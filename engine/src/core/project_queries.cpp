// 文件职责：实现对项目聚合、场景和各类时间线节点的只读查询。
// 关键实现：find_scene、scene_node_id、find_scene_node 及节点专用 find_* 函数。
#include "vnengine/project.hpp"

#include <algorithm>

namespace vnengine {

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

SceneJumpNode* find_scene_jump_node(
    Scene& scene,
    const std::string_view node_id) {
  SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<SceneJumpNode>(node);
}

const SceneJumpNode* find_scene_jump_node(
    const Scene& scene,
    const std::string_view node_id) {
  const SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<SceneJumpNode>(node);
}

BgmNode* find_bgm_node(Scene& scene, const std::string_view node_id) {
  SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<BgmNode>(node);
}

const BgmNode* find_bgm_node(
    const Scene& scene,
    const std::string_view node_id) {
  const SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<BgmNode>(node);
}

VideoNode* find_video_node(Scene& scene, const std::string_view node_id) {
  SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<VideoNode>(node);
}

const VideoNode* find_video_node(
    const Scene& scene,
    const std::string_view node_id) {
  const SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<VideoNode>(node);
}

ChoiceNode* find_choice_node(Scene& scene, const std::string_view node_id) {
  SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<ChoiceNode>(node);
}

const ChoiceNode* find_choice_node(
    const Scene& scene,
    const std::string_view node_id) {
  const SceneNode* node = find_scene_node(scene, node_id);
  return node == nullptr ? nullptr : std::get_if<ChoiceNode>(node);
}

ChoiceOption* find_choice_option(
    ChoiceNode& choice,
    const std::string_view option_id) {
  const auto iterator = std::find_if(
      choice.options.begin(),
      choice.options.end(),
      [option_id](const ChoiceOption& option) {
        return option.id == option_id;
      });
  return iterator == choice.options.end() ? nullptr : &*iterator;
}

const ChoiceOption* find_choice_option(
    const ChoiceNode& choice,
    const std::string_view option_id) {
  const auto iterator = std::find_if(
      choice.options.begin(),
      choice.options.end(),
      [option_id](const ChoiceOption& option) {
        return option.id == option_id;
      });
  return iterator == choice.options.end() ? nullptr : &*iterator;
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

}  // namespace vnengine
