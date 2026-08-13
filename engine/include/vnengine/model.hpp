#pragma once

#include <optional>
#include <string>
#include <variant>
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

enum class CharacterSlot {
  left,
  center,
  right,
};

// A BackgroundNode is a timeline command rather than Asset metadata. When
// playback reaches it, the optional referenced image becomes the active
// background and remains active until the next BackgroundNode. nullopt is an
// explicit "no background" command. SceneVisualState provides the initial
// background before the first such command.
struct BackgroundNode {
  std::string id;
  std::optional<std::string> asset_id;

  bool operator==(const BackgroundNode&) const = default;
};

// A CharacterNode changes one persistent portrait layer on the timeline.
// nullopt clears that layer; otherwise the referenced image remains visible
// until another CharacterNode targets the same layer.
struct CharacterNode {
  std::string id;
  std::optional<std::string> asset_id;
  CharacterSlot slot = CharacterSlot::center;
  int layer = 1;

  bool operator==(const CharacterNode&) const = default;
};

// A SceneJumpNode is the only way playback leaves the current Scene. Reaching
// the end of a Scene without one stops playback instead of implicitly using
// Project.scenes order.
struct SceneJumpNode {
  std::string id;
  std::string target_scene_id;

  bool operator==(const SceneJumpNode&) const = default;
};

using SceneNode =
    std::variant<Dialogue, BackgroundNode, CharacterNode, SceneJumpNode>;

// Character slots are authoring presets rather than z-order. Multiple
// characters may intentionally share a slot; their order in SceneVisualState
// decides which one is drawn in front.

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
  // One authoritative playback order shared by dialogue and visual commands.
  std::vector<SceneNode> nodes;

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
