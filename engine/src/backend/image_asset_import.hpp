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
inline constexpr std::uintmax_t kMaximumImportedVideoBytes =
    2U * 1024U * 1024U * 1024U;
inline constexpr std::uintmax_t kMaximumImportedAudioBytes =
    512U * 1024U * 1024U;

enum class AssetImportKind {
  image,
  video,
  audio,
};

struct AssetImportPlan {
  std::string relative_path;
  std::string display_name;
};

using ImageAssetImportPlan = AssetImportPlan;
using VideoAssetImportPlan = AssetImportPlan;
using AudioAssetImportPlan = AssetImportPlan;

class AssetImportError final : public std::runtime_error {
 public:
  explicit AssetImportError(std::string message);
};

using ImageAssetImportError = AssetImportError;

// Derives public metadata and the canonical project-relative destination from
// a Main-owned source path. This step performs no filesystem mutation.
ImageAssetImportPlan plan_image_asset_import(
    std::string_view source_file_path,
    std::string_view asset_id);

// Video imports currently accept ISO BMFF MP4 and EBML WebM. The canonical
// destination is derived from the validated extension, never from renderer
// supplied relative paths.
VideoAssetImportPlan plan_video_asset_import(
    std::string_view source_file_path,
    std::string_view asset_id);

// Audio imports accept MP3, RIFF/WAVE, and Ogg Vorbis/Opus. Files are copied
// to assets/audio after the selected extension and binary signature agree.
AudioAssetImportPlan plan_audio_asset_import(
    std::string_view source_file_path,
    std::string_view asset_id);

AssetImportPlan plan_asset_import(
    std::string_view source_file_path,
    std::string_view asset_id,
    AssetImportKind kind);

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

void copy_video_asset_no_clobber(
    const std::filesystem::path& source,
    const std::filesystem::path& project_directory,
    const VideoAssetImportPlan& plan,
    ImageImportBeforePublishHook before_publish = nullptr);

void copy_audio_asset_no_clobber(
    const std::filesystem::path& source,
    const std::filesystem::path& project_directory,
    const AudioAssetImportPlan& plan,
    ImageImportBeforePublishHook before_publish = nullptr);

void copy_asset_no_clobber(
    const std::filesystem::path& source,
    const std::filesystem::path& project_directory,
    const AssetImportPlan& plan,
    AssetImportKind kind,
    ImageImportBeforePublishHook before_publish = nullptr);

}  // namespace vnengine::backend
