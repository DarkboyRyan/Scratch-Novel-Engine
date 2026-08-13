#include "backend.hpp"

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <unordered_set>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "atomic_file.hpp"
#include "image_asset_import.hpp"
#include "serialization.hpp"

namespace vnengine::backend {
namespace {

using Json = nlohmann::json;

constexpr std::uintmax_t kMaximumProjectFileBytes = 64U * 1024U * 1024U;

class ProtocolError final : public std::runtime_error {
 public:
  ProtocolError(std::string code, std::string message)
      : std::runtime_error(std::move(message)), code_(std::move(code)) {}

  const std::string& code() const { return code_; }

 private:
  std::string code_;
};

std::string required_string(
    const Json& object,
    const std::string_view field_name) {
  const std::string key(field_name);
  if (!object.contains(key) || !object.at(key).is_string()) {
    throw ProtocolError(
        "invalid_params",
        "params." + key + " must be a string");
  }
  return object.at(key).get<std::string>();
}

std::vector<std::string> required_unique_string_array(
    const Json& object,
    const std::string_view field_name) {
  const std::string key(field_name);
  if (!object.contains(key) || !object.at(key).is_array() ||
      object.at(key).empty()) {
    throw ProtocolError(
        "invalid_params",
        "params." + key + " must be a non-empty string array");
  }

  std::vector<std::string> values;
  std::unordered_set<std::string> unique_values;
  for (const Json& value : object.at(key)) {
    if (!value.is_string()) {
      throw ProtocolError(
          "invalid_params",
          "params." + key + " must contain only strings");
    }

    const std::string text = value.get<std::string>();
    if (!unique_values.insert(text).second) {
      throw ProtocolError(
          "invalid_params",
          "params." + key + " must not contain duplicates");
    }
    values.push_back(text);
  }

  return values;
}

CharacterSlot required_character_slot(const Json& object) {
  const std::string slot = required_string(object, "slot");
  if (slot == "left") {
    return CharacterSlot::left;
  }
  if (slot == "center") {
    return CharacterSlot::center;
  }
  if (slot == "right") {
    return CharacterSlot::right;
  }
  throw ProtocolError(
      "invalid_params", "params.slot must be left, center, or right");
}

int required_character_layer(const Json& object) {
  if (!object.contains("layer") || !object.at("layer").is_number_integer()) {
    throw ProtocolError(
        "invalid_params", "params.layer must be an integer between 1 and 10");
  }
  try {
    const int layer = object.at("layer").get<int>();
    if (layer >= 1 && layer <= 10) {
      return layer;
    }
  } catch (const Json::exception&) {
  }
  throw ProtocolError(
      "invalid_params", "params.layer must be an integer between 1 and 10");
}

std::string read_project_file(const std::string& file_path) {
  if (file_path.empty() || file_path.find('\0') != std::string::npos) {
    throw ProtocolError(
        "invalid_params", "params.filePath must not be empty");
  }

  const std::filesystem::path path(file_path);
  std::error_code error;
  if (!std::filesystem::is_regular_file(path, error) || error) {
    throw ProtocolError(
        "project_file_read_failed", "project file could not be read");
  }

  const std::uintmax_t file_size = std::filesystem::file_size(path, error);
  if (error || file_size > kMaximumProjectFileBytes ||
      file_size > static_cast<std::uintmax_t>(
          std::numeric_limits<std::streamsize>::max())) {
    throw ProtocolError(
        "project_file_read_failed",
        "project file is unavailable or exceeds the size limit");
  }

  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw ProtocolError(
        "project_file_read_failed", "project file could not be opened");
  }

  std::string contents(static_cast<std::size_t>(file_size), '\0');
  if (file_size > 0) {
    input.read(
        contents.data(),
        static_cast<std::streamsize>(file_size));
  }
  if (!input || input.gcount() != static_cast<std::streamsize>(file_size) ||
      input.peek() != std::char_traits<char>::eof()) {
    throw ProtocolError(
        "project_file_read_failed", "project file changed while being read");
  }
  return contents;
}

std::filesystem::path project_file_path(const std::string& file_path) {
  if (file_path.empty() || file_path.find('\0') != std::string::npos) {
    throw ProtocolError(
        "invalid_params", "params.filePath must not be empty");
  }
  const std::filesystem::path path(file_path);
  if (!path.is_absolute() || path.lexically_normal() != path ||
      path.filename() != "project.vn.json") {
    throw ProtocolError(
        "invalid_params",
        "params.filePath must be a normalized absolute path named "
        "project.vn.json");
  }
  return path;
}

Json success_response(
    const Json& id,
    const std::optional<vnengine::ProjectAggregate>& aggregate,
    const std::uint64_t revision,
    const std::optional<std::uint64_t> saved_revision,
    const std::optional<std::string>& scene_id = std::nullopt,
    const std::optional<std::string>& node_id = std::nullopt,
    const std::optional<std::string>& asset_id = std::nullopt) {
  Json result{
      {"project",
       aggregate.has_value()
           ? project_to_json(aggregate->project)
           : Json(nullptr)},
      {"assets",
       aggregate.has_value()
           ? assets_to_renderer_json(aggregate->assets)
           : Json::array()},
      {"session",
       {
           {"revision", revision},
           {"savedRevision",
            saved_revision.has_value() ? Json(*saved_revision) : Json(nullptr)},
           {"isDirty",
            aggregate.has_value() &&
                (!saved_revision.has_value() ||
                 *saved_revision != revision)},
       }},
  };
  if (scene_id.has_value()) {
    result["sceneId"] = *scene_id;
  }
  if (node_id.has_value()) {
    result["nodeId"] = *node_id;
  }
  if (asset_id.has_value()) {
    result["assetId"] = *asset_id;
  }

  return {
      {"id", id},
      {"ok", true},
      {"result", std::move(result)},
  };
}

Json error_response(
    const Json& id,
    const std::string_view code,
    const std::string_view message) {
  return {
      {"id", id},
      {"ok", false},
      {"error", {{"code", code}, {"message", message}}},
  };
}

}  // namespace

Json Backend::handle(const Json& request) {
  if (!request.is_object()) {
    throw ProtocolError("invalid_request", "request must be a JSON object");
  }

  const std::string method = required_string(request, "method");
  const Json params = request.contains("params")
      ? request.at("params")
      : Json::object();
  if (!params.is_object()) {
    throw ProtocolError("invalid_params", "params must be a JSON object");
  }

  if (method == "ping") {
    return success_response(
        request_id(request), aggregate_, revision_, saved_revision_);
  }
  if (method == "project.create") {
    std::string name = params.contains("name")
        ? required_string(params, "name")
        : "未命名项目";
    const auto normalized_name =
        vnengine::normalize_project_name(std::move(name));
    if (!normalized_name.has_value()) {
      throw ProtocolError(
          "project_name_required", "project name must not be empty");
    }

    ProjectAggregate candidate = vnengine::create_empty_project_aggregate(
        ids_, *normalized_name);
    aggregate_ = std::move(candidate);
    reset_unsaved_session();
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        aggregate_->project.entry_scene_id);
  }
  if (method == "project.open") {
    const std::string file_path = required_string(params, "filePath");

    // All fallible work happens against a local aggregate. The current
    // Project and Asset manifest are replaced together only after validation.
    ProjectFileDocument candidate;
    try {
      candidate = project_file_from_json(Json::parse(
          read_project_file(file_path)));
    } catch (const Json::parse_error& error) {
      throw ProtocolError(
          "project_file_invalid",
          "project file is not valid JSON: " + std::string(error.what()));
    } catch (const ProjectFileError& error) {
      const std::string code =
          error.kind() == ProjectFileErrorKind::unsupported_format
          ? "project_file_unsupported"
          : "project_file_invalid";
      throw ProtocolError(code, error.what());
    }

    aggregate_ = std::move(candidate);
    reset_opened_session();
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        aggregate_->project.entry_scene_id);
  }
  if (method == "project.ensure") {
    if (!aggregate_.has_value()) {
      aggregate_ = vnengine::create_empty_project_aggregate(ids_);
      reset_unsaved_session();
    }
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        aggregate_->project.entry_scene_id);
  }
  if (method == "project.get") {
    require_project();
    return success_response(
        request_id(request), aggregate_, revision_, saved_revision_);
  }
  if (method == "project.save") {
    require_project();
    const std::filesystem::path file_path = project_file_path(
        required_string(params, "filePath"));

    std::string contents;
    try {
      contents = project_file_to_json(require_aggregate()).dump(2);
      contents.push_back('\n');
      atomic_write_file(file_path, contents);
    } catch (const ProjectFileError& error) {
      throw ProtocolError("project_save_failed", error.what());
    } catch (const std::exception&) {
      // File-system details can contain private paths and are not useful to a
      // renderer. The stable code lets Electron show an actionable message.
      throw ProtocolError(
          "project_save_failed",
          "project file could not be saved safely");
    }

    saved_revision_ = revision_;
    return success_response(
        request_id(request), aggregate_, revision_, saved_revision_);
  }
  if (method == "asset.import") {
    ProjectAggregate& current = require_aggregate();
    const std::string source_file_path =
        required_string(params, "sourceFilePath");
    const std::filesystem::path project_path = project_file_path(
        required_string(params, "projectFilePath"));

    std::string asset_id;
    for (int attempt = 0; attempt < 32; ++attempt) {
      std::string candidate_id = ids_.next();
      if (vnengine::find_asset(current, candidate_id) == nullptr) {
        asset_id = std::move(candidate_id);
        break;
      }
    }
    if (asset_id.empty()) {
      throw ProtocolError(
          "internal_error", "could not generate a unique image Asset ID");
    }

    ImageAssetImportPlan plan;
    try {
      plan = plan_image_asset_import(source_file_path, asset_id);
    } catch (const ImageAssetImportError& error) {
      throw ProtocolError("asset_import_failed", error.what());
    }

    // Validate a complete aggregate before touching the project directory.
    // Once the no-clobber file publication succeeds, move assignment commits
    // this already-validated candidate without allocating or copying.
    ProjectAggregate candidate = current;
    candidate.assets.push_back(Asset{
        .id = asset_id,
        .type = AssetType::image,
        .relative_path = plan.relative_path,
        .display_name = plan.display_name,
    });
    if (const auto violation =
            vnengine::validate_project_aggregate(candidate);
        violation.has_value()) {
      throw ProtocolError("internal_error", *violation);
    }

    try {
      copy_image_asset_no_clobber(
          std::filesystem::path(source_file_path),
          project_path.parent_path(),
          plan);
    } catch (const ImageAssetImportError& error) {
      throw ProtocolError("asset_import_failed", error.what());
    } catch (const std::exception&) {
      throw ProtocolError(
          "asset_import_failed", "image Asset could not be imported safely");
    }

    static_assert(
        std::is_nothrow_move_assignable_v<ProjectAggregate>,
        "filesystem publication requires a no-throw aggregate commit");
    current = std::move(candidate);
    record_mutation(true);
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        std::nullopt,
        std::nullopt,
        asset_id);
  }

  vnengine::Project& project = require_project();
  bool changed = false;

  if (method == "project.rename") {
    const auto name = vnengine::normalize_project_name(
        required_string(params, "name"));
    if (!name.has_value()) {
      throw ProtocolError(
          "project_name_required", "project name must not be empty");
    }
    changed = vnengine::rename_project(project, *name);
  } else if (method == "scene.add") {
    std::optional<std::string> name;
    if (params.contains("name")) {
      name = required_string(params, "name");
    }
    const std::string scene_id =
        vnengine::add_scene(project, ids_, std::move(name));
    if (const auto violation =
            vnengine::validate_project_aggregate(require_aggregate());
        violation.has_value()) {
      throw ProtocolError("internal_error", *violation);
    }
    record_mutation(true);
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        scene_id);
  } else if (method == "scene.rename") {
    const std::string scene_id = required_string(params, "sceneId");
    if (vnengine::find_scene(project, scene_id) == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    changed = vnengine::rename_scene(
        project,
        scene_id,
        required_string(params, "name"));
  } else if (method == "scene.setBackground") {
    const std::string scene_id = required_string(params, "sceneId");
    if (!params.contains("assetId") ||
        (!params.at("assetId").is_null() &&
         !params.at("assetId").is_string())) {
      throw ProtocolError(
          "invalid_params", "params.assetId must be a string or null");
    }

    std::optional<std::string> asset_id;
    if (!params.at("assetId").is_null()) {
      asset_id = params.at("assetId").get<std::string>();
    }

    switch (vnengine::set_scene_background(
        require_aggregate(), scene_id, std::move(asset_id))) {
      case vnengine::SetSceneBackgroundResult::changed:
        changed = true;
        break;
      case vnengine::SetSceneBackgroundResult::unchanged:
        changed = false;
        break;
      case vnengine::SetSceneBackgroundResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::SetSceneBackgroundResult::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case vnengine::SetSceneBackgroundResult::asset_not_image:
        throw ProtocolError(
            "asset_not_image", "scene background asset must be an image");
    }
  } else if (method == "scene.delete") {
    const std::string scene_id = required_string(params, "sceneId");
    if (vnengine::find_scene(project, scene_id) == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    for (const vnengine::Scene& owner : project.scenes) {
      for (const vnengine::SceneNode& node : owner.nodes) {
        const auto* jump = std::get_if<vnengine::SceneJumpNode>(&node);
        if (jump != nullptr && jump->target_scene_id == scene_id) {
          throw ProtocolError(
              "scene_in_use", "scene is referenced by a scene jump node");
        }
      }
    }
    changed = vnengine::delete_scene(project, scene_id);
  } else if (method == "background.add") {
    const std::string scene_id = required_string(params, "sceneId");
    if (params.contains("assetId")) {
      throw ProtocolError(
          "invalid_params",
          "background.add always creates an empty node; use background.update to assign an image");
    }

    std::optional<std::string> after_node_id;
    if (params.contains("afterNodeId") &&
        !params.at("afterNodeId").is_null()) {
      after_node_id = required_string(params, "afterNodeId");
    }
    std::optional<std::string> before_node_id;
    if (params.contains("beforeNodeId") &&
        !params.at("beforeNodeId").is_null()) {
      before_node_id = required_string(params, "beforeNodeId");
    }

    // Work on a complete candidate so even a generated-ID collision or a
    // future invariant failure cannot partially alter the current document.
    ProjectAggregate candidate = require_aggregate();
    const vnengine::AddBackgroundNodeResult result =
        vnengine::add_background_node(
            candidate,
            ids_,
            scene_id,
            std::move(after_node_id),
            std::move(before_node_id));
    switch (result.status) {
      case vnengine::AddBackgroundNodeStatus::added:
        break;
      case vnengine::AddBackgroundNodeStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::AddBackgroundNodeStatus::placement_conflict:
        throw ProtocolError(
            "background_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case vnengine::AddBackgroundNodeStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
    }
    if (const auto violation = vnengine::validate_project_aggregate(candidate);
        violation.has_value()) {
      throw ProtocolError("internal_error", *violation);
    }
    require_aggregate() = std::move(candidate);
    record_mutation(true);
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        scene_id,
        result.node_id);
  } else if (method == "background.update") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    if (!params.contains("assetId") ||
        (!params.at("assetId").is_null() &&
         !params.at("assetId").is_string())) {
      throw ProtocolError(
          "invalid_params", "params.assetId must be a string or null");
    }
    std::optional<std::string> asset_id;
    if (!params.at("assetId").is_null()) {
      asset_id = params.at("assetId").get<std::string>();
    }
    switch (vnengine::update_background_node(
        require_aggregate(), scene_id, node_id, asset_id)) {
      case vnengine::UpdateBackgroundNodeResult::changed:
        changed = true;
        break;
      case vnengine::UpdateBackgroundNodeResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateBackgroundNodeResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::UpdateBackgroundNodeResult::node_not_found:
        throw ProtocolError(
            "background_node_not_found", "background node does not exist");
      case vnengine::UpdateBackgroundNodeResult::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case vnengine::UpdateBackgroundNodeResult::asset_not_image:
        throw ProtocolError(
            "asset_not_image", "background node asset must be an image");
    }
  } else if (method == "background.delete") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    if (vnengine::find_background_node(*scene, node_id) == nullptr) {
      throw ProtocolError(
          "background_node_not_found", "background node does not exist");
    }
    changed = vnengine::delete_background_node(project, scene_id, node_id);
  } else if (method == "background.reorder") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    if (!params.contains("beforeNodeId") ||
        (!params.at("beforeNodeId").is_null() &&
         !params.at("beforeNodeId").is_string())) {
      throw ProtocolError(
          "invalid_params",
          "params.beforeNodeId must be a string or null");
    }
    std::optional<std::string> before_node_id;
    if (!params.at("beforeNodeId").is_null()) {
      before_node_id = required_string(params, "beforeNodeId");
    }

    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    if (vnengine::find_background_node(*scene, node_id) == nullptr) {
      throw ProtocolError(
          "background_node_not_found", "background node does not exist");
    }
    if (before_node_id == node_id) {
      throw ProtocolError(
          "invalid_params", "params.beforeNodeId must differ from nodeId");
    }
    if (before_node_id.has_value() &&
        vnengine::find_scene_node(*scene, *before_node_id) == nullptr) {
      throw ProtocolError("node_not_found", "timeline anchor does not exist");
    }
    changed = vnengine::reorder_scene_node(
        project, scene_id, node_id, std::move(before_node_id));
  } else if (method == "character.add") {
    const std::string scene_id = required_string(params, "sceneId");
    if (params.contains("assetId") || params.contains("slot") ||
        params.contains("layer")) {
      throw ProtocolError(
          "invalid_params",
          "character.add always creates an empty centered layer-1 node");
    }
    std::optional<std::string> after_node_id;
    if (params.contains("afterNodeId") &&
        !params.at("afterNodeId").is_null()) {
      after_node_id = required_string(params, "afterNodeId");
    }
    std::optional<std::string> before_node_id;
    if (params.contains("beforeNodeId") &&
        !params.at("beforeNodeId").is_null()) {
      before_node_id = required_string(params, "beforeNodeId");
    }

    ProjectAggregate candidate = require_aggregate();
    const vnengine::AddCharacterNodeResult result =
        vnengine::add_character_node(
            candidate,
            ids_,
            scene_id,
            std::move(after_node_id),
            std::move(before_node_id));
    switch (result.status) {
      case vnengine::AddCharacterNodeStatus::added:
        break;
      case vnengine::AddCharacterNodeStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::AddCharacterNodeStatus::placement_conflict:
        throw ProtocolError(
            "character_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case vnengine::AddCharacterNodeStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
    }
    if (const auto violation = vnengine::validate_project_aggregate(candidate);
        violation.has_value()) {
      throw ProtocolError("internal_error", *violation);
    }
    require_aggregate() = std::move(candidate);
    record_mutation(true);
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        scene_id,
        result.node_id);
  } else if (method == "character.update") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    if (!params.contains("assetId") ||
        (!params.at("assetId").is_null() &&
         !params.at("assetId").is_string())) {
      throw ProtocolError(
          "invalid_params", "params.assetId must be a string or null");
    }
    std::optional<std::string> asset_id;
    if (params.at("assetId").is_string()) {
      asset_id = params.at("assetId").get<std::string>();
    }
    switch (vnengine::update_character_node(
        require_aggregate(),
        scene_id,
        node_id,
        std::move(asset_id),
        required_character_slot(params),
        required_character_layer(params))) {
      case vnengine::UpdateCharacterNodeResult::changed:
        changed = true;
        break;
      case vnengine::UpdateCharacterNodeResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateCharacterNodeResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::UpdateCharacterNodeResult::node_not_found:
        throw ProtocolError(
            "character_node_not_found", "character node does not exist");
      case vnengine::UpdateCharacterNodeResult::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case vnengine::UpdateCharacterNodeResult::asset_not_image:
        throw ProtocolError(
            "asset_not_image", "character node asset must be an image");
      case vnengine::UpdateCharacterNodeResult::invalid_slot:
      case vnengine::UpdateCharacterNodeResult::invalid_layer:
        throw ProtocolError("invalid_params", "character node fields are invalid");
    }
  } else if (method == "sceneJump.add") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string target_scene_id =
        required_string(params, "targetSceneId");
    std::optional<std::string> after_node_id;
    if (params.contains("afterNodeId") &&
        !params.at("afterNodeId").is_null()) {
      after_node_id = required_string(params, "afterNodeId");
    }
    std::optional<std::string> before_node_id;
    if (params.contains("beforeNodeId") &&
        !params.at("beforeNodeId").is_null()) {
      before_node_id = required_string(params, "beforeNodeId");
    }

    ProjectAggregate candidate = require_aggregate();
    const vnengine::AddSceneJumpNodeResult result =
        vnengine::add_scene_jump_node(
            candidate.project,
            ids_,
            scene_id,
            target_scene_id,
            std::move(after_node_id),
            std::move(before_node_id));
    switch (result.status) {
      case vnengine::AddSceneJumpNodeStatus::added:
        break;
      case vnengine::AddSceneJumpNodeStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::AddSceneJumpNodeStatus::target_scene_not_found:
        throw ProtocolError(
            "target_scene_not_found", "target scene does not exist");
      case vnengine::AddSceneJumpNodeStatus::self_target:
        throw ProtocolError(
            "scene_jump_self_target", "scene jump cannot target its own scene");
      case vnengine::AddSceneJumpNodeStatus::placement_conflict:
        throw ProtocolError(
            "scene_jump_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case vnengine::AddSceneJumpNodeStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
    }
    if (const auto violation = vnengine::validate_project_aggregate(candidate);
        violation.has_value()) {
      throw ProtocolError("internal_error", *violation);
    }
    require_aggregate() = std::move(candidate);
    record_mutation(true);
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        scene_id,
        result.node_id);
  } else if (method == "sceneJump.update") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    const std::string target_scene_id =
        required_string(params, "targetSceneId");
    switch (vnengine::update_scene_jump_node(
        project, scene_id, node_id, target_scene_id)) {
      case vnengine::UpdateSceneJumpNodeResult::changed:
        changed = true;
        break;
      case vnengine::UpdateSceneJumpNodeResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateSceneJumpNodeResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::UpdateSceneJumpNodeResult::node_not_found:
        throw ProtocolError(
            "scene_jump_node_not_found", "scene jump node does not exist");
      case vnengine::UpdateSceneJumpNodeResult::target_scene_not_found:
        throw ProtocolError(
            "target_scene_not_found", "target scene does not exist");
      case vnengine::UpdateSceneJumpNodeResult::self_target:
        throw ProtocolError(
            "scene_jump_self_target", "scene jump cannot target its own scene");
    }
  } else if (method == "timeline.deleteMany") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::vector<std::string> node_ids =
        required_unique_string_array(params, "nodeIds");
    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    for (const std::string& node_id : node_ids) {
      if (vnengine::find_scene_node(*scene, node_id) == nullptr) {
        throw ProtocolError("node_not_found", "timeline node does not exist");
      }
    }
    changed = vnengine::delete_scene_nodes(project, scene_id, node_ids);
  } else if (method == "timeline.reorder" ||
             method == "timeline.reorderMany") {
    const std::string scene_id = required_string(params, "sceneId");
    std::vector<std::string> node_ids;
    if (method == "timeline.reorder") {
      node_ids.push_back(required_string(params, "nodeId"));
    } else {
      node_ids = required_unique_string_array(params, "nodeIds");
    }
    if (!params.contains("beforeNodeId") ||
        (!params.at("beforeNodeId").is_null() &&
         !params.at("beforeNodeId").is_string())) {
      throw ProtocolError(
          "invalid_params",
          "params.beforeNodeId must be a string or null");
    }

    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    const std::unordered_set<std::string> selected_ids(
        node_ids.begin(), node_ids.end());
    for (const std::string& node_id : node_ids) {
      if (vnengine::find_scene_node(*scene, node_id) == nullptr) {
        throw ProtocolError("node_not_found", "timeline node does not exist");
      }
    }

    std::optional<std::string> before_node_id;
    if (!params.at("beforeNodeId").is_null()) {
      before_node_id = required_string(params, "beforeNodeId");
      if (selected_ids.contains(*before_node_id)) {
        throw ProtocolError(
            "invalid_params",
            "params.beforeNodeId must not be one of the moved nodes");
      }
      if (vnengine::find_scene_node(*scene, *before_node_id) == nullptr) {
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      }
    }
    changed = vnengine::reorder_scene_nodes(
        project, scene_id, node_ids, std::move(before_node_id));
  } else if (method == "dialogue.add") {
    const std::string scene_id = required_string(params, "sceneId");
    std::optional<std::string> after_dialogue_id;
    if (params.contains("afterNodeId") &&
        !params.at("afterNodeId").is_null()) {
      after_dialogue_id = required_string(params, "afterNodeId");
    }
    std::optional<std::string> before_dialogue_id;
    if (params.contains("beforeNodeId") &&
        !params.at("beforeNodeId").is_null()) {
      before_dialogue_id = required_string(params, "beforeNodeId");
    }

    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    if (after_dialogue_id.has_value() &&
        before_dialogue_id.has_value()) {
      throw ProtocolError(
          "dialogue_placement_conflict",
          "afterNodeId and beforeNodeId cannot both be provided");
    }
    if (before_dialogue_id.has_value() &&
        vnengine::find_scene_node(*scene, *before_dialogue_id) == nullptr) {
      throw ProtocolError(
          "dialogue_not_found", "before timeline node does not exist");
    }

    const bool has_speaker = params.contains("speaker");
    const bool has_text = params.contains("text");
    std::string speaker = has_speaker
        ? required_string(params, "speaker")
        : std::string{};
    std::string text = has_text
        ? required_string(params, "text")
        : std::string{};

    // text 存在表示表单正在提交完整对白，必须通过内容校验。
    // 只有 speaker 而没有 text 表示尚未连接的新积木草稿：保留角色名，
    // 但仍允许空文本，连接后用户可以继续编辑。
    if (has_text) {
      const auto content = vnengine::normalize_dialogue_content(
          std::move(speaker), std::move(text));
      if (!content.has_value()) {
        throw ProtocolError(
            "dialogue_text_required", "dialogue text must not be empty");
      }
      speaker = content->speaker;
      text = content->text;
    }

    const std::optional<std::string> node_id = vnengine::add_dialogue(
        project,
        ids_,
        scene_id,
        speaker,
        text,
        std::move(after_dialogue_id),
        std::move(before_dialogue_id));
    if (!node_id.has_value()) {
      throw ProtocolError(
          "dialogue_add_failed", "could not add dialogue");
    }
    if (const auto violation =
            vnengine::validate_project_aggregate(require_aggregate());
        violation.has_value()) {
      throw ProtocolError("internal_error", *violation);
    }
    record_mutation(true);
    return success_response(
        request_id(request),
        aggregate_,
        revision_,
        saved_revision_,
        scene_id,
        node_id);
  } else if (method == "dialogue.update") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    vnengine::Dialogue* dialogue = vnengine::find_dialogue(*scene, node_id);
    if (dialogue == nullptr) {
      throw ProtocolError("dialogue_not_found", "dialogue does not exist");
    }

    std::string speaker = required_string(params, "speaker");
    std::string text = required_string(params, "text");
    const auto content = vnengine::normalize_dialogue_content(
        speaker,
        text);
    if (!content.has_value()) {
      // An empty node created by "+" is an editing placeholder. Persisting a
      // speaker-first edit keeps Blockly and C++ in sync without turning the
      // placeholder into committed dialogue. Once text has been committed,
      // clearing it is still rejected.
      if (!dialogue->text.empty()) {
        throw ProtocolError(
            "dialogue_text_required", "dialogue text must not be empty");
      }

      changed = vnengine::update_dialogue(
          project,
          scene_id,
          node_id,
          std::move(speaker),
          {});
    } else {
      changed = vnengine::update_dialogue(
          project,
          scene_id,
          node_id,
          content->speaker,
          content->text);
    }
  } else if (method == "dialogue.delete") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    if (vnengine::find_dialogue(*scene, node_id) == nullptr) {
      throw ProtocolError("dialogue_not_found", "dialogue does not exist");
    }
    changed = vnengine::delete_dialogue(project, scene_id, node_id);
  } else if (method == "dialogue.deleteMany") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::vector<std::string> node_ids =
        required_unique_string_array(params, "nodeIds");

    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }

    for (const std::string& node_id : node_ids) {
      if (vnengine::find_dialogue(*scene, node_id) == nullptr) {
        throw ProtocolError("dialogue_not_found", "dialogue does not exist");
      }
    }

    changed = vnengine::delete_dialogues(project, scene_id, node_ids);
  } else if (method == "dialogue.move") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    if (!params.contains("direction") ||
        !params.at("direction").is_number_integer()) {
      throw ProtocolError(
          "invalid_params", "params.direction must be -1 or 1");
    }
    const int direction = params.at("direction").get<int>();
    if (direction != -1 && direction != 1) {
      throw ProtocolError("invalid_params", "params.direction must be -1 or 1");
    }

    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    if (vnengine::find_dialogue(*scene, node_id) == nullptr) {
      throw ProtocolError("dialogue_not_found", "dialogue does not exist");
    }
    changed = vnengine::move_dialogue(
        project, scene_id, node_id, direction);
  } else if (method == "dialogue.reorder") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");

    if (!params.contains("beforeNodeId") ||
        (!params.at("beforeNodeId").is_null() &&
         !params.at("beforeNodeId").is_string())) {
      throw ProtocolError(
          "invalid_params",
          "params.beforeNodeId must be a string or null");
    }

    std::optional<std::string> before_dialogue_id;
    if (!params.at("beforeNodeId").is_null()) {
      before_dialogue_id = required_string(params, "beforeNodeId");
    }

    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }
    if (vnengine::find_dialogue(*scene, node_id) == nullptr) {
      throw ProtocolError("dialogue_not_found", "dialogue does not exist");
    }
    if (before_dialogue_id.has_value() &&
        vnengine::find_scene_node(*scene, *before_dialogue_id) == nullptr) {
      throw ProtocolError(
          "dialogue_not_found", "before timeline node does not exist");
    }

    // A legal no-op is still a successful command. The renderer may emit one
    // when a block is dropped back in its original position.
    changed = vnengine::reorder_dialogue(
        project,
        scene_id,
        node_id,
        std::move(before_dialogue_id));
  } else if (method == "dialogue.reorderMany") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::vector<std::string> node_ids =
        required_unique_string_array(params, "nodeIds");

    if (!params.contains("beforeNodeId") ||
        (!params.at("beforeNodeId").is_null() &&
         !params.at("beforeNodeId").is_string())) {
      throw ProtocolError(
          "invalid_params",
          "params.beforeNodeId must be a string or null");
    }

    vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    if (scene == nullptr) {
      throw ProtocolError("scene_not_found", "scene does not exist");
    }

    const std::unordered_set<std::string> selected_ids(
        node_ids.begin(), node_ids.end());
    for (const std::string& node_id : node_ids) {
      if (vnengine::find_dialogue(*scene, node_id) == nullptr) {
        throw ProtocolError("dialogue_not_found", "dialogue does not exist");
      }
    }

    std::optional<std::string> before_dialogue_id;
    if (!params.at("beforeNodeId").is_null()) {
      before_dialogue_id = required_string(params, "beforeNodeId");
      if (selected_ids.contains(*before_dialogue_id)) {
        throw ProtocolError(
            "invalid_params",
            "params.beforeNodeId must not be one of params.nodeIds");
      }
      if (vnengine::find_scene_node(*scene, *before_dialogue_id) == nullptr) {
        throw ProtocolError(
            "dialogue_not_found", "before timeline node does not exist");
      }
    }

    // Legal no-ops still return a successful authoritative snapshot.
    changed = vnengine::reorder_dialogues(
        project,
        scene_id,
        node_ids,
        std::move(before_dialogue_id));
  } else {
    throw ProtocolError("method_not_found", "unknown method: " + method);
  }

  if (const auto violation =
          vnengine::validate_project_aggregate(require_aggregate());
      violation.has_value()) {
    throw ProtocolError("internal_error", *violation);
  }
  record_mutation(changed);
  return success_response(
      request_id(request), aggregate_, revision_, saved_revision_);
}

Json Backend::request_id(const Json& request) {
  return request.contains("id") ? request.at("id") : Json(nullptr);
}

ProjectAggregate& Backend::require_aggregate() {
  if (!aggregate_.has_value()) {
    throw ProtocolError(
        "project_not_created",
        "call project.create before using this method");
  }
  return *aggregate_;
}

Project& Backend::require_project() {
  return require_aggregate().project;
}

void Backend::reset_unsaved_session() {
  revision_ = 0;
  saved_revision_.reset();
}

void Backend::reset_opened_session() {
  revision_ = 0;
  saved_revision_ = 0;
}

void Backend::record_mutation(const bool changed) {
  if (changed) {
    ++revision_;
  }
}

std::string Backend::process_line(const std::string_view line) {
  Json id = nullptr;
  Json response;

  try {
    const Json request = Json::parse(line);
    if (request.is_object() && request.contains("id")) {
      id = request.at("id");
    }
    response = handle(request);
  } catch (const ProtocolError& error) {
    response = error_response(id, error.code(), error.what());
  } catch (const Json::exception& error) {
    response = error_response(id, "invalid_json", error.what());
  } catch (const std::exception& error) {
    std::cerr << "vn_engine_backend internal error: " << error.what() << '\n';
    response = error_response(id, "internal_error", "unexpected backend error");
  }

  return response.dump();
}

}  // namespace vnengine::backend
