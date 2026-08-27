// 文件职责：严格读取、迁移并写出 VN Engine Author 项目 JSON。
// 关键实现：v1–v19 迁移、exact-field 校验、节点/资源序列化和 v19 Writer。
#include "serialization.hpp"

#include <algorithm>
#include <cmath>
#include <initializer_list>
#include <string>
#include <string_view>
#include <type_traits>
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
      {"voiceAssetId",
       dialogue.voice_asset_id.has_value() ? Json(*dialogue.voice_asset_id)
                                           : Json(nullptr)},
  };
}

Dialogue dialogue_from_json(
    const Json& value,
    const std::string& context,
    const int file_version) {
  if (file_version >= 7) {
    require_exact_fields(
        value,
        {"id", "type", "speaker", "text", "voiceAssetId"},
        context);
    if (!value.at("voiceAssetId").is_null() &&
        !value.at("voiceAssetId").is_string()) {
      invalid(context + ".voiceAssetId must be a string or null");
    }
  } else {
    require_exact_fields(
        value,
        {"id", "type", "speaker", "text"},
        context);
  }

  if (require_string(value, "type", context) != "dialogue") {
    unsupported(context + ".type is not supported");
  }

  std::optional<std::string> voice_asset_id;
  if (file_version >= 7 && value.at("voiceAssetId").is_string()) {
    voice_asset_id = value.at("voiceAssetId").get<std::string>();
  }
  return Dialogue{
      .id = require_string(value, "id", context),
      .speaker = require_string(value, "speaker", context),
      .text = require_string(value, "text", context),
      .voice_asset_id = std::move(voice_asset_id),
  };
}

std::string character_slot_to_string(CharacterSlot slot);
CharacterSlot character_slot_from_json(
    const Json& value,
    const std::string& context);

std::string character_node_mode_to_string(const CharacterNodeMode mode) {
  switch (mode) {
    case CharacterNodeMode::show:
      return "show";
    case CharacterNodeMode::clear:
      return "clear";
  }
  invalid("character node mode is invalid");
}

CharacterNodeMode character_node_mode_from_json(
    const Json& value,
    const std::string& context) {
  const std::string mode = require_string(value, "mode", context);
  if (mode == "show") {
    return CharacterNodeMode::show;
  }
  if (mode == "clear") {
    return CharacterNodeMode::clear;
  }
  invalid(context + ".mode must be show or clear");
}

std::string character_effect_type_to_string(const CharacterEffectType type) {
  switch (type) {
    case CharacterEffectType::shake:
      return "shake";
    case CharacterEffectType::jump:
      return "jump";
    case CharacterEffectType::breathe:
      return "breathe";
    case CharacterEffectType::flash:
      return "flash";
    case CharacterEffectType::fade_in:
      return "fadeIn";
    case CharacterEffectType::fade_out:
      return "fadeOut";
    case CharacterEffectType::slide_in:
      return "slideIn";
  }
  return {};
}

std::string character_effect_intensity_to_string(
    const CharacterEffectIntensity intensity) {
  switch (intensity) {
    case CharacterEffectIntensity::subtle:
      return "subtle";
    case CharacterEffectIntensity::normal:
      return "normal";
    case CharacterEffectIntensity::strong:
      return "strong";
  }
  return {};
}

std::string character_effect_direction_to_string(
    const CharacterEffectDirection direction) {
  switch (direction) {
    case CharacterEffectDirection::left:
      return "left";
    case CharacterEffectDirection::right:
      return "right";
    case CharacterEffectDirection::up:
      return "up";
    case CharacterEffectDirection::down:
      return "down";
  }
  return {};
}

Json character_effect_to_json(const CharacterEffect& effect) {
  Json result{
      {"type", character_effect_type_to_string(effect.type)},
      {"durationMs", effect.duration_ms},
  };
  if (effect.intensity.has_value()) {
    result["intensity"] =
        character_effect_intensity_to_string(*effect.intensity);
  }
  if (effect.direction.has_value()) {
    result["direction"] =
        character_effect_direction_to_string(*effect.direction);
  }
  return result;
}

CharacterEffectIntensity character_effect_intensity_from_json(
    const Json& value,
    const std::string& context) {
  if (!value.is_string()) {
    invalid(context + " must be a string");
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
  invalid(context + " is not supported");
}

CharacterEffectDirection character_effect_direction_from_json(
    const Json& value,
    const std::string& context) {
  if (!value.is_string()) {
    invalid(context + " must be a string");
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
  invalid(context + " is not supported");
}

CharacterEffect character_effect_from_json(
    const Json& value,
    const std::string& context) {
  if (!value.is_object() || !value.contains("type") ||
      !value.at("type").is_string()) {
    invalid(context + ".type must be a string");
  }
  const std::string type = value.at("type").get<std::string>();
  CharacterEffect result;
  if (type == "shake" || type == "jump" || type == "breathe" ||
      type == "flash") {
    require_exact_fields(
        value, {"type", "durationMs", "intensity"}, context);
    result.type = type == "shake"
        ? CharacterEffectType::shake
        : type == "jump"
            ? CharacterEffectType::jump
            : type == "breathe"
                ? CharacterEffectType::breathe
                : CharacterEffectType::flash;
    result.intensity = character_effect_intensity_from_json(
        value.at("intensity"), context + ".intensity");
  } else if (type == "fadeIn" || type == "fadeOut") {
    require_exact_fields(value, {"type", "durationMs"}, context);
    result.type = type == "fadeIn"
        ? CharacterEffectType::fade_in
        : CharacterEffectType::fade_out;
  } else if (type == "slideIn") {
    require_exact_fields(
        value,
        {"type", "durationMs", "intensity", "direction"},
        context);
    result.type = CharacterEffectType::slide_in;
    result.intensity = character_effect_intensity_from_json(
        value.at("intensity"), context + ".intensity");
    result.direction = character_effect_direction_from_json(
        value.at("direction"), context + ".direction");
  } else {
    invalid(context + ".type is not supported");
  }
  result.duration_ms = require_integer(value, "durationMs", context);
  if (result.duration_ms < 100 || result.duration_ms > 10000) {
    invalid(context + ".durationMs must be between 100 and 10000");
  }
  return result;
}

Json background_node_to_json(const BackgroundNode& background) {
  return {
      {"id", background.id},
      {"type", "background"},
      {"assetId",
       background.asset_id.has_value() ? Json(*background.asset_id)
                                       : Json(nullptr)},
  };
}

Json character_node_to_json(const CharacterNode& character) {
  Json position = nullptr;
  if (character.position.has_value()) {
    position = {{"x", character.position->x}, {"y", character.position->y}};
  }
  Json effect = nullptr;
  if (character.effect.has_value()) {
    effect = character_effect_to_json(*character.effect);
  }
  return {
      {"id", character.id},
      {"type", "character"},
      {"mode", character_node_mode_to_string(character.mode)},
      {"assetId",
       character.asset_id.has_value() ? Json(*character.asset_id)
                                      : Json(nullptr)},
      {"slot", character_slot_to_string(character.slot)},
      {"layer", character.layer},
      {"position", std::move(position)},
      {"effect", std::move(effect)},
  };
}

Json scene_jump_node_to_json(const SceneJumpNode& jump) {
  return {
      {"id", jump.id},
      {"type", "sceneJump"},
      {"targetSceneId", jump.target_scene_id},
  };
}

Json bgm_node_to_json(const BgmNode& bgm) {
  return {
      {"id", bgm.id},
      {"type", "bgm"},
      {"assetId",
       bgm.asset_id.has_value() ? Json(*bgm.asset_id) : Json(nullptr)},
  };
}

Json video_node_to_json(const VideoNode& video) {
  return {
      {"id", video.id},
      {"type", "video"},
      {"assetId",
       video.asset_id.has_value() ? Json(*video.asset_id) : Json(nullptr)},
  };
}

Json cg_display_node_to_json(const CgDisplayNode& display) {
  return {
      {"id", display.id},
      {"type", "cgDisplay"},
      {"assetId", display.asset_id},
      {"leadInMs", display.lead_in_ms},
  };
}

Json cg_end_display_node_to_json(const CgEndDisplayNode& marker) {
  return {
      {"id", marker.id},
      {"type", "cgEndDisplay"},
      {"cgDisplayNodeId", marker.cg_display_node_id},
  };
}

Json choice_option_to_json(const ChoiceOption& option) {
  return {
      {"id", option.id},
      {"text", option.text},
      {"targetSceneId", option.target_scene_id},
  };
}

Json choice_node_to_json(const ChoiceNode& choice) {
  Json options = Json::array();
  for (const ChoiceOption& option : choice.options) {
    options.push_back(choice_option_to_json(option));
  }
  return {
      {"id", choice.id},
      {"type", "choice"},
      {"options", std::move(options)},
  };
}

Json story_extension_node_to_json(const StoryExtensionNode& extension) {
  return {
      {"id", extension.id},
      {"type", "storyExtension"},
  };
}

std::string logic_comparison_to_string(
    const LogicComparisonOperator comparison) {
  switch (comparison) {
    case LogicComparisonOperator::equal:
      return "eq";
    case LogicComparisonOperator::not_equal:
      return "neq";
    case LogicComparisonOperator::greater:
      return "gt";
    case LogicComparisonOperator::greater_or_equal:
      return "gte";
    case LogicComparisonOperator::less:
      return "lt";
    case LogicComparisonOperator::less_or_equal:
      return "lte";
  }
  invalid("logic comparison operator is invalid");
}

LogicComparisonOperator logic_comparison_from_json(
    const Json& value,
    const std::string& context) {
  if (!value.is_string()) {
    invalid(context + " must be a string");
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
  unsupported(context + " is not supported");
}

Json logic_value_to_json(const LogicValue& value) {
  return std::visit([](const auto& current) -> Json { return current; }, value);
}

LogicValue logic_value_from_json(
    const Json& value,
    const std::string& context) {
  if (value.is_boolean()) {
    return value.get<bool>();
  }
  if (value.is_number()) {
    const double number = value.get<double>();
    if (!std::isfinite(number)) {
      invalid(context + " must be finite");
    }
    return number;
  }
  if (value.is_string()) {
    const std::string text = value.get<std::string>();
    if (text.size() > kMaximumLogicStringBytes ||
        text.find('\0') != std::string::npos) {
      invalid(context + " is invalid");
    }
    return text;
  }
  invalid(context + " must be a boolean, number, or string");
}

Json logic_operand_to_json(const LogicOperand& operand) {
  if (const auto* variable = std::get_if<LogicVariableOperand>(&operand);
      variable != nullptr) {
    return {{"kind", "variable"}, {"name", variable->name}};
  }
  return {
      {"kind", "literal"},
      {"value", logic_value_to_json(
                    std::get<LogicLiteralOperand>(operand).value)},
  };
}

LogicOperand logic_operand_from_json(
    const Json& value,
    const std::string& context) {
  if (!value.is_object() || !value.contains("kind") ||
      !value.at("kind").is_string()) {
    invalid(context + ".kind must be a string");
  }
  const std::string kind = value.at("kind").get<std::string>();
  if (kind == "variable") {
    require_exact_fields(value, {"kind", "name"}, context);
    LogicOperand operand = LogicVariableOperand{
        .name = require_string(value, "name", context),
    };
    if (const auto violation = validate_logic_operand(operand);
        violation.has_value()) {
      invalid(context + " is invalid: " + *violation);
    }
    return operand;
  }
  if (kind == "literal") {
    require_exact_fields(value, {"kind", "value"}, context);
    LogicOperand operand = LogicLiteralOperand{
        .value = logic_value_from_json(value.at("value"), context + ".value"),
    };
    if (const auto violation = validate_logic_operand(operand);
        violation.has_value()) {
      invalid(context + " is invalid: " + *violation);
    }
    return operand;
  }
  unsupported(context + ".kind is not supported");
}

Json logic_condition_to_json(const LogicCondition& condition) {
  return {
      {"left", logic_operand_to_json(condition.left)},
      {"operator", logic_comparison_to_string(condition.comparison)},
      {"right", logic_operand_to_json(condition.right)},
  };
}

LogicCondition logic_condition_from_json(
    const Json& value,
    const std::string& context) {
  require_exact_fields(value, {"left", "operator", "right"}, context);
  LogicCondition condition{
      .left = logic_operand_from_json(value.at("left"), context + ".left"),
      .comparison = logic_comparison_from_json(
          value.at("operator"), context + ".operator"),
      .right = logic_operand_from_json(value.at("right"), context + ".right"),
  };
  if (const auto violation = validate_logic_condition(condition);
      violation.has_value()) {
    invalid(context + " is invalid: " + *violation);
  }
  return condition;
}

Json variable_set_node_to_json(const VariableSetNode& node) {
  return {
      {"id", node.id},
      {"type", "variableSet"},
      {"variableName", node.variable_name},
      {"value", logic_value_to_json(node.value)},
  };
}

Json variable_change_node_to_json(const VariableChangeNode& node) {
  return {
      {"id", node.id},
      {"type", "variableChange"},
      {"variableName", node.variable_name},
      {"amount", node.amount},
  };
}

Json logic_if_node_to_json(const LogicIfNode& node) {
  return {
      {"id", node.id},
      {"type", "logicIf"},
      {"condition", logic_condition_to_json(node.condition)},
  };
}

Json logic_else_node_to_json(const LogicElseNode& node) {
  return {
      {"id", node.id},
      {"type", "logicElse"},
      {"ifNodeId", node.if_node_id},
  };
}

Json logic_end_if_node_to_json(const LogicEndIfNode& node) {
  return {
      {"id", node.id},
      {"type", "logicEndIf"},
      {"ifNodeId", node.if_node_id},
  };
}

Json logic_repeat_node_to_json(const LogicRepeatNode& node) {
  return {{"id", node.id}, {"type", "logicRepeat"}, {"count", node.count}};
}

Json logic_end_repeat_node_to_json(const LogicEndRepeatNode& node) {
  return {
      {"id", node.id},
      {"type", "logicEndRepeat"},
      {"repeatNodeId", node.repeat_node_id},
  };
}

Json scene_node_to_json(const SceneNode& node) {
  return std::visit(
      [](const auto& value) -> Json {
        using Value = std::decay_t<decltype(value)>;
        if constexpr (std::is_same_v<Value, Dialogue>) {
          return dialogue_to_json(value);
        } else if constexpr (std::is_same_v<Value, BackgroundNode>) {
          return background_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, CharacterNode>) {
          return character_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, SceneJumpNode>) {
          return scene_jump_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, BgmNode>) {
          return bgm_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, VideoNode>) {
          return video_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, CgDisplayNode>) {
          return cg_display_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, CgEndDisplayNode>) {
          return cg_end_display_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, ChoiceNode>) {
          return choice_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, StoryExtensionNode>) {
          return story_extension_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, VariableSetNode>) {
          return variable_set_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, VariableChangeNode>) {
          return variable_change_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, LogicIfNode>) {
          return logic_if_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, LogicElseNode>) {
          return logic_else_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, LogicEndIfNode>) {
          return logic_end_if_node_to_json(value);
        } else if constexpr (std::is_same_v<Value, LogicRepeatNode>) {
          return logic_repeat_node_to_json(value);
        } else {
          return logic_end_repeat_node_to_json(value);
        }
      },
      node);
}

SceneNode scene_node_from_json(
    const Json& value,
    const std::string& context,
    const int file_version) {
  // File versions 1 and 2 defined Scene.nodes as dialogue-only. Keeping that
  // decoder strict prevents a v3 node from silently entering an older file.
  if (file_version < 3) {
    return dialogue_from_json(value, context, file_version);
  }

  if (!value.is_object()) {
    invalid(context + " must be an object");
  }
  if (!value.contains("type")) {
    invalid(context + ".type is required");
  }
  if (!value.at("type").is_string()) {
    invalid(context + ".type must be a string");
  }

  const std::string type = value.at("type").get<std::string>();
  if (type == "dialogue") {
    return dialogue_from_json(value, context, file_version);
  }
  if (type == "background") {
    require_exact_fields(value, {"id", "type", "assetId"}, context);
    if (file_version < 4 && !value.at("assetId").is_string()) {
      invalid(context + ".assetId must be a string before file version 4");
    }
    if (file_version >= 4 && !value.at("assetId").is_null() &&
        !value.at("assetId").is_string()) {
      invalid(context + ".assetId must be a string or null");
    }
    std::optional<std::string> asset_id;
    if (!value.at("assetId").is_null()) {
      asset_id = value.at("assetId").get<std::string>();
    }
    return BackgroundNode{
        .id = require_string(value, "id", context),
        .asset_id = std::move(asset_id),
    };
  }
  if (type == "character") {
    if (file_version < 5) {
      unsupported(context + ".type is not supported before file version 5");
    }
    if (file_version >= 19) {
      require_exact_fields(
          value,
          {"id", "type", "mode", "assetId", "slot", "layer", "position",
           "effect"},
          context);
    } else if (file_version >= 18) {
      require_exact_fields(
          value,
          {"id", "type", "assetId", "slot", "layer", "position", "effect"},
          context);
    } else if (file_version >= 13) {
      require_exact_fields(
          value,
          {"id", "type", "assetId", "slot", "layer", "position"},
          context);
    } else {
      require_exact_fields(
          value,
          {"id", "type", "assetId", "slot", "layer"},
          context);
    }
    const Json& asset_value = value.at("assetId");
    if (!asset_value.is_null() && !asset_value.is_string()) {
      invalid(context + ".assetId must be a string or null");
    }
    std::optional<std::string> asset_id;
    if (asset_value.is_string()) {
      asset_id = asset_value.get<std::string>();
    }
    const int layer = require_integer(value, "layer", context);
    if (layer < 1 || layer > 10) {
      invalid(context + ".layer must be between 1 and 10");
    }
    std::optional<CharacterPosition> position;
    if (file_version >= 13 && !value.at("position").is_null()) {
      const Json& position_value = value.at("position");
      require_exact_fields(position_value, {"x", "y"}, context + ".position");
      if (!position_value.at("x").is_number() ||
          !position_value.at("y").is_number()) {
        invalid(context + ".position coordinates must be numbers");
      }
      const double x = position_value.at("x").get<double>();
      const double y = position_value.at("y").get<double>();
      if (!std::isfinite(x) || !std::isfinite(y) || x < 0.0 || x > 100.0 ||
          y < 0.0 || y > 100.0) {
        invalid(context + ".position coordinates must be between 0 and 100");
      }
      position = CharacterPosition{.x = x, .y = y};
    }
    std::optional<CharacterEffect> effect;
    if (file_version >= 18 && !value.at("effect").is_null()) {
      effect = character_effect_from_json(
          value.at("effect"), context + ".effect");
    }
    const CharacterNodeMode mode = file_version >= 19
        ? character_node_mode_from_json(value, context)
        : asset_id.has_value() ? CharacterNodeMode::show
                               : CharacterNodeMode::clear;
    if (!asset_id.has_value() && effect.has_value()) {
      invalid(context + ".effect must be null when assetId is null");
    }
    if (mode == CharacterNodeMode::clear && asset_id.has_value()) {
      invalid(context + ".assetId must be null when mode is clear");
    }
    if (mode == CharacterNodeMode::clear && position.has_value()) {
      if (file_version >= 19) {
        invalid(context + ".position must be null when mode is clear");
      }
      // Before v19, assetId=null was the only clear signal and position was
      // still independently legal. Canonicalize that obsolete presentation
      // metadata so every migrated clear node satisfies the v19 invariant.
      position.reset();
    }
    return CharacterNode{
        .id = require_string(value, "id", context),
        .asset_id = std::move(asset_id),
        .mode = mode,
        .slot = character_slot_from_json(value, context),
        .layer = layer,
        .position = std::move(position),
        .effect = std::move(effect),
    };
  }
  if (type == "sceneJump") {
    if (file_version < 6) {
      unsupported(context + ".type is not supported before file version 6");
    }
    require_exact_fields(
        value,
        {"id", "type", "targetSceneId"},
        context);
    return SceneJumpNode{
        .id = require_string(value, "id", context),
        .target_scene_id = require_string(value, "targetSceneId", context),
    };
  }
  if (type == "bgm") {
    if (file_version < 7) {
      unsupported(context + ".type is not supported before file version 7");
    }
    require_exact_fields(value, {"id", "type", "assetId"}, context);
    const Json& asset_value = value.at("assetId");
    if (!asset_value.is_null() && !asset_value.is_string()) {
      invalid(context + ".assetId must be a string or null");
    }
    std::optional<std::string> asset_id;
    if (asset_value.is_string()) {
      asset_id = asset_value.get<std::string>();
    }
    return BgmNode{
        .id = require_string(value, "id", context),
        .asset_id = std::move(asset_id),
    };
  }
  if (type == "video") {
    if (file_version < 8) {
      unsupported(context + ".type is not supported before file version 8");
    }
    require_exact_fields(value, {"id", "type", "assetId"}, context);
    const Json& asset_value = value.at("assetId");
    if (!asset_value.is_null() && !asset_value.is_string()) {
      invalid(context + ".assetId must be a string or null");
    }
    std::optional<std::string> asset_id;
    if (asset_value.is_string()) {
      asset_id = asset_value.get<std::string>();
    }
    return VideoNode{
        .id = require_string(value, "id", context),
        .asset_id = std::move(asset_id),
    };
  }
  if (type == "cgDisplay") {
    if (file_version < 17) {
      unsupported(context + ".type is not supported before file version 17");
    }
    require_exact_fields(
        value, {"id", "type", "assetId", "leadInMs"}, context);
    const int lead_in_ms = require_integer(value, "leadInMs", context);
    if (lead_in_ms < 0 || lead_in_ms > kMaximumCgLeadInMs) {
      invalid(context + ".leadInMs is outside the supported range");
    }
    return CgDisplayNode{
        .id = require_string(value, "id", context),
        .asset_id = require_string(value, "assetId", context),
        .lead_in_ms = lead_in_ms,
    };
  }
  if (type == "cgEndDisplay") {
    if (file_version < 17) {
      unsupported(context + ".type is not supported before file version 17");
    }
    require_exact_fields(
        value, {"id", "type", "cgDisplayNodeId"}, context);
    return CgEndDisplayNode{
        .id = require_string(value, "id", context),
        .cg_display_node_id =
            require_string(value, "cgDisplayNodeId", context),
    };
  }
  if (type == "choice") {
    if (file_version < 9) {
      unsupported(context + ".type is not supported before file version 9");
    }
    require_exact_fields(value, {"id", "type", "options"}, context);
    const Json& options_value = value.at("options");
    if (!options_value.is_array()) {
      invalid(context + ".options must be an array");
    }

    ChoiceNode choice{
        .id = require_string(value, "id", context),
        .options = {},
    };
    choice.options.reserve(options_value.size());
    for (std::size_t index = 0; index < options_value.size(); ++index) {
      const std::string option_context =
          context + ".options[" + std::to_string(index) + "]";
      const Json& option = options_value.at(index);
      require_exact_fields(
          option,
          {"id", "text", "targetSceneId"},
          option_context);
      choice.options.push_back(ChoiceOption{
          .id = require_string(option, "id", option_context),
          .text = require_string(option, "text", option_context),
          .target_scene_id =
              require_string(option, "targetSceneId", option_context),
      });
    }
    return choice;
  }
  if (type == "storyExtension") {
    if (file_version < 12) {
      unsupported(context + ".type is not supported before file version 12");
    }
    require_exact_fields(value, {"id", "type"}, context);
    return StoryExtensionNode{
        .id = require_string(value, "id", context),
    };
  }
  if (type == "variableSet") {
    if (file_version < 16) {
      unsupported(context + ".type is not supported before file version 16");
    }
    require_exact_fields(
        value, {"id", "type", "variableName", "value"}, context);
    VariableSetNode node{
        .id = require_string(value, "id", context),
        .variable_name = require_string(value, "variableName", context),
        .value = logic_value_from_json(value.at("value"), context + ".value"),
    };
    if (const auto violation = validate_logic_operand(
            LogicVariableOperand{.name = node.variable_name});
        violation.has_value()) {
      invalid(context + " is invalid: " + *violation);
    }
    return node;
  }
  if (type == "variableChange") {
    if (file_version < 16) {
      unsupported(context + ".type is not supported before file version 16");
    }
    require_exact_fields(
        value, {"id", "type", "variableName", "amount"}, context);
    if (!value.at("amount").is_number()) {
      invalid(context + ".amount must be a number");
    }
    const double amount = value.at("amount").get<double>();
    VariableChangeNode node{
        .id = require_string(value, "id", context),
        .variable_name = require_string(value, "variableName", context),
        .amount = amount,
    };
    const auto name_violation = validate_logic_operand(
        LogicVariableOperand{.name = node.variable_name});
    if (!std::isfinite(amount) || name_violation.has_value()) {
      invalid(context + " is invalid");
    }
    return node;
  }
  if (type == "logicIf") {
    if (file_version < 16) {
      unsupported(context + ".type is not supported before file version 16");
    }
    require_exact_fields(value, {"id", "type", "condition"}, context);
    return LogicIfNode{
        .id = require_string(value, "id", context),
        .condition = logic_condition_from_json(
            value.at("condition"), context + ".condition"),
    };
  }
  if (type == "logicElse") {
    if (file_version < 16) {
      unsupported(context + ".type is not supported before file version 16");
    }
    require_exact_fields(value, {"id", "type", "ifNodeId"}, context);
    return LogicElseNode{
        .id = require_string(value, "id", context),
        .if_node_id = require_string(value, "ifNodeId", context),
    };
  }
  if (type == "logicEndIf") {
    if (file_version < 16) {
      unsupported(context + ".type is not supported before file version 16");
    }
    require_exact_fields(value, {"id", "type", "ifNodeId"}, context);
    return LogicEndIfNode{
        .id = require_string(value, "id", context),
        .if_node_id = require_string(value, "ifNodeId", context),
    };
  }
  if (type == "logicRepeat") {
    if (file_version < 16) {
      unsupported(context + ".type is not supported before file version 16");
    }
    require_exact_fields(value, {"id", "type", "count"}, context);
    const int count = require_integer(value, "count", context);
    if (count < 1 || count > kMaximumLogicRepeatCount) {
      invalid(context + ".count is outside the supported range");
    }
    return LogicRepeatNode{
        .id = require_string(value, "id", context),
        .count = count,
    };
  }
  if (type == "logicEndRepeat") {
    if (file_version < 16) {
      unsupported(context + ".type is not supported before file version 16");
    }
    require_exact_fields(value, {"id", "type", "repeatNodeId"}, context);
    return LogicEndRepeatNode{
        .id = require_string(value, "id", context),
        .repeat_node_id = require_string(value, "repeatNodeId", context),
    };
  }
  unsupported(context + ".type is not supported");
}

Json scene_to_renderer_json(const Scene& scene) {
  Json nodes = Json::array();
  for (const SceneNode& node : scene.nodes) {
    nodes.push_back(scene_node_to_json(node));
  }

  return {
      {"schemaVersion", scene.schema_version},
      {"id", scene.id},
      {"name", scene.name},
      {"backgroundAssetId",
       scene.visuals.background_asset_id.has_value()
           ? Json(*scene.visuals.background_asset_id)
           : Json(nullptr)},
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

Json start_screen_to_json(const StartScreen& start_screen) {
  return {
      {"title", start_screen.title},
      {"backgroundAssetId",
       start_screen.background_asset_id.has_value()
           ? Json(*start_screen.background_asset_id)
           : Json(nullptr)},
      {"musicAssetId",
       start_screen.music_asset_id.has_value()
           ? Json(*start_screen.music_asset_id)
           : Json(nullptr)},
  };
}

StartScreen start_screen_from_json(
    const Json& value,
    const std::string_view context,
    const int file_version,
    const std::string& legacy_title) {
  if (file_version >= 11) {
    require_exact_fields(
        value, {"title", "backgroundAssetId", "musicAssetId"}, context);
  } else {
    require_exact_fields(
        value, {"backgroundAssetId", "musicAssetId"}, context);
  }

  const auto nullable_asset_id = [&value, context](
                                     const std::string_view field) {
    const Json& asset_id = value.at(std::string(field));
    if (asset_id.is_null()) {
      return std::optional<std::string>{};
    }
    if (!asset_id.is_string()) {
      invalid(
          std::string(context) + "." + std::string(field) +
          " must be a string or null");
    }
    return std::optional<std::string>{asset_id.get<std::string>()};
  };

  return StartScreen{
      .title = file_version >= 11
          ? require_string(value, "title", context)
          : legacy_title,
      .background_asset_id = nullable_asset_id("backgroundAssetId"),
      .music_asset_id = nullable_asset_id("musicAssetId"),
  };
}

Json cg_gallery_to_json(const CgGallery& cg_gallery) {
  Json pages = Json::array();
  for (const CgGalleryPage& page : cg_gallery.pages) {
    Json image_asset_ids = Json::array();
    for (const std::optional<std::string>& asset_id : page.image_asset_ids) {
      image_asset_ids.push_back(
          asset_id.has_value() ? Json(*asset_id) : Json(nullptr));
    }
    pages.push_back({{"imageAssetIds", std::move(image_asset_ids)}});
  }
  return {{"pages", std::move(pages)}};
}

CgGallery cg_gallery_from_json(
    const Json& value,
    const int file_version) {
  constexpr std::string_view context = "project.cgGallery";

  // v14 stored one packed image list. Preserve its order while migrating to
  // fixed nine-slot pages; an empty legacy list becomes one empty page.
  if (file_version == 14) {
    require_exact_fields(value, {"imageAssetIds"}, context);
    const Json& image_asset_ids = value.at("imageAssetIds");
    if (!image_asset_ids.is_array()) {
      invalid("project.cgGallery.imageAssetIds must be an array");
    }

    CgGallery gallery;
    const std::size_t page_count = std::max<std::size_t>(
        1U,
        (image_asset_ids.size() + kCgGalleryPageSize - 1U) /
            kCgGalleryPageSize);
    gallery.pages.assign(page_count, CgGalleryPage{});
    for (std::size_t index = 0; index < image_asset_ids.size(); ++index) {
      const Json& asset_id = image_asset_ids.at(index);
      if (!asset_id.is_string()) {
        invalid(
            "project.cgGallery.imageAssetIds[" + std::to_string(index) +
            "] must be a string");
      }
      gallery.pages[index / kCgGalleryPageSize]
          .image_asset_ids[index % kCgGalleryPageSize] =
          asset_id.get<std::string>();
    }
    return gallery;
  }

  require_exact_fields(value, {"pages"}, context);
  const Json& pages = value.at("pages");
  if (!pages.is_array() || pages.empty()) {
    invalid("project.cgGallery.pages must be a non-empty array");
  }

  CgGallery gallery;
  gallery.pages.clear();
  gallery.pages.reserve(pages.size());
  for (std::size_t page_index = 0; page_index < pages.size(); ++page_index) {
    const std::string page_context =
        "project.cgGallery.pages[" + std::to_string(page_index) + "]";
    const Json& page_json = pages.at(page_index);
    require_exact_fields(page_json, {"imageAssetIds"}, page_context);
    const Json& image_asset_ids = page_json.at("imageAssetIds");
    if (!image_asset_ids.is_array() ||
        image_asset_ids.size() != kCgGalleryPageSize) {
      invalid(
          page_context + ".imageAssetIds must contain exactly " +
          std::to_string(kCgGalleryPageSize) + " items");
    }

    CgGalleryPage page;
    for (std::size_t slot_index = 0;
         slot_index < kCgGalleryPageSize;
         ++slot_index) {
      const Json& asset_id = image_asset_ids.at(slot_index);
      if (asset_id.is_null()) {
        continue;
      }
      if (!asset_id.is_string()) {
        invalid(
            page_context + ".imageAssetIds[" +
            std::to_string(slot_index) + "] must be a string or null");
      }
      page.image_asset_ids[slot_index] = asset_id.get<std::string>();
    }
    gallery.pages.push_back(std::move(page));
  }
  return gallery;
}

Json scene_to_file_json(const Scene& scene) {
  // Construct the persisted shape explicitly. The Renderer projection and
  // file format have separate version boundaries and must not accidentally
  // inherit one another's future fields.
  Json nodes = Json::array();
  for (const SceneNode& node : scene.nodes) {
    nodes.push_back(scene_node_to_json(node));
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
    scene.nodes.push_back(scene_node_from_json(
        nodes.at(index),
        context + ".nodes[" + std::to_string(index) + "]",
        file_version));
  }
  return scene;
}

Project project_from_json(const Json& value, const int file_version) {
  constexpr std::string_view context = "project";
  if (file_version >= 14) {
    require_exact_fields(
        value,
        {"schemaVersion",
         "id",
         "name",
         "startScreen",
         "cgGallery",
         "entrySceneId",
         "scenes"},
        context);
  } else if (file_version >= 10) {
    require_exact_fields(
        value,
        {"schemaVersion",
         "id",
         "name",
         "startScreen",
         "entrySceneId",
         "scenes"},
        context);
  } else {
    require_exact_fields(
        value,
        {"schemaVersion", "id", "name", "entrySceneId", "scenes"},
        context);
  }
  require_schema_version(value, context);

  const Json& scenes = value.at("scenes");
  if (!scenes.is_array()) {
    invalid("project.scenes must be an array");
  }

  std::string project_name = require_string(value, "name", context);

  CgGallery cg_gallery = file_version >= 14
      ? cg_gallery_from_json(value.at("cgGallery"), file_version)
      : CgGallery{};

  Project project{
      .schema_version = kSchemaVersion,
      .id = require_string(value, "id", context),
      .name = project_name,
      .start_screen = file_version >= 10
          ? start_screen_from_json(
                value.at("startScreen"),
                "project.startScreen",
                file_version,
                project_name)
          : StartScreen{.title = project_name},
      .cg_gallery = std::move(cg_gallery),
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
      {"startScreen", start_screen_to_json(project.start_screen)},
      {"cgGallery", cg_gallery_to_json(project.cg_gallery)},
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
      {"startScreen", start_screen_to_json(project.start_screen)},
      {"cgGallery", cg_gallery_to_json(project.cg_gallery)},
      {"entrySceneId", project.entry_scene_id},
      {"scenes", std::move(scenes)},
  };
}

Json assets_to_renderer_json(const std::vector<Asset>& assets) {
  Json result = Json::array();
  for (const Asset& asset : assets) {
    result.push_back({
        {"id", asset.id},
        {"type", asset_type_to_string(asset.type)},
        {"displayName", asset.display_name},
    });
  }
  return result;
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
