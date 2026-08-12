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
#include "serialization.hpp"

namespace {

using Json = nlohmann::json;

void check(const bool condition, const std::string& expression) {
  if (!condition) {
    throw std::runtime_error("check failed: " + expression);
  }
}

#define CHECK(expression) check((expression), #expression)

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

void parses_and_round_trips_a_strict_project_document() {
  const Json source = valid_document();
  const vnengine::backend::ProjectFileDocument parsed =
      vnengine::backend::project_file_from_json(source);

  CHECK(parsed.project.id == "project-1");
  CHECK(parsed.project.name == "读取的项目");
  CHECK(parsed.project.scenes.size() == 1);
  CHECK(parsed.project.scenes[0].nodes.size() == 1);
  CHECK(parsed.project.scenes[0].nodes[0].text == "你好");
  CHECK(parsed.assets.size() == 2);
  CHECK(parsed.assets[0].type == vnengine::AssetType::image);
  CHECK(parsed.assets[1].type == vnengine::AssetType::video);
  CHECK(vnengine::backend::project_file_to_json(parsed) == source);
}

void rejects_unsupported_and_malformed_project_documents() {
  using Kind = vnengine::backend::ProjectFileErrorKind;

  Json document = valid_document();
  document["format"] = "another-engine";
  expect_file_error(document, Kind::unsupported_format);

  document = valid_document();
  document["fileVersion"] = 2;
  expect_file_error(document, Kind::unsupported_format);

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
  const Json& session = response.at("result").at("session");
  CHECK(session.at("revision") == revision);
  if (saved_revision.has_value()) {
    CHECK(session.at("savedRevision") == *saved_revision);
  } else {
    CHECK(session.at("savedRevision").is_null());
  }
  CHECK(session.at("isDirty") == is_dirty);
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
  CHECK(on_disk.at("fileVersion") == 1);
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

}  // namespace

int main() {
  const std::vector<std::pair<std::string, std::function<void()>>> tests{
      {"parses and round trips a strict project document",
       parses_and_round_trips_a_strict_project_document},
      {"rejects unsupported and malformed project documents",
       rejects_unsupported_and_malformed_project_documents},
      {"tracks real mutations and normalizes project names",
       tracks_real_mutations_and_normalizes_project_names},
      {"saves atomically and round trips assets",
       saves_atomically_and_round_trips_assets},
      {"failed save preserves state and destination",
       failed_save_preserves_state_and_destination},
      {"opens a file and preserves current project after failures",
       opens_a_file_and_preserves_current_project_after_failures},
      {"failed open does not create a project",
       failed_open_does_not_create_a_project},
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
