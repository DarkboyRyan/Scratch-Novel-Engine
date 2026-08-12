#pragma once

#include <optional>
#include <string>
#include <vector>

namespace vnengine {

inline constexpr int kSchemaVersion = 1;

struct Dialogue {
  std::string id;
  std::string speaker;
  std::string text;

  bool operator==(const Dialogue&) const = default;
};

struct DialogueContent {
  std::string speaker;
  std::string text;

  bool operator==(const DialogueContent&) const = default;
};

// Character slots are authoring presets rather than z-order. Multiple
// characters may intentionally share a slot; their order in SceneVisualState
// decides which one is drawn in front.
enum class CharacterSlot {
  left,
  center,
  right,
};

// An Asset describes one reusable file. A CharacterVisualInstance describes
// one use of that file in a Scene, so the same sprite can appear more than once
// without duplicating asset metadata.
struct CharacterVisualInstance {
  std::string id;
  std::string asset_id;
  CharacterSlot slot = CharacterSlot::center;

  bool operator==(const CharacterVisualInstance&) const = default;
};

struct SceneVisualState {
  std::optional<std::string> background_asset_id;
  // Stable authoritative z-order: first is furthest back, last is foremost.
  std::vector<CharacterVisualInstance> characters;

  bool operator==(const SceneVisualState&) const = default;
};

struct Scene {
  int schema_version = kSchemaVersion;
  std::string id;
  std::string name;
  SceneVisualState visuals;
  std::vector<Dialogue> nodes;

  bool operator==(const Scene&) const = default;
};

struct Project {
  int schema_version = kSchemaVersion;
  std::string id;
  std::string name;
  std::string entry_scene_id;
  std::vector<Scene> scenes;

  bool operator==(const Project&) const = default;
};

// Assets live beside the Project in the on-disk file envelope. Keeping their
// metadata separate means the editor can add images, video, and audio later
// without embedding large binary files into project.vn.json.
enum class AssetType {
  image,
  video,
  audio,
};

struct Asset {
  std::string id;
  AssetType type;
  std::string relative_path;
  std::string display_name;

  bool operator==(const Asset&) const = default;
};

// Project and Asset metadata form one consistency boundary: Scene visuals
// reference Assets by stable ID, so they must be validated and committed as a
// single aggregate even though the on-disk envelope stores them side by side.
struct ProjectAggregate {
  Project project;
  std::vector<Asset> assets;

  bool operator==(const ProjectAggregate&) const = default;
};

}  // namespace vnengine
