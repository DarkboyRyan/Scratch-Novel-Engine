#include <array>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <iterator>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "backend.hpp"
#include "image_asset_import.hpp"
#include "serialization.hpp"

namespace {

using Json = nlohmann::json;

void check(const bool condition, const std::string& expression) {
  if (!condition) {
    throw std::runtime_error("check failed: " + expression);
  }
}

#define CHECK(expression) check((expression), #expression)

std::string png_image_bytes() {
  constexpr std::array<unsigned char, 16> bytes{
      0x89U,
      0x50U,
      0x4eU,
      0x47U,
      0x0dU,
      0x0aU,
      0x1aU,
      0x0aU,
      0x00U,
      0x00U,
      0x00U,
      0x00U,
      0x49U,
      0x45U,
      0x4eU,
      0x44U,
  };
  return std::string(
      reinterpret_cast<const char*>(bytes.data()), bytes.size());
}

std::string jpeg_image_bytes() {
  constexpr std::array<unsigned char, 8> bytes{
      0xffU, 0xd8U, 0xffU, 0xe0U, 0x00U, 0x02U, 0xffU, 0xd9U};
  return std::string(
      reinterpret_cast<const char*>(bytes.data()), bytes.size());
}

Json valid_document() {
  return {
      {"format", "vn-engine-project"},
      {"fileVersion", 1},
      {"project",
       {
           {"schemaVersion", 1},
           {"id", "project-1"},
           {"name", "读取的项目"},
           {"entrySceneId", "scene-1"},
           {"scenes",
            Json::array({
                {
                    {"schemaVersion", 1},
                    {"id", "scene-1"},
                    {"name", "序章"},
                    {"nodes",
                     Json::array({
                         {
                             {"id", "dialogue-1"},
                             {"type", "dialogue"},
                             {"speaker", "Alice"},
                             {"text", "你好"},
                         },
                     })},
                },
            })},
       }},
      {"assets",
       Json::array({
           {
               {"id", "asset-image-1"},
               {"type", "image"},
               {"relativePath", "assets/images/classroom.png"},
               {"displayName", "教室"},
           },
           {
               {"id", "asset-video-1"},
               {"type", "video"},
               {"relativePath", "assets/videos/opening.mp4"},
               {"displayName", "片头"},
           },
       })},
  };
}

Json migrated_v2_document() {
  Json document = valid_document();
  document["fileVersion"] = 2;
  document["project"]["scenes"][0]["visuals"] = {
      {"backgroundAssetId", nullptr},
      {"characters", Json::array()},
  };
  return document;
}

Json migrated_v3_document() {
  Json document = migrated_v2_document();
  document["fileVersion"] = 3;
  return document;
}

Json migrated_v4_document() {
  Json document = migrated_v3_document();
  document["fileVersion"] = 4;
  return document;
}

Json migrated_v5_document() {
  Json document = migrated_v4_document();
  document["fileVersion"] = 5;
  return document;
}

Json migrated_v6_document() {
  Json document = migrated_v5_document();
  document["fileVersion"] = 6;
  return document;
}

Json valid_v2_visual_document() {
  Json document = migrated_v2_document();
  document["project"]["scenes"][0]["visuals"] = {
      {"backgroundAssetId", "asset-image-1"},
      {"characters",
       Json::array({
           {
               {"id", "visual-alice-back"},
               {"assetId", "asset-image-1"},
               {"slot", "right"},
           },
           {
               {"id", "visual-alice-front"},
               {"assetId", "asset-image-1"},
               {"slot", "left"},
           },
       })},
  };
  return document;
}

Json valid_v3_timeline_document() {
  Json document = migrated_v3_document();
  document["project"]["scenes"][0]["visuals"]["backgroundAssetId"] =
      "asset-image-1";
  document["project"]["scenes"][0]["nodes"] = Json::array({
      {
          {"id", "dialogue-1"},
          {"type", "dialogue"},
          {"speaker", "Alice"},
          {"text", "切换前"},
      },
      {
          {"id", "background-1"},
          {"type", "background"},
          {"assetId", "asset-image-1"},
      },
      {
          {"id", "dialogue-2"},
          {"type", "dialogue"},
          {"speaker", "Bob"},
          {"text", "切换后"},
      },
  });
  return document;
}

void expect_file_error(
    const Json& document,
    const vnengine::backend::ProjectFileErrorKind expected_kind) {
  try {
    static_cast<void>(
        vnengine::backend::project_file_from_json(document));
  } catch (const vnengine::backend::ProjectFileError& error) {
    CHECK(error.kind() == expected_kind);
    return;
  }
  throw std::runtime_error("expected ProjectFileError");
}

void reads_v1_and_writes_a_migrated_v6_document() {
  const Json source = valid_document();
  const vnengine::backend::ProjectFileDocument parsed =
      vnengine::backend::project_file_from_json(source);

  CHECK(parsed.project.id == "project-1");
  CHECK(parsed.project.name == "读取的项目");
  CHECK(parsed.project.scenes.size() == 1);
  CHECK(parsed.project.scenes[0].nodes.size() == 1);
  CHECK(std::get<vnengine::Dialogue>(
            parsed.project.scenes[0].nodes[0]).text == "你好");
  CHECK(!parsed.project.scenes[0].visuals.background_asset_id.has_value());
  CHECK(parsed.project.scenes[0].visuals.characters.empty());
  CHECK(parsed.assets.size() == 2);
  CHECK(parsed.assets[0].type == vnengine::AssetType::image);
  CHECK(parsed.assets[1].type == vnengine::AssetType::video);
  CHECK(
      vnengine::backend::project_file_to_json(parsed) ==
      migrated_v6_document());
}

void round_trips_v2_visuals_and_preserves_character_order() {
  const Json source = valid_v2_visual_document();
  const vnengine::backend::ProjectFileDocument parsed =
      vnengine::backend::project_file_from_json(source);

  const vnengine::SceneVisualState& visuals =
      parsed.project.scenes[0].visuals;
  CHECK(visuals.background_asset_id == "asset-image-1");
  CHECK(visuals.characters.size() == 2);
  CHECK(visuals.characters[0].id == "visual-alice-back");
  CHECK(visuals.characters[0].slot == vnengine::CharacterSlot::right);
  CHECK(visuals.characters[1].id == "visual-alice-front");
  CHECK(visuals.characters[1].slot == vnengine::CharacterSlot::left);
  Json expected = source;
  expected["fileVersion"] = 6;
  CHECK(vnengine::backend::project_file_to_json(parsed) == expected);
}

void v1_reader_rejects_unversioned_visual_fields() {
  Json document = valid_document();
  document["project"]["scenes"][0]["visuals"] = {
      {"backgroundAssetId", "asset-image-1"},
      {"characters", Json::array()},
  };

  expect_file_error(
      document,
      vnengine::backend::ProjectFileErrorKind::invalid_document);
}

void rejects_unsupported_and_malformed_project_documents() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json document = valid_document();
  document["format"] = "another-engine";
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["fileVersion"] = 7;
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["fileVersion"] = 0;
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["fileVersion"] = "2";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["project"]["schemaVersion"] = 2;
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["unexpected"] = true;
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document.erase("assets");
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["project"]["entrySceneId"] = "missing";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["project"]["id"] = "scene-1";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["assets"][0]["relativePath"] =
      "assets/images/../../outside.png";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["assets"][0]["id"] = "dialogue-1";
  expect_file_error(document, Kind::invalid_document);

  document = valid_document();
  document["assets"][0]["type"] = "executable";
  expect_file_error(document, Kind::unsupported_format);
}

void rejects_malformed_v2_visual_fields_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json document = valid_v2_visual_document();
  document["project"]["scenes"][0].erase("visuals");
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["unexpected"] = true;
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"].erase(
      "backgroundAssetId");
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"].erase("characters");
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["unexpected"] = true;
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"] = nullptr;
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["backgroundAssetId"] = 7;
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"] =
      Json::object();
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0] =
      "not an object";
  expect_file_error(document, Kind::invalid_document);

  for (const std::string& field : {"id", "assetId", "slot"}) {
    document = valid_v2_visual_document();
    document["project"]["scenes"][0]["visuals"]["characters"][0].erase(
        field);
    expect_file_error(document, Kind::invalid_document);
  }

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0]
          ["unexpected"] = true;
  expect_file_error(document, Kind::invalid_document);

  for (const std::string& field : {"id", "assetId", "slot"}) {
    document = valid_v2_visual_document();
    document["project"]["scenes"][0]["visuals"]["characters"][0][field] =
        7;
    expect_file_error(document, Kind::invalid_document);
  }

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0]["slot"] =
      "foreground";
  expect_file_error(document, Kind::invalid_document);

  // Structural parsing succeeds first; aggregate validation then rejects
  // references that cannot be resolved to an image Asset.
  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["backgroundAssetId"] =
      "missing-asset";
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["backgroundAssetId"] =
      "asset-video-1";
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0]["assetId"] =
      "missing-asset";
  expect_file_error(document, Kind::invalid_document);

  document = valid_v2_visual_document();
  document["project"]["scenes"][0]["visuals"]["characters"][0]["assetId"] =
      "asset-video-1";
  expect_file_error(document, Kind::invalid_document);
}

void round_trips_v3_mixed_timeline_strictly() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  const Json source = valid_v3_timeline_document();
  const vnengine::backend::ProjectFileDocument parsed =
      vnengine::backend::project_file_from_json(source);
  const vnengine::Scene& scene = parsed.project.scenes[0];
  CHECK(scene.nodes.size() == 3);
  CHECK(std::holds_alternative<vnengine::Dialogue>(scene.nodes[0]));
  CHECK(std::get<vnengine::BackgroundNode>(scene.nodes[1]).id ==
        "background-1");
  CHECK(std::get<vnengine::BackgroundNode>(scene.nodes[1]).asset_id ==
        "asset-image-1");
  CHECK(std::holds_alternative<vnengine::Dialogue>(scene.nodes[2]));
  Json migrated_source = source;
  migrated_source["fileVersion"] = 6;
  CHECK(vnengine::backend::project_file_to_json(parsed) == migrated_source);

  Json no_background_source = source;
  no_background_source["fileVersion"] = 6;
  no_background_source["project"]["scenes"][0]["nodes"][1]["assetId"] =
      nullptr;
  const auto no_background =
      vnengine::backend::project_file_from_json(no_background_source);
  CHECK(!std::get<vnengine::BackgroundNode>(
             no_background.project.scenes[0].nodes[1])
             .asset_id.has_value());
  CHECK(vnengine::backend::project_file_to_json(no_background) ==
        no_background_source);

  const Json renderer = vnengine::backend::project_to_json(parsed.project);
  CHECK(renderer.at("scenes")[0].at("nodes") ==
        source.at("project").at("scenes")[0].at("nodes"));

  for (const std::string& missing : {"id", "type", "assetId"}) {
    Json malformed = source;
    malformed["project"]["scenes"][0]["nodes"][1].erase(missing);
    expect_file_error(malformed, Kind::invalid_document);
  }

  Json malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["unexpected"] = true;
  expect_file_error(malformed, Kind::invalid_document);

  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["assetId"] = 7;
  expect_file_error(malformed, Kind::invalid_document);

  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["type"] = "camera";
  expect_file_error(malformed, Kind::unsupported_format);

  malformed = source;
  malformed["project"]["scenes"][0]["nodes"][1]["assetId"] =
      "asset-video-1";
  expect_file_error(malformed, Kind::invalid_document);

  // Older versions remain dialogue-only, even if the node happens to have a
  // shape understood by v3.
  malformed = source;
  malformed["fileVersion"] = 2;
  expect_file_error(malformed, Kind::invalid_document);
}

class TemporaryDirectory final {
 public:
  TemporaryDirectory() {
    const auto nonce = std::chrono::steady_clock::now()
                           .time_since_epoch()
                           .count();
    path_ = std::filesystem::temp_directory_path() /
        ("vn-engine-backend-tests-" + std::to_string(nonce));
    if (!std::filesystem::create_directory(path_)) {
      throw std::runtime_error("could not create temporary directory");
    }
  }

  ~TemporaryDirectory() {
    std::error_code ignored;
    std::filesystem::remove_all(path_, ignored);
  }

  TemporaryDirectory(const TemporaryDirectory&) = delete;
  TemporaryDirectory& operator=(const TemporaryDirectory&) = delete;

  std::filesystem::path write(
      const std::string& filename,
      const std::string& contents) const {
    const std::filesystem::path file_path = path_ / filename;
    std::ofstream output(file_path, std::ios::binary);
    output.write(
        contents.data(), static_cast<std::streamsize>(contents.size()));
    if (!output) {
      throw std::runtime_error("could not write temporary project file");
    }
    return file_path;
  }

  std::filesystem::path path(const std::string& filename) const {
    return path_ / filename;
  }

  const std::filesystem::path& root() const {
    return path_;
  }

 private:
  std::filesystem::path path_;
};

Json request(
    vnengine::backend::Backend& backend,
    const int id,
    const std::string& method,
    Json params = Json::object()) {
  return Json::parse(backend.process_line(Json{
      {"id", id},
      {"method", method},
      {"params", std::move(params)},
  }.dump()));
}

std::string read_file(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  return std::string(
      std::istreambuf_iterator<char>(input),
      std::istreambuf_iterator<char>());
}

void expect_session(
    const Json& response,
    const std::uint64_t revision,
    const std::optional<std::uint64_t> saved_revision,
    const bool is_dirty) {
  CHECK(response.at("ok") == true);
  const Json& result = response.at("result");
  CHECK(result.contains("assets"));
  CHECK(result.at("assets").is_array());
  for (const Json& asset : result.at("assets")) {
    CHECK(asset.is_object());
    CHECK(asset.size() == 3);
    CHECK(asset.contains("id"));
    CHECK(asset.contains("type"));
    CHECK(asset.contains("displayName"));
    CHECK(!asset.contains("relativePath"));
  }
  if (!result.at("project").is_null()) {
    for (const Json& scene : result.at("project").at("scenes")) {
      CHECK(scene.contains("backgroundAssetId"));
      CHECK(scene.at("backgroundAssetId").is_null() ||
            scene.at("backgroundAssetId").is_string());
    }
  }

  const Json& session = result.at("session");
  CHECK(session.at("revision") == revision);
  if (saved_revision.has_value()) {
    CHECK(session.at("savedRevision") == *saved_revision);
  } else {
    CHECK(session.at("savedRevision").is_null());
  }
  CHECK(session.at("isDirty") == is_dirty);
}

void imports_an_image_without_exposing_paths_or_autosaving_manifest() {
  TemporaryDirectory temporary;
  const std::filesystem::path project_file =
      temporary.path("project.vn.json");
  const std::filesystem::path source = temporary.write(
      "Alice Portrait.PNG", png_image_bytes());
  const std::string original_source = read_file(source);

  vnengine::backend::Backend backend;
  const Json created = request(
      backend, 1, "project.create", {{"name", "图片导入"}});
  expect_session(created, 0, std::nullopt, true);
  CHECK(created.at("result").at("assets").empty());

  const Json initially_saved = request(
      backend,
      2,
      "project.save",
      {{"filePath", project_file.string()}});
  expect_session(initially_saved, 0, 0, false);
  CHECK(Json::parse(read_file(project_file)).at("assets").empty());

  const Json imported = request(
      backend,
      3,
      "asset.import",
      {
          {"sourceFilePath", source.string()},
          {"projectFilePath", project_file.string()},
      });
  expect_session(imported, 1, 0, true);
  const Json& result = imported.at("result");
  CHECK(result.contains("assetId"));
  const std::string asset_id = result.at("assetId").get<std::string>();
  CHECK(!asset_id.empty());
  CHECK(result.at("assets").size() == 1);
  CHECK(result.at("assets")[0] == Json({
      {"id", asset_id},
      {"type", "image"},
      {"displayName", "Alice Portrait"},
  }));
  CHECK(imported.dump().find(source.string()) == std::string::npos);
  CHECK(imported.dump().find(project_file.string()) == std::string::npos);

  const std::filesystem::path imported_file = temporary.root() /
      "assets" / "images" / (asset_id + ".png");
  CHECK(std::filesystem::is_regular_file(imported_file));
  CHECK(read_file(imported_file) == original_source);
  CHECK(read_file(source) == original_source);

  // Import only copies the binary and mutates the in-memory manifest. The
  // existing project file remains unchanged until the ordinary save command.
  CHECK(Json::parse(read_file(project_file)).at("assets").empty());

  const Json saved = request(
      backend,
      4,
      "project.save",
      {{"filePath", project_file.string()}});
  expect_session(saved, 1, 1, false);
  const Json persisted = Json::parse(read_file(project_file));
  CHECK(persisted.at("assets").size() == 1);
  CHECK(persisted.at("assets")[0] == Json({
      {"id", asset_id},
      {"type", "image"},
      {"relativePath", "assets/images/" + asset_id + ".png"},
      {"displayName", "Alice Portrait"},
  }));
}

void rejects_unsafe_image_sources_without_mutating_document() {
  TemporaryDirectory temporary;
  const std::filesystem::path project_file =
      temporary.path("project.vn.json");
  const std::filesystem::path valid_source = temporary.write(
      "valid.png", png_image_bytes());
  const std::filesystem::path mismatched = temporary.write(
      "mismatch.png", jpeg_image_bytes());
  const std::filesystem::path unsupported = temporary.write(
      "unsupported.gif", png_image_bytes());
  const std::filesystem::path empty = temporary.write("empty.webp", "");
  const std::filesystem::path directory = temporary.path("directory.png");
  CHECK(std::filesystem::create_directory(directory));
  const std::filesystem::path oversized = temporary.write(
      "oversized.png", png_image_bytes());
  std::filesystem::resize_file(
      oversized,
      vnengine::backend::kMaximumImportedImageBytes + 1U);

  std::optional<std::filesystem::path> symlink;
  const std::filesystem::path symlink_path = temporary.path("linked.png");
  std::error_code symlink_error;
  std::filesystem::create_symlink(
      valid_source, symlink_path, symlink_error);
  if (!symlink_error) {
    symlink = symlink_path;
  }

  vnengine::backend::Backend no_project;
  const Json missing_project = request(
      no_project,
      1,
      "asset.import",
      {
          {"sourceFilePath", valid_source.string()},
          {"projectFilePath", project_file.string()},
      });
  CHECK(missing_project.at("ok") == false);
  CHECK(missing_project.at("error").at("code") == "project_not_created");

  vnengine::backend::Backend backend;
  static_cast<void>(request(
      backend, 1, "project.create", {{"name", "失败保持"}}));
  const Json clean = request(
      backend,
      2,
      "project.save",
      {{"filePath", project_file.string()}});
  expect_session(clean, 0, 0, false);

  std::vector<std::filesystem::path> invalid_sources{
      mismatched, unsupported, empty, directory, oversized};
  if (symlink.has_value()) {
    invalid_sources.push_back(*symlink);
  }

  int request_id = 3;
  for (const std::filesystem::path& invalid_source : invalid_sources) {
    const Json failed = request(
        backend,
        request_id++,
        "asset.import",
        {
            {"sourceFilePath", invalid_source.string()},
            {"projectFilePath", project_file.string()},
        });
    CHECK(failed.at("ok") == false);
    CHECK(failed.at("error").at("code") == "asset_import_failed");

    const Json current = request(backend, request_id++, "project.get");
    expect_session(current, 0, 0, false);
    CHECK(current.at("result").at("assets").empty());
  }

  const Json invalid_project_path = request(
      backend,
      request_id++,
      "asset.import",
      {
          {"sourceFilePath", valid_source.string()},
          {"projectFilePath", "project.vn.json"},
      });
  CHECK(invalid_project_path.at("ok") == false);
  CHECK(invalid_project_path.at("error").at("code") == "invalid_params");

  const Json final_state = request(backend, request_id, "project.get");
  expect_session(final_state, 0, 0, false);
  CHECK(final_state.at("result").at("assets").empty());
  CHECK(Json::parse(read_file(project_file)).at("assets").empty());

  const std::filesystem::path assets = temporary.root() / "assets";
  if (std::filesystem::exists(assets)) {
    for (const auto& entry :
         std::filesystem::recursive_directory_iterator(assets)) {
      CHECK(entry.path().filename().string().find(".tmp-") ==
            std::string::npos);
      CHECK(!entry.is_regular_file());
    }
  }
}

void sets_clears_and_persists_scene_backgrounds_atomically() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "background-source.vn.json", valid_document().dump(2));
  const std::filesystem::path target =
      temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(
      backend, 1, "project.open", {{"filePath", source.string()}});
  expect_session(opened, 0, 0, false);
  const Json& opened_scene =
      opened.at("result").at("project").at("scenes")[0];
  CHECK(opened_scene.at("backgroundAssetId").is_null());

  // project.get uses the same public projection as every mutation response.
  const Json initial_snapshot = request(backend, 2, "project.get");
  expect_session(initial_snapshot, 0, 0, false);
  CHECK(initial_snapshot.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId")
            .is_null());

  const Json assigned = request(
      backend,
      3,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", "asset-image-1"}});
  expect_session(assigned, 1, 0, true);
  CHECK(assigned.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId") == "asset-image-1");

  // Assigning the authoritative value again is a successful no-op.
  const Json same_assignment = request(
      backend,
      4,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", "asset-image-1"}});
  expect_session(same_assignment, 1, 0, true);

  int request_id = 5;
  const std::vector<std::pair<Json, std::string>> invalid_changes{
      {{{"sceneId", "missing-scene"}, {"assetId", "asset-image-1"}},
       "scene_not_found"},
      {{{"sceneId", "scene-1"}, {"assetId", "missing-asset"}},
       "asset_not_found"},
      {{{"sceneId", "scene-1"}, {"assetId", "asset-video-1"}},
       "asset_not_image"},
      {{{"sceneId", "scene-1"}}, "invalid_params"},
      {{{"sceneId", "scene-1"}, {"assetId", 7}}, "invalid_params"},
  };
  for (const auto& [params, expected_code] : invalid_changes) {
    const Json failed = request(
        backend, request_id++, "scene.setBackground", params);
    CHECK(failed.at("ok") == false);
    CHECK(failed.at("error").at("code") == expected_code);

    const Json unchanged = request(backend, request_id++, "project.get");
    expect_session(unchanged, 1, 0, true);
    CHECK(unchanged.at("result")
              .at("project")
              .at("scenes")[0]
              .at("backgroundAssetId") == "asset-image-1");
  }

  const Json cleared = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", nullptr}});
  expect_session(cleared, 2, 0, true);
  CHECK(cleared.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId")
            .is_null());

  const Json same_clear = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", nullptr}});
  expect_session(same_clear, 2, 0, true);

  const Json reassigned = request(
      backend,
      request_id++,
      "scene.setBackground",
      {{"sceneId", "scene-1"}, {"assetId", "asset-image-1"}});
  expect_session(reassigned, 3, 0, true);

  const Json saved = request(
      backend,
      request_id++,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 3, 3, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 6);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("visuals")
            .at("backgroundAssetId") == "asset-image-1");

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend,
      1,
      "project.open",
      {{"filePath", target.string()}});
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId") == "asset-image-1");
}

void mutates_and_persists_mixed_background_timeline() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "timeline-source.vn.json", valid_document().dump(2));
  const std::filesystem::path target = temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(
      backend, 1, "project.open", {{"filePath", source.string()}});
  expect_session(opened, 0, 0, false);

  const Json added = request(
      backend,
      2,
      "background.add",
      {
          {"sceneId", "scene-1"},
          {"afterNodeId", "dialogue-1"},
      });
  expect_session(added, 1, 0, true);
  const std::string background_id =
      added.at("result").at("nodeId").get<std::string>();
  const Json& added_nodes = added.at("result")
                                .at("project")
                                .at("scenes")[0]
                                .at("nodes");
  CHECK(added_nodes.size() == 2);
  CHECK(added_nodes[0].at("id") == "dialogue-1");
  CHECK(added_nodes[1] == Json({
      {"id", background_id},
      {"type", "background"},
      {"assetId", nullptr},
  }));

  const Json filled = request(
      backend,
      3,
      "background.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", background_id},
          {"assetId", "asset-image-1"},
      });
  expect_session(filled, 2, 0, true);

  // A dialogue can be inserted relative to a BackgroundNode anchor.
  const Json dialogue = request(
      backend,
      4,
      "dialogue.add",
      {
          {"sceneId", "scene-1"},
          {"speaker", "Bob"},
          {"text", "新背景之后"},
          {"afterNodeId", background_id},
      });
  expect_session(dialogue, 3, 0, true);
  const std::string dialogue_id =
      dialogue.at("result").at("nodeId").get<std::string>();

  // Legal no-op updates/reorders preserve the revision.
  const Json unchanged = request(
      backend,
      5,
      "background.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", background_id},
          {"assetId", "asset-image-1"},
      });
  expect_session(unchanged, 3, 0, true);

  const Json moved = request(
      backend,
      6,
      "timeline.reorderMany",
      {
          {"sceneId", "scene-1"},
          {"nodeIds", Json::array({dialogue_id, background_id})},
          {"beforeNodeId", "dialogue-1"},
      });
  expect_session(moved, 4, 0, true);
  const Json& moved_nodes = moved.at("result")
                                .at("project")
                                .at("scenes")[0]
                                .at("nodes");
  // Payload order is ignored; the authoritative Background->Dialogue order
  // is retained when the mixed selection moves.
  CHECK(moved_nodes[0].at("id") == background_id);
  CHECK(moved_nodes[1].at("id") == dialogue_id);
  CHECK(moved_nodes[2].at("id") == "dialogue-1");

  const Json before_failures = request(backend, 7, "project.get");
  const std::vector<std::pair<std::string, Json>> failures{
      {
          "background.update",
          {
              {"sceneId", "scene-1"},
              {"nodeId", background_id},
              {"assetId", "missing"},
          },
      },
      {
          "timeline.reorderMany",
          {
              {"sceneId", "scene-1"},
              {"nodeIds", Json::array({dialogue_id, "missing"})},
              {"beforeNodeId", nullptr},
          },
      },
      {
          "timeline.deleteMany",
          {
              {"sceneId", "scene-1"},
              {"nodeIds", Json::array({background_id, "missing"})},
          },
      },
  };
  int request_id = 8;
  for (const auto& [method, params] : failures) {
    const Json failed = request(backend, request_id++, method, params);
    CHECK(failed.at("ok") == false);
    const Json current = request(backend, request_id++, "project.get");
    expect_session(current, 4, 0, true);
    CHECK(current.at("result").at("project") ==
          before_failures.at("result").at("project"));
  }

  const Json saved = request(
      backend,
      request_id++,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 4, 4, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 6);
  CHECK(persisted.at("project").at("scenes")[0].at("nodes") ==
        moved_nodes);

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend, 1, "project.open", {{"filePath", target.string()}});
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result").at("project").at("scenes")[0].at("nodes") ==
        moved_nodes);

  const Json deleted = request(
      reopened_backend,
      2,
      "timeline.deleteMany",
      {
          {"sceneId", "scene-1"},
          {"nodeIds", Json::array({background_id, dialogue_id})},
      });
  expect_session(deleted, 1, 0, true);
  CHECK(deleted.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")
            .size() == 1);
}

void tracks_real_mutations_and_normalizes_project_names() {
  TemporaryDirectory temporary;
  vnengine::backend::Backend backend;

  const Json ping = request(backend, 1, "ping");
  expect_session(ping, 0, std::nullopt, false);
  CHECK(ping.at("result").at("project").is_null());

  const Json created = request(
      backend, 2, "project.create", {{"name", "  学习项目\t"}});
  expect_session(created, 0, std::nullopt, true);
  CHECK(created.at("result").at("project").at("name") == "学习项目");
  const std::string scene_id =
      created.at("result").at("project").at("entrySceneId");

  const Json same_name = request(
      backend, 3, "project.rename", {{"name", " 学习项目 "}});
  expect_session(same_name, 0, std::nullopt, true);

  const Json renamed = request(
      backend, 4, "project.rename", {{"name", "  第一章  "}});
  expect_session(renamed, 1, std::nullopt, true);
  CHECK(renamed.at("result").at("project").at("name") == "第一章");

  const Json scene_no_op = request(
      backend,
      5,
      "scene.rename",
      {{"sceneId", scene_id}, {"name", "场景 1"}});
  expect_session(scene_no_op, 1, std::nullopt, true);

  const Json added = request(backend, 6, "scene.add");
  expect_session(added, 2, std::nullopt, true);

  const Json invalid_name = request(
      backend, 7, "project.rename", {{"name", " \n\t "}});
  CHECK(invalid_name.at("ok") == false);
  CHECK(invalid_name.at("error").at("code") == "project_name_required");

  const Json unchanged = request(backend, 8, "project.get");
  expect_session(unchanged, 2, std::nullopt, true);
  CHECK(unchanged.at("result").at("project").at("name") == "第一章");

  const Json saved = request(
      backend,
      9,
      "project.save",
      {{"filePath", temporary.path("project.vn.json").string()}});
  expect_session(saved, 2, 2, false);

  const Json clean_no_op = request(
      backend, 10, "project.rename", {{"name", " 第一章 "}});
  expect_session(clean_no_op, 2, 2, false);

  const Json dirty_again = request(
      backend, 11, "project.rename", {{"name", "第二章"}});
  expect_session(dirty_again, 3, 2, true);

  const Json wrong_filename = request(
      backend,
      12,
      "project.save",
      {{"filePath", temporary.path("wrong-name.json").string()}});
  CHECK(wrong_filename.at("ok") == false);
  CHECK(wrong_filename.at("error").at("code") == "invalid_params");

  const Json relative_path = request(
      backend,
      13,
      "project.save",
      {{"filePath", "project.vn.json"}});
  CHECK(relative_path.at("ok") == false);
  CHECK(relative_path.at("error").at("code") == "invalid_params");

  const Json still_dirty = request(backend, 14, "project.get");
  expect_session(still_dirty, 3, 2, true);
}

void saves_atomically_and_round_trips_assets() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "source.vn.json", valid_document().dump(2));
  const std::filesystem::path target = temporary.write(
      "project.vn.json", "old bytes that must be replaced");

  vnengine::backend::Backend backend;
  const Json opened = request(
      backend, 1, "project.open", {{"filePath", source.string()}});
  expect_session(opened, 0, 0, false);

  const Json renamed = request(
      backend, 2, "project.rename", {{"name", "  保存后的项目  "}});
  expect_session(renamed, 1, 0, true);

  const Json saved = request(
      backend, 3, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 1, 1, false);

  const Json on_disk = Json::parse(read_file(target));
  CHECK(on_disk.at("format") == "vn-engine-project");
  CHECK(on_disk.at("fileVersion") == 6);
  CHECK(on_disk.at("project").at("name") == "保存后的项目");
  CHECK(on_disk.at("assets") == valid_document().at("assets"));

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend,
      1,
      "project.open",
      {{"filePath", target.string()}});
  expect_session(reopened, 0, 0, false);
  CHECK(reopened.at("result").at("project") ==
        saved.at("result").at("project"));

  // Saving a clean document is a successful metadata no-op: it does not
  // invent a new revision.
  const Json resaved = request(
      reopened_backend,
      2,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(resaved, 0, 0, false);
}

void backend_preserves_hidden_v2_visuals_across_mutation_and_save() {
  TemporaryDirectory temporary;
  const Json source_document = valid_v2_visual_document();
  const std::filesystem::path source = temporary.write(
      "visual-source.vn.json", source_document.dump(2));
  const std::filesystem::path target =
      temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(
      backend, 1, "project.open", {{"filePath", source.string()}});
  expect_session(opened, 0, 0, false);

  // Renderer gets the safe background Asset ID needed for selection/preview,
  // while future character-instance details remain private for now.
  CHECK(opened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("backgroundAssetId") == "asset-image-1");
  CHECK(!opened.at("result").at("project").at("scenes")[0].contains(
      "visuals"));

  const Json renamed = request(
      backend, 2, "project.rename", {{"name", "视觉保留测试"}});
  expect_session(renamed, 1, 0, true);
  const Json saved = request(
      backend, 3, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 1, 1, false);

  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 6);
  CHECK(
      persisted.at("project").at("scenes")[0].at("visuals") ==
      source_document.at("project").at("scenes")[0].at("visuals"));
}

void failed_open_preserves_dirty_hidden_v2_aggregate() {
  TemporaryDirectory temporary;
  const Json source_document = valid_v2_visual_document();
  const std::filesystem::path source = temporary.write(
      "current-v2.vn.json", source_document.dump(2));

  Json invalid_document = valid_v2_visual_document();
  invalid_document["project"]["scenes"][0]["visuals"]
                  ["backgroundAssetId"] = "missing-asset";
  const std::filesystem::path invalid = temporary.write(
      "invalid-v2.vn.json", invalid_document.dump(2));

  Json invalid_timeline_document = valid_v3_timeline_document();
  invalid_timeline_document["project"]["scenes"][0]["nodes"][1]
                           ["assetId"] = "asset-video-1";
  const std::filesystem::path invalid_timeline = temporary.write(
      "invalid-v3-timeline.vn.json", invalid_timeline_document.dump(2));

  Json future_document = valid_v2_visual_document();
  future_document["fileVersion"] = 7;
  const std::filesystem::path future = temporary.write(
      "future-v7.vn.json", future_document.dump(2));
  const std::filesystem::path target =
      temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  const Json opened = request(
      backend, 1, "project.open", {{"filePath", source.string()}});
  expect_session(opened, 0, 0, false);

  const Json renamed = request(
      backend, 2, "project.rename", {{"name", "失败后仍保留"}});
  expect_session(renamed, 1, 0, true);

  const Json invalid_open = request(
      backend, 3, "project.open", {{"filePath", invalid.string()}});
  CHECK(invalid_open.at("ok") == false);
  CHECK(invalid_open.at("error").at("code") == "project_file_invalid");

  const Json after_invalid = request(backend, 4, "project.get");
  expect_session(after_invalid, 1, 0, true);
  CHECK(
      after_invalid.at("result").at("project").at("name") ==
      "失败后仍保留");

  const Json invalid_timeline_open = request(
      backend,
      5,
      "project.open",
      {{"filePath", invalid_timeline.string()}});
  CHECK(invalid_timeline_open.at("ok") == false);
  CHECK(invalid_timeline_open.at("error").at("code") ==
        "project_file_invalid");

  const Json after_invalid_timeline = request(backend, 6, "project.get");
  expect_session(after_invalid_timeline, 1, 0, true);
  CHECK(after_invalid_timeline.at("result").at("project").at("name") ==
        "失败后仍保留");

  const Json future_open = request(
      backend, 7, "project.open", {{"filePath", future.string()}});
  CHECK(future_open.at("ok") == false);
  CHECK(future_open.at("error").at("code") ==
        "project_file_unsupported");

  const Json after_future = request(backend, 8, "project.get");
  expect_session(after_future, 1, 0, true);
  CHECK(
      after_future.at("result").at("project").at("name") ==
      "失败后仍保留");

  const Json saved = request(
      backend, 9, "project.save", {{"filePath", target.string()}});
  expect_session(saved, 1, 1, false);

  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 6);
  CHECK(persisted.at("project").at("name") == "失败后仍保留");
  CHECK(
      persisted.at("project").at("scenes")[0].at("visuals") ==
      source_document.at("project").at("scenes")[0].at("visuals"));
  CHECK(persisted.at("assets") == source_document.at("assets"));
}

void failed_save_preserves_state_and_destination() {
  TemporaryDirectory temporary;
  const std::filesystem::path blocked_target =
      temporary.path("project.vn.json");
  CHECK(std::filesystem::create_directory(blocked_target));
  const std::filesystem::path sentinel =
      blocked_target / "original-content.txt";
  temporary.write("unrelated.txt", "unrelated");
  {
    std::ofstream output(sentinel, std::ios::binary);
    output << "original bytes";
  }

  vnengine::backend::Backend backend;
  const Json created = request(
      backend, 1, "project.create", {{"name", "未保存"}});
  expect_session(created, 0, std::nullopt, true);
  const Json original_project = created.at("result").at("project");

  // Replacing a non-empty directory is guaranteed to fail on supported
  // platforms. The temporary sibling must be removed and the directory's
  // existing bytes must remain intact.
  const Json failed = request(
      backend,
      2,
      "project.save",
      {{"filePath", blocked_target.string()}});
  CHECK(failed.at("ok") == false);
  CHECK(failed.at("error").at("code") == "project_save_failed");
  CHECK(std::filesystem::is_directory(blocked_target));
  CHECK(read_file(sentinel) == "original bytes");

  const Json current = request(backend, 3, "project.get");
  expect_session(current, 0, std::nullopt, true);
  CHECK(current.at("result").at("project") == original_project);

  const std::string temporary_prefix = ".project.vn.json.tmp-";
  for (const auto& entry :
       std::filesystem::directory_iterator(temporary.root())) {
    CHECK(!entry.path().filename().string().starts_with(temporary_prefix));
  }
}

void opens_a_file_and_preserves_current_project_after_failures() {
  TemporaryDirectory temporary;
  const std::filesystem::path valid_path = temporary.write(
      "valid.vn.json", valid_document().dump(2));
  const std::filesystem::path malformed_path = temporary.write(
      "malformed.vn.json", "{not json");

  Json invalid_document = valid_document();
  invalid_document["project"]["entrySceneId"] = "missing";
  const std::filesystem::path invalid_path = temporary.write(
      "invalid.vn.json", invalid_document.dump());

  Json unsupported_document = valid_document();
  unsupported_document["fileVersion"] = 99;
  const std::filesystem::path unsupported_path = temporary.write(
      "future.vn.json", unsupported_document.dump());

  vnengine::backend::Backend backend;
  const Json initial = request(
      backend, 1, "project.create", {{"name", "原项目"}});
  CHECK(initial.at("ok") == true);

  const Json opened = request(
      backend,
      2,
      "project.open",
      {{"filePath", valid_path.string()}});
  CHECK(opened.at("ok") == true);
  CHECK(opened.at("result").at("sceneId") == "scene-1");
  CHECK(opened.at("result").at("project").at("name") == "读取的项目");
  const Json authoritative_project = opened.at("result").at("project");

  const std::vector<std::pair<std::filesystem::path, std::string>> failures{
      {malformed_path, "project_file_invalid"},
      {invalid_path, "project_file_invalid"},
      {unsupported_path, "project_file_unsupported"},
      {temporary.path("missing.vn.json"), "project_file_read_failed"},
  };

  int request_id = 3;
  for (const auto& [path, expected_code] : failures) {
    const Json failed = request(
        backend,
        request_id++,
        "project.open",
        {{"filePath", path.string()}});
    CHECK(failed.at("ok") == false);
    CHECK(failed.at("error").at("code") == expected_code);

    const Json current = request(backend, request_id++, "project.get");
    CHECK(current.at("ok") == true);
    CHECK(current.at("result").at("project") == authoritative_project);
  }

  const Json empty_path = request(
      backend, request_id, "project.open", {{"filePath", ""}});
  CHECK(empty_path.at("ok") == false);
  CHECK(empty_path.at("error").at("code") == "invalid_params");
}

void failed_open_does_not_create_a_project() {
  TemporaryDirectory temporary;
  vnengine::backend::Backend backend;

  const Json failed = request(
      backend,
      1,
      "project.open",
      {{"filePath", temporary.path("missing.vn.json").string()}});
  CHECK(failed.at("ok") == false);

  const Json current = request(backend, 2, "project.get");
  CHECK(current.at("ok") == false);
  CHECK(current.at("error").at("code") == "project_not_created");
}

void mutates_and_persists_character_timeline() {
  TemporaryDirectory temporary;
  const std::filesystem::path source = temporary.write(
      "character-source.vn.json", migrated_v5_document().dump(2));
  const std::filesystem::path target = temporary.path("project.vn.json");
  vnengine::backend::Backend backend;
  CHECK(request(
            backend, 1, "project.open", {{"filePath", source.string()}})
            .at("ok") == true);

  const Json added = request(
      backend,
      2,
      "character.add",
      {{"sceneId", "scene-1"}, {"afterNodeId", "dialogue-1"}});
  expect_session(added, 1, 0, true);
  const std::string node_id =
      added.at("result").at("nodeId").get<std::string>();
  const Json& empty = added.at("result")
                          .at("project")
                          .at("scenes")[0]
                          .at("nodes")[1];
  CHECK(empty == Json({
      {"id", node_id},
      {"type", "character"},
      {"assetId", nullptr},
      {"slot", "center"},
      {"layer", 1},
  }));

  const Json updated = request(
      backend,
      3,
      "character.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", node_id},
          {"assetId", "asset-image-1"},
          {"slot", "left"},
          {"layer", 3},
      });
  expect_session(updated, 2, 0, true);
  CHECK(updated.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("slot") == "left");

  const Json failed = request(
      backend,
      4,
      "character.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", node_id},
          {"assetId", "asset-video-1"},
          {"slot", "right"},
          {"layer", 2},
      });
  CHECK(failed.at("ok") == false);
  CHECK(failed.at("error").at("code") == "asset_not_image");

  const Json saved = request(
      backend,
      5,
      "project.save",
      {{"filePath", target.string()}});
  expect_session(saved, 2, 2, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 6);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("assetId") == "asset-image-1");

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend,
      1,
      "project.open",
      {{"filePath", target.string()}});
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("layer") == 3);
}

void mutates_and_persists_scene_jump_timeline() {
  TemporaryDirectory temporary;
  Json source_document = migrated_v6_document();
  source_document["project"]["scenes"].push_back({
      {"schemaVersion", 1},
      {"id", "scene-2"},
      {"name", "第二幕"},
      {"visuals",
       {{"backgroundAssetId", nullptr}, {"characters", Json::array()}}},
      {"nodes",
       Json::array({
           {{"id", "dialogue-2"},
            {"type", "dialogue"},
            {"speaker", "Bob"},
            {"text", "第二幕"}},
       })},
  });
  const std::filesystem::path source = temporary.write(
      "scene-jump-source.vn.json", source_document.dump(2));
  const std::filesystem::path target = temporary.path("project.vn.json");

  vnengine::backend::Backend backend;
  CHECK(request(
            backend, 1, "project.open", {{"filePath", source.string()}})
            .at("ok") == true);

  const Json added = request(
      backend,
      2,
      "sceneJump.add",
      {
          {"sceneId", "scene-1"},
          {"targetSceneId", "scene-2"},
          {"afterNodeId", "dialogue-1"},
      });
  CHECK(added.at("ok") == true);
  expect_session(added, 1, 0, true);
  const std::string jump_id =
      added.at("result").at("nodeId").get<std::string>();
  CHECK(added.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1] == Json({
                {"id", jump_id},
                {"type", "sceneJump"},
                {"targetSceneId", "scene-2"},
            }));

  const Json self_target = request(
      backend,
      3,
      "sceneJump.update",
      {
          {"sceneId", "scene-1"},
          {"nodeId", jump_id},
          {"targetSceneId", "scene-1"},
      });
  CHECK(self_target.at("ok") == false);
  CHECK(self_target.at("error").at("code") == "scene_jump_self_target");

  const Json delete_target = request(
      backend, 4, "scene.delete", {{"sceneId", "scene-2"}});
  CHECK(delete_target.at("ok") == false);
  CHECK(delete_target.at("error").at("code") == "scene_in_use");

  const Json saved = request(
      backend, 5, "project.save", {{"filePath", target.string()}});
  CHECK(saved.at("ok") == true);
  expect_session(saved, 1, 1, false);
  const Json persisted = Json::parse(read_file(target));
  CHECK(persisted.at("fileVersion") == 6);
  CHECK(persisted.at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("targetSceneId") == "scene-2");

  vnengine::backend::Backend reopened_backend;
  const Json reopened = request(
      reopened_backend,
      1,
      "project.open",
      {{"filePath", target.string()}});
  CHECK(reopened.at("ok") == true);
  CHECK(reopened.at("result")
            .at("project")
            .at("scenes")[0]
            .at("nodes")[1]
            .at("type") == "sceneJump");
}

}  // namespace

int main() {
  const std::vector<std::pair<std::string, std::function<void()>>> tests{
      {"reads v1 and writes a migrated v6 document",
       reads_v1_and_writes_a_migrated_v6_document},
      {"round trips v2 visuals and preserves character order",
       round_trips_v2_visuals_and_preserves_character_order},
      {"v1 reader rejects unversioned visual fields",
       v1_reader_rejects_unversioned_visual_fields},
      {"rejects unsupported and malformed project documents",
       rejects_unsupported_and_malformed_project_documents},
      {"rejects malformed v2 visual fields strictly",
       rejects_malformed_v2_visual_fields_strictly},
      {"round trips v3 mixed timeline strictly",
       round_trips_v3_mixed_timeline_strictly},
      {"tracks real mutations and normalizes project names",
       tracks_real_mutations_and_normalizes_project_names},
      {"imports an image without exposing paths or autosaving manifest",
       imports_an_image_without_exposing_paths_or_autosaving_manifest},
      {"rejects unsafe image sources without mutating document",
       rejects_unsafe_image_sources_without_mutating_document},
      {"sets clears and persists scene backgrounds atomically",
       sets_clears_and_persists_scene_backgrounds_atomically},
      {"mutates and persists mixed background timeline",
       mutates_and_persists_mixed_background_timeline},
      {"saves atomically and round trips assets",
       saves_atomically_and_round_trips_assets},
      {"backend preserves hidden v2 visuals across mutation and save",
       backend_preserves_hidden_v2_visuals_across_mutation_and_save},
      {"failed open preserves dirty hidden v2 aggregate",
       failed_open_preserves_dirty_hidden_v2_aggregate},
      {"failed save preserves state and destination",
       failed_save_preserves_state_and_destination},
      {"opens a file and preserves current project after failures",
       opens_a_file_and_preserves_current_project_after_failures},
      {"failed open does not create a project",
       failed_open_does_not_create_a_project},
      {"mutates and persists character timeline",
       mutates_and_persists_character_timeline},
      {"mutates and persists scene jump timeline",
       mutates_and_persists_scene_jump_timeline},
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
