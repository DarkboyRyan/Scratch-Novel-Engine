#pragma once

#include <cstdint>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <string_view>

namespace vnengine::backend {

// Images are copied through a bounded stream; they are never embedded in the
// JSONL protocol or loaded into one large in-memory buffer.
inline constexpr std::uintmax_t kMaximumImportedImageBytes =
    128U * 1024U * 1024U;

struct ImageAssetImportPlan {
  std::string relative_path;
  std::string display_name;
};

class ImageAssetImportError final : public std::runtime_error {
 public:
  explicit ImageAssetImportError(std::string message);
};

// Derives public metadata and the canonical project-relative destination from
// a Main-owned source path. This step performs no filesystem mutation.
ImageAssetImportPlan plan_image_asset_import(
    std::string_view source_file_path,
    std::string_view asset_id);

// Runs after a complete temporary copy has been flushed, immediately before
// the no-clobber publication. Production callers omit this hook; tests use it
// to prove rollback and temporary-file cleanup.
using ImageImportBeforePublishHook = void (*)();

// Opens the source without following its final symlink/reparse point, checks
// the regular-file size and magic bytes on that same OS handle, then streams
// into a temporary file below <project>/assets/images. Publication never
// replaces an existing destination.
void copy_image_asset_no_clobber(
    const std::filesystem::path& source,
    const std::filesystem::path& project_directory,
    const ImageAssetImportPlan& plan,
    ImageImportBeforePublishHook before_publish = nullptr);

}  // namespace vnengine::backend
