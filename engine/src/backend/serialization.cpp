#include "serialization.hpp"

#include <nlohmann/json.hpp>

namespace vnengine::backend {

namespace {

nlohmann::json dialogue_to_json(const Dialogue& dialogue) {
  return {
      {"id", dialogue.id},
      {"type", "dialogue"},
      {"speaker", dialogue.speaker},
      {"text", dialogue.text},
  };
}

nlohmann::json scene_to_json(const Scene& scene) {
  nlohmann::json nodes = nlohmann::json::array();
  for (const Dialogue& dialogue : scene.nodes) {
    nodes.push_back(dialogue_to_json(dialogue));
  }

  return {
      {"schemaVersion", scene.schema_version},
      {"id", scene.id},
      {"name", scene.name},
      {"nodes", std::move(nodes)},
  };
}

}  // namespace

nlohmann::json project_to_json(const Project& project) {
  nlohmann::json scenes = nlohmann::json::array();
  for (const Scene& scene : project.scenes) {
    scenes.push_back(scene_to_json(scene));
  }

  return {
      {"schemaVersion", project.schema_version},
      {"id", project.id},
      {"name", project.name},
      {"entrySceneId", project.entry_scene_id},
      {"scenes", std::move(scenes)},
  };
}

}  // namespace vnengine::backend
