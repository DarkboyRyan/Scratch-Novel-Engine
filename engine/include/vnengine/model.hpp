// 文件职责：定义 VN Engine 的权威项目、资源、场景与时间线数据模型。
// 关键实现：Project/Scene/SceneNode、逻辑控制、CG 展示及 CharacterEffect 判别结构。
#pragma once

#include <array>
#include <cstddef>
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
  // A voice clip belongs to this one dialogue and is played once when the
  // dialogue becomes active. nullopt means the dialogue has no voice clip.
  std::optional<std::string> voice_asset_id;

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

// Authoring needs to distinguish an unresolved portrait block from an
// explicit runtime clear command. A show node may temporarily have no Asset
// while the user is still editing it; a clear node always has no Asset.
enum class CharacterNodeMode {
  show,
  clear,
};

// Optional author-controlled portrait anchor in visual-stage percentages.
// (0, 0) is the top-left corner and (100, 100) is the bottom-right corner.
struct CharacterPosition {
  double x = 50.0;
  double y = 100.0;

  bool operator==(const CharacterPosition&) const = default;
};

enum class CharacterEffectType {
  shake,
  jump,
  breathe,
  flash,
  fade_in,
  fade_out,
  slide_in,
};

enum class CharacterEffectIntensity {
  subtle,
  normal,
  strong,
};

enum class CharacterEffectDirection {
  left,
  right,
  up,
  down,
};

// Portrait effects are attached to one CharacterNode rather than inserted as
// timeline nodes. The optional fields form a strict tagged union: shake,
// jump, breathe and flash require intensity; fadeIn/fadeOut require neither;
// slideIn requires both intensity and direction.
struct CharacterEffect {
  CharacterEffectType type;
  int duration_ms;
  std::optional<CharacterEffectIntensity> intensity;
  std::optional<CharacterEffectDirection> direction;

  bool operator==(const CharacterEffect&) const = default;
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
// show + nullopt is an authoring placeholder, show + an image displays it,
// and clear + nullopt explicitly clears the targeted layer.
struct CharacterNode {
  std::string id;
  std::optional<std::string> asset_id;
  CharacterNodeMode mode = CharacterNodeMode::show;
  CharacterSlot slot = CharacterSlot::center;
  int layer = 1;
  std::optional<CharacterPosition> position;
  std::optional<CharacterEffect> effect;

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

// A BgmNode changes the persistent background-music state. A referenced
// audio Asset starts/replaces looping music; nullopt explicitly stops it.
// Music may continue across Scene jumps until another BgmNode is reached.
struct BgmNode {
  std::string id;
  std::optional<std::string> asset_id;

  bool operator==(const BgmNode&) const = default;
};

// A VideoNode pauses normal timeline advancement while its referenced video
// is played. nullopt is an authoring placeholder: a newly inserted graphical
// block may exist before the user drops a video Asset into it.
struct VideoNode {
  std::string id;
  std::optional<std::string> asset_id;

  bool operator==(const VideoNode&) const = default;
};

// A CG display is a paired authoring/runtime control. The selected image is
// shown immediately, then playback waits lead_in_ms before exposing the first
// dialogue in its body. The image remains active until the matching end
// marker. Only Dialogue nodes may appear between the pair.
struct CgDisplayNode {
  std::string id;
  std::string asset_id;
  int lead_in_ms = 0;

  bool operator==(const CgDisplayNode&) const = default;
};

struct CgEndDisplayNode {
  std::string id;
  std::string cg_display_node_id;

  bool operator==(const CgEndDisplayNode&) const = default;
};

// One ChoiceNode is a blocking branch point in the playback timeline. An
// empty options vector is a valid authoring placeholder and is skipped by the
// preview. Each option owns a stable ID so it can be edited and reordered
// without coupling persistence to its current array position.
struct ChoiceOption {
  std::string id;
  std::string text;
  std::string target_scene_id;

  bool operator==(const ChoiceOption&) const = default;
};

struct ChoiceNode {
  std::string id;
  std::vector<ChoiceOption> options;

  bool operator==(const ChoiceNode&) const = default;
};

// A StoryExtensionNode is an authoring-only pagination marker. It has no
// playback behavior and is removed when an author project is compiled into a
// runtime bundle. Its stable ID lets the Editor use the same transactional
// timeline ordering and deletion commands as every other Blockly item.
struct StoryExtensionNode {
  std::string id;

  bool operator==(const StoryExtensionNode&) const = default;
};

// Logic authoring is deliberately data-only. Values and conditions are a
// closed, validated AST; arbitrary source text is never persisted or
// evaluated by either the Editor or Player.
using LogicValue = std::variant<bool, double, std::string>;

struct LogicVariableOperand {
  std::string name;

  bool operator==(const LogicVariableOperand&) const = default;
};

struct LogicLiteralOperand {
  LogicValue value;

  bool operator==(const LogicLiteralOperand&) const = default;
};

using LogicOperand = std::variant<LogicVariableOperand, LogicLiteralOperand>;

enum class LogicComparisonOperator {
  equal,
  not_equal,
  greater,
  greater_or_equal,
  less,
  less_or_equal,
};

struct LogicCondition {
  LogicOperand left;
  LogicComparisonOperator comparison = LogicComparisonOperator::equal;
  LogicOperand right;

  bool operator==(const LogicCondition&) const = default;
};

struct VariableSetNode {
  std::string id;
  std::string variable_name;
  LogicValue value;

  bool operator==(const VariableSetNode&) const = default;
};

struct VariableChangeNode {
  std::string id;
  std::string variable_name;
  double amount = 0.0;

  bool operator==(const VariableChangeNode&) const = default;
};

// Control flow is stored as a flat, paired marker stream. This preserves the
// existing authoritative Scene timeline while allowing Blockly to project
// the stream as C-shaped nested blocks. Pair IDs prevent markers from being
// silently re-associated after a malformed reorder.
struct LogicIfNode {
  std::string id;
  LogicCondition condition;

  bool operator==(const LogicIfNode&) const = default;
};

struct LogicElseNode {
  std::string id;
  std::string if_node_id;

  bool operator==(const LogicElseNode&) const = default;
};

struct LogicEndIfNode {
  std::string id;
  std::string if_node_id;

  bool operator==(const LogicEndIfNode&) const = default;
};

struct LogicRepeatNode {
  std::string id;
  int count = 1;

  bool operator==(const LogicRepeatNode&) const = default;
};

struct LogicEndRepeatNode {
  std::string id;
  std::string repeat_node_id;

  bool operator==(const LogicEndRepeatNode&) const = default;
};

using SceneNode =
    std::variant<
        Dialogue,
        BackgroundNode,
        CharacterNode,
        SceneJumpNode,
        BgmNode,
        VideoNode,
        CgDisplayNode,
        CgEndDisplayNode,
        ChoiceNode,
        StoryExtensionNode,
        VariableSetNode,
        VariableChangeNode,
        LogicIfNode,
        LogicElseNode,
        LogicEndIfNode,
        LogicRepeatNode,
        LogicEndRepeatNode>;

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

// The title screen is an engine-provided scene that precedes the authored
// entry Scene. Authors configure its title and media; the built-in menu
// controls remain Player-owned and are not persisted as editable project
// entities.
struct StartScreen {
  std::string title = "未命名项目";
  std::optional<std::string> background_asset_id;
  std::optional<std::string> music_asset_id;

  bool operator==(const StartScreen&) const = default;
};

inline constexpr std::size_t kCgGalleryPageSize = 9;

// A CG page has nine stable, nullable positions. Empty positions are kept
// rather than compacted so authors can deliberately leave gaps in a page.
struct CgGalleryPage {
  std::array<std::optional<std::string>, kCgGalleryPageSize> image_asset_ids{};

  bool operator==(const CgGalleryPage&) const = default;
};

// The CG gallery is an author-controlled list of pages. It always contains at
// least one page, including for a new project, so the Editor can immediately
// render nine explicit "none" choices without inventing transient state.
struct CgGallery {
  std::vector<CgGalleryPage> pages{CgGalleryPage{}};

  bool operator==(const CgGallery&) const = default;
};

struct Project {
  int schema_version = kSchemaVersion;
  std::string id;
  std::string name;
  StartScreen start_screen;
  CgGallery cg_gallery;
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
