#include "vnengine/project.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <iomanip>
#include <iterator>
#include <sstream>
#include <unordered_set>
#include <utility>

namespace vnengine {

namespace {

std::string trim_ascii_whitespace(std::string value) {
  constexpr std::string_view whitespace = " \t\n\r\f\v";
  const std::size_t first = value.find_first_not_of(whitespace);

  if (first == std::string::npos) {
    return {};
  }

  const std::size_t last = value.find_last_not_of(whitespace);
  return value.substr(first, last - first + 1);
}

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

bool is_valid_character_slot(const CharacterSlot slot) {
  switch (slot) {
    case CharacterSlot::left:
    case CharacterSlot::center:
    case CharacterSlot::right:
      return true;
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
      .name = std::move(name),
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

Scene* find_scene(Project& project, const std::string_view scene_id) {
  const auto iterator = std::find_if(
      project.scenes.begin(),
      project.scenes.end(),
      [scene_id](const Scene& scene) { return scene.id == scene_id; });
  return iterator == project.scenes.end() ? nullptr : &*iterator;
}

const Scene* find_scene(
    const Project& project,
    const std::string_view scene_id) {
  const auto iterator = std::find_if(
      project.scenes.begin(),
      project.scenes.end(),
      [scene_id](const Scene& scene) { return scene.id == scene_id; });
  return iterator == project.scenes.end() ? nullptr : &*iterator;
}

std::string_view scene_node_id(const SceneNode& node) {
  return std::visit(
      [](const auto& value) -> std::string_view { return value.id; },
      node);
}

SceneNode* find_scene_node(
    Scene& scene,
    const std::string_view node_id) {
  const auto iterator = std::find_if(
      scene.nodes.begin(),
      scene.nodes.end(),
      [node_id](const SceneNode& node) {
        return scene_node_id(node) == node_id;
      });
  return iterator == scene.nodes.end() ? nullptr : &*iterator;
}

const SceneNode* find_scene_node(
    const Scene& scene,
    const std::string_view node_id) {
  const auto iterator = std::find_if(
      scene.nodes.begin(),
      scene.nodes.end(),
      [node_id](const SceneNode& node) {
        return scene_node_id(node) == node_id;
      });
  return iterator == scene.nodes.end() ? nullptr : &*iterator;
}

Dialogue* find_dialogue(Scene& scene, const std::string_view dialogue_id) {
  SceneNode* node = find_scene_node(scene, dialogue_id);
  return node == nullptr ? nullptr : std::get_if<Dialogue>(node);
}

const Dialogue* find_dialogue(
    const Scene& scene,
    const std::string_view dialogue_id) {
  const SceneNode* node = find_scene_node(scene, dialogue_id);
  return node == nullptr ? nullptr : std::get_if<Dialogue>(node);
}

BackgroundNode* find_background_node(
    Scene& scene,
    const std::string_view node_id) {
  SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<BackgroundNode>(node);
}

const BackgroundNode* find_background_node(
    const Scene& scene,
    const std::string_view node_id) {
  const SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<BackgroundNode>(node);
}

CharacterNode* find_character_node(
    Scene& scene,
    const std::string_view node_id) {
  SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<CharacterNode>(node);
}

const CharacterNode* find_character_node(
    const Scene& scene,
    const std::string_view node_id) {
  const SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<CharacterNode>(node);
}

Asset* find_asset(
    ProjectAggregate& aggregate,
    const std::string_view asset_id) {
  const auto iterator = std::find_if(
      aggregate.assets.begin(),
      aggregate.assets.end(),
      [asset_id](const Asset& asset) { return asset.id == asset_id; });
  return iterator == aggregate.assets.end() ? nullptr : &*iterator;
}

const Asset* find_asset(
    const ProjectAggregate& aggregate,
    const std::string_view asset_id) {
  const auto iterator = std::find_if(
      aggregate.assets.begin(),
      aggregate.assets.end(),
      [asset_id](const Asset& asset) { return asset.id == asset_id; });
  return iterator == aggregate.assets.end() ? nullptr : &*iterator;
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
    const int layer) {
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
      character->layer == layer) {
    return UpdateCharacterNodeResult::unchanged;
  }

  character->asset_id = std::move(asset_id);
  character->slot = slot;
  character->layer = layer;
  return UpdateCharacterNodeResult::changed;
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
  if (project.scenes.empty()) {
    return "project must contain at least one scene";
  }

  // Project, Scene, Dialogue, and visual-instance IDs share one namespace.
  // Assets join the same namespace in validate_project_aggregate().
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
      if (!is_valid_character_slot(character.slot)) {
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
      if (const auto* character = std::get_if<CharacterNode>(&node);
          character != nullptr) {
        if (character->asset_id.has_value() && character->asset_id->empty()) {
          return "character node Asset ID must not be empty";
        }
        if (!is_valid_character_slot(character->slot)) {
          return "character node slot is invalid";
        }
        if (character->layer < 1 || character->layer > 10) {
          return "character node layer must be between 1 and 10";
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
    }
  }

  return std::nullopt;
}

}  // namespace vnengine
