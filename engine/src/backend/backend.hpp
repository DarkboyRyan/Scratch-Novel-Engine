// 文件职责：声明持有 Author 会话状态并处理单条 JSONL 请求的 Backend。
// 关键实现：Backend::handle、测试故障点和会话 revision 管理入口。
#pragma once

#include <cstdint>
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
  ProjectAggregate& require_aggregate();
  Project& require_project();
  void reset_unsaved_session();
  void reset_opened_session();
  void record_mutation(bool changed);

  RandomIdGenerator ids_;
  // Project data and Asset metadata are one consistency boundary because
  // Scene visuals reference Assets by ID. Renderer responses expose only the
  // Project plus path-free Asset metadata; storage paths remain private here.
  std::optional<ProjectAggregate> aggregate_;
  // Revisions describe the current in-memory document, not a filesystem path.
  // Electron Main remains the sole owner of the active path.
  std::uint64_t revision_ = 0;
  std::optional<std::uint64_t> saved_revision_;
};

}  // namespace vnengine::backend
