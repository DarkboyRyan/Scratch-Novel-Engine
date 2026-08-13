#include <functional>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "vnengine/project.hpp"

namespace {

class SequenceIdGenerator final : public vnengine::IdGenerator {
 public:
  std::string next() override {
    return "id-" + std::to_string(next_number_++);
  }

 private:
  int next_number_ = 1;
};

void check(const bool condition, const std::string& expression) {
  if (!condition) {
    throw std::runtime_error("check failed: " + expression);
  }
}

#define CHECK(expression) check((expression), #expression)

const vnengine::Dialogue& dialogue_at(
    const vnengine::Scene& scene,
    const std::size_t index) {
  return std::get<vnengine::Dialogue>(scene.nodes.at(index));
}

const vnengine::BackgroundNode& background_at(
    const vnengine::Scene& scene,
    const std::size_t index) {
  return std::get<vnengine::BackgroundNode>(scene.nodes.at(index));
}

const vnengine::CharacterNode& character_at(
    const vnengine::Scene& scene,
    const std::size_t index) {
  return std::get<vnengine::CharacterNode>(scene.nodes.at(index));
}

std::vector<std::string> timeline_ids(const vnengine::Scene& scene) {
  std::vector<std::string> result;
  result.reserve(scene.nodes.size());
  for (const vnengine::SceneNode& node : scene.nodes) {
    result.emplace_back(vnengine::scene_node_id(node));
  }
  return result;
}

void creates_project_with_one_empty_entry_scene() {
  SequenceIdGenerator ids;
  const vnengine::Project project = vnengine::create_empty_project(ids);

  CHECK(project.schema_version == 1);
  CHECK(project.name == "未命名项目");
  CHECK(project.scenes.size() == 1);
  CHECK(project.scenes[0].name == "场景 1");
  CHECK(!project.scenes[0].visuals.background_asset_id.has_value());
  CHECK(project.scenes[0].visuals.characters.empty());
  CHECK(project.scenes[0].nodes.empty());
  CHECK(project.entry_scene_id == project.scenes[0].id);
  CHECK(project.id != project.scenes[0].id);
  CHECK(!vnengine::validate_project(project).has_value());
}

void creates_an_empty_project_aggregate() {
  SequenceIdGenerator ids;
  const vnengine::ProjectAggregate aggregate =
      vnengine::create_empty_project_aggregate(ids, "视觉小说");

  CHECK(aggregate.project.name == "视觉小说");
  CHECK(aggregate.assets.empty());
  CHECK(aggregate.project.scenes.size() == 1);
  CHECK(aggregate.project.scenes[0].visuals.characters.empty());
  CHECK(!vnengine::validate_project_aggregate(aggregate).has_value());
}

void normalizes_and_renames_a_project() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids, "旧名字");

  CHECK(vnengine::normalize_project_name("  新名字\t") == "新名字");
  CHECK(!vnengine::normalize_project_name(" \n\t ").has_value());
  CHECK(vnengine::rename_project(project, "新名字"));
  CHECK(project.name == "新名字");
  CHECK(!vnengine::rename_project(project, "新名字"));
}

void adds_and_renames_scenes_without_changing_entry() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);
  const std::string original_entry = project.entry_scene_id;

  const std::string second_id = vnengine::add_scene(project, ids);
  CHECK(project.scenes.size() == 2);
  CHECK(project.scenes[1].id == second_id);
  CHECK(project.scenes[1].name == "场景 2");
  CHECK(project.entry_scene_id == original_entry);

  CHECK(vnengine::rename_scene(project, second_id, "序章"));
  CHECK(project.scenes[1].name == "序章");
  CHECK(!vnengine::rename_scene(project, "missing", "不存在"));

  const std::string generated_id = vnengine::add_scene(project, ids);
  CHECK(vnengine::find_scene(project, generated_id)->name == "场景 2");
  CHECK(!vnengine::validate_project(project).has_value());
}

void preserves_scene_deletion_rules() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);
  const std::string first_id = project.scenes[0].id;
  const std::string second_id = vnengine::add_scene(project, ids);
  const std::string third_id = vnengine::add_scene(project, ids);

  CHECK(vnengine::delete_scene(project, first_id));
  CHECK(project.entry_scene_id == second_id);
  CHECK(project.scenes.size() == 2);

  project.entry_scene_id = third_id;
  CHECK(vnengine::delete_scene(project, third_id));
  CHECK(project.entry_scene_id == second_id);
  CHECK(project.scenes.size() == 1);

  CHECK(!vnengine::delete_scene(project, second_id));
  CHECK(project.scenes.size() == 1);
  CHECK(!vnengine::delete_scene(project, "missing"));
  CHECK(!vnengine::validate_project(project).has_value());
}

void inserts_empty_dialogue_after_selected_node() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);
  const std::string scene_id = project.entry_scene_id;

  const std::string first_id = *vnengine::add_dialogue(
      project, ids, scene_id, "Alice", "第一句话");
  const std::string second_id = *vnengine::add_dialogue(
      project, ids, scene_id, "Bob", "第二句话");
  const std::string empty_id = *vnengine::add_dialogue(
      project, ids, scene_id, "", "", first_id);

  const vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
  CHECK(scene != nullptr);
  CHECK(scene->nodes.size() == 3);
  CHECK(vnengine::scene_node_id(scene->nodes[0]) == first_id);
  CHECK(vnengine::scene_node_id(scene->nodes[1]) == empty_id);
  CHECK(dialogue_at(*scene, 1).speaker.empty());
  CHECK(dialogue_at(*scene, 1).text.empty());
  CHECK(vnengine::scene_node_id(scene->nodes[2]) == second_id);

  const std::string appended_id = *vnengine::add_dialogue(
      project, ids, scene_id, "旁白", "末尾", "missing-node");
  CHECK(vnengine::scene_node_id(scene->nodes.back()) == appended_id);
  CHECK(!vnengine::add_dialogue(project, ids, "missing-scene").has_value());
}

void inserts_dialogue_before_requested_node() {
  SequenceIdGenerator ids;
  vnengine::Project project =
      vnengine::create_empty_project(ids);
  const std::string scene_id =
      project.entry_scene_id;

  const std::string first_id =
      *vnengine::add_dialogue(
          project, ids, scene_id, "A", "第一句");
  const std::string second_id =
      *vnengine::add_dialogue(
          project, ids, scene_id, "B", "第二句");

  const std::string before_first_id =
      *vnengine::add_dialogue(
          project,
          ids,
          scene_id,
          "Start",
          "最前面",
          std::nullopt,
          first_id);

  const std::string before_second_id =
      *vnengine::add_dialogue(
          project,
          ids,
          scene_id,
          "Middle",
          "中间",
          std::nullopt,
          second_id);

  const vnengine::Scene* scene =
      vnengine::find_scene(project, scene_id);

  CHECK(scene != nullptr);
  CHECK(scene->nodes.size() == 4);
  CHECK(vnengine::scene_node_id(scene->nodes[0]) == before_first_id);
  CHECK(vnengine::scene_node_id(scene->nodes[1]) == first_id);
  CHECK(vnengine::scene_node_id(scene->nodes[2]) == before_second_id);
  CHECK(vnengine::scene_node_id(scene->nodes[3]) == second_id);

  const auto node_count = scene->nodes.size();

  // 不存在的 before 目标必须被拒绝。
  CHECK(!vnengine::add_dialogue(
             project,
             ids,
             scene_id,
             "",
             "",
             std::nullopt,
             "missing-node")
             .has_value());
  CHECK(scene->nodes.size() == node_count);

  // 同时提供 after 和 before 也必须被拒绝。
  CHECK(!vnengine::add_dialogue(
             project,
             ids,
             scene_id,
             "",
             "",
             first_id,
             second_id)
             .has_value());
  CHECK(scene->nodes.size() == node_count);

  // 两次失败操作都不应消耗 ID；下一个成功节点仍然是 id-7。
  const std::string appended_id = *vnengine::add_dialogue(
      project, ids, scene_id, "End", "最后一句");
  CHECK(appended_id == "id-7");
  CHECK(scene->nodes.size() == node_count + 1);
  CHECK(vnengine::scene_node_id(scene->nodes.back()) == appended_id);
}

void updates_deletes_and_moves_dialogue() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);
  const std::string scene_id = project.entry_scene_id;
  const std::string first_id = *vnengine::add_dialogue(
      project, ids, scene_id, "A", "1");
  const std::string second_id = *vnengine::add_dialogue(
      project, ids, scene_id, "B", "2");
  const std::string third_id = *vnengine::add_dialogue(
      project, ids, scene_id, "C", "3");

  CHECK(vnengine::update_dialogue(
      project, scene_id, second_id, "Bob", "更新后的第二句"));
  CHECK(vnengine::find_dialogue(
            *vnengine::find_scene(project, scene_id), second_id)
            ->speaker == "Bob");
  CHECK(!vnengine::update_dialogue(
      project, scene_id, "missing", "Nobody", "Missing"));

  CHECK(vnengine::move_dialogue(project, scene_id, second_id, -1));
  const vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
  CHECK(vnengine::scene_node_id(scene->nodes[0]) == second_id);
  CHECK(vnengine::scene_node_id(scene->nodes[1]) == first_id);
  CHECK(!vnengine::move_dialogue(project, scene_id, second_id, -1));
  CHECK(!vnengine::move_dialogue(project, scene_id, second_id, 2));

  CHECK(vnengine::delete_dialogue(project, scene_id, first_id));
  CHECK(scene->nodes.size() == 2);
  CHECK(vnengine::scene_node_id(scene->nodes[0]) == second_id);
  CHECK(vnengine::scene_node_id(scene->nodes[1]) == third_id);
  CHECK(!vnengine::delete_dialogue(project, scene_id, "missing"));
  CHECK(!vnengine::validate_project(project).has_value());
}

void reorders_one_dialogue_to_an_arbitrary_position() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);
  const std::string scene_id = project.entry_scene_id;
  const std::string first_id = *vnengine::add_dialogue(
      project, ids, scene_id, "A", "1");
  const std::string second_id = *vnengine::add_dialogue(
      project, ids, scene_id, "B", "2");
  const std::string third_id = *vnengine::add_dialogue(
      project, ids, scene_id, "C", "3");
  const std::string fourth_id = *vnengine::add_dialogue(
      project, ids, scene_id, "D", "4");

  auto dialogue_ids = [&project, &scene_id]() {
    std::vector<std::string> result;
    const vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
    result = timeline_ids(*scene);
    return result;
  };

  CHECK(vnengine::reorder_dialogue(
      project, scene_id, fourth_id, second_id));
  CHECK(dialogue_ids() ==
        std::vector<std::string>({first_id, fourth_id, second_id, third_id}));

  CHECK(vnengine::reorder_dialogue(
      project, scene_id, first_id, third_id));
  CHECK(dialogue_ids() ==
        std::vector<std::string>({fourth_id, second_id, first_id, third_id}));

  CHECK(vnengine::reorder_dialogue(
      project, scene_id, second_id, std::nullopt));
  CHECK(dialogue_ids() ==
        std::vector<std::string>({fourth_id, first_id, third_id, second_id}));

  CHECK(!vnengine::reorder_dialogue(
      project, scene_id, second_id, std::nullopt));
  CHECK(!vnengine::reorder_dialogue(
      project, scene_id, first_id, first_id));
  CHECK(!vnengine::reorder_dialogue(
      project, scene_id, "missing", first_id));
  CHECK(!vnengine::reorder_dialogue(
      project, scene_id, first_id, "missing"));
  CHECK(!vnengine::reorder_dialogue(
      project, "missing", first_id, std::nullopt));
  CHECK(dialogue_ids() ==
        std::vector<std::string>({fourth_id, first_id, third_id, second_id}));
  CHECK(!vnengine::validate_project(project).has_value());
}

void reorders_multiple_dialogues_atomically() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);
  const std::string scene_id = project.entry_scene_id;
  std::vector<std::string> dialogue_ids;

  for (const std::string& speaker : {"A", "B", "C", "D", "E", "F"}) {
    dialogue_ids.push_back(*vnengine::add_dialogue(
        project, ids, scene_id, speaker, speaker));
  }

  auto current_ids = [&project, &scene_id]() {
    std::vector<std::string> result;
    result = timeline_ids(*vnengine::find_scene(project, scene_id));
    return result;
  };

  const std::string& first = dialogue_ids[0];
  const std::string& second = dialogue_ids[1];
  const std::string& third = dialogue_ids[2];
  const std::string& fourth = dialogue_ids[3];
  const std::string& fifth = dialogue_ids[4];
  const std::string& sixth = dialogue_ids[5];

  // Even a reverse-order payload moves the selection in authoritative order.
  CHECK(vnengine::reorder_dialogues(
      project, scene_id, {fourth, second}, fifth));
  CHECK(current_ids() ==
        std::vector<std::string>({first, third, second, fourth, fifth, sixth}));

  CHECK(vnengine::reorder_dialogues(
      project, scene_id, {second, fourth}, first));
  CHECK(current_ids() ==
        std::vector<std::string>({second, fourth, first, third, fifth, sixth}));

  CHECK(vnengine::reorder_dialogues(
      project, scene_id, {second, fourth}, std::nullopt));
  CHECK(current_ids() ==
        std::vector<std::string>({first, third, fifth, sixth, second, fourth}));

  const std::vector<std::string> unchanged = current_ids();
  CHECK(!vnengine::reorder_dialogues(
      project, scene_id, {}, std::nullopt));
  CHECK(!vnengine::reorder_dialogues(
      project, scene_id, {first, first}, std::nullopt));
  CHECK(!vnengine::reorder_dialogues(
      project, scene_id, {first, "missing"}, std::nullopt));
  CHECK(!vnengine::reorder_dialogues(
      project, scene_id, {first, third}, third));
  CHECK(!vnengine::reorder_dialogues(
      project, scene_id, {first}, "missing"));
  CHECK(!vnengine::reorder_dialogues(
      project, "missing", {first}, std::nullopt));
  CHECK(current_ids() == unchanged);
  CHECK(!vnengine::validate_project(project).has_value());
}

void deletes_multiple_dialogues_atomically() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);
  const std::string scene_id = project.entry_scene_id;
  const std::string first_id = *vnengine::add_dialogue(
      project, ids, scene_id, "A", "1");
  const std::string second_id = *vnengine::add_dialogue(
      project, ids, scene_id, "B", "2");
  const std::string third_id = *vnengine::add_dialogue(
      project, ids, scene_id, "C", "3");

  CHECK(!vnengine::delete_dialogues(
      project, scene_id, {first_id, "missing"}));
  CHECK(vnengine::find_scene(project, scene_id)->nodes.size() == 3);

  CHECK(!vnengine::delete_dialogues(
      project, scene_id, {first_id, first_id}));
  CHECK(vnengine::find_scene(project, scene_id)->nodes.size() == 3);

  CHECK(vnengine::delete_dialogues(
      project, scene_id, {first_id, third_id}));
  const vnengine::Scene* scene = vnengine::find_scene(project, scene_id);
  CHECK(scene->nodes.size() == 1);
  CHECK(vnengine::scene_node_id(scene->nodes[0]) == second_id);
  CHECK(!vnengine::validate_project(project).has_value());
}

void detects_invalid_project_invariants() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);

  const std::string original_scene_id = project.scenes[0].id;
  project.scenes[0].id = project.id;
  project.entry_scene_id = project.id;
  CHECK(vnengine::validate_project(project).has_value());

  project.scenes[0].id = original_scene_id;
  project.entry_scene_id = "missing";
  CHECK(vnengine::validate_project(project).has_value());

  project.entry_scene_id = project.scenes[0].id;
  project.scenes.push_back(project.scenes[0]);
  CHECK(vnengine::validate_project(project).has_value());
}

void validates_portable_asset_paths() {
  CHECK(!vnengine::validate_asset_relative_path(
             vnengine::AssetType::image,
             "assets/images/classroom.png")
             .has_value());
  CHECK(!vnengine::validate_asset_relative_path(
             vnengine::AssetType::video,
             "assets/videos/opening.mp4")
             .has_value());
  CHECK(!vnengine::validate_asset_relative_path(
             vnengine::AssetType::audio,
             "assets/audio/bgm/theme.ogg")
             .has_value());

  CHECK(vnengine::validate_asset_relative_path(
            vnengine::AssetType::image,
            "assets/videos/not-an-image.mp4")
            .has_value());
  CHECK(vnengine::validate_asset_relative_path(
            vnengine::AssetType::image,
            "assets/images/../../outside.png")
            .has_value());
  CHECK(vnengine::validate_asset_relative_path(
            vnengine::AssetType::image,
            "assets/images/folder//sprite.png")
            .has_value());
  CHECK(vnengine::validate_asset_relative_path(
            vnengine::AssetType::image,
            "assets/images/")
            .has_value());
  CHECK(vnengine::validate_asset_relative_path(
            vnengine::AssetType::image,
            "assets\\images\\sprite.png")
            .has_value());
  CHECK(vnengine::validate_asset_relative_path(
            static_cast<vnengine::AssetType>(99),
            "assets/images/sprite.png")
            .has_value());
}

vnengine::ProjectAggregate visual_aggregate() {
  SequenceIdGenerator ids;
  vnengine::ProjectAggregate aggregate =
      vnengine::create_empty_project_aggregate(ids, "立绘项目");
  aggregate.assets = {
      {
          .id = "asset-background",
          .type = vnengine::AssetType::image,
          .relative_path = "assets/images/classroom.png",
          .display_name = "教室背景",
      },
      {
          .id = "asset-alice",
          .type = vnengine::AssetType::image,
          .relative_path = "assets/images/alice.png",
          .display_name = "Alice 立绘",
      },
      {
          .id = "asset-bob",
          .type = vnengine::AssetType::image,
          .relative_path = "assets/images/bob.png",
          .display_name = "Bob 立绘",
      },
      {
          .id = "asset-music",
          .type = vnengine::AssetType::audio,
          .relative_path = "assets/audio/theme.ogg",
          .display_name = "主题曲",
      },
  };

  vnengine::SceneVisualState& visuals =
      aggregate.project.scenes[0].visuals;
  visuals.background_asset_id = "asset-background";
  visuals.characters = {
      {
          .id = "instance-back",
          .asset_id = "asset-alice",
          .slot = vnengine::CharacterSlot::center,
      },
      {
          .id = "instance-front",
          .asset_id = "asset-bob",
          .slot = vnengine::CharacterSlot::center,
      },
  };
  return aggregate;
}

void validates_visual_references_and_stable_z_order() {
  vnengine::ProjectAggregate aggregate = visual_aggregate();
  const vnengine::SceneVisualState& visuals =
      aggregate.project.scenes[0].visuals;

  // Sharing a slot is legal. Vector order is authoritative from back to front
  // and validation must never sort it as a side effect.
  CHECK(visuals.characters[0].id == "instance-back");
  CHECK(visuals.characters[1].id == "instance-front");
  CHECK(!vnengine::validate_project_aggregate(aggregate).has_value());
  CHECK(aggregate.project.scenes[0].visuals.characters[0].id ==
        "instance-back");
  CHECK(aggregate.project.scenes[0].visuals.characters[1].id ==
        "instance-front");

  vnengine::Asset* mutable_asset =
      vnengine::find_asset(aggregate, "asset-alice");
  CHECK(mutable_asset != nullptr);
  CHECK(mutable_asset->display_name == "Alice 立绘");
  const vnengine::ProjectAggregate& const_aggregate = aggregate;
  const vnengine::Asset* const_asset =
      vnengine::find_asset(const_aggregate, "asset-background");
  CHECK(const_asset != nullptr);
  CHECK(const_asset->type == vnengine::AssetType::image);
  CHECK(vnengine::find_asset(aggregate, "missing") == nullptr);
}

void changes_scene_background_only_after_validation() {
  using Result = vnengine::SetSceneBackgroundResult;

  vnengine::ProjectAggregate aggregate = visual_aggregate();
  const std::string scene_id = aggregate.project.entry_scene_id;

  CHECK(vnengine::set_scene_background(
            aggregate, scene_id, "asset-background") ==
        Result::unchanged);
  CHECK(vnengine::set_scene_background(
            aggregate, scene_id, "asset-alice") == Result::changed);
  CHECK(
      aggregate.project.scenes[0].visuals.background_asset_id ==
      "asset-alice");

  const vnengine::ProjectAggregate after_change = aggregate;
  CHECK(vnengine::set_scene_background(
            aggregate, "missing-scene", "asset-background") ==
        Result::scene_not_found);
  CHECK(aggregate == after_change);

  CHECK(vnengine::set_scene_background(
            aggregate, scene_id, "missing-asset") ==
        Result::asset_not_found);
  CHECK(aggregate == after_change);

  CHECK(vnengine::set_scene_background(
            aggregate, scene_id, "asset-music") ==
        Result::asset_not_image);
  CHECK(aggregate == after_change);

  CHECK(vnengine::set_scene_background(
            aggregate, scene_id, std::nullopt) == Result::changed);
  CHECK(!aggregate.project.scenes[0]
             .visuals.background_asset_id.has_value());
  CHECK(vnengine::set_scene_background(
            aggregate, scene_id, std::nullopt) == Result::unchanged);
}

void manages_mixed_background_timeline_atomically() {
  using AddStatus = vnengine::AddBackgroundNodeStatus;
  using UpdateResult = vnengine::UpdateBackgroundNodeResult;

  SequenceIdGenerator ids;
  vnengine::ProjectAggregate aggregate = visual_aggregate();
  // visual_aggregate used its own deterministic generator for id-1/id-2.
  // Advance this independent fixture generator past those occupied IDs.
  static_cast<void>(ids.next());
  static_cast<void>(ids.next());
  const std::string scene_id = aggregate.project.entry_scene_id;
  vnengine::Scene& scene = aggregate.project.scenes[0];

  const std::string first = *vnengine::add_dialogue(
      aggregate.project, ids, scene_id, "Alice", "第一句");
  const std::string second = *vnengine::add_dialogue(
      aggregate.project, ids, scene_id, "Bob", "第二句");

  const auto first_background = vnengine::add_background_node(
      aggregate, ids, scene_id, first);
  CHECK(first_background.status == AddStatus::added);
  CHECK(first_background.node_id.has_value());
  CHECK(timeline_ids(scene) == std::vector<std::string>({
      first, *first_background.node_id, second}));
  CHECK(!background_at(scene, 1).asset_id.has_value());
  CHECK(vnengine::update_background_node(
            aggregate,
            scene_id,
            *first_background.node_id,
            "asset-alice") == UpdateResult::changed);

  // Dialogue placement anchors are timeline nodes, not dialogue-only IDs.
  const std::string between = *vnengine::add_dialogue(
      aggregate.project,
      ids,
      scene_id,
      "旁白",
      "切换后",
      *first_background.node_id);
  CHECK(timeline_ids(scene) == std::vector<std::string>({
      first, *first_background.node_id, between, second}));

  const auto second_background = vnengine::add_background_node(
      aggregate,
      ids,
      scene_id,
      std::nullopt,
      second);
  CHECK(second_background.status == AddStatus::added);
  CHECK(vnengine::update_background_node(
            aggregate,
            scene_id,
            *second_background.node_id,
            "asset-bob") == UpdateResult::changed);
  CHECK(timeline_ids(scene) == std::vector<std::string>({
      first,
      *first_background.node_id,
      between,
      *second_background.node_id,
      second}));

  const std::string before_switch = *vnengine::add_dialogue(
      aggregate.project,
      ids,
      scene_id,
      "旁白",
      "即将切换",
      std::nullopt,
      *second_background.node_id);
  CHECK(timeline_ids(scene) == std::vector<std::string>({
      first,
      *first_background.node_id,
      between,
      before_switch,
      *second_background.node_id,
      second}));

  // Preview semantics are a pure fold: static visuals initialize the value;
  // each BackgroundNode replaces it for all following dialogue nodes.
  std::optional<std::string> active = scene.visuals.background_asset_id;
  std::vector<std::string> dialogue_backgrounds;
  for (const vnengine::SceneNode& node : scene.nodes) {
    if (const auto* background = std::get_if<vnengine::BackgroundNode>(&node)) {
      active = background->asset_id;
    } else {
      dialogue_backgrounds.push_back(active.value_or("none"));
    }
  }
  CHECK(dialogue_backgrounds == std::vector<std::string>({
      "asset-background", "asset-alice", "asset-alice", "asset-bob"}));

  CHECK(vnengine::update_background_node(
            aggregate,
            scene_id,
            *first_background.node_id,
            "asset-bob") == UpdateResult::changed);
  CHECK(vnengine::update_background_node(
            aggregate,
            scene_id,
            *first_background.node_id,
            "asset-bob") == UpdateResult::unchanged);

  const vnengine::ProjectAggregate before_failures = aggregate;
  CHECK(vnengine::update_background_node(
            aggregate,
            scene_id,
            *first_background.node_id,
            "asset-music") == UpdateResult::asset_not_image);
  CHECK(aggregate == before_failures);

  CHECK(vnengine::update_background_node(
            aggregate,
            scene_id,
            *first_background.node_id,
            std::nullopt) == UpdateResult::changed);
  CHECK(!background_at(scene, 1).asset_id.has_value());
  CHECK(vnengine::update_background_node(
            aggregate,
            scene_id,
            *first_background.node_id,
            std::nullopt) == UpdateResult::unchanged);

  // Legacy dialogue operations still participate in the unified timeline:
  // they can move a Dialogue across, or anchor it to, a BackgroundNode.
  const std::vector<vnengine::SceneNode> before_legacy_operations =
      scene.nodes;
  CHECK(vnengine::move_dialogue(
      aggregate.project, scene_id, second, -1));
  CHECK(timeline_ids(scene) == std::vector<std::string>({
      first,
      *first_background.node_id,
      between,
      before_switch,
      second,
      *second_background.node_id}));
  scene.nodes = before_legacy_operations;

  CHECK(vnengine::reorder_dialogue(
      aggregate.project, scene_id, second, *second_background.node_id));
  CHECK(timeline_ids(scene) == std::vector<std::string>({
      first,
      *first_background.node_id,
      between,
      before_switch,
      second,
      *second_background.node_id}));
  scene.nodes = before_legacy_operations;

  CHECK(vnengine::reorder_dialogues(
      aggregate.project,
      scene_id,
      {between, first},
      *second_background.node_id));
  CHECK(timeline_ids(scene) == std::vector<std::string>({
      *first_background.node_id,
      before_switch,
      first,
      between,
      *second_background.node_id,
      second}));
  scene.nodes = before_legacy_operations;

  // Dialogue-only compatibility methods must never interpret a BackgroundNode
  // as a Dialogue, including an otherwise valid-looking batch request.
  CHECK(!vnengine::delete_dialogue(
      aggregate.project, scene_id, *first_background.node_id));
  CHECK(!vnengine::delete_dialogues(
      aggregate.project, scene_id, {first, *first_background.node_id}));
  CHECK(scene.nodes == before_legacy_operations);
  CHECK(!vnengine::move_dialogue(
      aggregate.project, scene_id, *first_background.node_id, 1));
  CHECK(!vnengine::reorder_dialogue(
      aggregate.project, scene_id, *first_background.node_id, std::nullopt));

  // Generic operations support a mixed selection while preserving the
  // authoritative order of selected nodes, independent of payload order.
  CHECK(vnengine::reorder_scene_nodes(
      aggregate.project,
      scene_id,
      {second, *first_background.node_id},
      first));
  CHECK(timeline_ids(scene) == std::vector<std::string>({
      *first_background.node_id,
      second,
      first,
      between,
      before_switch,
      *second_background.node_id}));

  const vnengine::Project before_invalid_reorder = aggregate.project;
  CHECK(!vnengine::reorder_scene_nodes(
      aggregate.project, scene_id, {first, "missing"}, std::nullopt));
  CHECK(aggregate.project == before_invalid_reorder);
  CHECK(vnengine::delete_scene_nodes(
      aggregate.project,
      scene_id,
      {between, *second_background.node_id}));
  CHECK(vnengine::find_dialogue(scene, between) == nullptr);
  CHECK(vnengine::find_background_node(
            scene, *second_background.node_id) == nullptr);
  CHECK(!vnengine::validate_project_aggregate(aggregate).has_value());
}

void rejects_invalid_background_timeline_references() {
  vnengine::ProjectAggregate valid = visual_aggregate();
  valid.project.scenes[0].nodes.push_back(vnengine::BackgroundNode{
      .id = "background-node",
      .asset_id = std::nullopt,
  });
  CHECK(!vnengine::validate_project_aggregate(valid).has_value());

  std::get<vnengine::BackgroundNode>(valid.project.scenes[0].nodes[0])
      .asset_id = "asset-alice";
  CHECK(!vnengine::validate_project_aggregate(valid).has_value());

  vnengine::ProjectAggregate invalid = valid;
  std::get<vnengine::BackgroundNode>(invalid.project.scenes[0].nodes[0])
      .asset_id = "missing";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  std::get<vnengine::BackgroundNode>(invalid.project.scenes[0].nodes[0])
      .asset_id = "asset-music";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  std::get<vnengine::BackgroundNode>(invalid.project.scenes[0].nodes[0])
      .id = invalid.project.id;
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  std::get<vnengine::BackgroundNode>(invalid.project.scenes[0].nodes[0])
      .id.clear();
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());
}

void rejects_invalid_asset_manifests() {
  const vnengine::ProjectAggregate valid = visual_aggregate();

  vnengine::ProjectAggregate invalid = valid;
  invalid.assets[0].id = invalid.project.id;
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.assets[1].id = invalid.assets[0].id;
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  // Legacy fileVersion 1 documents may contain multiple logical Assets that
  // point at one safe file, or an empty/whitespace display name. Keep those
  // documents readable; stricter naming belongs to the future import command.
  invalid = valid;
  invalid.assets[1].relative_path = invalid.assets[0].relative_path;
  invalid.assets[0].display_name.clear();
  invalid.assets[1].display_name = "  旧名称  ";
  CHECK(!vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.assets[0].relative_path = "assets/images/../outside.png";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.assets[0].type = vnengine::AssetType::video;
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());
}

void rejects_invalid_scene_visuals_atomically() {
  const vnengine::ProjectAggregate valid = visual_aggregate();

  vnengine::ProjectAggregate invalid = valid;
  invalid.project.scenes[0].visuals.background_asset_id = "missing";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.project.scenes[0].visuals.background_asset_id = "asset-music";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.project.scenes[0].visuals.background_asset_id = "";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.project.scenes[0].visuals.characters[0].asset_id = "missing";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.project.scenes[0].visuals.characters[0].asset_id = "asset-music";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.project.scenes[0].visuals.characters[0].id.clear();
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.project.scenes[0].visuals.characters[1].id = "instance-back";
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  invalid = valid;
  invalid.project.scenes[0].visuals.characters[0].slot =
      static_cast<vnengine::CharacterSlot>(99);
  CHECK(vnengine::validate_project_aggregate(invalid).has_value());

  // Validation is observational: rejected candidates do not mutate the known
  // good aggregate or its stable back-to-front character ordering.
  CHECK(!vnengine::validate_project_aggregate(valid).has_value());
  CHECK(valid.project.scenes[0].visuals.characters[0].id == "instance-back");
  CHECK(valid.project.scenes[0].visuals.characters[1].id == "instance-front");
}

void normalizes_committed_dialogue_content() {
  const auto normalized = vnengine::normalize_dialogue_content(
      "   ", "  一段旁白  \n");
  CHECK(normalized.has_value());
  CHECK(normalized->speaker == "旁白");
  CHECK(normalized->text == "一段旁白");

  CHECK(!vnengine::normalize_dialogue_content(
             "Alice", "  \n\t")
             .has_value());
}

void manages_character_timeline_nodes_atomically() {
  SequenceIdGenerator ids;
  vnengine::ProjectAggregate aggregate =
      vnengine::create_empty_project_aggregate(ids);
  const std::string scene_id = aggregate.project.entry_scene_id;
  aggregate.assets = {
      {.id = "portrait", .type = vnengine::AssetType::image,
       .relative_path = "assets/images/portrait.png",
       .display_name = "Alice"},
      {.id = "video", .type = vnengine::AssetType::video,
       .relative_path = "assets/videos/clip.mp4", .display_name = "Clip"},
  };

  const auto added = vnengine::add_character_node(
      aggregate, ids, scene_id);
  CHECK(added.status == vnengine::AddCharacterNodeStatus::added);
  CHECK(added.node_id.has_value());
  const vnengine::Scene& scene = aggregate.project.scenes[0];
  const vnengine::CharacterNode& empty = character_at(scene, 0);
  CHECK(!empty.asset_id.has_value());
  CHECK(empty.slot == vnengine::CharacterSlot::center);
  CHECK(empty.layer == 1);

  CHECK(vnengine::update_character_node(
            aggregate,
            scene_id,
            *added.node_id,
            "portrait",
            vnengine::CharacterSlot::left,
            3) == vnengine::UpdateCharacterNodeResult::changed);
  const vnengine::CharacterNode& updated = character_at(scene, 0);
  CHECK(updated.asset_id == "portrait");
  CHECK(updated.slot == vnengine::CharacterSlot::left);
  CHECK(updated.layer == 3);
  CHECK(vnengine::update_character_node(
            aggregate,
            scene_id,
            *added.node_id,
            "portrait",
            vnengine::CharacterSlot::left,
            3) == vnengine::UpdateCharacterNodeResult::unchanged);

  const vnengine::ProjectAggregate before_failures = aggregate;
  CHECK(vnengine::update_character_node(
            aggregate,
            scene_id,
            *added.node_id,
            "missing",
            vnengine::CharacterSlot::right,
            2) == vnengine::UpdateCharacterNodeResult::asset_not_found);
  CHECK(vnengine::update_character_node(
            aggregate,
            scene_id,
            *added.node_id,
            "video",
            vnengine::CharacterSlot::right,
            2) == vnengine::UpdateCharacterNodeResult::asset_not_image);
  CHECK(vnengine::update_character_node(
            aggregate,
            scene_id,
            *added.node_id,
            "portrait",
            vnengine::CharacterSlot::right,
            11) == vnengine::UpdateCharacterNodeResult::invalid_layer);
  CHECK(aggregate == before_failures);

  CHECK(vnengine::update_character_node(
            aggregate,
            scene_id,
            *added.node_id,
            std::nullopt,
            vnengine::CharacterSlot::right,
            3) == vnengine::UpdateCharacterNodeResult::changed);
  CHECK(!character_at(scene, 0).asset_id.has_value());
  CHECK(!vnengine::validate_project_aggregate(aggregate).has_value());
}

}  // namespace

int main() {
  const std::vector<std::pair<std::string, std::function<void()>>> tests{
      {"creates project with one empty entry scene",
       creates_project_with_one_empty_entry_scene},
      {"creates an empty project aggregate",
       creates_an_empty_project_aggregate},
      {"normalizes and renames a project",
       normalizes_and_renames_a_project},
      {"adds and renames scenes without changing entry",
       adds_and_renames_scenes_without_changing_entry},
      {"preserves scene deletion rules", preserves_scene_deletion_rules},
      {"inserts empty dialogue after selected node",
       inserts_empty_dialogue_after_selected_node},
      {"inserts dialogue before requested node",
       inserts_dialogue_before_requested_node},
      {"updates deletes and moves dialogue",
       updates_deletes_and_moves_dialogue},
      {"reorders one dialogue to an arbitrary position",
       reorders_one_dialogue_to_an_arbitrary_position},
      {"reorders multiple dialogues atomically",
       reorders_multiple_dialogues_atomically},
      {"deletes multiple dialogues atomically",
       deletes_multiple_dialogues_atomically},
      {"detects invalid project invariants",
       detects_invalid_project_invariants},
      {"validates portable asset paths", validates_portable_asset_paths},
      {"validates visual references and stable z order",
       validates_visual_references_and_stable_z_order},
      {"changes scene background only after validation",
       changes_scene_background_only_after_validation},
      {"manages mixed background timeline atomically",
       manages_mixed_background_timeline_atomically},
      {"rejects invalid background timeline references",
       rejects_invalid_background_timeline_references},
      {"rejects invalid asset manifests", rejects_invalid_asset_manifests},
      {"rejects invalid scene visuals atomically",
       rejects_invalid_scene_visuals_atomically},
      {"normalizes committed dialogue content",
       normalizes_committed_dialogue_content},
      {"manages character timeline nodes atomically",
       manages_character_timeline_nodes_atomically},
  };

  int failures = 0;
  for (const auto& [name, test] : tests) {
    try {
      test();
      std::cout << "[PASS] " << name << '\n';
    } catch (const std::exception& error) {
      ++failures;
      std::cerr << "[FAIL] " << name << ": " << error.what() << '\n';
    }
  }

  if (failures != 0) {
    std::cerr << failures << " test(s) failed\n";
    return 1;
  }

  std::cout << tests.size() << " test(s) passed\n";
  return 0;
}
