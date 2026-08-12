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
