// 文件职责：验证媒体导入的类型识别、路径隔离和无覆盖发布。
// 关键覆盖：图片/视频/音频 magic bytes、符号链接、源文件竞态与故障恢复。
#include <array>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <system_error>
#include <utility>
#include <vector>

#ifndef _WIN32
#include <sys/stat.h>
#endif

#include "asset_import.hpp"

namespace {

void check(const bool condition, const std::string& expression) {
  if (!condition) {
    throw std::runtime_error("check failed: " + expression);
  }
}

#define CHECK(expression) check((expression), #expression)

class TemporaryDirectory final {
 public:
  TemporaryDirectory() {
    const auto nonce = std::chrono::steady_clock::now()
                           .time_since_epoch()
                           .count();
    root_ = std::filesystem::temp_directory_path() /
        ("vn-engine-image-import-tests-" + std::to_string(nonce));
    if (!std::filesystem::create_directory(root_)) {
      throw std::runtime_error("could not create temporary directory");
    }
  }

  ~TemporaryDirectory() {
    std::error_code ignored;
    std::filesystem::remove_all(root_, ignored);
  }

  const std::filesystem::path& root() const { return root_; }

  std::filesystem::path make_directory(const std::string& name) const {
    const std::filesystem::path path = root_ / name;
    if (!std::filesystem::create_directory(path)) {
      throw std::runtime_error("could not create test directory");
    }
    return path;
  }

  std::filesystem::path write(
      const std::string& name,
      const std::string& contents) const {
    const std::filesystem::path path = root_ / name;
    std::ofstream output(path, std::ios::binary);
    output.write(
        contents.data(), static_cast<std::streamsize>(contents.size()));
    if (!output) {
      throw std::runtime_error("could not write test file");
    }
    return path;
  }

 private:
  std::filesystem::path root_;
};

std::string bytes(const std::initializer_list<unsigned int> values) {
  std::string result;
  result.reserve(values.size());
  for (const unsigned int value : values) {
    result.push_back(static_cast<char>(value));
  }
  return result;
}

std::string png_bytes() {
  return bytes({
      0x89U, 0x50U, 0x4eU, 0x47U, 0x0dU, 0x0aU, 0x1aU, 0x0aU,
      0x50U, 0x41U, 0x59U, 0x4cU, 0x4fU, 0x41U, 0x44U});
}

std::string jpeg_bytes() {
  return bytes({
      0xffU, 0xd8U, 0xffU, 0xe0U, 0x00U, 0x02U, 0x4aU, 0x46U,
      0x49U, 0x46U, 0xffU, 0xd9U});
}

std::string webp_bytes() {
  return bytes({
      'R', 'I', 'F', 'F', 0x04U, 0x00U, 0x00U, 0x00U,
      'W', 'E', 'B', 'P', 'D', 'A', 'T', 'A'});
}

std::string mp4_bytes() {
  return bytes({
      0x00U, 0x00U, 0x00U, 0x18U, 'f', 't', 'y', 'p',
      'i', 's', 'o', 'm', 0x00U, 0x00U, 0x02U, 0x00U,
      'i', 's', 'o', 'm', 'm', 'p', '4', '2'});
}

std::string webm_bytes() {
  return bytes({
      0x1aU, 0x45U, 0xdfU, 0xa3U, 0x8bU,
      0x42U, 0x86U, 0x81U, 0x01U,
      0x42U, 0x82U, 0x84U, 'w', 'e', 'b', 'm'});
}

std::string mp3_bytes() {
  std::string result(417, '\0');
  result[0] = static_cast<char>(0xffU);
  result[1] = static_cast<char>(0xfbU);
  result[2] = static_cast<char>(0x90U);
  result[3] = static_cast<char>(0x64U);
  return result;
}

std::string id3_mp3_bytes(const bool include_mpeg_frame) {
  std::string result = bytes({
      'I', 'D', '3', 4U, 0U, 0U, 0U, 0U, 39U, 8U});
  result.append(5000, '\0');
  result += include_mpeg_frame ? mp3_bytes() : std::string("NOPE");
  return result;
}

std::string wav_bytes() {
  return bytes({
      'R', 'I', 'F', 'F', 40U, 0U, 0U, 0U,
      'W', 'A', 'V', 'E', 'f', 'm', 't', ' ',
      16U, 0U, 0U, 0U, 1U, 0U, 1U, 0U,
      0x44U, 0xacU, 0U, 0U, 0x88U, 0x58U, 0x01U, 0U,
      2U, 0U, 16U, 0U, 'd', 'a', 't', 'a',
      4U, 0U, 0U, 0U, 0U, 0U, 0U, 0U});
}

std::string ogg_opus_bytes() {
  std::string result = bytes({
      'O', 'g', 'g', 'S', 0U, 0x02U,
      0U, 0U, 0U, 0U, 0U, 0U, 0U, 0U,
      1U, 0U, 0U, 0U, 0U, 0U, 0U, 0U,
      0U, 0U, 0U, 0U, 1U, 19U});
  std::string packet(19, '\0');
  packet.replace(0, 8, "OpusHead");
  packet[8] = 1;
  packet[9] = 2;
  packet[12] = static_cast<char>(0x80U);
  packet[13] = static_cast<char>(0xbbU);
  result += packet;
  return result;
}

std::string ogg_vorbis_bytes() {
  std::string result = bytes({
      'O', 'g', 'g', 'S', 0U, 0x02U,
      0U, 0U, 0U, 0U, 0U, 0U, 0U, 0U,
      1U, 0U, 0U, 0U, 0U, 0U, 0U, 0U,
      0U, 0U, 0U, 0U, 1U, 30U});
  std::string packet(30, '\0');
  packet[0] = 1;
  packet.replace(1, 6, "vorbis");
  packet[11] = 2;
  packet[12] = static_cast<char>(0x80U);
  packet[13] = static_cast<char>(0xbbU);
  packet[29] = 1;
  result += packet;
  return result;
}

std::string read_file(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  return std::string(
      std::istreambuf_iterator<char>(input),
      std::istreambuf_iterator<char>());
}

void expect_import_error(const std::function<void()>& action) {
  try {
    action();
  } catch (const vnengine::backend::ImageAssetImportError&) {
    return;
  }
  throw std::runtime_error("expected ImageAssetImportError");
}

void check_no_temporary_files(const std::filesystem::path& root) {
  if (!std::filesystem::exists(root)) {
    return;
  }
  for (const auto& entry :
       std::filesystem::recursive_directory_iterator(root)) {
    CHECK(entry.path().filename().string().find(".tmp-") ==
          std::string::npos);
  }
}

void plans_canonical_metadata_without_filesystem_mutation() {
  const auto jpeg = vnengine::backend::plan_image_asset_import(
      "/images/Alice Portrait.JPEG", "asset_123");
  CHECK(jpeg.relative_path == "assets/images/asset_123.jpg");
  CHECK(jpeg.display_name == "Alice Portrait");

  const auto webp = vnengine::backend::plan_image_asset_import(
      "C:\\images\\背景.WEBP", "asset-webp");
  CHECK(webp.relative_path == "assets/images/asset-webp.webp");
  CHECK(webp.display_name == "背景");

  expect_import_error([] {
    static_cast<void>(vnengine::backend::plan_image_asset_import(
        "/images/file.gif", "asset-gif"));
  });
  expect_import_error([] {
    static_cast<void>(vnengine::backend::plan_image_asset_import(
        "/images/file.png", "../outside"));
  });
}

void plans_and_streams_supported_videos() {
  TemporaryDirectory temporary;
  const std::filesystem::path project =
      temporary.make_directory("video-project");

  struct Fixture {
    std::string filename;
    std::string id;
    std::string expected_extension;
    std::string contents;
  };
  const std::vector<Fixture> fixtures{
      {"Opening.MP4", "asset-mp4", ".mp4", mp4_bytes()},
      {"Chapter 1.WebM", "asset-webm", ".webm", webm_bytes()},
  };

  for (const Fixture& fixture : fixtures) {
    const std::filesystem::path source = temporary.write(
        fixture.filename, fixture.contents);
    const auto plan = vnengine::backend::plan_video_asset_import(
        source.string(), fixture.id);
    CHECK(plan.relative_path ==
        "assets/videos/" + fixture.id + fixture.expected_extension);
    vnengine::backend::copy_video_asset_no_clobber(
        source, project, plan);

    const std::filesystem::path target = project / "assets" / "videos" /
        (fixture.id + fixture.expected_extension);
    CHECK(std::filesystem::is_regular_file(target));
    CHECK(read_file(target) == fixture.contents);
    CHECK(read_file(source) == fixture.contents);
  }
  check_no_temporary_files(project);
}

void rejects_mismatched_and_unsafe_video_sources() {
  TemporaryDirectory temporary;
  const std::filesystem::path project =
      temporary.make_directory("video-project");
  const std::filesystem::path mismatched = temporary.write(
      "mismatch.mp4", webm_bytes());
  const std::filesystem::path unsupported = temporary.write(
      "movie.mov", mp4_bytes());
  const std::filesystem::path fake_mp4 = temporary.write(
      "fake.mp4",
      bytes({
          0x00U, 0x00U, 0x00U, 0x0cU, 'f', 't', 'y', 'p',
          'h', 'e', 'i', 'c'}));
  const std::filesystem::path fake_webm = temporary.write(
      "fake.webm",
      bytes({
          0x1aU, 0x45U, 0xdfU, 0xa3U, 0x8bU,
          0x42U, 0x86U, 0x81U, 0x01U,
          0x42U, 0x87U, 0x84U, 'w', 'e', 'b', 'm'}));
  const std::filesystem::path malformed_mp4_tail = temporary.write(
      "malformed-tail.mp4",
      bytes({
          0x00U, 0x00U, 0x00U, 0x11U, 'f', 't', 'y', 'p',
          'i', 's', 'o', 'm', 0x00U, 0x00U, 0x00U, 0x00U,
          0xffU}));
  const std::filesystem::path malformed_webm_tail = temporary.write(
      "malformed-tail.webm",
      bytes({
          0x1aU, 0x45U, 0xdfU, 0xa3U, 0x94U,
          0x42U, 0x82U, 0x84U, 'w', 'e', 'b', 'm',
          0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U, 0x00U,
          0x00U, 0x00U, 0x00U, 0x00U, 0x00U}));

  expect_import_error([&] {
    static_cast<void>(vnengine::backend::plan_video_asset_import(
        unsupported.string(), "unsupported"));
  });
  expect_import_error([&] {
    static_cast<void>(vnengine::backend::plan_video_asset_import(
        (temporary.root() / "still.png").string(), "wrong-kind"));
  });

  const auto mismatch_plan = vnengine::backend::plan_video_asset_import(
      mismatched.string(), "mismatch");
  expect_import_error([&] {
    vnengine::backend::copy_video_asset_no_clobber(
        mismatched, project, mismatch_plan);
  });
  for (const auto& [source, id] : std::vector<
           std::pair<std::filesystem::path, std::string>>{
           {fake_mp4, "fake-mp4"}, {fake_webm, "fake-webm"},
           {malformed_mp4_tail, "malformed-mp4-tail"},
           {malformed_webm_tail, "malformed-webm-tail"}}) {
    const auto plan = vnengine::backend::plan_video_asset_import(
        source.string(), id);
    expect_import_error([&] {
      vnengine::backend::copy_video_asset_no_clobber(
          source, project, plan);
    });
  }

  std::error_code error;
  const std::filesystem::path valid = temporary.write("valid.mp4", mp4_bytes());
  const std::filesystem::path oversized = temporary.write(
      "oversized.mp4", mp4_bytes());
  std::filesystem::resize_file(
      oversized,
      vnengine::backend::kMaximumImportedVideoBytes + 1U);
  const auto oversized_plan = vnengine::backend::plan_video_asset_import(
      oversized.string(), "oversized");
  expect_import_error([&] {
    vnengine::backend::copy_video_asset_no_clobber(
        oversized, project, oversized_plan);
  });

  const std::filesystem::path source_link = temporary.root() / "linked.mp4";
  std::filesystem::create_symlink(valid, source_link, error);
  if (!error) {
    const auto link_plan = vnengine::backend::plan_video_asset_import(
        source_link.string(), "linked");
    expect_import_error([&] {
      vnengine::backend::copy_video_asset_no_clobber(
          source_link, project, link_plan);
    });
  }

  error.clear();
  const std::filesystem::path linked_project =
      temporary.make_directory("video-link-project");
  CHECK(std::filesystem::create_directory(linked_project / "assets"));
  const std::filesystem::path outside =
      temporary.make_directory("outside-videos");
  std::filesystem::create_directory_symlink(
      outside, linked_project / "assets" / "videos", error);
  if (!error) {
    const auto plan = vnengine::backend::plan_video_asset_import(
        valid.string(), "destination-link");
    expect_import_error([&] {
      vnengine::backend::copy_video_asset_no_clobber(
          valid, linked_project, plan);
    });
    CHECK(std::filesystem::is_empty(outside));
  }

  CHECK(std::filesystem::create_directories(
      project / "assets" / "videos"));
  const std::filesystem::path existing =
      project / "assets" / "videos" / "collision.mp4";
  const std::string sentinel = mp4_bytes() + "existing";
  {
    std::ofstream output(existing, std::ios::binary);
    output.write(sentinel.data(), static_cast<std::streamsize>(sentinel.size()));
  }
  const auto collision_plan = vnengine::backend::plan_video_asset_import(
      valid.string(), "collision");
  expect_import_error([&] {
    vnengine::backend::copy_video_asset_no_clobber(
        valid, project, collision_plan);
  });
  CHECK(read_file(existing) == sentinel);
  CHECK(!std::filesystem::exists(
      project / "assets" / "videos" / "mismatch.mp4"));
  check_no_temporary_files(project);
}

void plans_and_streams_supported_audio() {
  TemporaryDirectory temporary;
  const std::filesystem::path project =
      temporary.make_directory("audio-project");

  struct Fixture {
    std::string filename;
    std::string id;
    std::string expected_extension;
    std::string contents;
  };
  const std::vector<Fixture> fixtures{
      {"Alice Voice.MP3", "voice-mp3", ".mp3", mp3_bytes()},
      {"Tagged Voice.mp3", "voice-tagged", ".mp3", id3_mp3_bytes(true)},
      {"Rain.WAV", "bgm-wav", ".wav", wav_bytes()},
      {"Theme.ogg", "bgm-opus", ".ogg", ogg_opus_bytes()},
      {"Ambience.OGG", "bgm-vorbis", ".ogg", ogg_vorbis_bytes()},
  };

  for (const Fixture& fixture : fixtures) {
    const std::filesystem::path source = temporary.write(
        fixture.filename, fixture.contents);
    const auto plan = vnengine::backend::plan_audio_asset_import(
        source.string(), fixture.id);
    CHECK(plan.relative_path ==
        "assets/audio/" + fixture.id + fixture.expected_extension);
    CHECK(!plan.display_name.empty());
    vnengine::backend::copy_audio_asset_no_clobber(
        source, project, plan);

    const std::filesystem::path target = project / "assets" / "audio" /
        (fixture.id + fixture.expected_extension);
    CHECK(std::filesystem::is_regular_file(target));
    CHECK(read_file(target) == fixture.contents);
    CHECK(read_file(source) == fixture.contents);
  }
  check_no_temporary_files(project);
}

void rejects_mismatched_and_unsafe_audio_sources() {
  TemporaryDirectory temporary;
  const std::filesystem::path project =
      temporary.make_directory("audio-project");
  const std::filesystem::path mismatch = temporary.write(
      "mismatch.mp3", wav_bytes());
  const auto mismatch_plan = vnengine::backend::plan_audio_asset_import(
      mismatch.string(), "mismatch");
  expect_import_error([&] {
    vnengine::backend::copy_audio_asset_no_clobber(
        mismatch, project, mismatch_plan);
  });

  for (const auto& [filename, contents] :
       std::vector<std::pair<std::string, std::string>>{
           {"truncated.mp3", bytes({0xffU, 0xfbU, 0x90U, 0x64U})},
           {"id3-without-frame.mp3", id3_mp3_bytes(false)}}) {
    const std::filesystem::path invalid = temporary.write(filename, contents);
    const auto invalid_plan = vnengine::backend::plan_audio_asset_import(
        invalid.string(),
        filename.starts_with("truncated") ? "invalid-truncated" :
                                             "invalid-id3");
    expect_import_error([&] {
      vnengine::backend::copy_audio_asset_no_clobber(
          invalid, project, invalid_plan);
    });
  }

  expect_import_error([&] {
    static_cast<void>(vnengine::backend::plan_audio_asset_import(
        (temporary.root() / "track.m4a").string(), "unsupported"));
  });
  expect_import_error([&] {
    static_cast<void>(vnengine::backend::plan_asset_import(
        (temporary.root() / "still.png").string(),
        "wrong-kind",
        vnengine::backend::AssetImportKind::audio));
  });

  const std::filesystem::path oversized = temporary.write(
      "oversized.wav", wav_bytes());
  std::filesystem::resize_file(
      oversized,
      vnengine::backend::kMaximumImportedAudioBytes + 1U);
  const auto oversized_plan = vnengine::backend::plan_audio_asset_import(
      oversized.string(), "oversized");
  expect_import_error([&] {
    vnengine::backend::copy_audio_asset_no_clobber(
        oversized, project, oversized_plan);
  });

  const std::filesystem::path valid = temporary.write(
      "valid.mp3", mp3_bytes());
  std::error_code error;
  const std::filesystem::path source_link = temporary.root() / "linked.mp3";
  std::filesystem::create_symlink(valid, source_link, error);
  if (!error) {
    const auto link_plan = vnengine::backend::plan_audio_asset_import(
        source_link.string(), "linked");
    expect_import_error([&] {
      vnengine::backend::copy_audio_asset_no_clobber(
          source_link, project, link_plan);
    });
  }

  CHECK(std::filesystem::create_directories(project / "assets" / "audio"));
  const std::filesystem::path existing =
      project / "assets" / "audio" / "collision.mp3";
  const std::string sentinel = mp3_bytes() + "existing";
  {
    std::ofstream output(existing, std::ios::binary);
    output.write(sentinel.data(), static_cast<std::streamsize>(sentinel.size()));
  }
  const auto collision_plan = vnengine::backend::plan_audio_asset_import(
      valid.string(), "collision");
  expect_import_error([&] {
    vnengine::backend::copy_audio_asset_no_clobber(
        valid, project, collision_plan);
  });
  CHECK(read_file(existing) == sentinel);
  CHECK(!std::filesystem::exists(
      project / "assets" / "audio" / "mismatch.mp3"));
  check_no_temporary_files(project);
}

void streams_supported_images_and_preserves_sources() {
  TemporaryDirectory temporary;
  const std::filesystem::path project =
      temporary.make_directory("project");

  struct Fixture {
    std::string filename;
    std::string id;
    std::string expected_extension;
    std::string contents;
  };
  const std::vector<Fixture> fixtures{
      {"background.PNG", "asset-png", ".png", png_bytes()},
      {"portrait.jpeg", "asset-jpeg", ".jpg", jpeg_bytes()},
      {"effect.WebP", "asset-webp", ".webp", webp_bytes()},
  };

  for (const Fixture& fixture : fixtures) {
    const std::filesystem::path source = temporary.write(
        fixture.filename, fixture.contents);
    const auto plan = vnengine::backend::plan_image_asset_import(
        source.string(), fixture.id);
    vnengine::backend::copy_image_asset_no_clobber(
        source, project, plan);

    const std::filesystem::path target = project / "assets" / "images" /
        (fixture.id + fixture.expected_extension);
    CHECK(std::filesystem::is_regular_file(target));
    CHECK(read_file(target) == fixture.contents);
    CHECK(read_file(source) == fixture.contents);
  }
  check_no_temporary_files(project);
}

void rejects_malformed_nonregular_and_oversized_sources() {
  TemporaryDirectory temporary;
  const std::filesystem::path project =
      temporary.make_directory("project");
  const std::filesystem::path mismatch = temporary.write(
      "mismatch.png", jpeg_bytes());
  const std::filesystem::path empty = temporary.write("empty.png", "");
  const std::filesystem::path directory =
      temporary.make_directory("directory.png");
  const std::filesystem::path oversized = temporary.write(
      "oversized.png", png_bytes());
  std::filesystem::resize_file(
      oversized,
      vnengine::backend::kMaximumImportedImageBytes + 1U);

  const std::vector<std::filesystem::path> invalid{
      mismatch, empty, directory, oversized};
  int number = 0;
  for (const std::filesystem::path& source : invalid) {
    const auto plan = vnengine::backend::plan_image_asset_import(
        source.string(), "invalid-" + std::to_string(number++));
    expect_import_error([&] {
      vnengine::backend::copy_image_asset_no_clobber(
          source, project, plan);
    });
  }

#ifndef _WIN32
  const std::filesystem::path fifo = temporary.root() / "pipe.png";
  CHECK(::mkfifo(fifo.c_str(), 0600) == 0);
  const auto fifo_plan = vnengine::backend::plan_image_asset_import(
      fifo.string(), "fifo");
  expect_import_error([&] {
    vnengine::backend::copy_image_asset_no_clobber(
        fifo, project, fifo_plan);
  });
#endif

  CHECK(!std::filesystem::exists(project / "assets" / "images"));
  check_no_temporary_files(project);
}

void rejects_source_and_destination_links() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "source.png", png_bytes());

  std::error_code error;
  const std::filesystem::path source_link = temporary.root() / "linked.png";
  std::filesystem::create_symlink(source, source_link, error);
  if (!error) {
    const std::filesystem::path project =
        temporary.make_directory("source-link-project");
    const auto plan = vnengine::backend::plan_image_asset_import(
        source_link.string(), "source-link");
    expect_import_error([&] {
      vnengine::backend::copy_image_asset_no_clobber(
          source_link, project, plan);
    });
    CHECK(!std::filesystem::exists(project / "assets"));
  }

  error.clear();
  const std::filesystem::path assets_link_project =
      temporary.make_directory("assets-link-project");
  const std::filesystem::path outside_assets =
      temporary.make_directory("outside-assets");
  std::filesystem::create_directory_symlink(
      outside_assets, assets_link_project / "assets", error);
  if (!error) {
    const auto plan = vnengine::backend::plan_image_asset_import(
        source.string(), "assets-link");
    expect_import_error([&] {
      vnengine::backend::copy_image_asset_no_clobber(
          source, assets_link_project, plan);
    });
    CHECK(std::filesystem::is_empty(outside_assets));
  }

  error.clear();
  const std::filesystem::path images_link_project =
      temporary.make_directory("images-link-project");
  CHECK(std::filesystem::create_directory(images_link_project / "assets"));
  const std::filesystem::path outside_images =
      temporary.make_directory("outside-images");
  std::filesystem::create_directory_symlink(
      outside_images,
      images_link_project / "assets" / "images",
      error);
  if (!error) {
    const auto plan = vnengine::backend::plan_image_asset_import(
        source.string(), "images-link");
    expect_import_error([&] {
      vnengine::backend::copy_image_asset_no_clobber(
          source, images_link_project, plan);
    });
    CHECK(std::filesystem::is_empty(outside_images));
  }
}

[[noreturn]] void fail_before_publish() {
  throw std::runtime_error("injected before-publish failure");
}

void never_clobbers_and_removes_temporary_files_on_failure() {
  TemporaryDirectory temporary;
  const std::filesystem::path project =
      temporary.make_directory("project");
  CHECK(std::filesystem::create_directories(
      project / "assets" / "images"));

  const std::filesystem::path existing =
      project / "assets" / "images" / "fixed.png";
  const std::string existing_bytes = png_bytes() + "existing-sentinel";
  {
    std::ofstream output(existing, std::ios::binary);
    output.write(
        existing_bytes.data(),
        static_cast<std::streamsize>(existing_bytes.size()));
  }
  const auto alias_plan = vnengine::backend::plan_image_asset_import(
      existing.string(), "fixed");
  expect_import_error([&] {
    vnengine::backend::copy_image_asset_no_clobber(
        existing, project, alias_plan);
  });
  CHECK(read_file(existing) == existing_bytes);
  check_no_temporary_files(project);

  // Also exercise a distinct valid source colliding at the publication step.
  const std::filesystem::path collision_source = temporary.write(
      "collision.png", png_bytes() + "new-source");
  expect_import_error([&] {
    vnengine::backend::copy_image_asset_no_clobber(
        collision_source, project, alias_plan);
  });
  CHECK(read_file(existing) == existing_bytes);
  CHECK(read_file(collision_source) == png_bytes() + "new-source");
  check_no_temporary_files(project);

  const std::filesystem::path source = temporary.write(
      "rollback.png", png_bytes());
  const auto rollback_plan = vnengine::backend::plan_image_asset_import(
      source.string(), "rollback");
  try {
    vnengine::backend::copy_image_asset_no_clobber(
        source, project, rollback_plan, fail_before_publish);
    throw std::runtime_error("expected injected failure");
  } catch (const std::runtime_error& error) {
    CHECK(std::string(error.what()) == "injected before-publish failure");
  }
  CHECK(!std::filesystem::exists(
      project / "assets" / "images" / "rollback.png"));
  CHECK(read_file(source) == png_bytes());
  check_no_temporary_files(project);
}

}  // namespace

int main() {
  const std::vector<std::pair<std::string, std::function<void()>>> tests{
      {"plans canonical metadata without filesystem mutation",
       plans_canonical_metadata_without_filesystem_mutation},
      {"streams supported images and preserves sources",
       streams_supported_images_and_preserves_sources},
      {"plans and streams supported videos",
       plans_and_streams_supported_videos},
      {"rejects mismatched and unsafe video sources",
       rejects_mismatched_and_unsafe_video_sources},
      {"plans and streams supported audio",
       plans_and_streams_supported_audio},
      {"rejects mismatched and unsafe audio sources",
       rejects_mismatched_and_unsafe_audio_sources},
      {"rejects malformed nonregular and oversized sources",
       rejects_malformed_nonregular_and_oversized_sources},
      {"rejects source and destination links",
       rejects_source_and_destination_links},
      {"never clobbers and removes temporary files on failure",
       never_clobbers_and_removes_temporary_files_on_failure},
  };

  int failures = 0;
  for (const auto& [name, test] : tests) {
    try {
      test();
      std::cout << "[PASS] " << name << '\n';
    } catch (const std::exception& error) {
      ++failures;
      std::cerr << "[FAIL] " << name << ": " << error.what() << '\n';
    }
  }
  if (failures != 0) {
    std::cerr << failures << " test(s) failed\n";
    return 1;
  }
  std::cout << tests.size() << " test(s) passed\n";
  return 0;
}
