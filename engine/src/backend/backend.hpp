#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

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
  void reset_unsaved_session();
  void reset_opened_session();
  void record_mutation(bool changed);

  RandomIdGenerator ids_;
  std::optional<Project> project_;
  // Asset metadata is loaded transactionally with the Project and retained
  // for the later save/import stages. It is intentionally not exposed in the
  // renderer-facing Project snapshot yet.
  std::vector<Asset> assets_;
  // Revisions describe the current in-memory document, not a filesystem path.
  // Electron Main remains the sole owner of the active path.
  std::uint64_t revision_ = 0;
  std::optional<std::uint64_t> saved_revision_;
};

}  // namespace vnengine::backend
