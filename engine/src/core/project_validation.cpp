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
  if (project.start_screen.background_asset_id.has_value() &&
      project.start_screen.background_asset_id->empty()) {
    return "start screen background Asset ID must not be empty";
  }
  if (project.start_screen.music_asset_id.has_value() &&
      project.start_screen.music_asset_id->empty()) {
    return "start screen music Asset ID must not be empty";
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
  if (project.scenes.empty()) {
    return "project must contain at least one scene";
  }

  // Project, Scene, timeline-node, Choice-option, and visual-instance IDs
  // share one namespace. Assets join it in validate_project_aggregate().
  std::unordered_set<std::string> ids{project.id};
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

    if (scene.visuals.background_asset_id.has_value() &&
        scene.visuals.background_asset_id->empty()) {
      return "background Asset ID must not be empty";
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
          background != nullptr && background->asset_id.has_value() &&
          background->asset_id->empty()) {
        return "background node Asset ID must not be empty";
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
