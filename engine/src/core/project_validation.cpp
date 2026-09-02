// 文件职责：验证 Author 项目结构、资源引用、控制配对和安全路径。
// 关键实现：validate_scene_logic_structure、图片缩放不变量与聚合资源校验。
#include "vnengine/project.hpp"

#include <cmath>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_set>

#include "project_internal.hpp"

namespace vnengine {

namespace {

std::optional<std::string_view> asset_directory(const AssetType type) {
  switch (type) {
    case AssetType::image:
      return "images";
    case AssetType::video:
      return "videos";
    case AssetType::audio:
      return "audio";
  }
  return std::nullopt;
}

}  // namespace

std::optional<std::string> validate_logic_value(const LogicValue& value) {
  if (const auto* number = std::get_if<double>(&value);
      number != nullptr && !std::isfinite(*number)) {
    return "logic number must be finite";
  }
  if (const auto* text = std::get_if<std::string>(&value);
      text != nullptr &&
      (text->size() > kMaximumLogicStringBytes ||
       text->find('\0') != std::string::npos)) {
    return "logic string is invalid";
  }
  return std::nullopt;
}

std::optional<std::string> validate_logic_operand(
    const LogicOperand& operand) {
  if (const auto* variable = std::get_if<LogicVariableOperand>(&operand);
      variable != nullptr) {
    const std::string normalized =
        project_detail::trim_ascii_whitespace(variable->name);
    if (normalized.empty() || normalized != variable->name ||
        variable->name.size() > kMaximumLogicVariableNameBytes ||
        variable->name.find('\0') != std::string::npos) {
      return "logic variable name is invalid";
    }
    return std::nullopt;
  }
  return validate_logic_value(std::get<LogicLiteralOperand>(operand).value);
}

std::optional<std::string> validate_logic_condition(
    const LogicCondition& condition) {
  switch (condition.comparison) {
    case LogicComparisonOperator::equal:
    case LogicComparisonOperator::not_equal:
    case LogicComparisonOperator::greater:
    case LogicComparisonOperator::greater_or_equal:
    case LogicComparisonOperator::less:
    case LogicComparisonOperator::less_or_equal:
      break;
    default:
      return "logic comparison operator is invalid";
  }
  if (const auto violation = validate_logic_operand(condition.left);
      violation.has_value()) {
    return violation;
  }
  return validate_logic_operand(condition.right);
}

std::optional<std::string> validate_scene_logic_structure(
    const Scene& scene) {
  enum class FrameKind { condition, repeat };
  struct Frame {
    FrameKind kind;
    std::string root_id;
    bool saw_else = false;
  };
  std::vector<Frame> stack;
  std::optional<std::string> open_cg_display_id;

  for (const SceneNode& node : scene.nodes) {
    if (open_cg_display_id.has_value()) {
      if (std::holds_alternative<Dialogue>(node)) {
        continue;
      }
      if (const auto* marker = std::get_if<CgEndDisplayNode>(&node);
          marker != nullptr) {
        if (marker->cg_display_node_id != *open_cg_display_id) {
          return "CG end-display marker is orphaned or mismatched";
        }
        open_cg_display_id.reset();
        continue;
      }
      return "CG display body may contain only dialogue nodes";
    }
    if (const auto* display = std::get_if<CgDisplayNode>(&node);
        display != nullptr) {
      if (display->asset_id.empty()) {
        return "CG display Asset ID must not be empty";
      }
      if (display->lead_in_ms < 0 ||
          display->lead_in_ms > kMaximumCgLeadInMs) {
        return "CG display lead-in is outside the supported range";
      }
      open_cg_display_id = display->id;
      continue;
    }
    if (std::holds_alternative<CgEndDisplayNode>(node)) {
      return "CG end-display marker is orphaned or mismatched";
    }
    if (const auto* variable_set = std::get_if<VariableSetNode>(&node);
        variable_set != nullptr) {
      const std::string normalized = project_detail::trim_ascii_whitespace(
          variable_set->variable_name);
      if (normalized.empty() || normalized != variable_set->variable_name ||
          variable_set->variable_name.size() >
              kMaximumLogicVariableNameBytes ||
          variable_set->variable_name.find('\0') != std::string::npos) {
        return "variable-set name is invalid";
      }
      if (const auto violation = validate_logic_value(variable_set->value);
          violation.has_value()) {
        return violation;
      }
      continue;
    }
    if (const auto* variable_change = std::get_if<VariableChangeNode>(&node);
        variable_change != nullptr) {
      const std::string normalized = project_detail::trim_ascii_whitespace(
          variable_change->variable_name);
      if (normalized.empty() || normalized != variable_change->variable_name ||
          variable_change->variable_name.size() >
              kMaximumLogicVariableNameBytes ||
          variable_change->variable_name.find('\0') != std::string::npos) {
        return "variable-change name is invalid";
      }
      if (!std::isfinite(variable_change->amount)) {
        return "variable-change amount must be finite";
      }
      continue;
    }
    if (std::holds_alternative<StoryExtensionNode>(node)) {
      if (!stack.empty()) {
        return "story extension must not split a logic control";
      }
      continue;
    }
    if (const auto* condition = std::get_if<LogicIfNode>(&node);
        condition != nullptr) {
      if (const auto violation = validate_logic_condition(condition->condition);
          violation.has_value()) {
        return violation;
      }
      if (stack.size() >=
          static_cast<std::size_t>(kMaximumLogicNestingDepth)) {
        return "logic nesting exceeds the supported depth";
      }
      stack.push_back(Frame{
          .kind = FrameKind::condition,
          .root_id = condition->id,
      });
      continue;
    }
    if (const auto* marker = std::get_if<LogicElseNode>(&node);
        marker != nullptr) {
      if (stack.empty() || stack.back().kind != FrameKind::condition ||
          stack.back().root_id != marker->if_node_id ||
          stack.back().saw_else) {
        return "logic else marker is orphaned or mismatched";
      }
      stack.back().saw_else = true;
      continue;
    }
    if (const auto* marker = std::get_if<LogicEndIfNode>(&node);
        marker != nullptr) {
      if (stack.empty() || stack.back().kind != FrameKind::condition ||
          stack.back().root_id != marker->if_node_id ||
          !stack.back().saw_else) {
        return "logic end-if marker is orphaned or mismatched";
      }
      stack.pop_back();
      continue;
    }
    if (const auto* repeat = std::get_if<LogicRepeatNode>(&node);
        repeat != nullptr) {
      if (repeat->count < 1 || repeat->count > kMaximumLogicRepeatCount) {
        return "logic repeat count is outside the supported range";
      }
      if (stack.size() >=
          static_cast<std::size_t>(kMaximumLogicNestingDepth)) {
        return "logic nesting exceeds the supported depth";
      }
      stack.push_back(Frame{
          .kind = FrameKind::repeat,
          .root_id = repeat->id,
      });
      continue;
    }
    if (const auto* marker = std::get_if<LogicEndRepeatNode>(&node);
        marker != nullptr) {
      if (stack.empty() || stack.back().kind != FrameKind::repeat ||
          stack.back().root_id != marker->repeat_node_id) {
        return "logic end-repeat marker is orphaned or mismatched";
      }
      stack.pop_back();
    }
  }

  if (!stack.empty()) {
    return "logic control is missing a paired end marker";
  }
  if (open_cg_display_id.has_value()) {
    return "CG display is missing a paired end marker";
  }
  return std::nullopt;
}

std::optional<std::string> validate_project(const Project& project) {
  if (project.schema_version != kSchemaVersion) {
    return "project schema version is unsupported";
  }
  if (project.id.empty()) {
    return "project ID must not be empty";
  }
  const auto normalized_name = normalize_project_name(project.name);
  if (!normalized_name.has_value()) {
    return "project name must not be empty";
  }
  if (*normalized_name != project.name) {
    return "project name must not have surrounding whitespace";
  }
  const auto normalized_title =
      normalize_start_screen_title(project.start_screen.title);
  if (!normalized_title.has_value()) {
    return "start screen title must not be empty";
  }
  if (*normalized_title != project.start_screen.title) {
    return "start screen title must not have surrounding whitespace";
  }
  const auto normalized_eyebrow =
      normalize_start_screen_eyebrow(project.start_screen.eyebrow);
  if (!normalized_eyebrow.has_value()) {
    return "start screen eyebrow must be valid UTF-8 text up to 256 bytes";
  }
  if (*normalized_eyebrow != project.start_screen.eyebrow) {
    return "start screen eyebrow must not have surrounding whitespace";
  }
  if (project.start_screen.background_asset_id.has_value() &&
      project.start_screen.background_asset_id->empty()) {
    return "start screen background Asset ID must not be empty";
  }
  if (project.start_screen.music_asset_id.has_value() &&
      project.start_screen.music_asset_id->empty()) {
    return "start screen music Asset ID must not be empty";
  }
  if (!is_valid_start_screen_style(project.start_screen.style)) {
    return "start screen style is invalid";
  }
  std::unordered_set<std::string> cg_asset_ids;
  if (project.cg_gallery.pages.empty()) {
    return "CG gallery must contain at least one page";
  }
  for (const CgGalleryPage& page : project.cg_gallery.pages) {
    for (const std::optional<std::string>& asset_id : page.image_asset_ids) {
      if (!asset_id.has_value()) {
        continue;
      }
      if (asset_id->empty()) {
        return "CG gallery Asset ID must not be empty";
      }
      if (!cg_asset_ids.insert(*asset_id).second) {
        return "CG gallery Asset IDs must be unique";
      }
    }
  }
  if (!is_valid_cg_gallery_style(project.cg_gallery.style)) {
    return "CG gallery style is invalid";
  }
  if (project.scenes.empty()) {
    return "project must contain at least one scene";
  }

  // Project, Scene, timeline-node, Choice-option, and visual-instance IDs
  // share one namespace. Assets join it in validate_project_aggregate().
  std::unordered_set<std::string> ids{project.id};
  std::unordered_set<std::string> logic_variable_names;
  bool found_entry_scene = false;

  for (const Scene& scene : project.scenes) {
    if (scene.schema_version != kSchemaVersion) {
      return "scene schema version is unsupported";
    }
    if (scene.id.empty()) {
      return "scene ID must not be empty";
    }
    if (!ids.insert(scene.id).second) {
      return "entity IDs must be unique";
    }
    found_entry_scene = found_entry_scene || scene.id == project.entry_scene_id;

    if (const auto violation = validate_scene_logic_structure(scene);
        violation.has_value()) {
      return violation;
    }

    if (scene.visuals.background_asset_id.has_value() &&
        scene.visuals.background_asset_id->empty()) {
      return "background Asset ID must not be empty";
    }
    if (scene.visuals.background_scale_percent < kMinimumImageScalePercent ||
        scene.visuals.background_scale_percent > kMaximumImageScalePercent) {
      return "scene background scale must be between 10 and 300";
    }
    if (!scene.visuals.background_asset_id.has_value() &&
        scene.visuals.background_scale_percent !=
            kDefaultImageScalePercent) {
      return "empty scene background scale must be 100";
    }

    for (const CharacterVisualInstance& character :
         scene.visuals.characters) {
      if (character.id.empty()) {
        return "character visual instance ID must not be empty";
      }
      if (!ids.insert(character.id).second) {
        return "entity IDs must be unique";
      }
      if (character.asset_id.empty()) {
        return "character visual Asset ID must not be empty";
      }
      if (!project_detail::is_valid_character_slot(character.slot)) {
        return "character visual slot is invalid";
      }
    }

    for (const SceneNode& node : scene.nodes) {
      const std::string_view node_id = scene_node_id(node);
      if (node_id.empty()) {
        return "scene node ID must not be empty";
      }
      if (!ids.insert(std::string(node_id)).second) {
        return "entity IDs must be unique";
      }
      if (const auto* background = std::get_if<BackgroundNode>(&node);
          background != nullptr) {
        if (background->asset_id.has_value() &&
            background->asset_id->empty()) {
          return "background node Asset ID must not be empty";
        }
        if (background->scale_percent < kMinimumImageScalePercent ||
            background->scale_percent > kMaximumImageScalePercent) {
          return "background node scale must be between 10 and 300";
        }
        if (!background->asset_id.has_value() &&
            background->scale_percent != kDefaultImageScalePercent) {
          return "empty background node scale must be 100";
        }
      }
      if (const auto* dialogue = std::get_if<Dialogue>(&node);
          dialogue != nullptr && dialogue->voice_asset_id.has_value() &&
          dialogue->voice_asset_id->empty()) {
        return "dialogue voice Asset ID must not be empty";
      }
      if (const auto* character = std::get_if<CharacterNode>(&node);
          character != nullptr) {
        if (character->asset_id.has_value() && character->asset_id->empty()) {
          return "character node Asset ID must not be empty";
        }
        if (!project_detail::is_valid_character_slot(character->slot)) {
          return "character node slot is invalid";
        }
        if (character->mode != CharacterNodeMode::show &&
            character->mode != CharacterNodeMode::clear) {
          return "character node mode is invalid";
        }
        if (character->mode == CharacterNodeMode::clear &&
            character->asset_id.has_value()) {
          return "clear character node must not reference an Asset";
        }
        if (character->mode == CharacterNodeMode::clear &&
            character->position.has_value()) {
          return "clear character node must not have a position";
        }
        if (character->layer < 1 || character->layer > 10) {
          return "character node layer must be between 1 and 10";
        }
        if (character->position.has_value() &&
            (!std::isfinite(character->position->x) ||
             !std::isfinite(character->position->y) ||
             character->position->x < 0.0 ||
             character->position->x > 100.0 ||
             character->position->y < 0.0 ||
             character->position->y > 100.0)) {
          return "character node position must be between 0 and 100";
        }
        if (character->scale_percent < kMinimumImageScalePercent ||
            character->scale_percent > kMaximumImageScalePercent) {
          return "character node scale must be between 10 and 300";
        }
        if (character->mode == CharacterNodeMode::clear &&
            character->scale_percent != kDefaultImageScalePercent) {
          return "clear character node scale must be 100";
        }
        if (character->effect.has_value() &&
            !project_detail::is_valid_character_effect(*character->effect)) {
          return "character node effect is invalid";
        }
        if ((!character->asset_id.has_value() ||
             character->mode == CharacterNodeMode::clear) &&
            character->effect.has_value()) {
          return "character node without an Asset must not have an effect";
        }
      }
      if (const auto* jump = std::get_if<SceneJumpNode>(&node);
          jump != nullptr && jump->target_scene_id.empty()) {
        return "scene jump target Scene ID must not be empty";
      }
      if (const auto* bgm = std::get_if<BgmNode>(&node);
          bgm != nullptr && bgm->asset_id.has_value() &&
          bgm->asset_id->empty()) {
        return "BGM node Asset ID must not be empty";
      }
      if (const auto* video = std::get_if<VideoNode>(&node);
          video != nullptr && video->asset_id.has_value() &&
          video->asset_id->empty()) {
        return "video node Asset ID must not be empty";
      }
      if (const auto* display = std::get_if<CgDisplayNode>(&node);
          display != nullptr) {
        if (display->asset_id.empty()) {
          return "CG display Asset ID must not be empty";
        }
        if (display->lead_in_ms < 0 ||
            display->lead_in_ms > kMaximumCgLeadInMs) {
          return "CG display lead-in is outside the supported range";
        }
      }
      if (const auto* choice = std::get_if<ChoiceNode>(&node);
          choice != nullptr) {
        for (const ChoiceOption& option : choice->options) {
          if (option.id.empty()) {
            return "choice option ID must not be empty";
          }
          if (!ids.insert(option.id).second) {
            return "entity IDs must be unique";
          }
          const std::string normalized_text =
              project_detail::trim_ascii_whitespace(option.text);
          if (normalized_text.empty()) {
            return "choice option text must not be empty";
          }
          if (normalized_text != option.text) {
            return "choice option text must not have surrounding whitespace";
          }
          if (option.target_scene_id.empty()) {
            return "choice option target Scene ID must not be empty";
          }
          if (find_scene(project, option.target_scene_id) == nullptr) {
            return "choice option must reference an existing Scene";
          }
        }
      }
      if (const auto* variable_set = std::get_if<VariableSetNode>(&node);
          variable_set != nullptr) {
        logic_variable_names.insert(variable_set->variable_name);
      }
      if (const auto* variable_change = std::get_if<VariableChangeNode>(&node);
          variable_change != nullptr) {
        logic_variable_names.insert(variable_change->variable_name);
      }
      if (const auto* condition = std::get_if<LogicIfNode>(&node);
          condition != nullptr) {
        for (const LogicOperand* operand : {
                 &condition->condition.left,
                 &condition->condition.right}) {
          if (const auto* variable =
                  std::get_if<LogicVariableOperand>(operand);
              variable != nullptr) {
            logic_variable_names.insert(variable->name);
          }
        }
      }
      if (logic_variable_names.size() > kMaximumLogicVariableCount) {
        return "project contains too many logic variables";
      }
    }
  }

  if (!found_entry_scene) {
    return "entry scene ID must reference an existing scene";
  }

  return std::nullopt;
}

std::optional<std::string> validate_asset_relative_path(
    const AssetType type,
    const std::string_view relative_path) {
  const std::optional<std::string_view> directory = asset_directory(type);
  if (!directory.has_value()) {
    return "asset type is invalid";
  }

  const std::string prefix = "assets/" + std::string(*directory) + "/";
  if (relative_path.size() <= prefix.size() ||
      !relative_path.starts_with(prefix) ||
      relative_path.back() == '/' ||
      relative_path.find('\\') != std::string_view::npos ||
      relative_path.find('\0') != std::string_view::npos) {
    return "asset relative path must be a safe path below " + prefix;
  }

  std::size_t component_start = 0;
  while (component_start < relative_path.size()) {
    const std::size_t separator =
        relative_path.find('/', component_start);
    const std::size_t component_end = separator == std::string_view::npos
        ? relative_path.size()
        : separator;
    const std::string_view component = relative_path.substr(
        component_start,
        component_end - component_start);
    if (component.empty() || component == "." || component == "..") {
      return "asset relative path contains an unsafe component";
    }
    if (separator == std::string_view::npos) {
      break;
    }
    component_start = separator + 1;
  }

  return std::nullopt;
}

std::optional<std::string> validate_project_aggregate(
    const ProjectAggregate& aggregate) {
  if (const auto violation = validate_project(aggregate.project);
      violation.has_value()) {
    return violation;
  }

  std::unordered_set<std::string> ids{aggregate.project.id};
  for (const Scene& scene : aggregate.project.scenes) {
    ids.insert(scene.id);
    for (const CharacterVisualInstance& character :
         scene.visuals.characters) {
      ids.insert(character.id);
    }
    for (const SceneNode& node : scene.nodes) {
      ids.insert(std::string(scene_node_id(node)));
      if (const auto* choice = std::get_if<ChoiceNode>(&node);
          choice != nullptr) {
        for (const ChoiceOption& option : choice->options) {
          ids.insert(option.id);
        }
      }
    }
  }

  for (const Asset& asset : aggregate.assets) {
    if (asset.id.empty()) {
      return "asset ID must not be empty";
    }
    if (!ids.insert(asset.id).second) {
      return "entity and asset IDs must be unique";
    }

    if (const auto violation =
            validate_asset_relative_path(asset.type, asset.relative_path);
        violation.has_value()) {
      return violation;
    }
  }

  if (aggregate.project.start_screen.background_asset_id.has_value()) {
    const Asset* background = find_asset(
        aggregate,
        *aggregate.project.start_screen.background_asset_id);
    if (background == nullptr) {
      return "start screen background must reference an existing Asset";
    }
    if (background->type != AssetType::image) {
      return "start screen background Asset must be an image";
    }
  }
  if (aggregate.project.start_screen.music_asset_id.has_value()) {
    const Asset* music = find_asset(
        aggregate,
        *aggregate.project.start_screen.music_asset_id);
    if (music == nullptr) {
      return "start screen music must reference an existing Asset";
    }
    if (music->type != AssetType::audio) {
      return "start screen music Asset must be audio";
    }
  }

  for (const CgGalleryPage& page : aggregate.project.cg_gallery.pages) {
    for (const std::optional<std::string>& asset_id : page.image_asset_ids) {
      if (!asset_id.has_value()) {
        continue;
      }
      const Asset* image = find_asset(aggregate, *asset_id);
      if (image == nullptr) {
        return "CG gallery must reference an existing Asset";
      }
      if (image->type != AssetType::image) {
        return "CG gallery Asset must be an image";
      }
    }
  }

  for (const Scene& scene : aggregate.project.scenes) {
    if (scene.visuals.background_asset_id.has_value()) {
      const Asset* background = find_asset(
          aggregate,
          *scene.visuals.background_asset_id);
      if (background == nullptr) {
        return "background must reference an existing Asset";
      }
      if (background->type != AssetType::image) {
        return "background Asset must be an image";
      }
    }

    for (const CharacterVisualInstance& character :
         scene.visuals.characters) {
      const Asset* sprite = find_asset(aggregate, character.asset_id);
      if (sprite == nullptr) {
        return "character visual must reference an existing Asset";
      }
      if (sprite->type != AssetType::image) {
        return "character visual Asset must be an image";
      }
    }

    for (const SceneNode& node : scene.nodes) {
      if (const auto* dialogue = std::get_if<Dialogue>(&node);
          dialogue != nullptr && dialogue->voice_asset_id.has_value()) {
        const Asset* asset = find_asset(aggregate, *dialogue->voice_asset_id);
        if (asset == nullptr) {
          return "dialogue voice must reference an existing Asset";
        }
        if (asset->type != AssetType::audio) {
          return "dialogue voice Asset must be audio";
        }
      }
      if (const auto* background = std::get_if<BackgroundNode>(&node);
          background != nullptr && background->asset_id.has_value()) {
        const Asset* asset = find_asset(aggregate, *background->asset_id);
        if (asset == nullptr) {
          return "background node must reference an existing Asset";
        }
        if (asset->type != AssetType::image) {
          return "background node Asset must be an image";
        }
      }
      if (const auto* character = std::get_if<CharacterNode>(&node);
          character != nullptr && character->asset_id.has_value()) {
        const Asset* asset = find_asset(aggregate, *character->asset_id);
        if (asset == nullptr) {
          return "character node must reference an existing Asset";
        }
        if (asset->type != AssetType::image) {
          return "character node Asset must be an image";
        }
      }
      if (const auto* jump = std::get_if<SceneJumpNode>(&node);
          jump != nullptr) {
        if (jump->target_scene_id == scene.id) {
          return "scene jump must not target its containing Scene";
        }
        if (find_scene(aggregate.project, jump->target_scene_id) == nullptr) {
          return "scene jump must reference an existing Scene";
        }
      }
      if (const auto* bgm = std::get_if<BgmNode>(&node);
          bgm != nullptr && bgm->asset_id.has_value()) {
        const Asset* asset = find_asset(aggregate, *bgm->asset_id);
        if (asset == nullptr) {
          return "BGM node must reference an existing Asset";
        }
        if (asset->type != AssetType::audio) {
          return "BGM node Asset must be audio";
        }
      }
      if (const auto* video = std::get_if<VideoNode>(&node);
          video != nullptr && video->asset_id.has_value()) {
        const Asset* asset = find_asset(aggregate, *video->asset_id);
        if (asset == nullptr) {
          return "video node must reference an existing Asset";
        }
        if (asset->type != AssetType::video) {
          return "video node Asset must be video";
        }
      }
      if (const auto* display = std::get_if<CgDisplayNode>(&node);
          display != nullptr) {
        const Asset* asset = find_asset(aggregate, display->asset_id);
        if (asset == nullptr) {
          return "CG display must reference an existing Asset";
        }
        if (asset->type != AssetType::image) {
          return "CG display Asset must be an image";
        }
      }
      if (const auto* choice = std::get_if<ChoiceNode>(&node);
          choice != nullptr) {
        for (const ChoiceOption& option : choice->options) {
          if (find_scene(aggregate.project, option.target_scene_id) ==
              nullptr) {
            return "choice option must reference an existing Scene";
          }
        }
      }
    }
  }

  return std::nullopt;
}

}  // namespace vnengine
