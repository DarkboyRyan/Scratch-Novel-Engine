#include "serialization.hpp"

#include <initializer_list>
#include <string>
#include <string_view>
#include <unordered_set>
#include <utility>

#include <nlohmann/json.hpp>

#include "vnengine/project.hpp"

namespace vnengine::backend {
namespace {

using Json = nlohmann::json;

[[noreturn]] void invalid(std::string message) {
  throw ProjectFileError(
      ProjectFileErrorKind::invalid_document,
      std::move(message));
}

[[noreturn]] void unsupported(std::string message) {
  throw ProjectFileError(
      ProjectFileErrorKind::unsupported_format,
      std::move(message));
}

void require_exact_fields(
    const Json& value,
    const std::initializer_list<std::string_view> expected_fields,
    const std::string_view context) {
  if (!value.is_object()) {
    invalid(std::string(context) + " must be an object");
  }

  std::unordered_set<std::string> expected;
  for (const std::string_view field : expected_fields) {
    expected.emplace(field);
    if (!value.contains(std::string(field))) {
      invalid(
          std::string(context) + "." + std::string(field) +
          " is required");
    }
  }

  for (const auto& [field, unused] : value.items()) {
    static_cast<void>(unused);
    if (!expected.contains(field)) {
      invalid(
          std::string(context) + " contains unknown field: " + field);
    }
  }
}

std::string require_string(
    const Json& object,
    const std::string_view field,
    const std::string_view context) {
  const std::string key(field);
  if (!object.at(key).is_string()) {
    invalid(
        std::string(context) + "." + key + " must be a string");
  }
  return object.at(key).get<std::string>();
}

int require_integer(
    const Json& object,
    const std::string_view field,
    const std::string_view context) {
  const std::string key(field);
  if (!object.at(key).is_number_integer()) {
    invalid(
        std::string(context) + "." + key + " must be an integer");
  }

  try {
    return object.at(key).get<int>();
  } catch (const Json::exception&) {
    invalid(
        std::string(context) + "." + key + " is outside the supported range");
  }
}

void require_schema_version(
    const Json& object,
    const std::string_view context) {
  const int version = require_integer(object, "schemaVersion", context);
  if (version != kSchemaVersion) {
    unsupported(
        std::string(context) + " schemaVersion is not supported");
  }
}

Json dialogue_to_json(const Dialogue& dialogue) {
  return {
      {"id", dialogue.id},
      {"type", "dialogue"},
      {"speaker", dialogue.speaker},
      {"text", dialogue.text},
  };
}

Dialogue dialogue_from_json(
    const Json& value,
    const std::string& context) {
  require_exact_fields(
      value,
      {"id", "type", "speaker", "text"},
      context);

  if (require_string(value, "type", context) != "dialogue") {
    unsupported(context + ".type is not supported");
  }

  return Dialogue{
      .id = require_string(value, "id", context),
      .speaker = require_string(value, "speaker", context),
      .text = require_string(value, "text", context),
  };
}

Json scene_to_json(const Scene& scene) {
  Json nodes = Json::array();
  for (const Dialogue& dialogue : scene.nodes) {
    nodes.push_back(dialogue_to_json(dialogue));
  }

  return {
      {"schemaVersion", scene.schema_version},
      {"id", scene.id},
      {"name", scene.name},
      {"nodes", std::move(nodes)},
  };
}

Scene scene_from_json(
    const Json& value,
    const std::size_t scene_index) {
  const std::string context =
      "project.scenes[" + std::to_string(scene_index) + "]";
  require_exact_fields(
      value,
      {"schemaVersion", "id", "name", "nodes"},
      context);
  require_schema_version(value, context);

  const Json& nodes = value.at("nodes");
  if (!nodes.is_array()) {
    invalid(context + ".nodes must be an array");
  }

  Scene scene{
      .schema_version = kSchemaVersion,
      .id = require_string(value, "id", context),
      .name = require_string(value, "name", context),
      .nodes = {},
  };
  scene.nodes.reserve(nodes.size());
  for (std::size_t index = 0; index < nodes.size(); ++index) {
    scene.nodes.push_back(dialogue_from_json(
        nodes.at(index),
        context + ".nodes[" + std::to_string(index) + "]"));
  }
  return scene;
}

Project project_from_json(const Json& value) {
  constexpr std::string_view context = "project";
  require_exact_fields(
      value,
      {"schemaVersion", "id", "name", "entrySceneId", "scenes"},
      context);
  require_schema_version(value, context);

  const Json& scenes = value.at("scenes");
  if (!scenes.is_array()) {
    invalid("project.scenes must be an array");
  }

  Project project{
      .schema_version = kSchemaVersion,
      .id = require_string(value, "id", context),
      .name = require_string(value, "name", context),
      .entry_scene_id = require_string(value, "entrySceneId", context),
      .scenes = {},
  };
  project.scenes.reserve(scenes.size());
  for (std::size_t index = 0; index < scenes.size(); ++index) {
    project.scenes.push_back(scene_from_json(scenes.at(index), index));
  }

  if (const auto violation = validate_project(project);
      violation.has_value()) {
    invalid("project is invalid: " + *violation);
  }
  return project;
}

std::string asset_type_to_string(const AssetType type) {
  switch (type) {
    case AssetType::image:
      return "image";
    case AssetType::video:
      return "video";
    case AssetType::audio:
      return "audio";
  }
  invalid("asset type is invalid");
}

AssetType asset_type_from_string(
    const std::string_view type,
    const std::string& context) {
  if (type == "image") {
    return AssetType::image;
  }
  if (type == "video") {
    return AssetType::video;
  }
  if (type == "audio") {
    return AssetType::audio;
  }
  unsupported(context + ".type is not supported");
}

std::string asset_directory(const AssetType type) {
  switch (type) {
    case AssetType::image:
      return "images";
    case AssetType::video:
      return "videos";
    case AssetType::audio:
      return "audio";
  }
  invalid("asset type is invalid");
}

void validate_asset_path(
    const AssetType type,
    const std::string& path,
    const std::string& context) {
  // Project files use portable forward-slash paths. Requiring the type's
  // directory also prevents absolute paths and ../ directory traversal.
  const std::string prefix = "assets/" + asset_directory(type) + "/";
  if (path.size() <= prefix.size() || !path.starts_with(prefix) ||
      path.find('\\') != std::string::npos ||
      path.find('\0') != std::string::npos) {
    invalid(
        context + ".relativePath must be a safe path below " + prefix);
  }

  std::size_t component_start = 0;
  while (component_start < path.size()) {
    const std::size_t separator = path.find('/', component_start);
    const std::size_t component_end = separator == std::string::npos
        ? path.size()
        : separator;
    const std::string_view component(
        path.data() + component_start,
        component_end - component_start);
    if (component.empty() || component == "." || component == "..") {
      invalid(context + ".relativePath contains an unsafe component");
    }
    if (separator == std::string::npos) {
      break;
    }
    component_start = separator + 1;
  }
}

Json asset_to_json(const Asset& asset) {
  return {
      {"id", asset.id},
      {"type", asset_type_to_string(asset.type)},
      {"relativePath", asset.relative_path},
      {"displayName", asset.display_name},
  };
}

Asset asset_from_json(
    const Json& value,
    const std::size_t asset_index) {
  const std::string context =
      "assets[" + std::to_string(asset_index) + "]";
  require_exact_fields(
      value,
      {"id", "type", "relativePath", "displayName"},
      context);

  Asset asset{
      .id = require_string(value, "id", context),
      .type = asset_type_from_string(
          require_string(value, "type", context), context),
      .relative_path = require_string(value, "relativePath", context),
      .display_name = require_string(value, "displayName", context),
  };
  if (asset.id.empty()) {
    invalid(context + ".id must not be empty");
  }
  validate_asset_path(asset.type, asset.relative_path, context);
  return asset;
}

void validate_assets(
    const Project& project,
    const std::vector<Asset>& assets) {
  std::unordered_set<std::string> entity_ids{project.id};
  for (const Scene& scene : project.scenes) {
    entity_ids.insert(scene.id);
    for (const Dialogue& dialogue : scene.nodes) {
      entity_ids.insert(dialogue.id);
    }
  }

  for (std::size_t index = 0; index < assets.size(); ++index) {
    const Asset& asset = assets[index];
    const std::string context = "assets[" + std::to_string(index) + "]";
    if (asset.id.empty()) {
      invalid(context + ".id must not be empty");
    }
    if (!entity_ids.insert(asset.id).second) {
      invalid("entity and asset IDs must be unique");
    }
    validate_asset_path(asset.type, asset.relative_path, context);
  }
}

}  // namespace

ProjectFileError::ProjectFileError(
    const ProjectFileErrorKind kind,
    std::string message)
    : std::runtime_error(std::move(message)), kind_(kind) {}

ProjectFileErrorKind ProjectFileError::kind() const noexcept {
  return kind_;
}

Json project_to_json(const Project& project) {
  Json scenes = Json::array();
  for (const Scene& scene : project.scenes) {
    scenes.push_back(scene_to_json(scene));
  }

  return {
      {"schemaVersion", project.schema_version},
      {"id", project.id},
      {"name", project.name},
      {"entrySceneId", project.entry_scene_id},
      {"scenes", std::move(scenes)},
  };
}

Json project_file_to_json(const ProjectFileDocument& document) {
  if (const auto violation = validate_project(document.project);
      violation.has_value()) {
    invalid("project is invalid: " + *violation);
  }
  validate_assets(document.project, document.assets);

  Json assets = Json::array();
  for (const Asset& asset : document.assets) {
    assets.push_back(asset_to_json(asset));
  }

  return {
      {"format", kProjectFileFormat},
      {"fileVersion", kProjectFileVersion},
      {"project", project_to_json(document.project)},
      {"assets", std::move(assets)},
  };
}

ProjectFileDocument project_file_from_json(const Json& value) {
  require_exact_fields(
      value,
      {"format", "fileVersion", "project", "assets"},
      "document");

  if (require_string(value, "format", "document") != kProjectFileFormat) {
    unsupported("document.format is not supported");
  }

  const int file_version = require_integer(value, "fileVersion", "document");
  if (file_version != kProjectFileVersion) {
    unsupported("document.fileVersion is not supported");
  }

  if (!value.at("assets").is_array()) {
    invalid("document.assets must be an array");
  }

  ProjectFileDocument document{
      .project = project_from_json(value.at("project")),
      .assets = {},
  };
  const Json& assets = value.at("assets");
  document.assets.reserve(assets.size());
  for (std::size_t index = 0; index < assets.size(); ++index) {
    document.assets.push_back(asset_from_json(assets.at(index), index));
  }
  validate_assets(document.project, document.assets);
  return document;
}

}  // namespace vnengine::backend
