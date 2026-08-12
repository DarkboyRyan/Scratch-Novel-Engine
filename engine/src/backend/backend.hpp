#pragma once

#include <optional>
#include <string>
#include <string_view>

#include <nlohmann/json_fwd.hpp>

#include "vnengine/project.hpp"

namespace vnengine::backend {

// Owns the in-memory project and translates one JSONL request at a time. The
// executable entry point only manages stdin/stdout; protocol dispatch stays
// here so it can evolve independently from process lifecycle code.
class Backend final {
 public:
  std::string process_line(std::string_view line);

 private:
  nlohmann::json handle(const nlohmann::json& request);
  static nlohmann::json request_id(const nlohmann::json& request);
  Project& require_project();

  RandomIdGenerator ids_;
  std::optional<Project> project_;
};

}  // namespace vnengine::backend
