#pragma once

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

struct Scene {
  int schema_version = kSchemaVersion;
  std::string id;
  std::string name;
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

}  // namespace vnengine
