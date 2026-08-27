// 文件职责：声明对权威项目模型的查询、校验和原子编辑接口。
// 关键实现：IdGenerator、项目/场景命令、时间线节点、控制范围和聚合校验函数。
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
SceneJumpNode* find_scene_jump_node(Scene& scene, std::string_view node_id);
const SceneJumpNode* find_scene_jump_node(
    const Scene& scene,
    std::string_view node_id);
BgmNode* find_bgm_node(Scene& scene, std::string_view node_id);
const BgmNode* find_bgm_node(
    const Scene& scene,
    std::string_view node_id);
VideoNode* find_video_node(Scene& scene, std::string_view node_id);
const VideoNode* find_video_node(
    const Scene& scene,
    std::string_view node_id);
ChoiceNode* find_choice_node(Scene& scene, std::string_view node_id);
const ChoiceNode* find_choice_node(
    const Scene& scene,
    std::string_view node_id);
ChoiceOption* find_choice_option(
    ChoiceNode& choice,
    std::string_view option_id);
const ChoiceOption* find_choice_option(
    const ChoiceNode& choice,
    std::string_view option_id);
Asset* find_asset(
    ProjectAggregate& aggregate,
    std::string_view asset_id);
const Asset* find_asset(
    const ProjectAggregate& aggregate,
    std::string_view asset_id);

// The title and both title-screen media references form one authoring command.
// The model validates the complete requested state before committing any
// value, so an invalid field can never produce a partially updated screen.
enum class UpdateStartScreenResult {
  changed,
  unchanged,
  title_required,
  eyebrow_invalid,
  background_asset_not_found,
  background_asset_not_image,
  music_asset_not_found,
  music_asset_not_audio,
};

UpdateStartScreenResult update_start_screen(
    ProjectAggregate& aggregate,
    std::string title,
    std::string eyebrow,
    std::optional<std::string> background_asset_id,
    std::optional<std::string> music_asset_id);

enum class UpdateCgGalleryResult {
  changed,
  unchanged,
  page_required,
  asset_not_found,
  asset_not_image,
  duplicate_asset_id,
};

// Replaces the complete ordered CG selection as one aggregate mutation. The
// candidate is fully validated before commit, so a bad Asset never partially
// changes the gallery.
UpdateCgGalleryResult update_cg_gallery(
    ProjectAggregate& aggregate,
    std::vector<CgGalleryPage> pages);

// Title-screen names follow the same whitespace rules as project names but
// remain an independent value after project creation/migration.
std::optional<std::string> normalize_start_screen_title(std::string title);

// Empty eyebrow copy is valid (and hides the line), while non-empty copy uses
// surrounding ASCII whitespace normalization. Every accepted value is valid
// UTF-8, NUL-free, and bounded by kStartScreenEyebrowMaxBytes.
std::optional<std::string> normalize_start_screen_eyebrow(
    std::string eyebrow);

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
  control_boundary_conflict,
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
  control_boundary_conflict,
  invalid_mode,
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
    std::optional<std::string> before_node_id = std::nullopt,
    CharacterNodeMode mode = CharacterNodeMode::show);

enum class UpdateCharacterNodeResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  asset_not_found,
  asset_not_image,
  invalid_slot,
  invalid_layer,
  invalid_position,
  invalid_mode,
};

UpdateCharacterNodeResult update_character_node(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<std::string> asset_id,
    CharacterSlot slot,
    int layer,
    std::optional<CharacterPosition> position = std::nullopt,
    std::optional<CharacterNodeMode> mode = std::nullopt);

enum class UpdateCharacterEffectResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  character_cleared,
  invalid_effect,
};

UpdateCharacterEffectResult update_character_effect(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<CharacterEffect> effect);

enum class MoveCharacterEffectResult {
  changed,
  scene_not_found,
  source_node_not_found,
  target_node_not_found,
  same_node,
  source_effect_missing,
  source_effect_mismatch,
  target_character_cleared,
  invalid_effect,
};

MoveCharacterEffectResult move_character_effect(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view from_node_id,
    std::string_view to_node_id,
    CharacterEffect effect);

enum class AddBgmNodeStatus {
  added,
  scene_not_found,
  placement_conflict,
  anchor_not_found,
  control_boundary_conflict,
};

struct AddBgmNodeResult {
  AddBgmNodeStatus status;
  std::optional<std::string> node_id;
};

// A new BGM node is an explicit stop command. Assigning an imported audio
// Asset is a separate update operation.
AddBgmNodeResult add_bgm_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    std::string_view scene_id,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);

enum class UpdateBgmNodeResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  asset_not_found,
  asset_not_audio,
};

UpdateBgmNodeResult update_bgm_node(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<std::string> asset_id);

enum class AddVideoNodeStatus {
  added,
  scene_not_found,
  placement_conflict,
  anchor_not_found,
  control_boundary_conflict,
};

struct AddVideoNodeResult {
  AddVideoNodeStatus status;
  std::optional<std::string> node_id;
};

// A new Video node starts empty so Blockly can insert a placeholder before a
// video Asset is assigned through video.update.
AddVideoNodeResult add_video_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    std::string_view scene_id,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);

enum class UpdateVideoNodeResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  asset_not_found,
  asset_not_video,
};

UpdateVideoNodeResult update_video_node(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<std::string> asset_id);

enum class AddChoiceNodeStatus {
  added,
  scene_not_found,
  placement_conflict,
  anchor_not_found,
  control_boundary_conflict,
};

struct AddChoiceNodeResult {
  AddChoiceNodeStatus status;
  std::optional<std::string> node_id;
};

// A new Choice node is intentionally empty. Options are independent child
// entities created with add_choice_option.
AddChoiceNodeResult add_choice_node(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);

enum class AddChoiceOptionStatus {
  added,
  scene_not_found,
  node_not_found,
  text_required,
  target_scene_not_found,
  before_option_not_found,
  id_generation_failed,
};

struct AddChoiceOptionResult {
  AddChoiceOptionStatus status;
  std::optional<std::string> option_id;
};

AddChoiceOptionResult add_choice_option(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    std::string_view node_id,
    std::string text,
    std::string target_scene_id,
    std::optional<std::string> before_option_id = std::nullopt);

enum class UpdateChoiceOptionResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  option_not_found,
  text_required,
  target_scene_not_found,
};

UpdateChoiceOptionResult update_choice_option(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::string_view option_id,
    std::string text,
    std::string target_scene_id);

enum class DeleteChoiceOptionResult {
  changed,
  scene_not_found,
  node_not_found,
  option_not_found,
};

DeleteChoiceOptionResult delete_choice_option(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::string_view option_id);

enum class ReorderChoiceOptionResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  option_not_found,
  before_option_not_found,
  self_anchor,
};

ReorderChoiceOptionResult reorder_choice_option(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::string_view option_id,
    std::optional<std::string> before_option_id);

enum class AddSceneJumpNodeStatus {
  added,
  scene_not_found,
  target_scene_not_found,
  self_target,
  placement_conflict,
  anchor_not_found,
  control_boundary_conflict,
};

struct AddSceneJumpNodeResult {
  AddSceneJumpNodeStatus status;
  std::optional<std::string> node_id;
};

AddSceneJumpNodeResult add_scene_jump_node(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    std::string target_scene_id,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);

enum class UpdateSceneJumpNodeResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  target_scene_not_found,
  self_target,
};

UpdateSceneJumpNodeResult update_scene_jump_node(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::string target_scene_id);

enum class AddStoryExtensionNodeStatus {
  added,
  scene_not_found,
  placement_conflict,
  anchor_not_found,
  logic_boundary_conflict,
};

struct AddStoryExtensionNodeResult {
  AddStoryExtensionNodeStatus status;
  std::optional<std::string> node_id;
};

// Story extensions are authoring-only timeline markers. Their visual number
// is derived from Scene order by the Editor and is intentionally not stored.
AddStoryExtensionNodeResult add_story_extension_node(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);

inline constexpr std::size_t kMaximumLogicVariableNameBytes = 64;
inline constexpr std::size_t kMaximumLogicStringBytes = 4096;
inline constexpr std::size_t kMaximumLogicVariableCount = 32;
inline constexpr int kMaximumLogicNestingDepth = 16;
inline constexpr int kMaximumLogicRepeatCount = 1000;
inline constexpr int kMaximumCgLeadInMs = 60000;

// Control validation is shared by persistence, authoring commands, and the
// structural timeline guard. The legacy function name is retained for API
// compatibility; it validates both logic controls and paired CG displays.
std::optional<std::string> validate_logic_value(const LogicValue& value);
std::optional<std::string> validate_logic_operand(const LogicOperand& operand);
std::optional<std::string> validate_logic_condition(
    const LogicCondition& condition);
std::optional<std::string> validate_scene_logic_structure(const Scene& scene);

enum class AddLogicNodeStatus {
  added,
  scene_not_found,
  placement_conflict,
  anchor_not_found,
  invalid_logic,
  variable_limit,
};

struct AddLogicNodeResult {
  AddLogicNodeStatus status;
  std::optional<std::string> node_id;
};

enum class UpdateLogicNodeResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  invalid_logic,
  variable_limit,
};

AddLogicNodeResult add_variable_set_node(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    std::string variable_name,
    LogicValue value,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);
UpdateLogicNodeResult update_variable_set_node(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::string variable_name,
    LogicValue value);

AddLogicNodeResult add_variable_change_node(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    std::string variable_name,
    double amount,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);
UpdateLogicNodeResult update_variable_change_node(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::string variable_name,
    double amount);

// Adding a control root atomically creates every paired marker. An if always
// has an else branch, even while both branches are empty.
AddLogicNodeResult add_logic_if_node(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    LogicCondition condition,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);
UpdateLogicNodeResult update_logic_if_node(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    LogicCondition condition);

AddLogicNodeResult add_logic_repeat_node(
    Project& project,
    IdGenerator& ids,
    std::string_view scene_id,
    int count,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);
UpdateLogicNodeResult update_logic_repeat_node(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    int count);

enum class LogicControlMutationResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  not_control_root,
  anchor_not_found,
  anchor_inside_control,
};

// Deletion follows Blockly's C-block semantics: the root, paired markers,
// and every nested body node are removed as one transaction.
LogicControlMutationResult delete_logic_control(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id);
LogicControlMutationResult reorder_logic_control(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<std::string> before_node_id);

bool is_logic_control_marker(const SceneNode& node);
bool is_cg_display_control_marker(const SceneNode& node);

enum class AddCgDisplayStatus {
  added,
  scene_not_found,
  placement_conflict,
  anchor_not_found,
  asset_not_found,
  asset_not_image,
  invalid_lead_in,
  boundary_conflict,
};

struct AddCgDisplayResult {
  AddCgDisplayStatus status;
  std::optional<std::string> node_id;
};

enum class UpdateCgDisplayResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  asset_not_found,
  asset_not_image,
  invalid_lead_in,
};

AddCgDisplayResult add_cg_display_node(
    ProjectAggregate& aggregate,
    IdGenerator& ids,
    std::string_view scene_id,
    std::string asset_id,
    int lead_in_ms,
    std::optional<std::string> after_node_id = std::nullopt,
    std::optional<std::string> before_node_id = std::nullopt);
UpdateCgDisplayResult update_cg_display_node(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view node_id,
    std::string asset_id,
    int lead_in_ms);

enum class CgDisplayMutationResult {
  changed,
  unchanged,
  scene_not_found,
  node_not_found,
  not_display_root,
  anchor_not_found,
  anchor_inside_display,
  boundary_conflict,
};

// Delete/reorder always treats a CG display root, every body dialogue, and
// its paired end marker as one atomic C-shaped block.
CgDisplayMutationResult delete_cg_display(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id);
CgDisplayMutationResult reorder_cg_display(
    Project& project,
    std::string_view scene_id,
    std::string_view node_id,
    std::optional<std::string> before_node_id);

// A generic multi-node move may carry logic or CG controls only when selecting
// any of that control's own root/branch/end markers also selects its complete
// range.
// Semantic body leaves remain independently movable. This is used by
// StoryExtension page moves, which send the entire page through
// timeline.reorderMany.
bool scene_node_selection_respects_logic_boundaries(
    const Scene& scene,
    const std::vector<std::string>& node_ids);

// Generic timeline ordering supports semantic leaf nodes and complete,
// balanced control ranges. Individual or partial control selections must use
// the atomic logic-control commands so they can never become orphaned.
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

enum class SetDialogueVoiceResult {
  changed,
  unchanged,
  scene_not_found,
  dialogue_not_found,
  asset_not_found,
  asset_not_audio,
};

SetDialogueVoiceResult set_dialogue_voice(
    ProjectAggregate& aggregate,
    std::string_view scene_id,
    std::string_view dialogue_id,
    std::optional<std::string> asset_id);
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
