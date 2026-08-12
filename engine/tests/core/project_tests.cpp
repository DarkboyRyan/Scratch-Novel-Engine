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

void creates_project_with_one_empty_entry_scene() {
  SequenceIdGenerator ids;
  const vnengine::Project project = vnengine::create_empty_project(ids);

  CHECK(project.schema_version == 1);
  CHECK(project.name == "未命名项目");
  CHECK(project.scenes.size() == 1);
  CHECK(project.scenes[0].name == "场景 1");
  CHECK(project.scenes[0].nodes.empty());
  CHECK(project.entry_scene_id == project.scenes[0].id);
  CHECK(project.id != project.scenes[0].id);
  CHECK(!vnengine::validate_project(project).has_value());
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
  CHECK(scene->nodes[0].id == first_id);
  CHECK(scene->nodes[1].id == empty_id);
  CHECK(scene->nodes[1].speaker.empty());
  CHECK(scene->nodes[1].text.empty());
  CHECK(scene->nodes[2].id == second_id);

  const std::string appended_id = *vnengine::add_dialogue(
      project, ids, scene_id, "旁白", "末尾", "missing-node");
  CHECK(scene->nodes.back().id == appended_id);
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
  CHECK(scene->nodes[0].id == before_first_id);
  CHECK(scene->nodes[1].id == first_id);
  CHECK(scene->nodes[2].id == before_second_id);
  CHECK(scene->nodes[3].id == second_id);

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
  CHECK(scene->nodes.back().id == appended_id);
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
  CHECK(scene->nodes[0].id == second_id);
  CHECK(scene->nodes[1].id == first_id);
  CHECK(!vnengine::move_dialogue(project, scene_id, second_id, -1));
  CHECK(!vnengine::move_dialogue(project, scene_id, second_id, 2));

  CHECK(vnengine::delete_dialogue(project, scene_id, first_id));
  CHECK(scene->nodes.size() == 2);
  CHECK(scene->nodes[0].id == second_id);
  CHECK(scene->nodes[1].id == third_id);
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
    for (const vnengine::Dialogue& dialogue : scene->nodes) {
      result.push_back(dialogue.id);
    }
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
    for (const vnengine::Dialogue& dialogue :
         vnengine::find_scene(project, scene_id)->nodes) {
      result.push_back(dialogue.id);
    }
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
  CHECK(scene->nodes[0].id == second_id);
  CHECK(!vnengine::validate_project(project).has_value());
}

void detects_invalid_project_invariants() {
  SequenceIdGenerator ids;
  vnengine::Project project = vnengine::create_empty_project(ids);

  project.entry_scene_id = "missing";
  CHECK(vnengine::validate_project(project).has_value());

  project.entry_scene_id = project.scenes[0].id;
  project.scenes.push_back(project.scenes[0]);
  CHECK(vnengine::validate_project(project).has_value());
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

}  // namespace

int main() {
  const std::vector<std::pair<std::string, std::function<void()>>> tests{
      {"creates project with one empty entry scene",
       creates_project_with_one_empty_entry_scene},
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
      {"normalizes committed dialogue content",
       normalizes_committed_dialogue_content},
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
