#include "vnengine/project.hpp"

#include "project_internal.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <iomanip>
#include <iterator>
#include <sstream>
#include <type_traits>
#include <unordered_set>
#include <utility>

namespace vnengine {

namespace {

using project_detail::is_valid_character_slot;
using project_detail::trim_ascii_whitespace;

bool project_contains_entity_id(
    const Project& project,
    const std::string_view candidate_id) {
  if (project.id == candidate_id) {
    return true;
  }
  for (const Scene& scene : project.scenes) {
    if (scene.id == candidate_id) {
      return true;
    }
    for (const CharacterVisualInstance& character :
         scene.visuals.characters) {
      if (character.id == candidate_id) {
        return true;
      }
    }
    for (const SceneNode& node : scene.nodes) {
      if (std::visit(
              [candidate_id](const auto& value) {
                return value.id == candidate_id;
              },
              node)) {
        return true;
      }
      const auto* choice = std::get_if<ChoiceNode>(&node);
      if (choice == nullptr) {
        continue;
      }
      for (const ChoiceOption& option : choice->options) {
        if (option.id == candidate_id) {
          return true;
        }
      }
    }
  }
  return false;
}

}  // namespace

RandomIdGenerator::RandomIdGenerator() : random_engine_(std::random_device{}()) {}

std::string RandomIdGenerator::next() {
  std::array<unsigned int, 16> bytes{};
  for (auto& byte : bytes) {
    byte = byte_distribution_(random_engine_);
  }

  // RFC 4122 version 4 and variant bits make these IDs interoperable with the
  // UUIDs that the TypeScript prototype previously produced.
  bytes[6] = (bytes[6] & 0x0fU) | 0x40U;
  bytes[8] = (bytes[8] & 0x3fU) | 0x80U;

  std::ostringstream result;
  result << std::hex << std::setfill('0');

  for (std::size_t index = 0; index < bytes.size(); ++index) {
    if (index == 4 || index == 6 || index == 8 || index == 10) {
      result << '-';
    }
    result << std::setw(2) << bytes[index];
  }

  return result.str();
}

Scene create_empty_scene(IdGenerator& ids, std::string name) {
  return Scene{
      .schema_version = kSchemaVersion,
      .id = ids.next(),
      .name = std::move(name),
      .visuals = {},
      .nodes = {},
  };
}

Project create_empty_project(IdGenerator& ids, std::string name) {
  Scene first_scene = create_empty_scene(ids, "场景 1");
  const std::string first_scene_id = first_scene.id;

  return Project{
      .schema_version = kSchemaVersion,
      .id = ids.next(),
      .name = name,
      .start_screen = {.title = std::move(name)},
      .cg_gallery = {},
      .entry_scene_id = first_scene_id,
      .scenes = {std::move(first_scene)},
  };
}

ProjectAggregate create_empty_project_aggregate(
    IdGenerator& ids,
    std::string name) {
  return ProjectAggregate{
      .project = create_empty_project(ids, std::move(name)),
      .assets = {},
  };
}

UpdateStartScreenResult update_start_screen(
    ProjectAggregate& aggregate,
    std::string title,
    std::optional<std::string> background_asset_id,
    std::optional<std::string> music_asset_id) {
  const auto normalized_title =
      normalize_start_screen_title(std::move(title));
  if (!normalized_title.has_value()) {
    return UpdateStartScreenResult::title_required;
  }

  if (background_asset_id.has_value()) {
    const Asset* background = find_asset(aggregate, *background_asset_id);
    if (background == nullptr) {
      return UpdateStartScreenResult::background_asset_not_found;
    }
    if (background->type != AssetType::image) {
      return UpdateStartScreenResult::background_asset_not_image;
    }
  }

  if (music_asset_id.has_value()) {
    const Asset* music = find_asset(aggregate, *music_asset_id);
    if (music == nullptr) {
      return UpdateStartScreenResult::music_asset_not_found;
    }
    if (music->type != AssetType::audio) {
      return UpdateStartScreenResult::music_asset_not_audio;
    }
  }

  StartScreen candidate{
      .title = *normalized_title,
      .background_asset_id = std::move(background_asset_id),
      .music_asset_id = std::move(music_asset_id),
  };
  if (aggregate.project.start_screen == candidate) {
    return UpdateStartScreenResult::unchanged;
  }

  static_assert(std::is_nothrow_move_assignable_v<StartScreen>);
  aggregate.project.start_screen = std::move(candidate);
  return UpdateStartScreenResult::changed;
}

UpdateCgGalleryResult update_cg_gallery(
    ProjectAggregate& aggregate,
    std::vector<CgGalleryPage> pages) {
  if (pages.empty()) {
    return UpdateCgGalleryResult::page_required;
  }

  std::unordered_set<std::string> unique_asset_ids;
  unique_asset_ids.reserve(pages.size() * kCgGalleryPageSize);
  for (const CgGalleryPage& page : pages) {
    for (const std::optional<std::string>& asset_id : page.image_asset_ids) {
      if (!asset_id.has_value()) {
        continue;
      }
      if (!unique_asset_ids.insert(*asset_id).second) {
        return UpdateCgGalleryResult::duplicate_asset_id;
      }
      const Asset* asset = find_asset(aggregate, *asset_id);
      if (asset == nullptr) {
        return UpdateCgGalleryResult::asset_not_found;
      }
      if (asset->type != AssetType::image) {
        return UpdateCgGalleryResult::asset_not_image;
      }
    }
  }

  CgGallery candidate{.pages = std::move(pages)};
  if (aggregate.project.cg_gallery == candidate) {
    return UpdateCgGalleryResult::unchanged;
  }

  static_assert(std::is_nothrow_move_assignable_v<CgGallery>);
  aggregate.project.cg_gallery = std::move(candidate);
  return UpdateCgGalleryResult::changed;
}

SetSceneBackgroundResult set_scene_background(
    ProjectAggregate& aggregate,
    const std::string_view scene_id,
    std::optional<std::string> asset_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return SetSceneBackgroundResult::scene_not_found;
  }

  // Resolve and type-check the requested Asset before touching the Scene.
  // Clearing the background uses nullopt and intentionally needs no Asset.
  if (asset_id.has_value()) {
    const Asset* asset = find_asset(aggregate, *asset_id);
    if (asset == nullptr) {
      return SetSceneBackgroundResult::asset_not_found;
    }
    if (asset->type != AssetType::image) {
      return SetSceneBackgroundResult::asset_not_image;
    }
  }

  if (scene->visuals.background_asset_id == asset_id) {
    return SetSceneBackgroundResult::unchanged;
  }

  // std::string's move assignment is noexcept with the default allocator, so
  // no fallible work remains after the authoritative value starts changing.
  scene->visuals.background_asset_id = std::move(asset_id);
  return SetSceneBackgroundResult::changed;
}

std::string next_scene_name(const Project& project) {
  std::unordered_set<std::string> existing_names;
  for (const Scene& scene : project.scenes) {
    existing_names.insert(scene.name);
  }

  for (std::size_t number = 1;; ++number) {
    std::string candidate = "场景 " + std::to_string(number);
    if (!existing_names.contains(candidate)) {
      return candidate;
    }
  }
}

std::optional<DialogueContent> normalize_dialogue_content(
    std::string speaker,
    std::string text) {
  speaker = trim_ascii_whitespace(std::move(speaker));
  text = trim_ascii_whitespace(std::move(text));

  if (text.empty()) {
    return std::nullopt;
  }

  if (speaker.empty()) {
    speaker = "旁白";
  }

  return DialogueContent{
      .speaker = std::move(speaker),
      .text = std::move(text),
  };
}

std::optional<std::string> normalize_project_name(std::string name) {
  name = trim_ascii_whitespace(std::move(name));
  if (name.empty()) {
    return std::nullopt;
  }
  return name;
}

std::optional<std::string> normalize_start_screen_title(std::string title) {
  title = trim_ascii_whitespace(std::move(title));
  if (title.empty()) {
    return std::nullopt;
  }
  return title;
}

bool rename_project(Project& project, std::string name) {
  if (project.name == name) {
    return false;
  }
  project.name = std::move(name);
  return true;
}

std::string add_scene(
    Project& project,
    IdGenerator& ids,
    std::optional<std::string> name) {
  Scene scene = create_empty_scene(
      ids,
      name.has_value() ? std::move(*name) : next_scene_name(project));
  std::string created_id = scene.id;
  project.scenes.push_back(std::move(scene));
  return created_id;
}

bool rename_scene(
    Project& project,
    const std::string_view scene_id,
    std::string name) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || scene->name == name) {
    return false;
  }

  scene->name = std::move(name);
  return true;
}

bool delete_scene(Project& project, const std::string_view scene_id) {
  const auto scene_iterator = std::find_if(
      project.scenes.begin(),
      project.scenes.end(),
      [scene_id](const Scene& scene) { return scene.id == scene_id; });

  if (scene_iterator == project.scenes.end() || project.scenes.size() == 1) {
    return false;
  }

  for (const Scene& scene : project.scenes) {
    for (const SceneNode& node : scene.nodes) {
      const auto* jump = std::get_if<SceneJumpNode>(&node);
      if (jump != nullptr && jump->target_scene_id == scene_id) {
        return false;
      }
      const auto* choice = std::get_if<ChoiceNode>(&node);
      if (choice != nullptr && scene.id != scene_id &&
          std::any_of(
              choice->options.begin(),
              choice->options.end(),
              [scene_id](const ChoiceOption& option) {
                return option.target_scene_id == scene_id;
              })) {
        return false;
      }
    }
  }

  const auto scene_index = static_cast<std::size_t>(
      std::distance(project.scenes.begin(), scene_iterator));
  const bool deleting_entry_scene = project.entry_scene_id == scene_id;

  project.scenes.erase(scene_iterator);

  if (deleting_entry_scene) {
    // After erase, the same index is the former next scene. If it was the last
    // scene, the final remaining index is the former previous scene.
    const std::size_t replacement_index =
        std::min(scene_index, project.scenes.size() - 1);
    project.entry_scene_id = project.scenes[replacement_index].id;
  }

  return true;
}

AddBackgroundNodeResult add_background_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    const std::string_view scene_id,
    std::optional<std::string> after_node_id,
    std::optional<std::string> before_node_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return {AddBackgroundNodeStatus::scene_not_found, std::nullopt};
  }
  if (after_node_id.has_value() && before_node_id.has_value()) {
    return {AddBackgroundNodeStatus::placement_conflict, std::nullopt};
  }

  auto insertion_iterator = scene->nodes.end();
  if (before_node_id.has_value()) {
    insertion_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&before_node_id](const SceneNode& node) {
          return scene_node_id(node) == *before_node_id;
        });
    if (insertion_iterator == scene->nodes.end()) {
      return {AddBackgroundNodeStatus::anchor_not_found, std::nullopt};
    }
  } else if (after_node_id.has_value()) {
    const auto anchor = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&after_node_id](const SceneNode& node) {
          return scene_node_id(node) == *after_node_id;
        });
    if (anchor == scene->nodes.end()) {
      return {AddBackgroundNodeStatus::anchor_not_found, std::nullopt};
    }
    insertion_iterator = std::next(anchor);
  }

  BackgroundNode background{
      .id = ids.next(),
      .asset_id = std::nullopt,
  };
  std::string created_id = background.id;
  scene->nodes.insert(insertion_iterator, std::move(background));
  return {AddBackgroundNodeStatus::added, std::move(created_id)};
}

UpdateBackgroundNodeResult update_background_node(
    ProjectAggregate& aggregate,
    const std::string_view scene_id,
    const std::string_view node_id,
    std::optional<std::string> asset_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return UpdateBackgroundNodeResult::scene_not_found;
  }
  BackgroundNode* background = find_background_node(*scene, node_id);
  if (background == nullptr) {
    return UpdateBackgroundNodeResult::node_not_found;
  }

  if (asset_id.has_value()) {
    const Asset* asset = find_asset(aggregate, *asset_id);
    if (asset == nullptr) {
      return UpdateBackgroundNodeResult::asset_not_found;
    }
    if (asset->type != AssetType::image) {
      return UpdateBackgroundNodeResult::asset_not_image;
    }
  }
  if (background->asset_id == asset_id) {
    return UpdateBackgroundNodeResult::unchanged;
  }

  background->asset_id = std::move(asset_id);
  return UpdateBackgroundNodeResult::changed;
}

bool delete_background_node(
    Project& project,
    const std::string_view scene_id,
    const std::string_view node_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || find_background_node(*scene, node_id) == nullptr) {
    return false;
  }
  const auto old_size = scene->nodes.size();
  std::erase_if(scene->nodes, [node_id](const SceneNode& node) {
    return scene_node_id(node) == node_id;
  });
  return scene->nodes.size() != old_size;
}

AddCharacterNodeResult add_character_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    const std::string_view scene_id,
    std::optional<std::string> after_node_id,
    std::optional<std::string> before_node_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return {AddCharacterNodeStatus::scene_not_found, std::nullopt};
  }
  if (after_node_id.has_value() && before_node_id.has_value()) {
    return {AddCharacterNodeStatus::placement_conflict, std::nullopt};
  }

  auto insertion_iterator = scene->nodes.end();
  if (before_node_id.has_value()) {
    insertion_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&before_node_id](const SceneNode& node) {
          return scene_node_id(node) == *before_node_id;
        });
    if (insertion_iterator == scene->nodes.end()) {
      return {AddCharacterNodeStatus::anchor_not_found, std::nullopt};
    }
  } else if (after_node_id.has_value()) {
    const auto anchor = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&after_node_id](const SceneNode& node) {
          return scene_node_id(node) == *after_node_id;
        });
    if (anchor == scene->nodes.end()) {
      return {AddCharacterNodeStatus::anchor_not_found, std::nullopt};
    }
    insertion_iterator = std::next(anchor);
  }

  CharacterNode character{
      .id = ids.next(),
      .asset_id = std::nullopt,
      .slot = CharacterSlot::center,
      .layer = 1,
      .position = std::nullopt,
  };
  std::string created_id = character.id;
  scene->nodes.insert(insertion_iterator, std::move(character));
  return {AddCharacterNodeStatus::added, std::move(created_id)};
}

UpdateCharacterNodeResult update_character_node(
    ProjectAggregate& aggregate,
    const std::string_view scene_id,
    const std::string_view node_id,
    std::optional<std::string> asset_id,
    const CharacterSlot slot,
    const int layer,
    std::optional<CharacterPosition> position) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return UpdateCharacterNodeResult::scene_not_found;
  }
  CharacterNode* character = find_character_node(*scene, node_id);
  if (character == nullptr) {
    return UpdateCharacterNodeResult::node_not_found;
  }
  if (!is_valid_character_slot(slot)) {
    return UpdateCharacterNodeResult::invalid_slot;
  }
  if (layer < 1 || layer > 10) {
    return UpdateCharacterNodeResult::invalid_layer;
  }
  if (position.has_value() &&
      (!std::isfinite(position->x) || !std::isfinite(position->y) ||
       position->x < 0.0 || position->x > 100.0 ||
       position->y < 0.0 || position->y > 100.0)) {
    return UpdateCharacterNodeResult::invalid_position;
  }
  if (asset_id.has_value()) {
    const Asset* asset = find_asset(aggregate, *asset_id);
    if (asset == nullptr) {
      return UpdateCharacterNodeResult::asset_not_found;
    }
    if (asset->type != AssetType::image) {
      return UpdateCharacterNodeResult::asset_not_image;
    }
  }
  if (character->asset_id == asset_id && character->slot == slot &&
      character->layer == layer && character->position == position) {
    return UpdateCharacterNodeResult::unchanged;
  }

  character->asset_id = std::move(asset_id);
  character->slot = slot;
  character->layer = layer;
  character->position = std::move(position);
  return UpdateCharacterNodeResult::changed;
}

AddBgmNodeResult add_bgm_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    const std::string_view scene_id,
    std::optional<std::string> after_node_id,
    std::optional<std::string> before_node_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return {AddBgmNodeStatus::scene_not_found, std::nullopt};
  }
  if (after_node_id.has_value() && before_node_id.has_value()) {
    return {AddBgmNodeStatus::placement_conflict, std::nullopt};
  }

  auto insertion_iterator = scene->nodes.end();
  if (before_node_id.has_value()) {
    insertion_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&before_node_id](const SceneNode& node) {
          return scene_node_id(node) == *before_node_id;
        });
    if (insertion_iterator == scene->nodes.end()) {
      return {AddBgmNodeStatus::anchor_not_found, std::nullopt};
    }
  } else if (after_node_id.has_value()) {
    const auto anchor = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&after_node_id](const SceneNode& node) {
          return scene_node_id(node) == *after_node_id;
        });
    if (anchor == scene->nodes.end()) {
      return {AddBgmNodeStatus::anchor_not_found, std::nullopt};
    }
    insertion_iterator = std::next(anchor);
  }

  BgmNode bgm{
      .id = ids.next(),
      .asset_id = std::nullopt,
  };
  std::string created_id = bgm.id;
  scene->nodes.insert(insertion_iterator, std::move(bgm));
  return {AddBgmNodeStatus::added, std::move(created_id)};
}

UpdateBgmNodeResult update_bgm_node(
    ProjectAggregate& aggregate,
    const std::string_view scene_id,
    const std::string_view node_id,
    std::optional<std::string> asset_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return UpdateBgmNodeResult::scene_not_found;
  }
  BgmNode* bgm = find_bgm_node(*scene, node_id);
  if (bgm == nullptr) {
    return UpdateBgmNodeResult::node_not_found;
  }
  if (asset_id.has_value()) {
    const Asset* asset = find_asset(aggregate, *asset_id);
    if (asset == nullptr) {
      return UpdateBgmNodeResult::asset_not_found;
    }
    if (asset->type != AssetType::audio) {
      return UpdateBgmNodeResult::asset_not_audio;
    }
  }
  if (bgm->asset_id == asset_id) {
    return UpdateBgmNodeResult::unchanged;
  }

  bgm->asset_id = std::move(asset_id);
  return UpdateBgmNodeResult::changed;
}

AddVideoNodeResult add_video_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    const std::string_view scene_id,
    std::optional<std::string> after_node_id,
    std::optional<std::string> before_node_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return {AddVideoNodeStatus::scene_not_found, std::nullopt};
  }
  if (after_node_id.has_value() && before_node_id.has_value()) {
    return {AddVideoNodeStatus::placement_conflict, std::nullopt};
  }

  auto insertion_iterator = scene->nodes.end();
  if (before_node_id.has_value()) {
    insertion_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&before_node_id](const SceneNode& node) {
          return scene_node_id(node) == *before_node_id;
        });
    if (insertion_iterator == scene->nodes.end()) {
      return {AddVideoNodeStatus::anchor_not_found, std::nullopt};
    }
  } else if (after_node_id.has_value()) {
    const auto anchor = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&after_node_id](const SceneNode& node) {
          return scene_node_id(node) == *after_node_id;
        });
    if (anchor == scene->nodes.end()) {
      return {AddVideoNodeStatus::anchor_not_found, std::nullopt};
    }
    insertion_iterator = std::next(anchor);
  }

  VideoNode video{
      .id = ids.next(),
      .asset_id = std::nullopt,
  };
  std::string created_id = video.id;
  scene->nodes.insert(insertion_iterator, std::move(video));
  return {AddVideoNodeStatus::added, std::move(created_id)};
}

UpdateVideoNodeResult update_video_node(
    ProjectAggregate& aggregate,
    const std::string_view scene_id,
    const std::string_view node_id,
    std::optional<std::string> asset_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return UpdateVideoNodeResult::scene_not_found;
  }
  VideoNode* video = find_video_node(*scene, node_id);
  if (video == nullptr) {
    return UpdateVideoNodeResult::node_not_found;
  }
  if (asset_id.has_value()) {
    const Asset* asset = find_asset(aggregate, *asset_id);
    if (asset == nullptr) {
      return UpdateVideoNodeResult::asset_not_found;
    }
    if (asset->type != AssetType::video) {
      return UpdateVideoNodeResult::asset_not_video;
    }
  }
  if (video->asset_id == asset_id) {
    return UpdateVideoNodeResult::unchanged;
  }

  video->asset_id = std::move(asset_id);
  return UpdateVideoNodeResult::changed;
}

AddChoiceNodeResult add_choice_node(
    Project& project,
    IdGenerator& ids,
    const std::string_view scene_id,
    std::optional<std::string> after_node_id,
    std::optional<std::string> before_node_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr) {
    return {AddChoiceNodeStatus::scene_not_found, std::nullopt};
  }
  if (after_node_id.has_value() && before_node_id.has_value()) {
    return {AddChoiceNodeStatus::placement_conflict, std::nullopt};
  }

  auto insertion_iterator = scene->nodes.end();
  if (before_node_id.has_value()) {
    insertion_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&before_node_id](const SceneNode& node) {
          return scene_node_id(node) == *before_node_id;
        });
    if (insertion_iterator == scene->nodes.end()) {
      return {AddChoiceNodeStatus::anchor_not_found, std::nullopt};
    }
  } else if (after_node_id.has_value()) {
    const auto anchor = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&after_node_id](const SceneNode& node) {
          return scene_node_id(node) == *after_node_id;
        });
    if (anchor == scene->nodes.end()) {
      return {AddChoiceNodeStatus::anchor_not_found, std::nullopt};
    }
    insertion_iterator = std::next(anchor);
  }

  ChoiceNode choice{
      .id = ids.next(),
      .options = {},
  };
  std::string created_id = choice.id;
  scene->nodes.insert(insertion_iterator, std::move(choice));
  return {AddChoiceNodeStatus::added, std::move(created_id)};
}

AddChoiceOptionResult add_choice_option(
    Project& project,
    IdGenerator& ids,
    const std::string_view scene_id,
    const std::string_view node_id,
    std::string text,
    std::string target_scene_id,
    std::optional<std::string> before_option_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr) {
    return {AddChoiceOptionStatus::scene_not_found, std::nullopt};
  }
  ChoiceNode* choice = find_choice_node(*scene, node_id);
  if (choice == nullptr) {
    return {AddChoiceOptionStatus::node_not_found, std::nullopt};
  }

  text = trim_ascii_whitespace(std::move(text));
  if (text.empty()) {
    return {AddChoiceOptionStatus::text_required, std::nullopt};
  }
  if (find_scene(project, target_scene_id) == nullptr) {
    return {
        AddChoiceOptionStatus::target_scene_not_found,
        std::nullopt,
    };
  }

  auto insertion_iterator = choice->options.end();
  if (before_option_id.has_value()) {
    insertion_iterator = std::find_if(
        choice->options.begin(),
        choice->options.end(),
        [&before_option_id](const ChoiceOption& option) {
          return option.id == *before_option_id;
        });
    if (insertion_iterator == choice->options.end()) {
      return {
          AddChoiceOptionStatus::before_option_not_found,
          std::nullopt,
      };
    }
  }

  std::string option_id;
  for (int attempt = 0; attempt < 32; ++attempt) {
    std::string candidate = ids.next();
    if (!candidate.empty() &&
        !project_contains_entity_id(project, candidate)) {
      option_id = std::move(candidate);
      break;
    }
  }
  if (option_id.empty()) {
    return {
        AddChoiceOptionStatus::id_generation_failed,
        std::nullopt,
    };
  }

  choice->options.insert(
      insertion_iterator,
      ChoiceOption{
          .id = option_id,
          .text = std::move(text),
          .target_scene_id = std::move(target_scene_id),
      });
  return {AddChoiceOptionStatus::added, std::move(option_id)};
}

UpdateChoiceOptionResult update_choice_option(
    Project& project,
    const std::string_view scene_id,
    const std::string_view node_id,
    const std::string_view option_id,
    std::string text,
    std::string target_scene_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr) {
    return UpdateChoiceOptionResult::scene_not_found;
  }
  ChoiceNode* choice = find_choice_node(*scene, node_id);
  if (choice == nullptr) {
    return UpdateChoiceOptionResult::node_not_found;
  }
  ChoiceOption* option = find_choice_option(*choice, option_id);
  if (option == nullptr) {
    return UpdateChoiceOptionResult::option_not_found;
  }

  text = trim_ascii_whitespace(std::move(text));
  if (text.empty()) {
    return UpdateChoiceOptionResult::text_required;
  }
  if (find_scene(project, target_scene_id) == nullptr) {
    return UpdateChoiceOptionResult::target_scene_not_found;
  }
  if (option->text == text &&
      option->target_scene_id == target_scene_id) {
    return UpdateChoiceOptionResult::unchanged;
  }

  option->text = std::move(text);
  option->target_scene_id = std::move(target_scene_id);
  return UpdateChoiceOptionResult::changed;
}

DeleteChoiceOptionResult delete_choice_option(
    Project& project,
    const std::string_view scene_id,
    const std::string_view node_id,
    const std::string_view option_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr) {
    return DeleteChoiceOptionResult::scene_not_found;
  }
  ChoiceNode* choice = find_choice_node(*scene, node_id);
  if (choice == nullptr) {
    return DeleteChoiceOptionResult::node_not_found;
  }
  const auto iterator = std::find_if(
      choice->options.begin(),
      choice->options.end(),
      [option_id](const ChoiceOption& option) {
        return option.id == option_id;
      });
  if (iterator == choice->options.end()) {
    return DeleteChoiceOptionResult::option_not_found;
  }

  choice->options.erase(iterator);
  return DeleteChoiceOptionResult::changed;
}

ReorderChoiceOptionResult reorder_choice_option(
    Project& project,
    const std::string_view scene_id,
    const std::string_view node_id,
    const std::string_view option_id,
    std::optional<std::string> before_option_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr) {
    return ReorderChoiceOptionResult::scene_not_found;
  }
  ChoiceNode* choice = find_choice_node(*scene, node_id);
  if (choice == nullptr) {
    return ReorderChoiceOptionResult::node_not_found;
  }
  if (find_choice_option(*choice, option_id) == nullptr) {
    return ReorderChoiceOptionResult::option_not_found;
  }
  if (before_option_id == option_id) {
    return ReorderChoiceOptionResult::self_anchor;
  }
  if (before_option_id.has_value() &&
      find_choice_option(*choice, *before_option_id) == nullptr) {
    return ReorderChoiceOptionResult::before_option_not_found;
  }

  std::vector<ChoiceOption> reordered;
  reordered.reserve(choice->options.size());
  std::optional<ChoiceOption> moving;
  for (const ChoiceOption& option : choice->options) {
    if (option.id == option_id) {
      moving = option;
    } else {
      reordered.push_back(option);
    }
  }

  auto insertion_iterator = reordered.end();
  if (before_option_id.has_value()) {
    insertion_iterator = std::find_if(
        reordered.begin(),
        reordered.end(),
        [&before_option_id](const ChoiceOption& option) {
          return option.id == *before_option_id;
        });
  }
  reordered.insert(insertion_iterator, std::move(*moving));

  if (std::equal(
          choice->options.begin(),
          choice->options.end(),
          reordered.begin(),
          [](const ChoiceOption& current, const ChoiceOption& next) {
            return current.id == next.id;
          })) {
    return ReorderChoiceOptionResult::unchanged;
  }

  choice->options.swap(reordered);
  return ReorderChoiceOptionResult::changed;
}

AddSceneJumpNodeResult add_scene_jump_node(
    Project& project,
    IdGenerator& ids,
    const std::string_view scene_id,
    std::string target_scene_id,
    std::optional<std::string> after_node_id,
    std::optional<std::string> before_node_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr) {
    return {AddSceneJumpNodeStatus::scene_not_found, std::nullopt};
  }
  if (find_scene(project, target_scene_id) == nullptr) {
    return {AddSceneJumpNodeStatus::target_scene_not_found, std::nullopt};
  }
  if (scene_id == target_scene_id) {
    return {AddSceneJumpNodeStatus::self_target, std::nullopt};
  }
  if (after_node_id.has_value() && before_node_id.has_value()) {
    return {AddSceneJumpNodeStatus::placement_conflict, std::nullopt};
  }

  auto insertion_iterator = scene->nodes.end();
  if (before_node_id.has_value()) {
    insertion_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&before_node_id](const SceneNode& node) {
          return scene_node_id(node) == *before_node_id;
        });
    if (insertion_iterator == scene->nodes.end()) {
      return {AddSceneJumpNodeStatus::anchor_not_found, std::nullopt};
    }
  } else if (after_node_id.has_value()) {
    const auto anchor = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&after_node_id](const SceneNode& node) {
          return scene_node_id(node) == *after_node_id;
        });
    if (anchor == scene->nodes.end()) {
      return {AddSceneJumpNodeStatus::anchor_not_found, std::nullopt};
    }
    insertion_iterator = std::next(anchor);
  }

  SceneJumpNode jump{
      .id = ids.next(),
      .target_scene_id = std::move(target_scene_id),
  };
  std::string created_id = jump.id;
  scene->nodes.insert(insertion_iterator, std::move(jump));
  return {AddSceneJumpNodeStatus::added, std::move(created_id)};
}

UpdateSceneJumpNodeResult update_scene_jump_node(
    Project& project,
    const std::string_view scene_id,
    const std::string_view node_id,
    std::string target_scene_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr) {
    return UpdateSceneJumpNodeResult::scene_not_found;
  }
  SceneJumpNode* jump = find_scene_jump_node(*scene, node_id);
  if (jump == nullptr) {
    return UpdateSceneJumpNodeResult::node_not_found;
  }
  if (find_scene(project, target_scene_id) == nullptr) {
    return UpdateSceneJumpNodeResult::target_scene_not_found;
  }
  if (scene_id == target_scene_id) {
    return UpdateSceneJumpNodeResult::self_target;
  }
  if (jump->target_scene_id == target_scene_id) {
    return UpdateSceneJumpNodeResult::unchanged;
  }

  jump->target_scene_id = std::move(target_scene_id);
  return UpdateSceneJumpNodeResult::changed;
}

AddStoryExtensionNodeResult add_story_extension_node(
    Project& project,
    IdGenerator& ids,
    const std::string_view scene_id,
    std::optional<std::string> after_node_id,
    std::optional<std::string> before_node_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr) {
    return {AddStoryExtensionNodeStatus::scene_not_found, std::nullopt};
  }
  if (after_node_id.has_value() && before_node_id.has_value()) {
    return {
        AddStoryExtensionNodeStatus::placement_conflict,
        std::nullopt,
    };
  }

  auto insertion_iterator = scene->nodes.end();
  if (before_node_id.has_value()) {
    insertion_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&before_node_id](const SceneNode& node) {
          return scene_node_id(node) == *before_node_id;
        });
    if (insertion_iterator == scene->nodes.end()) {
      return {
          AddStoryExtensionNodeStatus::anchor_not_found,
          std::nullopt,
      };
    }
  } else if (after_node_id.has_value()) {
    const auto anchor = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&after_node_id](const SceneNode& node) {
          return scene_node_id(node) == *after_node_id;
        });
    if (anchor == scene->nodes.end()) {
      return {
          AddStoryExtensionNodeStatus::anchor_not_found,
          std::nullopt,
      };
    }
    insertion_iterator = std::next(anchor);
  }

  StoryExtensionNode extension{.id = ids.next()};
  std::string created_id = extension.id;
  scene->nodes.insert(insertion_iterator, std::move(extension));
  return {
      AddStoryExtensionNodeStatus::added,
      std::move(created_id),
  };
}

bool reorder_scene_node(
    Project& project,
    const std::string_view scene_id,
    const std::string_view node_id,
    std::optional<std::string> before_node_id) {
  return reorder_scene_nodes(
      project,
      scene_id,
      {std::string(node_id)},
      std::move(before_node_id));
}

bool delete_scene_nodes(
    Project& project,
    const std::string_view scene_id,
    const std::vector<std::string>& node_ids) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || node_ids.empty()) {
    return false;
  }

  std::unordered_set<std::string> requested_ids;
  for (const std::string& node_id : node_ids) {
    if (!requested_ids.insert(node_id).second ||
        find_scene_node(*scene, node_id) == nullptr) {
      return false;
    }
  }

  std::erase_if(scene->nodes, [&requested_ids](const SceneNode& node) {
    return requested_ids.contains(std::string(scene_node_id(node)));
  });
  return true;
}

bool reorder_scene_nodes(
    Project& project,
    const std::string_view scene_id,
    const std::vector<std::string>& node_ids,
    std::optional<std::string> before_node_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || node_ids.empty()) {
    return false;
  }

  std::unordered_set<std::string> selected_ids;
  for (const std::string& node_id : node_ids) {
    if (!selected_ids.insert(node_id).second ||
        find_scene_node(*scene, node_id) == nullptr) {
      return false;
    }
  }

  if (before_node_id.has_value() &&
      (selected_ids.contains(*before_node_id) ||
       find_scene_node(*scene, *before_node_id) == nullptr)) {
    return false;
  }

  std::vector<SceneNode> moving;
  std::vector<SceneNode> remaining;
  moving.reserve(selected_ids.size());
  remaining.reserve(scene->nodes.size() - selected_ids.size());
  for (const SceneNode& node : scene->nodes) {
    if (selected_ids.contains(std::string(scene_node_id(node)))) {
      moving.push_back(node);
    } else {
      remaining.push_back(node);
    }
  }

  auto insertion_iterator = remaining.end();
  if (before_node_id.has_value()) {
    insertion_iterator = std::find_if(
        remaining.begin(),
        remaining.end(),
        [&before_node_id](const SceneNode& node) {
          return scene_node_id(node) == *before_node_id;
        });
  }

  std::vector<SceneNode> reordered;
  reordered.reserve(scene->nodes.size());
  reordered.insert(
      reordered.end(), remaining.begin(), insertion_iterator);
  reordered.insert(reordered.end(), moving.begin(), moving.end());
  reordered.insert(reordered.end(), insertion_iterator, remaining.end());

  const bool changed = !std::equal(
      scene->nodes.begin(),
      scene->nodes.end(),
      reordered.begin(),
      [](const SceneNode& current, const SceneNode& next) {
        return scene_node_id(current) == scene_node_id(next);
      });
  if (!changed) {
    return false;
  }

  scene->nodes.swap(reordered);
  return true;
}

std::optional<std::string> add_dialogue(
    Project& project,
    IdGenerator& ids,
    const std::string_view scene_id,
    std::string speaker,
    std::string text,
    std::optional<std::string> after_dialogue_id,
    std::optional<std::string> before_dialogue_id) {
  Scene* scene = find_scene(project, scene_id);

  if (scene == nullptr) {
    return std::nullopt;
  }

  // 同时指定“前面”和“后面”会产生歧义，因此拒绝。
  if (after_dialogue_id.has_value() &&
      before_dialogue_id.has_value()) {
    return std::nullopt;
  }

  auto insertion_iterator = scene->nodes.end();

  if (before_dialogue_id.has_value()) {
    insertion_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&before_dialogue_id](const SceneNode& current) {
          return scene_node_id(current) == *before_dialogue_id;
        });

    // before 的目标不存在时，不能猜测用户想放在哪里。
    if (insertion_iterator == scene->nodes.end()) {
      return std::nullopt;
    }
  } else if (after_dialogue_id.has_value()) {
    const auto after_iterator = std::find_if(
        scene->nodes.begin(),
        scene->nodes.end(),
        [&after_dialogue_id](const SceneNode& current) {
          return scene_node_id(current) == *after_dialogue_id;
        });

    // 保留旧行为：无效的 after ID 会追加到末尾。
    if (after_iterator != scene->nodes.end()) {
      insertion_iterator = std::next(after_iterator);
    }
  }

  // 位置验证成功后才生成 ID，避免失败请求浪费一个 ID。
  Dialogue dialogue{
      .id = ids.next(),
      .speaker = std::move(speaker),
      .text = std::move(text),
      .voice_asset_id = std::nullopt,
  };
  std::string created_id = dialogue.id;

  // vector::insert 会把元素插到 iterator 指向元素的前面。
  // 当 iterator 是 end() 时，就相当于追加到末尾。
  scene->nodes.insert(
      insertion_iterator,
      std::move(dialogue));

  return created_id;
}

bool update_dialogue(
    Project& project,
    const std::string_view scene_id,
    const std::string_view dialogue_id,
    std::string speaker,
    std::string text) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || find_dialogue(*scene, dialogue_id) == nullptr) {
    return false;
  }

  Dialogue* dialogue = find_dialogue(*scene, dialogue_id);
  if (dialogue == nullptr ||
      (dialogue->speaker == speaker && dialogue->text == text)) {
    return false;
  }

  dialogue->speaker = std::move(speaker);
  dialogue->text = std::move(text);
  return true;
}

SetDialogueVoiceResult set_dialogue_voice(
    ProjectAggregate& aggregate,
    const std::string_view scene_id,
    const std::string_view dialogue_id,
    std::optional<std::string> asset_id) {
  Scene* scene = find_scene(aggregate.project, scene_id);
  if (scene == nullptr) {
    return SetDialogueVoiceResult::scene_not_found;
  }
  Dialogue* dialogue = find_dialogue(*scene, dialogue_id);
  if (dialogue == nullptr) {
    return SetDialogueVoiceResult::dialogue_not_found;
  }
  if (asset_id.has_value()) {
    const Asset* asset = find_asset(aggregate, *asset_id);
    if (asset == nullptr) {
      return SetDialogueVoiceResult::asset_not_found;
    }
    if (asset->type != AssetType::audio) {
      return SetDialogueVoiceResult::asset_not_audio;
    }
  }
  if (dialogue->voice_asset_id == asset_id) {
    return SetDialogueVoiceResult::unchanged;
  }

  dialogue->voice_asset_id = std::move(asset_id);
  return SetDialogueVoiceResult::changed;
}

bool delete_dialogue(
    Project& project,
    const std::string_view scene_id,
    const std::string_view dialogue_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || find_dialogue(*scene, dialogue_id) == nullptr) {
    return false;
  }

  const auto old_size = scene->nodes.size();
  std::erase_if(scene->nodes, [dialogue_id](const SceneNode& node) {
    return scene_node_id(node) == dialogue_id;
  });
  return scene->nodes.size() != old_size;
}

bool delete_dialogues(
    Project& project,
    const std::string_view scene_id,
    const std::vector<std::string>& dialogue_ids) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || dialogue_ids.empty()) {
    return false;
  }

  std::unordered_set<std::string> requested_ids;
  for (const std::string& dialogue_id : dialogue_ids) {
    if (!requested_ids.insert(dialogue_id).second ||
        find_dialogue(*scene, dialogue_id) == nullptr) {
      return false;
    }
  }

  std::erase_if(scene->nodes, [&requested_ids](const SceneNode& node) {
    return requested_ids.contains(std::string(scene_node_id(node)));
  });
  return true;
}

bool move_dialogue(
    Project& project,
    const std::string_view scene_id,
    const std::string_view dialogue_id,
    const int direction) {
  if (direction != -1 && direction != 1) {
    return false;
  }

  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || find_dialogue(*scene, dialogue_id) == nullptr) {
    return false;
  }

  const auto current_iterator = std::find_if(
      scene->nodes.begin(),
      scene->nodes.end(),
      [dialogue_id](const SceneNode& node) {
        return scene_node_id(node) == dialogue_id;
      });
  if (current_iterator == scene->nodes.end()) {
    return false;
  }

  const auto current_index = std::distance(
      scene->nodes.begin(),
      current_iterator);
  const auto target_index = current_index + direction;
  if (target_index < 0 ||
      target_index >= static_cast<std::ptrdiff_t>(scene->nodes.size())) {
    return false;
  }

  std::iter_swap(
      current_iterator,
      scene->nodes.begin() + target_index);
  return true;
}

bool reorder_dialogue(
    Project& project,
    const std::string_view scene_id,
    const std::string_view dialogue_id,
    std::optional<std::string> before_dialogue_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || find_dialogue(*scene, dialogue_id) == nullptr) {
    return false;
  }
  return reorder_scene_node(
      project, scene_id, dialogue_id, std::move(before_dialogue_id));
}

bool reorder_dialogues(
    Project& project,
    const std::string_view scene_id,
    const std::vector<std::string>& dialogue_ids,
    std::optional<std::string> before_dialogue_id) {
  Scene* scene = find_scene(project, scene_id);
  if (scene == nullptr || dialogue_ids.empty()) {
    return false;
  }

  std::unordered_set<std::string> selected_ids;
  for (const std::string& dialogue_id : dialogue_ids) {
    if (!selected_ids.insert(dialogue_id).second ||
        find_dialogue(*scene, dialogue_id) == nullptr) {
      return false;
    }
  }

  if (before_dialogue_id.has_value()) {
    if (selected_ids.contains(*before_dialogue_id) ||
        find_scene_node(*scene, *before_dialogue_id) == nullptr) {
      return false;
    }
  }

  std::vector<SceneNode> moving;
  std::vector<SceneNode> remaining;
  moving.reserve(selected_ids.size());
  remaining.reserve(scene->nodes.size() - selected_ids.size());

  // Iterate over the authoritative Scene order instead of request order.
  for (const SceneNode& node : scene->nodes) {
    if (selected_ids.contains(std::string(scene_node_id(node)))) {
      moving.push_back(node);
    } else {
      remaining.push_back(node);
    }
  }

  auto insertion_iterator = remaining.end();
  if (before_dialogue_id.has_value()) {
    insertion_iterator = std::find_if(
        remaining.begin(),
        remaining.end(),
        [&before_dialogue_id](const SceneNode& node) {
          return scene_node_id(node) == *before_dialogue_id;
        });
  }

  std::vector<SceneNode> reordered;
  reordered.reserve(scene->nodes.size());
  reordered.insert(
      reordered.end(), remaining.begin(), insertion_iterator);
  reordered.insert(reordered.end(), moving.begin(), moving.end());
  reordered.insert(reordered.end(), insertion_iterator, remaining.end());

  const bool changed = !std::equal(
      scene->nodes.begin(),
      scene->nodes.end(),
      reordered.begin(),
      [](const SceneNode& current, const SceneNode& next) {
        return scene_node_id(current) == scene_node_id(next);
      });
  if (!changed) {
    return false;
  }

  scene->nodes.swap(reordered);
  return true;
}

}  // namespace vnengine
