// 文件职责：将精确校验后的 JSONL 命令映射到 C++ Core 原子操作。
// 关键实现：Backend::handle、参数解析、业务错误码、revision 与项目快照提交。
#include "backend.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <initializer_list>
#include <iostream>
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
#include "asset_import.hpp"
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

void require_exact_params(
    const Json& params,
    const std::initializer_list<std::string_view> expected_fields) {
  std::unordered_set<std::string> expected;
  for (const std::string_view field : expected_fields) {
    expected.emplace(field);
    if (!params.contains(std::string(field))) {
      throw ProtocolError(
          "invalid_params",
          "params." + std::string(field) + " is required");
    }
  }
  for (const auto& [field, unused] : params.items()) {
    static_cast<void>(unused);
    if (!expected.contains(field)) {
      throw ProtocolError(
          "invalid_params", "params contains unknown field: " + field);
    }
  }
}

void require_params_with_optional(
    const Json& params,
    const std::initializer_list<std::string_view> required_fields,
    const std::initializer_list<std::string_view> optional_fields) {
  std::unordered_set<std::string> allowed;
  for (const std::string_view field : required_fields) {
    allowed.emplace(field);
    if (!params.contains(std::string(field))) {
      throw ProtocolError(
          "invalid_params",
          "params." + std::string(field) + " is required");
    }
  }
  for (const std::string_view field : optional_fields) {
    allowed.emplace(field);
  }
  for (const auto& [field, unused] : params.items()) {
    static_cast<void>(unused);
    if (!allowed.contains(field)) {
      throw ProtocolError(
          "invalid_params", "params contains unknown field: " + field);
    }
  }
}

std::optional<std::string> required_nullable_string(
    const Json& object,
    const std::string_view field_name) {
  const std::string key(field_name);
  if (!object.contains(key) ||
      (!object.at(key).is_null() && !object.at(key).is_string())) {
    throw ProtocolError(
        "invalid_params", "params." + key + " must be a string or null");
  }
  if (object.at(key).is_null()) {
    return std::nullopt;
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

std::vector<CgGalleryPage> required_cg_gallery_pages(const Json& object) {
  constexpr std::string_view field_name = "pages";
  const std::string key(field_name);
  if (!object.contains(key) || !object.at(key).is_array() ||
      object.at(key).empty()) {
    throw ProtocolError(
        "invalid_params", "params.pages must be a non-empty array");
  }

  std::vector<CgGalleryPage> pages;
  pages.reserve(object.at(key).size());
  std::unordered_set<std::string> unique_asset_ids;
  for (std::size_t page_index = 0;
       page_index < object.at(key).size();
       ++page_index) {
    const Json& page_json = object.at(key).at(page_index);
    if (!page_json.is_object() || page_json.size() != 1U ||
        !page_json.contains("imageAssetIds")) {
      throw ProtocolError(
          "invalid_params",
          "params.pages must contain only imageAssetIds page objects");
    }
    const Json& slots = page_json.at("imageAssetIds");
    if (!slots.is_array() || slots.size() != kCgGalleryPageSize) {
      throw ProtocolError(
          "invalid_params",
          "params.pages[].imageAssetIds must contain exactly " +
              std::to_string(kCgGalleryPageSize) + " items");
    }

    CgGalleryPage page;
    for (std::size_t slot_index = 0;
         slot_index < kCgGalleryPageSize;
         ++slot_index) {
      const Json& value = slots.at(slot_index);
      if (value.is_null()) {
        continue;
      }
      if (!value.is_string() || value.get_ref<const std::string&>().empty()) {
        throw ProtocolError(
            "invalid_params",
            "params.pages[].imageAssetIds must contain strings or null");
      }
      const std::string asset_id = value.get<std::string>();
      if (!unique_asset_ids.insert(asset_id).second) {
        throw ProtocolError(
            "invalid_params",
            "params.pages[].imageAssetIds must not contain duplicates");
      }
      page.image_asset_ids[slot_index] = asset_id;
    }
    pages.push_back(std::move(page));
  }
  return pages;
}

LogicValue required_logic_value(
    const Json& object,
    const std::string_view field_name) {
  const std::string key(field_name);
  if (!object.contains(key)) {
    throw ProtocolError(
        "invalid_params", "params." + key + " is required");
  }
  const Json& value = object.at(key);
  LogicValue parsed;
  if (value.is_boolean()) {
    parsed = value.get<bool>();
  } else if (value.is_number()) {
    const double number = value.get<double>();
    if (!std::isfinite(number)) {
      throw ProtocolError(
          "invalid_params", "params." + key + " must be finite");
    }
    parsed = number;
  } else if (value.is_string()) {
    parsed = value.get<std::string>();
  } else {
    throw ProtocolError(
        "invalid_params",
        "params." + key + " must be a boolean, number, or string");
  }
  if (const auto violation = validate_logic_value(parsed);
      violation.has_value()) {
    throw ProtocolError("invalid_params", "params." + key + " is invalid");
  }
  return parsed;
}

LogicOperand required_logic_operand(
    const Json& value,
    const std::string& context) {
  if (!value.is_object() || !value.contains("kind") ||
      !value.at("kind").is_string()) {
    throw ProtocolError("invalid_params", context + ".kind must be a string");
  }
  const std::string kind = value.at("kind").get<std::string>();
  LogicOperand operand;
  if (kind == "variable") {
    if (value.size() != 2U || !value.contains("name") ||
        !value.at("name").is_string()) {
      throw ProtocolError(
          "invalid_params", context + " must contain only kind and name");
    }
    operand = LogicVariableOperand{
        .name = value.at("name").get<std::string>(),
    };
  } else if (kind == "literal") {
    if (value.size() != 2U || !value.contains("value")) {
      throw ProtocolError(
          "invalid_params", context + " must contain only kind and value");
    }
    Json wrapper{{"value", value.at("value")}};
    operand = LogicLiteralOperand{
        .value = required_logic_value(wrapper, "value"),
    };
  } else {
    throw ProtocolError(
        "invalid_params", context + ".kind is not supported");
  }
  if (const auto violation = validate_logic_operand(operand);
      violation.has_value()) {
    throw ProtocolError("invalid_params", context + " is invalid");
  }
  return operand;
}

LogicComparisonOperator required_logic_comparison(const Json& value) {
  if (!value.is_string()) {
    throw ProtocolError(
        "invalid_params", "params.condition.operator must be a string");
  }
  const std::string comparison = value.get<std::string>();
  if (comparison == "eq") {
    return LogicComparisonOperator::equal;
  }
  if (comparison == "neq") {
    return LogicComparisonOperator::not_equal;
  }
  if (comparison == "gt") {
    return LogicComparisonOperator::greater;
  }
  if (comparison == "gte") {
    return LogicComparisonOperator::greater_or_equal;
  }
  if (comparison == "lt") {
    return LogicComparisonOperator::less;
  }
  if (comparison == "lte") {
    return LogicComparisonOperator::less_or_equal;
  }
  throw ProtocolError(
      "invalid_params", "params.condition.operator is not supported");
}

LogicCondition required_logic_condition(const Json& params) {
  if (!params.contains("condition") || !params.at("condition").is_object()) {
    throw ProtocolError(
        "invalid_params", "params.condition must be an object");
  }
  const Json& value = params.at("condition");
  if (value.size() != 3U || !value.contains("left") ||
      !value.contains("operator") || !value.contains("right")) {
    throw ProtocolError(
        "invalid_params",
        "params.condition must contain only left, operator, and right");
  }
  LogicCondition condition{
      .left = required_logic_operand(value.at("left"), "params.condition.left"),
      .comparison = required_logic_comparison(value.at("operator")),
      .right = required_logic_operand(
          value.at("right"), "params.condition.right"),
  };
  if (validate_logic_condition(condition).has_value()) {
    throw ProtocolError("invalid_params", "params.condition is invalid");
  }
  return condition;
}

int required_logic_repeat_count(const Json& params) {
  if (!params.contains("count") || !params.at("count").is_number_integer()) {
    throw ProtocolError(
        "invalid_params", "params.count must be an integer between 1 and 1000");
  }
  try {
    const int count = params.at("count").get<int>();
    if (count >= 1 && count <= kMaximumLogicRepeatCount) {
      return count;
    }
  } catch (const Json::exception&) {
  }
  throw ProtocolError(
      "invalid_params", "params.count must be an integer between 1 and 1000");
}

int required_cg_lead_in_ms(const Json& params) {
  if (!params.contains("leadInMs") ||
      !params.at("leadInMs").is_number_integer()) {
    throw ProtocolError(
        "invalid_params",
        "params.leadInMs must be an integer between 0 and 60000");
  }
  try {
    const int lead_in_ms = params.at("leadInMs").get<int>();
    if (lead_in_ms >= 0 && lead_in_ms <= kMaximumCgLeadInMs) {
      return lead_in_ms;
    }
  } catch (const Json::exception&) {
  }
  throw ProtocolError(
      "invalid_params",
      "params.leadInMs must be an integer between 0 and 60000");
}

std::optional<std::string> optional_timeline_anchor(
    const Json& params,
    const std::string_view field_name) {
  const std::string key(field_name);
  if (!params.contains(key) || params.at(key).is_null()) {
    return std::nullopt;
  }
  return required_string(params, key);
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

std::optional<CharacterPosition> required_character_position(
    const Json& object) {
  if (!object.contains("position")) {
    throw ProtocolError("invalid_params", "params.position is required");
  }
  const Json& position = object.at("position");
  if (position.is_null()) {
    return std::nullopt;
  }
  if (!position.is_object() || position.size() != 2 ||
      !position.contains("x") || !position.contains("y") ||
      !position.at("x").is_number() || !position.at("y").is_number()) {
    throw ProtocolError(
        "invalid_params", "params.position must contain numeric x and y");
  }
  const double x = position.at("x").get<double>();
  const double y = position.at("y").get<double>();
  if (!std::isfinite(x) || !std::isfinite(y) || x < 0.0 || x > 100.0 ||
      y < 0.0 || y > 100.0) {
    throw ProtocolError(
        "invalid_params", "params.position coordinates must be between 0 and 100");
  }
  return CharacterPosition{.x = x, .y = y};
}

CharacterNodeMode required_character_node_mode(const Json& object) {
  const std::string mode = required_string(object, "mode");
  if (mode == "show") {
    return CharacterNodeMode::show;
  }
  if (mode == "clear") {
    return CharacterNodeMode::clear;
  }
  throw ProtocolError(
      "invalid_params", "params.mode must be show or clear");
}

CharacterEffectIntensity required_character_effect_intensity(
    const Json& value,
    const std::string& context) {
  if (!value.is_string()) {
    throw ProtocolError("invalid_params", context + " must be a string");
  }
  const std::string intensity = value.get<std::string>();
  if (intensity == "subtle") {
    return CharacterEffectIntensity::subtle;
  }
  if (intensity == "normal") {
    return CharacterEffectIntensity::normal;
  }
  if (intensity == "strong") {
    return CharacterEffectIntensity::strong;
  }
  throw ProtocolError(
      "invalid_params", context + " must be subtle, normal, or strong");
}

CharacterEffectDirection required_character_effect_direction(
    const Json& value,
    const std::string& context) {
  if (!value.is_string()) {
    throw ProtocolError("invalid_params", context + " must be a string");
  }
  const std::string direction = value.get<std::string>();
  if (direction == "left") {
    return CharacterEffectDirection::left;
  }
  if (direction == "right") {
    return CharacterEffectDirection::right;
  }
  if (direction == "up") {
    return CharacterEffectDirection::up;
  }
  if (direction == "down") {
    return CharacterEffectDirection::down;
  }
  throw ProtocolError(
      "invalid_params", context + " must be left, right, up, or down");
}

std::optional<CharacterEffect> required_character_effect(
    const Json& object,
    const std::string_view field_name,
    const bool nullable) {
  const std::string key(field_name);
  if (!object.contains(key)) {
    throw ProtocolError("invalid_params", "params." + key + " is required");
  }
  const Json& value = object.at(key);
  if (nullable && value.is_null()) {
    return std::nullopt;
  }
  const std::string context = "params." + key;
  if (!value.is_object() || !value.contains("type") ||
      !value.at("type").is_string()) {
    throw ProtocolError("invalid_params", context + ".type must be a string");
  }
  const auto require_shape = [&value, &context](
                                 const std::initializer_list<std::string_view>
                                     fields) {
    if (value.size() != fields.size()) {
      throw ProtocolError(
          "invalid_params", context + " contains missing or unknown fields");
    }
    for (const std::string_view field : fields) {
      if (!value.contains(std::string(field))) {
        throw ProtocolError(
            "invalid_params",
            context + "." + std::string(field) + " is required");
      }
    }
  };

  const std::string type = value.at("type").get<std::string>();
  CharacterEffect effect;
  if (type == "shake" || type == "jump" || type == "breathe" ||
      type == "flash") {
    require_shape({"type", "durationMs", "intensity"});
    effect.type = type == "shake"
        ? CharacterEffectType::shake
        : type == "jump"
            ? CharacterEffectType::jump
            : type == "breathe"
                ? CharacterEffectType::breathe
                : CharacterEffectType::flash;
    effect.intensity = required_character_effect_intensity(
        value.at("intensity"), context + ".intensity");
  } else if (type == "fadeIn" || type == "fadeOut") {
    require_shape({"type", "durationMs"});
    effect.type = type == "fadeIn"
        ? CharacterEffectType::fade_in
        : CharacterEffectType::fade_out;
  } else if (type == "slideIn") {
    require_shape({"type", "durationMs", "intensity", "direction"});
    effect.type = CharacterEffectType::slide_in;
    effect.intensity = required_character_effect_intensity(
        value.at("intensity"), context + ".intensity");
    effect.direction = required_character_effect_direction(
        value.at("direction"), context + ".direction");
  } else {
    throw ProtocolError(
        "invalid_params", context + ".type is not supported");
  }
  if (!value.at("durationMs").is_number_integer()) {
    throw ProtocolError(
        "invalid_params",
        context + ".durationMs must be an integer between 100 and 10000");
  }
  try {
    effect.duration_ms = value.at("durationMs").get<int>();
  } catch (const Json::exception&) {
    throw ProtocolError(
        "invalid_params",
        context + ".durationMs must be an integer between 100 and 10000");
  }
  if (effect.duration_ms < 100 || effect.duration_ms > 10000) {
    throw ProtocolError(
        "invalid_params",
        context + ".durationMs must be an integer between 100 and 10000");
  }
  return effect;
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
    const std::optional<std::string>& asset_id = std::nullopt,
    const std::optional<std::string>& option_id = std::nullopt) {
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
  if (option_id.has_value()) {
    result["optionId"] = *option_id;
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
    const std::string contents = required_string(params, "contents");
    if (contents.size() > kMaximumProjectFileBytes) {
      throw ProtocolError(
          "project_file_read_failed",
          "project file exceeds the size limit");
    }

    // All fallible work happens against a local aggregate. The current
    // Project and Asset manifest are replaced together only after validation.
    ProjectFileDocument candidate;
    try {
      candidate = project_file_from_json(Json::parse(contents));
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
    const std::string kind = required_string(params, "kind");
    AssetImportKind import_kind;
    if (kind == "image") {
      import_kind = AssetImportKind::image;
    } else if (kind == "video") {
      import_kind = AssetImportKind::video;
    } else if (kind == "audio") {
      import_kind = AssetImportKind::audio;
    } else {
      throw ProtocolError(
          "invalid_params", "params.kind must be image, video, or audio");
    }

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
          "internal_error", "could not generate a unique Asset ID");
    }

    AssetImportPlan plan;
    try {
      plan = plan_asset_import(source_file_path, asset_id, import_kind);
    } catch (const ImageAssetImportError& error) {
      throw ProtocolError("asset_import_failed", error.what());
    }

    // Validate a complete aggregate before touching the project directory.
    // Once the no-clobber file publication succeeds, move assignment commits
    // this already-validated candidate without allocating or copying.
    ProjectAggregate candidate = current;
    AssetType asset_type = AssetType::image;
    switch (import_kind) {
      case AssetImportKind::image:
        asset_type = AssetType::image;
        break;
      case AssetImportKind::video:
        asset_type = AssetType::video;
        break;
      case AssetImportKind::audio:
        asset_type = AssetType::audio;
        break;
    }
    candidate.assets.push_back(Asset{
        .id = asset_id,
        .type = asset_type,
        .relative_path = plan.relative_path,
        .display_name = plan.display_name,
    });
    if (const auto violation =
            vnengine::validate_project_aggregate(candidate);
        violation.has_value()) {
      throw ProtocolError("internal_error", *violation);
    }

    try {
      copy_asset_no_clobber(
          std::filesystem::path(source_file_path),
          project_path.parent_path(),
          plan,
          import_kind);
    } catch (const ImageAssetImportError& error) {
      throw ProtocolError("asset_import_failed", error.what());
    } catch (const std::exception&) {
      throw ProtocolError(
          "asset_import_failed", "Asset could not be imported safely");
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
  } else if (method == "startScreen.update") {
    require_exact_params(
        params, {"title", "backgroundAssetId", "musicAssetId"});
    switch (vnengine::update_start_screen(
        require_aggregate(),
        required_string(params, "title"),
        required_nullable_string(params, "backgroundAssetId"),
        required_nullable_string(params, "musicAssetId"))) {
      case vnengine::UpdateStartScreenResult::changed:
        changed = true;
        break;
      case vnengine::UpdateStartScreenResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateStartScreenResult::title_required:
        throw ProtocolError(
            "start_screen_title_required",
            "start screen title must not be empty");
      case vnengine::UpdateStartScreenResult::background_asset_not_found:
      case vnengine::UpdateStartScreenResult::music_asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case vnengine::UpdateStartScreenResult::background_asset_not_image:
        throw ProtocolError(
            "asset_not_image",
            "start screen background asset must be an image");
      case vnengine::UpdateStartScreenResult::music_asset_not_audio:
        throw ProtocolError(
            "asset_not_audio", "start screen music asset must be audio");
    }
  } else if (method == "cgGallery.update") {
    require_exact_params(params, {"pages"});
    switch (vnengine::update_cg_gallery(
        require_aggregate(),
        required_cg_gallery_pages(params))) {
      case vnengine::UpdateCgGalleryResult::changed:
        changed = true;
        break;
      case vnengine::UpdateCgGalleryResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateCgGalleryResult::page_required:
        throw ProtocolError(
            "invalid_params", "params.pages must contain at least one page");
      case vnengine::UpdateCgGalleryResult::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case vnengine::UpdateCgGalleryResult::asset_not_image:
        throw ProtocolError(
            "asset_not_image", "CG gallery asset must be an image");
      case vnengine::UpdateCgGalleryResult::duplicate_asset_id:
        throw ProtocolError(
            "invalid_params",
            "params.pages[].imageAssetIds must not contain duplicates");
    }
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
        const auto* choice = std::get_if<vnengine::ChoiceNode>(&node);
        if (choice != nullptr && owner.id != scene_id &&
            std::any_of(
                choice->options.begin(),
                choice->options.end(),
                [&scene_id](const vnengine::ChoiceOption& option) {
                  return option.target_scene_id == scene_id;
                })) {
          throw ProtocolError(
              "scene_in_use", "scene is referenced by a choice option");
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
      case vnengine::AddBackgroundNodeStatus::control_boundary_conflict:
        throw ProtocolError(
            "cg_display_body_invalid",
            "CG display body may contain only dialogue nodes");
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
    require_params_with_optional(
        params,
        {"sceneId"},
        {"mode", "assetId", "afterNodeId", "beforeNodeId"});
    const std::string scene_id = required_string(params, "sceneId");
    const CharacterNodeMode mode = params.contains("mode")
        ? required_character_node_mode(params)
        : CharacterNodeMode::show;
    std::optional<std::string> initial_asset_id;
    if (params.contains("assetId")) {
      initial_asset_id = required_nullable_string(params, "assetId");
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
    if (mode == CharacterNodeMode::clear && initial_asset_id.has_value()) {
      throw ProtocolError(
          "invalid_params", "params.assetId must be null when mode is clear");
    }
    if (initial_asset_id.has_value()) {
      const vnengine::Asset* asset =
          vnengine::find_asset(candidate, *initial_asset_id);
      if (asset == nullptr) {
        throw ProtocolError("asset_not_found", "asset does not exist");
      }
      if (asset->type != vnengine::AssetType::image) {
        throw ProtocolError(
            "asset_not_image", "character node asset must be an image");
      }
    }
    const vnengine::AddCharacterNodeResult result =
        vnengine::add_character_node(
            candidate,
            ids_,
            scene_id,
            std::move(after_node_id),
            std::move(before_node_id),
            mode);
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
      case vnengine::AddCharacterNodeStatus::control_boundary_conflict:
        throw ProtocolError(
            "cg_display_body_invalid",
            "CG display body may contain only dialogue nodes");
      case vnengine::AddCharacterNodeStatus::invalid_mode:
        throw ProtocolError("invalid_params", "character node mode is invalid");
    }
    if (initial_asset_id.has_value()) {
      if (!result.node_id.has_value()) {
        throw ProtocolError(
            "internal_error", "character.add did not return a node ID");
      }
      switch (vnengine::update_character_node(
          candidate,
          scene_id,
          *result.node_id,
          std::move(initial_asset_id),
          vnengine::CharacterSlot::center,
          1,
          std::nullopt)) {
        case vnengine::UpdateCharacterNodeResult::changed:
          break;
        case vnengine::UpdateCharacterNodeResult::asset_not_found:
          throw ProtocolError("asset_not_found", "asset does not exist");
        case vnengine::UpdateCharacterNodeResult::asset_not_image:
          throw ProtocolError(
              "asset_not_image", "character node asset must be an image");
        case vnengine::UpdateCharacterNodeResult::unchanged:
        case vnengine::UpdateCharacterNodeResult::scene_not_found:
        case vnengine::UpdateCharacterNodeResult::node_not_found:
        case vnengine::UpdateCharacterNodeResult::invalid_slot:
        case vnengine::UpdateCharacterNodeResult::invalid_layer:
        case vnengine::UpdateCharacterNodeResult::invalid_position:
        case vnengine::UpdateCharacterNodeResult::invalid_mode:
          throw ProtocolError(
              "internal_error", "character.add initial asset update failed");
      }
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
    require_params_with_optional(
        params,
        {"sceneId", "nodeId", "assetId", "slot", "layer", "position"},
        {"mode"});
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
        required_character_layer(params),
        required_character_position(params),
        params.contains("mode")
            ? std::optional<CharacterNodeMode>(
                  required_character_node_mode(params))
            : std::nullopt)) {
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
      case vnengine::UpdateCharacterNodeResult::invalid_position:
      case vnengine::UpdateCharacterNodeResult::invalid_mode:
        throw ProtocolError("invalid_params", "character node fields are invalid");
    }
  } else if (method == "characterEffect.update") {
    require_exact_params(params, {"sceneId", "nodeId", "effect"});
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    switch (vnengine::update_character_effect(
        require_aggregate(),
        scene_id,
        node_id,
        required_character_effect(params, "effect", true))) {
      case vnengine::UpdateCharacterEffectResult::changed:
        changed = true;
        break;
      case vnengine::UpdateCharacterEffectResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateCharacterEffectResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::UpdateCharacterEffectResult::node_not_found:
        throw ProtocolError(
            "character_node_not_found", "character node does not exist");
      case vnengine::UpdateCharacterEffectResult::character_cleared:
        throw ProtocolError(
            "character_effect_requires_asset",
            "a character effect requires a selected portrait image");
      case vnengine::UpdateCharacterEffectResult::invalid_effect:
        throw ProtocolError("invalid_params", "character effect is invalid");
    }
  } else if (method == "characterEffect.move") {
    require_exact_params(
        params, {"sceneId", "fromNodeId", "toNodeId", "effect"});
    const std::string scene_id = required_string(params, "sceneId");
    const std::string from_node_id = required_string(params, "fromNodeId");
    const std::string to_node_id = required_string(params, "toNodeId");
    const std::optional<CharacterEffect> effect =
        required_character_effect(params, "effect", false);
    switch (vnengine::move_character_effect(
        require_aggregate(),
        scene_id,
        from_node_id,
        to_node_id,
        *effect)) {
      case vnengine::MoveCharacterEffectResult::changed:
        changed = true;
        break;
      case vnengine::MoveCharacterEffectResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::MoveCharacterEffectResult::source_node_not_found:
        throw ProtocolError(
            "character_effect_source_not_found",
            "source character node does not exist");
      case vnengine::MoveCharacterEffectResult::target_node_not_found:
        throw ProtocolError(
            "character_effect_target_not_found",
            "target character node does not exist");
      case vnengine::MoveCharacterEffectResult::same_node:
        throw ProtocolError(
            "invalid_params", "fromNodeId and toNodeId must differ");
      case vnengine::MoveCharacterEffectResult::source_effect_missing:
        throw ProtocolError(
            "character_effect_source_missing",
            "source character node has no effect");
      case vnengine::MoveCharacterEffectResult::source_effect_mismatch:
        throw ProtocolError(
            "character_effect_source_mismatch",
            "source character effect does not match the request");
      case vnengine::MoveCharacterEffectResult::target_character_cleared:
        throw ProtocolError(
            "character_effect_requires_asset",
            "target character node has no selected portrait image");
      case vnengine::MoveCharacterEffectResult::invalid_effect:
        throw ProtocolError("invalid_params", "character effect is invalid");
    }
  } else if (method == "bgm.add") {
    const std::string scene_id = required_string(params, "sceneId");
    if (params.contains("assetId")) {
      throw ProtocolError(
          "invalid_params",
          "bgm.add always creates a stop node; use bgm.update to assign audio");
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
    const vnengine::AddBgmNodeResult result = vnengine::add_bgm_node(
        candidate,
        ids_,
        scene_id,
        std::move(after_node_id),
        std::move(before_node_id));
    switch (result.status) {
      case vnengine::AddBgmNodeStatus::added:
        break;
      case vnengine::AddBgmNodeStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::AddBgmNodeStatus::placement_conflict:
        throw ProtocolError(
            "bgm_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case vnengine::AddBgmNodeStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      case vnengine::AddBgmNodeStatus::control_boundary_conflict:
        throw ProtocolError(
            "cg_display_body_invalid",
            "CG display body may contain only dialogue nodes");
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
  } else if (method == "bgm.update") {
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
    switch (vnengine::update_bgm_node(
        require_aggregate(), scene_id, node_id, std::move(asset_id))) {
      case vnengine::UpdateBgmNodeResult::changed:
        changed = true;
        break;
      case vnengine::UpdateBgmNodeResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateBgmNodeResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::UpdateBgmNodeResult::node_not_found:
        throw ProtocolError("bgm_node_not_found", "BGM node does not exist");
      case vnengine::UpdateBgmNodeResult::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case vnengine::UpdateBgmNodeResult::asset_not_audio:
        throw ProtocolError(
            "asset_not_audio", "BGM node asset must be audio");
    }
  } else if (method == "video.add") {
    const std::string scene_id = required_string(params, "sceneId");
    if (params.contains("assetId")) {
      throw ProtocolError(
          "invalid_params",
          "video.add always creates an empty node; use video.update to "
          "assign video");
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
    const vnengine::AddVideoNodeResult result = vnengine::add_video_node(
        candidate,
        ids_,
        scene_id,
        std::move(after_node_id),
        std::move(before_node_id));
    switch (result.status) {
      case vnengine::AddVideoNodeStatus::added:
        break;
      case vnengine::AddVideoNodeStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::AddVideoNodeStatus::placement_conflict:
        throw ProtocolError(
            "video_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case vnengine::AddVideoNodeStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      case vnengine::AddVideoNodeStatus::control_boundary_conflict:
        throw ProtocolError(
            "cg_display_body_invalid",
            "CG display body may contain only dialogue nodes");
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
  } else if (method == "video.update") {
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
    switch (vnengine::update_video_node(
        require_aggregate(), scene_id, node_id, std::move(asset_id))) {
      case vnengine::UpdateVideoNodeResult::changed:
        changed = true;
        break;
      case vnengine::UpdateVideoNodeResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateVideoNodeResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::UpdateVideoNodeResult::node_not_found:
        throw ProtocolError(
            "video_node_not_found", "video node does not exist");
      case vnengine::UpdateVideoNodeResult::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case vnengine::UpdateVideoNodeResult::asset_not_video:
        throw ProtocolError(
            "asset_not_video", "video node asset must be video");
    }
  } else if (method == "choice.add") {
    const std::string scene_id = required_string(params, "sceneId");
    if (params.contains("options")) {
      throw ProtocolError(
          "invalid_params",
          "choice.add always creates an empty node; use choice.option.add "
          "to create options");
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
    const vnengine::AddChoiceNodeResult result = vnengine::add_choice_node(
        candidate.project,
        ids_,
        scene_id,
        std::move(after_node_id),
        std::move(before_node_id));
    switch (result.status) {
      case vnengine::AddChoiceNodeStatus::added:
        break;
      case vnengine::AddChoiceNodeStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::AddChoiceNodeStatus::placement_conflict:
        throw ProtocolError(
            "choice_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case vnengine::AddChoiceNodeStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      case vnengine::AddChoiceNodeStatus::control_boundary_conflict:
        throw ProtocolError(
            "cg_display_body_invalid",
            "CG display body may contain only dialogue nodes");
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
  } else if (method == "choice.option.add") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    std::optional<std::string> before_option_id;
    if (params.contains("beforeOptionId") &&
        !params.at("beforeOptionId").is_null()) {
      before_option_id = required_string(params, "beforeOptionId");
    }

    ProjectAggregate candidate = require_aggregate();
    const vnengine::AddChoiceOptionResult result =
        vnengine::add_choice_option(
            candidate.project,
            ids_,
            scene_id,
            node_id,
            required_string(params, "text"),
            required_string(params, "targetSceneId"),
            std::move(before_option_id));
    switch (result.status) {
      case vnengine::AddChoiceOptionStatus::added:
        break;
      case vnengine::AddChoiceOptionStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::AddChoiceOptionStatus::node_not_found:
        throw ProtocolError(
            "choice_node_not_found", "choice node does not exist");
      case vnengine::AddChoiceOptionStatus::text_required:
        throw ProtocolError(
            "choice_text_required", "choice option text must not be empty");
      case vnengine::AddChoiceOptionStatus::target_scene_not_found:
        throw ProtocolError(
            "target_scene_not_found", "target scene does not exist");
      case vnengine::AddChoiceOptionStatus::before_option_not_found:
        throw ProtocolError(
            "choice_option_not_found", "choice option anchor does not exist");
      case vnengine::AddChoiceOptionStatus::id_generation_failed:
        throw ProtocolError(
            "internal_error", "could not generate a unique choice option ID");
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
        node_id,
        std::nullopt,
        result.option_id);
  } else if (method == "choice.option.update") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    const std::string option_id = required_string(params, "optionId");
    ProjectAggregate candidate = require_aggregate();
    const vnengine::UpdateChoiceOptionResult result =
        vnengine::update_choice_option(
            candidate.project,
            scene_id,
            node_id,
            option_id,
            required_string(params, "text"),
            required_string(params, "targetSceneId"));
    switch (result) {
      case vnengine::UpdateChoiceOptionResult::changed:
        changed = true;
        break;
      case vnengine::UpdateChoiceOptionResult::unchanged:
        changed = false;
        break;
      case vnengine::UpdateChoiceOptionResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::UpdateChoiceOptionResult::node_not_found:
        throw ProtocolError(
            "choice_node_not_found", "choice node does not exist");
      case vnengine::UpdateChoiceOptionResult::option_not_found:
        throw ProtocolError(
            "choice_option_not_found", "choice option does not exist");
      case vnengine::UpdateChoiceOptionResult::text_required:
        throw ProtocolError(
            "choice_text_required", "choice option text must not be empty");
      case vnengine::UpdateChoiceOptionResult::target_scene_not_found:
        throw ProtocolError(
            "target_scene_not_found", "target scene does not exist");
    }
    if (changed) {
      if (const auto violation =
              vnengine::validate_project_aggregate(candidate);
          violation.has_value()) {
        throw ProtocolError("internal_error", *violation);
      }
      require_aggregate() = std::move(candidate);
    }
    record_mutation(changed);
    return success_response(
        request_id(request), aggregate_, revision_, saved_revision_);
  } else if (method == "choice.option.delete") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    const std::string option_id = required_string(params, "optionId");
    ProjectAggregate candidate = require_aggregate();
    const vnengine::DeleteChoiceOptionResult result =
        vnengine::delete_choice_option(
            candidate.project, scene_id, node_id, option_id);
    switch (result) {
      case vnengine::DeleteChoiceOptionResult::changed:
        break;
      case vnengine::DeleteChoiceOptionResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::DeleteChoiceOptionResult::node_not_found:
        throw ProtocolError(
            "choice_node_not_found", "choice node does not exist");
      case vnengine::DeleteChoiceOptionResult::option_not_found:
        throw ProtocolError(
            "choice_option_not_found", "choice option does not exist");
    }
    if (const auto violation = vnengine::validate_project_aggregate(candidate);
        violation.has_value()) {
      throw ProtocolError("internal_error", *violation);
    }
    require_aggregate() = std::move(candidate);
    record_mutation(true);
    return success_response(
        request_id(request), aggregate_, revision_, saved_revision_);
  } else if (method == "choice.option.reorder") {
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    const std::string option_id = required_string(params, "optionId");
    if (!params.contains("beforeOptionId") ||
        (!params.at("beforeOptionId").is_null() &&
         !params.at("beforeOptionId").is_string())) {
      throw ProtocolError(
          "invalid_params",
          "params.beforeOptionId must be a string or null");
    }
    std::optional<std::string> before_option_id;
    if (params.at("beforeOptionId").is_string()) {
      before_option_id = params.at("beforeOptionId").get<std::string>();
    }

    ProjectAggregate candidate = require_aggregate();
    const vnengine::ReorderChoiceOptionResult result =
        vnengine::reorder_choice_option(
            candidate.project,
            scene_id,
            node_id,
            option_id,
            std::move(before_option_id));
    switch (result) {
      case vnengine::ReorderChoiceOptionResult::changed:
        changed = true;
        break;
      case vnengine::ReorderChoiceOptionResult::unchanged:
        changed = false;
        break;
      case vnengine::ReorderChoiceOptionResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::ReorderChoiceOptionResult::node_not_found:
        throw ProtocolError(
            "choice_node_not_found", "choice node does not exist");
      case vnengine::ReorderChoiceOptionResult::option_not_found:
        throw ProtocolError(
            "choice_option_not_found", "choice option does not exist");
      case vnengine::ReorderChoiceOptionResult::before_option_not_found:
        throw ProtocolError(
            "choice_option_not_found", "choice option anchor does not exist");
      case vnengine::ReorderChoiceOptionResult::self_anchor:
        throw ProtocolError(
            "invalid_params",
            "params.beforeOptionId must differ from optionId");
    }
    if (changed) {
      if (const auto violation =
              vnengine::validate_project_aggregate(candidate);
          violation.has_value()) {
        throw ProtocolError("internal_error", *violation);
      }
      require_aggregate() = std::move(candidate);
    }
    record_mutation(changed);
    return success_response(
        request_id(request), aggregate_, revision_, saved_revision_);
  } else if (method == "storyExtension.add") {
    const std::string scene_id = required_string(params, "sceneId");
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
    const vnengine::AddStoryExtensionNodeResult result =
        vnengine::add_story_extension_node(
            candidate.project,
            ids_,
            scene_id,
            std::move(after_node_id),
            std::move(before_node_id));
    switch (result.status) {
      case vnengine::AddStoryExtensionNodeStatus::added:
        break;
      case vnengine::AddStoryExtensionNodeStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::AddStoryExtensionNodeStatus::placement_conflict:
        throw ProtocolError(
            "story_extension_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case vnengine::AddStoryExtensionNodeStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      case vnengine::AddStoryExtensionNodeStatus::logic_boundary_conflict:
        throw ProtocolError(
            "story_extension_logic_boundary",
            "story extension cannot split a control");
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
  } else if (method == "cgDisplay.add") {
    require_params_with_optional(
        params,
        {"sceneId", "assetId", "leadInMs"},
        {"afterNodeId", "beforeNodeId"});
    const std::string scene_id = required_string(params, "sceneId");
    ProjectAggregate candidate = require_aggregate();
    const AddCgDisplayResult result = add_cg_display_node(
        candidate,
        ids_,
        scene_id,
        required_string(params, "assetId"),
        required_cg_lead_in_ms(params),
        optional_timeline_anchor(params, "afterNodeId"),
        optional_timeline_anchor(params, "beforeNodeId"));
    switch (result.status) {
      case AddCgDisplayStatus::added:
        break;
      case AddCgDisplayStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case AddCgDisplayStatus::placement_conflict:
        throw ProtocolError(
            "cg_display_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case AddCgDisplayStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      case AddCgDisplayStatus::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case AddCgDisplayStatus::asset_not_image:
        throw ProtocolError(
            "asset_not_image", "CG display asset must be an image");
      case AddCgDisplayStatus::invalid_lead_in:
        throw ProtocolError(
            "invalid_params", "CG display lead-in is outside the supported range");
      case AddCgDisplayStatus::boundary_conflict:
        throw ProtocolError(
            "cg_display_boundary_conflict",
            "CG display cannot cross or break another control boundary");
    }
    if (const auto violation = validate_project_aggregate(candidate);
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
  } else if (method == "cgDisplay.update") {
    require_exact_params(
        params, {"sceneId", "nodeId", "assetId", "leadInMs"});
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    ProjectAggregate candidate = require_aggregate();
    const UpdateCgDisplayResult result = update_cg_display_node(
        candidate,
        scene_id,
        node_id,
        required_string(params, "assetId"),
        required_cg_lead_in_ms(params));
    switch (result) {
      case UpdateCgDisplayResult::changed:
        changed = true;
        break;
      case UpdateCgDisplayResult::unchanged:
        changed = false;
        break;
      case UpdateCgDisplayResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case UpdateCgDisplayResult::node_not_found:
        throw ProtocolError(
            "cg_display_node_not_found", "CG display node does not exist");
      case UpdateCgDisplayResult::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case UpdateCgDisplayResult::asset_not_image:
        throw ProtocolError(
            "asset_not_image", "CG display asset must be an image");
      case UpdateCgDisplayResult::invalid_lead_in:
        throw ProtocolError(
            "invalid_params", "CG display lead-in is outside the supported range");
    }
    if (changed) {
      if (const auto violation = validate_project_aggregate(candidate);
          violation.has_value()) {
        throw ProtocolError("internal_error", *violation);
      }
      require_aggregate() = std::move(candidate);
    }
  } else if (method == "cgDisplay.delete" ||
             method == "cgDisplay.reorder") {
    if (method == "cgDisplay.delete") {
      require_exact_params(params, {"sceneId", "nodeId"});
    } else {
      require_exact_params(params, {"sceneId", "nodeId", "beforeNodeId"});
    }
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    ProjectAggregate candidate = require_aggregate();
    const CgDisplayMutationResult result = method == "cgDisplay.delete"
        ? delete_cg_display(candidate.project, scene_id, node_id)
        : reorder_cg_display(
              candidate.project,
              scene_id,
              node_id,
              required_nullable_string(params, "beforeNodeId"));
    switch (result) {
      case CgDisplayMutationResult::changed:
        changed = true;
        break;
      case CgDisplayMutationResult::unchanged:
        changed = false;
        break;
      case CgDisplayMutationResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case CgDisplayMutationResult::node_not_found:
        throw ProtocolError(
            "cg_display_node_not_found", "CG display node does not exist");
      case CgDisplayMutationResult::not_display_root:
        throw ProtocolError(
            "cg_display_root_required",
            "nodeId must identify a CG display root");
      case CgDisplayMutationResult::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      case CgDisplayMutationResult::anchor_inside_display:
        throw ProtocolError(
            "invalid_params",
            "beforeNodeId must not be inside the moved CG display");
      case CgDisplayMutationResult::boundary_conflict:
        throw ProtocolError(
            "cg_display_boundary_conflict",
            "CG display cannot cross or break another control boundary");
    }
    if (changed) {
      if (const auto violation = validate_project_aggregate(candidate);
          violation.has_value()) {
        throw ProtocolError("internal_error", *violation);
      }
      require_aggregate() = std::move(candidate);
    }
  } else if (method == "variableSet.add" ||
             method == "variableChange.add" ||
             method == "logicIf.add" ||
             method == "logicRepeat.add") {
    if (method == "variableSet.add") {
      require_params_with_optional(
          params,
          {"sceneId", "variableName", "value"},
          {"afterNodeId", "beforeNodeId"});
    } else if (method == "variableChange.add") {
      require_params_with_optional(
          params,
          {"sceneId", "variableName", "amount"},
          {"afterNodeId", "beforeNodeId"});
    } else if (method == "logicIf.add") {
      require_params_with_optional(
          params,
          {"sceneId", "condition"},
          {"afterNodeId", "beforeNodeId"});
    } else {
      require_params_with_optional(
          params,
          {"sceneId", "count"},
          {"afterNodeId", "beforeNodeId"});
    }
    const std::string scene_id = required_string(params, "sceneId");
    std::optional<std::string> after_node_id =
        optional_timeline_anchor(params, "afterNodeId");
    std::optional<std::string> before_node_id =
        optional_timeline_anchor(params, "beforeNodeId");
    ProjectAggregate candidate = require_aggregate();
    AddLogicNodeResult result{
        .status = AddLogicNodeStatus::invalid_logic,
        .node_id = std::nullopt,
    };
    if (method == "variableSet.add") {
      result = add_variable_set_node(
          candidate.project,
          ids_,
          scene_id,
          required_string(params, "variableName"),
          required_logic_value(params, "value"),
          std::move(after_node_id),
          std::move(before_node_id));
    } else if (method == "variableChange.add") {
      if (!params.contains("amount") || !params.at("amount").is_number()) {
        throw ProtocolError(
            "invalid_params", "params.amount must be a finite number");
      }
      const double amount = params.at("amount").get<double>();
      result = add_variable_change_node(
          candidate.project,
          ids_,
          scene_id,
          required_string(params, "variableName"),
          amount,
          std::move(after_node_id),
          std::move(before_node_id));
    } else if (method == "logicIf.add") {
      result = add_logic_if_node(
          candidate.project,
          ids_,
          scene_id,
          required_logic_condition(params),
          std::move(after_node_id),
          std::move(before_node_id));
    } else {
      result = add_logic_repeat_node(
          candidate.project,
          ids_,
          scene_id,
          required_logic_repeat_count(params),
          std::move(after_node_id),
          std::move(before_node_id));
    }
    switch (result.status) {
      case AddLogicNodeStatus::added:
        break;
      case AddLogicNodeStatus::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case AddLogicNodeStatus::placement_conflict:
        throw ProtocolError(
            "logic_placement_conflict",
            "afterNodeId and beforeNodeId cannot both be provided");
      case AddLogicNodeStatus::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      case AddLogicNodeStatus::invalid_logic:
        throw ProtocolError("invalid_params", "logic node data is invalid");
      case AddLogicNodeStatus::variable_limit:
        throw ProtocolError(
            "logic_variable_limit",
            "project cannot contain more than 32 logic variables");
    }
    if (const auto violation = validate_project_aggregate(candidate);
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
  } else if (method == "variableSet.update" ||
             method == "variableChange.update" ||
             method == "logicIf.update" ||
             method == "logicRepeat.update") {
    if (method == "variableSet.update") {
      require_exact_params(
          params, {"sceneId", "nodeId", "variableName", "value"});
    } else if (method == "variableChange.update") {
      require_exact_params(
          params, {"sceneId", "nodeId", "variableName", "amount"});
    } else if (method == "logicIf.update") {
      require_exact_params(
          params, {"sceneId", "nodeId", "condition"});
    } else {
      require_exact_params(params, {"sceneId", "nodeId", "count"});
    }
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    ProjectAggregate candidate = require_aggregate();
    UpdateLogicNodeResult result = UpdateLogicNodeResult::invalid_logic;
    if (method == "variableSet.update") {
      result = update_variable_set_node(
          candidate.project,
          scene_id,
          node_id,
          required_string(params, "variableName"),
          required_logic_value(params, "value"));
    } else if (method == "variableChange.update") {
      if (!params.contains("amount") || !params.at("amount").is_number()) {
        throw ProtocolError(
            "invalid_params", "params.amount must be a finite number");
      }
      result = update_variable_change_node(
          candidate.project,
          scene_id,
          node_id,
          required_string(params, "variableName"),
          params.at("amount").get<double>());
    } else if (method == "logicIf.update") {
      result = update_logic_if_node(
          candidate.project,
          scene_id,
          node_id,
          required_logic_condition(params));
    } else {
      result = update_logic_repeat_node(
          candidate.project,
          scene_id,
          node_id,
          required_logic_repeat_count(params));
    }
    switch (result) {
      case UpdateLogicNodeResult::changed:
        changed = true;
        break;
      case UpdateLogicNodeResult::unchanged:
        changed = false;
        break;
      case UpdateLogicNodeResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case UpdateLogicNodeResult::node_not_found:
        throw ProtocolError("logic_node_not_found", "logic node does not exist");
      case UpdateLogicNodeResult::invalid_logic:
        throw ProtocolError("invalid_params", "logic node data is invalid");
      case UpdateLogicNodeResult::variable_limit:
        throw ProtocolError(
            "logic_variable_limit",
            "project cannot contain more than 32 logic variables");
    }
    if (changed) {
      if (const auto violation = validate_project_aggregate(candidate);
          violation.has_value()) {
        throw ProtocolError("internal_error", *violation);
      }
      require_aggregate() = std::move(candidate);
    }
  } else if (method == "logicControl.delete" ||
             method == "logicControl.reorder") {
    if (method == "logicControl.delete") {
      require_exact_params(params, {"sceneId", "nodeId"});
    } else {
      require_exact_params(
          params, {"sceneId", "nodeId", "beforeNodeId"});
    }
    const std::string scene_id = required_string(params, "sceneId");
    const std::string node_id = required_string(params, "nodeId");
    ProjectAggregate candidate = require_aggregate();
    LogicControlMutationResult result;
    if (method == "logicControl.delete") {
      result = delete_logic_control(candidate.project, scene_id, node_id);
    } else {
      if (!params.contains("beforeNodeId") ||
          (!params.at("beforeNodeId").is_null() &&
           !params.at("beforeNodeId").is_string())) {
        throw ProtocolError(
            "invalid_params", "params.beforeNodeId must be a string or null");
      }
      result = reorder_logic_control(
          candidate.project,
          scene_id,
          node_id,
          required_nullable_string(params, "beforeNodeId"));
    }
    switch (result) {
      case LogicControlMutationResult::changed:
        changed = true;
        break;
      case LogicControlMutationResult::unchanged:
        changed = false;
        break;
      case LogicControlMutationResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case LogicControlMutationResult::node_not_found:
        throw ProtocolError("logic_node_not_found", "logic node does not exist");
      case LogicControlMutationResult::not_control_root:
        throw ProtocolError(
            "logic_control_root_required",
            "nodeId must identify an if or repeat root");
      case LogicControlMutationResult::anchor_not_found:
        throw ProtocolError("node_not_found", "timeline anchor does not exist");
      case LogicControlMutationResult::anchor_inside_control:
        throw ProtocolError(
            "invalid_params",
            "beforeNodeId must not be inside the moved control");
    }
    if (changed) {
      if (const auto violation = validate_project_aggregate(candidate);
          violation.has_value()) {
        throw ProtocolError("internal_error", *violation);
      }
      require_aggregate() = std::move(candidate);
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
      case vnengine::AddSceneJumpNodeStatus::control_boundary_conflict:
        throw ProtocolError(
            "cg_display_body_invalid",
            "CG display body may contain only dialogue nodes");
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
      const vnengine::SceneNode* node =
          vnengine::find_scene_node(*scene, node_id);
      if (node == nullptr) {
        throw ProtocolError("node_not_found", "timeline node does not exist");
      }
      if (vnengine::is_logic_control_marker(*node)) {
        throw ProtocolError(
            "logic_control_atomic_required",
            "logic control markers require logicControl.delete");
      }
      if (vnengine::is_cg_display_control_marker(*node)) {
        throw ProtocolError(
            "cg_display_atomic_required",
            "CG display markers require cgDisplay.delete");
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
      const vnengine::SceneNode* node =
          vnengine::find_scene_node(*scene, node_id);
      if (node == nullptr) {
        throw ProtocolError("node_not_found", "timeline node does not exist");
      }
    }
    if (!vnengine::scene_node_selection_respects_logic_boundaries(
            *scene, node_ids)) {
      throw ProtocolError(
          "logic_control_atomic_required",
          "timeline selection must contain complete controls");
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
  } else if (method == "dialogue.setVoice") {
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
    switch (vnengine::set_dialogue_voice(
        require_aggregate(), scene_id, node_id, std::move(asset_id))) {
      case vnengine::SetDialogueVoiceResult::changed:
        changed = true;
        break;
      case vnengine::SetDialogueVoiceResult::unchanged:
        changed = false;
        break;
      case vnengine::SetDialogueVoiceResult::scene_not_found:
        throw ProtocolError("scene_not_found", "scene does not exist");
      case vnengine::SetDialogueVoiceResult::dialogue_not_found:
        throw ProtocolError("dialogue_not_found", "dialogue does not exist");
      case vnengine::SetDialogueVoiceResult::asset_not_found:
        throw ProtocolError("asset_not_found", "asset does not exist");
      case vnengine::SetDialogueVoiceResult::asset_not_audio:
        throw ProtocolError(
            "asset_not_audio", "dialogue voice asset must be audio");
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
