// 文件职责：声明同目录临时文件到目标文件的耐久原子替换能力。
// 关键实现：atomic_write_file 及可测试的发布前故障钩子。
#pragma once

#include <filesystem>
#include <string_view>

namespace vnengine::backend {

// Runs after the temporary file has been completely written, flushed, and
// closed, but immediately before it can replace the destination. Production
// callers omit this hook; tests can throw from it to exercise the last safe
// rollback point deterministically.
using AtomicWriteBeforeReplaceHook = void (*)();

// Writes a complete replacement beside target, flushes it, and only then
// atomically replaces target. An exception before the replace leaves any
// existing target bytes untouched.
void atomic_write_file(
    const std::filesystem::path& target,
    std::string_view contents,
    AtomicWriteBeforeReplaceHook before_replace = nullptr);

}  // namespace vnengine::backend
