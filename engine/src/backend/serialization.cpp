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

Json scene_to_renderer_json(const Scene& scene) {
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

std::string character_slot_to_string(const CharacterSlot slot) {
  switch (slot) {
    case CharacterSlot::left:
      return "left";
    case CharacterSlot::center:
      return "center";
    case CharacterSlot::right:
      return "right";
  }
  invalid("character visual slot is invalid");
}

CharacterSlot character_slot_from_json(
    const Json& value,
    const std::string& context) {
  const std::string slot = require_string(value, "slot", context);
  if (slot == "left") {
    return CharacterSlot::left;
  }
  if (slot == "center") {
    return CharacterSlot::center;
  }
  if (slot == "right") {
    return CharacterSlot::right;
  }
  invalid(context + ".slot must be left, center, or right");
}

Json character_visual_to_json(
    const CharacterVisualInstance& character) {
  return {
      {"id", character.id},
      {"assetId", character.asset_id},
      {"slot", character_slot_to_string(character.slot)},
  };
}

CharacterVisualInstance character_visual_from_json(
    const Json& value,
    const std::string& context) {
  require_exact_fields(value, {"id", "assetId", "slot"}, context);
  return CharacterVisualInstance{
      .id = require_string(value, "id", context),
      .asset_id = require_string(value, "assetId", context),
      .slot = character_slot_from_json(value, context),
  };
}

Json scene_visuals_to_json(const SceneVisualState& visuals) {
  Json characters = Json::array();
  for (const CharacterVisualInstance& character : visuals.characters) {
    characters.push_back(character_visual_to_json(character));
  }

  return {
      {"backgroundAssetId",
       visuals.background_asset_id.has_value()
           ? Json(*visuals.background_asset_id)
           : Json(nullptr)},
      {"characters", std::move(characters)},
  };
}

SceneVisualState scene_visuals_from_json(
    const Json& value,
    const std::string& context) {
  require_exact_fields(
      value, {"backgroundAssetId", "characters"}, context);

  std::optional<std::string> background_asset_id;
  const Json& background = value.at("backgroundAssetId");
  if (background.is_string()) {
    background_asset_id = background.get<std::string>();
  } else if (!background.is_null()) {
    invalid(context + ".backgroundAssetId must be a string or null");
  }

  const Json& characters_json = value.at("characters");
  if (!characters_json.is_array()) {
    invalid(context + ".characters must be an array");
  }

  SceneVisualState visuals{
      .background_asset_id = std::move(background_asset_id),
      .characters = {},
  };
  visuals.characters.reserve(characters_json.size());
  for (std::size_t index = 0; index < characters_json.size(); ++index) {
    visuals.characters.push_back(character_visual_from_json(
        characters_json.at(index),
        context + ".characters[" + std::to_string(index) + "]"));
  }
  return visuals;
}

Json scene_to_file_json(const Scene& scene) {
  // Construct the persisted shape explicitly. The Renderer projection and
  // file format have separate version boundaries and must not accidentally
  // inherit one another's future fields.
  Json nodes = Json::array();
  for (const Dialogue& dialogue : scene.nodes) {
    nodes.push_back(dialogue_to_json(dialogue));
  }

  return {
      {"schemaVersion", scene.schema_version},
      {"id", scene.id},
      {"name", scene.name},
      {"visuals", scene_visuals_to_json(scene.visuals)},
      {"nodes", std::move(nodes)},
  };
}

Scene scene_from_json(
    const Json& value,
    const std::size_t scene_index,
    const int file_version) {
  const std::string context =
      "project.scenes[" + std::to_string(scene_index) + "]";
  if (file_version == 1) {
    require_exact_fields(
        value,
        {"schemaVersion", "id", "name", "nodes"},
        context);
  } else {
    require_exact_fields(
        value,
        {"schemaVersion", "id", "name", "visuals", "nodes"},
        context);
  }
  require_schema_version(value, context);

  const Json& nodes = value.at("nodes");
  if (!nodes.is_array()) {
    invalid(context + ".nodes must be an array");
  }

  Scene scene{
      .schema_version = kSchemaVersion,
      .id = require_string(value, "id", context),
      .name = require_string(value, "name", context),
      // File version 1 predates Scene visuals. Reading it always produces an
      // explicit empty visual state rather than inventing implicit Assets.
      .visuals = file_version == 1
          ? SceneVisualState{}
          : scene_visuals_from_json(value.at("visuals"), context + ".visuals"),
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

Project project_from_json(const Json& value, const int file_version) {
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
    project.scenes.push_back(
        scene_from_json(scenes.at(index), index, file_version));
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
  return asset;
}

Json project_to_file_json(const Project& project) {
  Json scenes = Json::array();
  for (const Scene& scene : project.scenes) {
    scenes.push_back(scene_to_file_json(scene));
  }

  return {
      {"schemaVersion", project.schema_version},
      {"id", project.id},
      {"name", project.name},
      {"entrySceneId", project.entry_scene_id},
      {"scenes", std::move(scenes)},
  };
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
    scenes.push_back(scene_to_renderer_json(scene));
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
  if (const auto violation = validate_project_aggregate(document);
      violation.has_value()) {
    invalid("project aggregate is invalid: " + *violation);
  }

  Json assets = Json::array();
  for (const Asset& asset : document.assets) {
    assets.push_back(asset_to_json(asset));
  }

  return {
      {"format", kProjectFileFormat},
      {"fileVersion", kProjectFileVersion},
      {"project", project_to_file_json(document.project)},
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
  if (file_version < 1 || file_version > kProjectFileVersion) {
    unsupported("document.fileVersion is not supported");
  }

  if (!value.at("assets").is_array()) {
    invalid("document.assets must be an array");
  }

  ProjectFileDocument document{
      .project = project_from_json(value.at("project"), file_version),
      .assets = {},
  };
  const Json& assets = value.at("assets");
  document.assets.reserve(assets.size());
  for (std::size_t index = 0; index < assets.size(); ++index) {
    document.assets.push_back(asset_from_json(assets.at(index), index));
  }
  if (const auto violation = validate_project_aggregate(document);
      violation.has_value()) {
    invalid("project aggregate is invalid: " + *violation);
  }
  return document;
}

}  // namespace vnengine::backend
