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

Scene* find_scene(Project& project, std::string_view scene_id);
const Scene* find_scene(const Project& project, std::string_view scene_id);
Dialogue* find_dialogue(Scene& scene, std::string_view dialogue_id);
const Dialogue* find_dialogue(
    const Scene& scene,
    std::string_view dialogue_id);

std::string next_scene_name(const Project& project);

// A committed dialogue must contain text. Whitespace is trimmed and an empty
// speaker becomes “旁白”. Empty placeholder nodes created by the "+" command
// bypass this function while the user is still editing their draft fields.
std::optional<DialogueContent> normalize_dialogue_content(
    std::string speaker,
    std::string text);

// Scene names are generated as 场景 1, 场景 2, ... when name is omitted.
// The created entity's ID is returned so the UI can select it if needed.
std::string add_scene(
    Project& project,
    IdGenerator& ids,
    std::optional<std::string> name = std::nullopt);
bool rename_scene(Project& project, std::string_view scene_id, std::string name);
bool delete_scene(Project& project, std::string_view scene_id);

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

}  // namespace vnengine
