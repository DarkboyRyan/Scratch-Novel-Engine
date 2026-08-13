#pragma once

#include <optional>
#include <random>
#include <string>
#include <string_view>
#include <vector>

#include "vnengine/model.hpp"

namespace vnengine {

// Separating ID generation from the model makes the production implementation
// random while allowing tests to use deterministic IDs.
class IdGenerator {
 public:
  virtual ~IdGenerator() = default;
  virtual std::string next() = 0;
};

class RandomIdGenerator final : public IdGenerator {
 public:
  RandomIdGenerator();
  std::string next() override;

 private:
  std::mt19937_64 random_engine_;
  std::uniform_int_distribution<unsigned int> byte_distribution_{0, 255};
};

Scene create_empty_scene(IdGenerator& ids, std::string name = "场景 1");
Project create_empty_project(
    IdGenerator& ids,
    std::string name = "未命名项目");
ProjectAggregate create_empty_project_aggregate(
    IdGenerator& ids,
    std::string name = "未命名项目");

Scene* find_scene(Project& project, std::string_view scene_id);
const Scene* find_scene(const Project& project, std::string_view scene_id);
std::string_view scene_node_id(const SceneNode& node);
SceneNode* find_scene_node(Scene& scene, std::string_view node_id);
const SceneNode* find_scene_node(
    const Scene& scene,
    std::string_view node_id);
Dialogue* find_dialogue(Scene& scene, std::string_view dialogue_id);
const Dialogue* find_dialogue(
    const Scene& scene,
    std::string_view dialogue_id);
BackgroundNode* find_background_node(
    Scene& scene,
    std::string_view node_id);
const BackgroundNode* find_background_node(
    const Scene& scene,
    std::string_view node_id);
CharacterNode* find_character_node(Scene& scene, std::string_view node_id);
const CharacterNode* find_character_node(
    const Scene& scene,
    std::string_view node_id);
Asset* find_asset(
    ProjectAggregate& aggregate,
    std::string_view asset_id);
const Asset* find_asset(
    const ProjectAggregate& aggregate,
    std::string_view asset_id);

// Background changes are aggregate operations because a Scene may only
// reference an existing image Asset. Expected validation failures are
// reported without changing the aggregate; assigning the current value is a
// successful no-op so callers can keep document revisions precise.
enum class SetSceneBackgroundResult {
  changed,
  unchanged,
  scene_not_found,
  asset_not_found,
  asset_not_image,
};

SetSceneBackgroundResult set_scene_background(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::optional<std::string> asset_id);

std::string next_scene_name(const Project& project);

// A committed dialogue must contain text. Whitespace is trimmed and an empty
// speaker becomes “旁白”. Empty placeholder nodes created by the "+" command
// bypass this function while the user is still editing their draft fields.
std::optional<DialogueContent> normalize_dialogue_content(
    std::string speaker,
    std::string text);

// Project names shown in the title bar are persisted data rather than a UI
// label. Keep their normalization in the C++ model so every frontend follows
// the same rule: surrounding ASCII whitespace is ignored and an all-whitespace
// name is invalid.
std::optional<std::string> normalize_project_name(std::string name);
bool rename_project(Project& project, std::string name);

// Scene names are generated as 场景 1, 场景 2, ... when name is omitted.
// The created entity's ID is returned so the UI can select it if needed.
std::string add_scene(
    Project& project,
    IdGenerator& ids,
    std::optional<std::string> name = std::nullopt);
bool rename_scene(Project& project, std::string_view scene_id, std::string name);
bool delete_scene(Project& project, std::string_view scene_id);

enum class AddBackgroundNodeStatus {
  added,
  scene_not_found,
  placement_conflict,
  anchor_not_found,
};

struct AddBackgroundNodeResult {
  AddBackgroundNodeStatus status;
  std::optional<std::string> node_id;
};

// A new BackgroundNode always starts as the explicit "no background" command.
// Assigning an imported image is a separate update operation.
AddBackgroundNodeResult add_background_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    std::string_view scene_id,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);

enum class UpdateBackgroundNodeResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  asset_not_found,
  asset_not_image,
};

UpdateBackgroundNodeResult update_background_node(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<std::string> asset_id);
bool delete_background_node(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id);

enum class AddCharacterNodeStatus {
  added,
  scene_not_found,
  placement_conflict,
  anchor_not_found,
};

struct AddCharacterNodeResult {
  AddCharacterNodeStatus status;
  std::optional<std::string> node_id;
};

AddCharacterNodeResult add_character_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    std::string_view scene_id,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);

enum class UpdateCharacterNodeResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  asset_not_found,
  asset_not_image,
  invalid_slot,
  invalid_layer,
};

UpdateCharacterNodeResult update_character_node(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<std::string> asset_id,
    CharacterSlot slot,
    int layer);

// Generic timeline ordering supports mixed Dialogue/BackgroundNode sequences.
// A null before ID means the end of the Scene.
bool reorder_scene_node(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<std::string> before_node_id);
bool delete_scene_nodes(
    Project& project,
    std::string_view scene_id,
    const std::vector<std::string>& node_ids);
bool reorder_scene_nodes(
    Project& project,
    std::string_view scene_id,
    const std::vector<std::string>& node_ids,
    std::optional<std::string> before_node_id);

// Empty speaker/text values are intentionally valid: clicking the dialogue "+"
// creates an editable empty node immediately.
std::optional<std::string> add_dialogue(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    std::string speaker = {},
    std::string text = {},
    std::optional<std::string> after_dialogue_id = std::nullopt,
    std::optional<std::string> before_dialogue_id = std::nullopt);
bool update_dialogue(
    Project& project,
    std::string_view scene_id,
    std::string_view dialogue_id,
    std::string speaker,
    std::string text);
bool delete_dialogue(
    Project& project,
    std::string_view scene_id,
    std::string_view dialogue_id);
// Deletes all requested dialogues atomically. Validation happens before the
// vector is changed, so one missing or duplicate ID leaves the scene intact.
bool delete_dialogues(
    Project& project,
    std::string_view scene_id,
    const std::vector<std::string>& dialogue_ids);
bool move_dialogue(
    Project& project,
    std::string_view scene_id,
    std::string_view dialogue_id,
    int direction);
// Moves one dialogue before another dialogue. A missing before ID means the
// end of the scene. Unlike move_dialogue, this supports an arbitrary drop.
bool reorder_dialogue(
    Project& project,
    std::string_view scene_id,
    std::string_view dialogue_id,
    std::optional<std::string> before_dialogue_id);
// Moves a selection as one atomic bundle. The payload is treated as a set:
// selected dialogues keep their current Scene order even if IDs arrive in a
// different order. A missing before ID means the end of the scene.
bool reorder_dialogues(
    Project& project,
    std::string_view scene_id,
    const std::vector<std::string>& dialogue_ids,
    std::optional<std::string> before_dialogue_id);

// Returns a human-readable invariant violation, or nullopt when valid.
std::optional<std::string> validate_project(const Project& project);

// Asset paths are portable project-relative paths. This helper is public so
// persistence/import adapters can apply the same Core rule instead of growing
// a second, subtly different path validator.
std::optional<std::string> validate_asset_relative_path(
    AssetType type,
    std::string_view relative_path);

// Validates Project entities, Asset metadata, and every visual Asset reference
// as one consistency boundary. Missing binary files are intentionally outside
// this pure model check and can be reported as recoverable diagnostics by I/O.
std::optional<std::string> validate_project_aggregate(
    const ProjectAggregate& aggregate);

}  // namespace vnengine
