// 文件职责：声明支持媒体格式的内容探测与 MP3 帧定位接口。
// 关键实现：MediaKind、media_magic_matches、mp3_audio_offset 和 probe 校验。
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>

namespace vnengine::backend {

// Ogg's first-page segment table may be larger than the image/video headers.
// Keeping a bounded 4 KiB prefix allows useful codec validation without ever
// loading the complete media file into memory.
inline constexpr std::size_t kMediaMagicBytes = 4096;
inline constexpr std::size_t kMediaAudioProbeBytes = 64U * 1024U;

enum class MediaKind {
  png,
  jpeg,
  webp,
  mp4,
  webm,
  mp3,
  wav,
  ogg,
};

bool media_magic_matches(
    MediaKind kind,
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    std::size_t size,
    std::uintmax_t file_size);

// MP3 may place the first MPEG frame beyond the bounded magic-byte prefix.
// The importer resolves this offset and reads the extra probe through the
// already-open, platform-safe source handle.
std::optional<std::uint64_t> mp3_audio_offset(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    std::size_t header_size,
    std::uintmax_t file_size);

bool mp3_audio_probe_matches(
    const std::array<unsigned char, kMediaAudioProbeBytes>& probe,
    std::size_t probe_size,
    std::uint64_t audio_offset,
    std::uintmax_t file_size);

}  // namespace vnengine::backend
