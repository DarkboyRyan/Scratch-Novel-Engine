#include "media_sniffer.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <utility>

namespace vnengine::backend {
namespace {

std::uint16_t read_little_endian_u16(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t offset) {
  return static_cast<std::uint16_t>(bytes[offset]) |
      (static_cast<std::uint16_t>(bytes[offset + 1]) << 8U);
}

std::uint32_t read_little_endian_u32(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t offset) {
  return static_cast<std::uint32_t>(bytes[offset]) |
      (static_cast<std::uint32_t>(bytes[offset + 1]) << 8U) |
      (static_cast<std::uint32_t>(bytes[offset + 2]) << 16U) |
      (static_cast<std::uint32_t>(bytes[offset + 3]) << 24U);
}

std::uint32_t read_big_endian_u32(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t offset) {
  return (static_cast<std::uint32_t>(bytes[offset]) << 24U) |
      (static_cast<std::uint32_t>(bytes[offset + 1]) << 16U) |
      (static_cast<std::uint32_t>(bytes[offset + 2]) << 8U) |
      static_cast<std::uint32_t>(bytes[offset + 3]);
}

std::uint64_t read_big_endian_u64(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t offset) {
  std::uint64_t value = 0;
  for (std::size_t index = 0; index < 8; ++index) {
    value = (value << 8U) | bytes[offset + index];
  }
  return value;
}

bool is_mp4_video_brand(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t offset) {
  constexpr std::array<std::array<unsigned char, 4>, 14> brands{{
      {{'i', 's', 'o', 'm'}}, {{'i', 's', 'o', '2'}},
      {{'i', 's', 'o', '3'}}, {{'i', 's', 'o', '4'}},
      {{'i', 's', 'o', '5'}}, {{'i', 's', 'o', '6'}},
      {{'m', 'p', '4', '1'}}, {{'m', 'p', '4', '2'}},
      {{'a', 'v', 'c', '1'}}, {{'a', 'v', 'c', '2'}},
      {{'d', 'a', 's', 'h'}}, {{'M', '4', 'V', ' '}},
      {{'M', 'S', 'N', 'V'}}, {{'3', 'g', 'p', '4'}},
  }};
  return std::any_of(brands.begin(), brands.end(), [&](const auto& brand) {
    return std::equal(brand.begin(), brand.end(), bytes.begin() + offset);
  });
}

bool valid_mp4_header(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t header_size,
    const std::uintmax_t file_size) {
  if (header_size < 16 || bytes[4] != 'f' || bytes[5] != 't' ||
      bytes[6] != 'y' || bytes[7] != 'p') {
    return false;
  }
  const std::uint32_t short_box_size = read_big_endian_u32(bytes, 0);
  std::uint64_t box_size = short_box_size;
  std::size_t brand_offset = 8;
  if (short_box_size == 1) {
    if (header_size < 24) {
      return false;
    }
    box_size = read_big_endian_u64(bytes, 8);
    brand_offset = 16;
  }
  if (box_size < brand_offset + 8 || box_size > file_size) {
    return false;
  }
  const std::uint64_t compatible_bytes = box_size - (brand_offset + 8);
  if (compatible_bytes % 4 != 0) {
    return false;
  }
  bool found_video_brand = is_mp4_video_brand(bytes, brand_offset);
  const std::size_t compatible_begin = brand_offset + 8;
  const std::size_t inspected_end = static_cast<std::size_t>(
      std::min<std::uint64_t>(box_size, header_size));
  for (std::size_t offset = compatible_begin;
       offset + 4 <= inspected_end;
       offset += 4) {
    if (is_mp4_video_brand(bytes, offset)) {
      found_video_brand = true;
    }
  }
  return found_video_brand;
}

std::optional<std::pair<std::uint64_t, std::size_t>> read_ebml_vint(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t offset,
    const std::size_t limit,
    const bool keep_marker) {
  if (offset >= limit || bytes[offset] == 0) {
    return std::nullopt;
  }
  std::size_t length = 1;
  unsigned char marker = 0x80U;
  while (length <= 8 && (bytes[offset] & marker) == 0) {
    marker >>= 1U;
    ++length;
  }
  if (length > 8 || offset + length > limit) {
    return std::nullopt;
  }
  std::uint64_t value = keep_marker
      ? bytes[offset]
      : static_cast<unsigned char>(bytes[offset] & (marker - 1U));
  for (std::size_t index = 1; index < length; ++index) {
    value = (value << 8U) | bytes[offset + index];
  }
  if (!keep_marker) {
    const std::uint64_t unknown = length == 8
        ? (std::uint64_t{1} << 56U) - 1U
        : (std::uint64_t{1} << (7U * length)) - 1U;
    if (value == unknown) {
      return std::nullopt;
    }
  }
  return std::pair{value, length};
}

bool valid_webm_header(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t header_size,
    const std::uintmax_t file_size) {
  if (header_size < 8 || bytes[0] != 0x1aU || bytes[1] != 0x45U ||
      bytes[2] != 0xdfU || bytes[3] != 0xa3U) {
    return false;
  }
  const auto header_length = read_ebml_vint(bytes, 4, header_size, false);
  if (!header_length.has_value()) {
    return false;
  }
  const std::size_t payload_begin = 4 + header_length->second;
  const std::uint64_t header_end_u64 =
      static_cast<std::uint64_t>(payload_begin) + header_length->first;
  if (header_end_u64 > header_size || header_end_u64 > file_size) {
    return false;
  }
  const std::size_t header_end = static_cast<std::size_t>(header_end_u64);
  std::size_t offset = payload_begin;
  bool found_webm_doctype = false;
  while (offset < header_end) {
    const auto id = read_ebml_vint(bytes, offset, header_end, true);
    if (!id.has_value()) {
      return false;
    }
    offset += id->second;
    const auto element_size = read_ebml_vint(
        bytes, offset, header_end, false);
    if (!element_size.has_value()) {
      return false;
    }
    offset += element_size->second;
    if (element_size->first > header_end - offset) {
      return false;
    }
    if (id->first == 0x4282U) {
      constexpr std::array<unsigned char, 4> webm{{'w', 'e', 'b', 'm'}};
      if (found_webm_doctype || element_size->first != webm.size() ||
          !std::equal(
              webm.begin(), webm.end(), bytes.begin() + offset)) {
        return false;
      }
      found_webm_doctype = true;
    }
    offset += static_cast<std::size_t>(element_size->first);
  }
  return found_webm_doctype && offset == header_end;
}

std::optional<std::uint64_t> mpeg_audio_frame_length(
    const unsigned char* bytes,
    const std::size_t size) {
  if (size < 4 || bytes[0] != 0xffU || (bytes[1] & 0xe0U) != 0xe0U) {
    return std::nullopt;
  }
  const unsigned int version = (bytes[1] >> 3U) & 0x03U;
  const unsigned int layer = (bytes[1] >> 1U) & 0x03U;
  const unsigned int bitrate_index = (bytes[2] >> 4U) & 0x0fU;
  const unsigned int sample_rate_index = (bytes[2] >> 2U) & 0x03U;
  if (version == 1U || layer == 0U || bitrate_index == 0U ||
      bitrate_index == 15U || sample_rate_index == 3U) {
    return std::nullopt;
  }

  constexpr std::array<unsigned int, 15> mpeg1_layer1{
      0, 32, 64, 96, 128, 160, 192, 224,
      256, 288, 320, 352, 384, 416, 448};
  constexpr std::array<unsigned int, 15> mpeg1_layer2{
      0, 32, 48, 56, 64, 80, 96, 112,
      128, 160, 192, 224, 256, 320, 384};
  constexpr std::array<unsigned int, 15> mpeg1_layer3{
      0, 32, 40, 48, 56, 64, 80, 96,
      112, 128, 160, 192, 224, 256, 320};
  constexpr std::array<unsigned int, 15> mpeg2_layer1{
      0, 32, 48, 56, 64, 80, 96, 112,
      128, 144, 160, 176, 192, 224, 256};
  constexpr std::array<unsigned int, 15> mpeg2_layer23{
      0, 8, 16, 24, 32, 40, 48, 56,
      64, 80, 96, 112, 128, 144, 160};
  constexpr std::array<unsigned int, 3> base_sample_rates{
      44'100, 48'000, 32'000};

  const bool is_mpeg1 = version == 3U;
  const auto& bitrate_table = is_mpeg1
      ? (layer == 3U ? mpeg1_layer1
                     : (layer == 2U ? mpeg1_layer2 : mpeg1_layer3))
      : (layer == 3U ? mpeg2_layer1 : mpeg2_layer23);
  const std::uint64_t bitrate =
      static_cast<std::uint64_t>(bitrate_table[bitrate_index]) * 1000U;
  const unsigned int version_divisor = version == 3U ? 1U :
      (version == 2U ? 2U : 4U);
  const std::uint64_t sample_rate =
      base_sample_rates[sample_rate_index] / version_divisor;
  const unsigned int padding = (bytes[2] >> 1U) & 0x01U;

  if (layer == 3U) {
    return ((12U * bitrate) / sample_rate + padding) * 4U;
  }
  const std::uint64_t coefficient = layer == 1U && !is_mpeg1 ? 72U : 144U;
  return (coefficient * bitrate) / sample_rate + padding;
}

bool valid_wav_header(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t header_size,
    const std::uintmax_t file_size) {
  if (header_size < 12 || bytes[0] != 'R' || bytes[1] != 'I' ||
      bytes[2] != 'F' || bytes[3] != 'F' || bytes[8] != 'W' ||
      bytes[9] != 'A' || bytes[10] != 'V' || bytes[11] != 'E') {
    return false;
  }
  const std::uint64_t riff_end =
      static_cast<std::uint64_t>(read_little_endian_u32(bytes, 4)) + 8U;
  if (riff_end > file_size || riff_end < 36U) {
    return false;
  }

  std::size_t offset = 12;
  bool found_format = false;
  bool found_data = false;
  while (offset + 8 <= header_size && offset + 8 <= riff_end) {
    const std::uint32_t chunk_size = read_little_endian_u32(bytes, offset + 4);
    const std::uint64_t chunk_end =
        static_cast<std::uint64_t>(offset) + 8U + chunk_size;
    if (chunk_end > riff_end || chunk_end > file_size) {
      return false;
    }
    if (bytes[offset] == 'f' && bytes[offset + 1] == 'm' &&
        bytes[offset + 2] == 't' && bytes[offset + 3] == ' ') {
      if (found_format || chunk_size < 16 || chunk_size > 1024 ||
          offset + 24 > header_size) {
        return false;
      }
      const std::uint16_t format = read_little_endian_u16(bytes, offset + 8);
      const std::uint16_t channels = read_little_endian_u16(bytes, offset + 10);
      const std::uint32_t sample_rate =
          read_little_endian_u32(bytes, offset + 12);
      const std::uint32_t byte_rate =
          read_little_endian_u32(bytes, offset + 16);
      const std::uint16_t block_align =
          read_little_endian_u16(bytes, offset + 20);
      const std::uint16_t bits_per_sample =
          read_little_endian_u16(bytes, offset + 22);
      const bool supported_format = format == 1U || format == 3U ||
          format == 6U || format == 7U || format == 0xfffeU;
      if (!supported_format || channels == 0 || sample_rate == 0 ||
          byte_rate == 0 || block_align == 0 || bits_per_sample == 0) {
        return false;
      }
      found_format = true;
    } else if (bytes[offset] == 'd' && bytes[offset + 1] == 'a' &&
               bytes[offset + 2] == 't' && bytes[offset + 3] == 'a') {
      if (chunk_size == 0) {
        return false;
      }
      found_data = true;
    }
    if (found_format && found_data) {
      return true;
    }
    const std::uint64_t padded_end = chunk_end + (chunk_size & 1U);
    if (padded_end > std::numeric_limits<std::size_t>::max()) {
      return false;
    }
    offset = static_cast<std::size_t>(padded_end);
  }
  return false;
}

bool valid_ogg_audio_header(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t header_size) {
  if (header_size < 28 || bytes[0] != 'O' || bytes[1] != 'g' ||
      bytes[2] != 'g' || bytes[3] != 'S' || bytes[4] != 0 ||
      (bytes[5] & 0x02U) == 0 ||
      read_little_endian_u32(bytes, 18) != 0) {
    return false;
  }
  const std::size_t segment_count = bytes[26];
  if (segment_count == 0) {
    return false;
  }
  const std::size_t payload_begin = 27U + segment_count;
  if (payload_begin > header_size) {
    return false;
  }
  std::size_t first_packet_size = 0;
  bool packet_complete = false;
  for (std::size_t index = 0; index < segment_count; ++index) {
    first_packet_size += bytes[27 + index];
    if (bytes[27 + index] < 255U) {
      packet_complete = true;
      break;
    }
  }
  if (!packet_complete || first_packet_size == 0 ||
      payload_begin + first_packet_size > header_size) {
    return false;
  }
  constexpr std::array<unsigned char, 8> opus{
      'O', 'p', 'u', 's', 'H', 'e', 'a', 'd'};
  constexpr std::array<unsigned char, 7> vorbis{
      0x01U, 'v', 'o', 'r', 'b', 'i', 's'};
  const bool valid_opus = first_packet_size >= 19U &&
      std::equal(opus.begin(), opus.end(), bytes.begin() + payload_begin) &&
      bytes[payload_begin + 8] > 0U &&
      (bytes[payload_begin + 8] & 0xf0U) == 0U &&
      bytes[payload_begin + 9] > 0U;
  const bool valid_vorbis = first_packet_size >= 30U &&
      std::equal(vorbis.begin(), vorbis.end(), bytes.begin() + payload_begin) &&
      read_little_endian_u32(bytes, payload_begin + 7) == 0U &&
      bytes[payload_begin + 11] > 0U &&
      read_little_endian_u32(bytes, payload_begin + 12) > 0U &&
      (bytes[payload_begin + 29] & 0x01U) == 1U;
  return valid_opus || valid_vorbis;
}

}  // namespace

std::optional<std::uint64_t> mp3_audio_offset(
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t header_size,
    const std::uintmax_t file_size) {
  if (header_size >= 4 && mpeg_audio_frame_length(bytes.data(), 4)) {
    return 0U;
  }
  if (header_size < 10 || bytes[0] != 'I' || bytes[1] != 'D' ||
      bytes[2] != '3' || bytes[3] < 2U || bytes[3] > 4U ||
      bytes[4] == 0xffU ||
      (bytes[6] & 0x80U) != 0 || (bytes[7] & 0x80U) != 0 ||
      (bytes[8] & 0x80U) != 0 || (bytes[9] & 0x80U) != 0) {
    return std::nullopt;
  }
  const unsigned char reserved_flags = bytes[3] == 2U ? 0x3fU :
      (bytes[3] == 3U ? 0x1fU : 0x0fU);
  if ((bytes[5] & reserved_flags) != 0) {
    return std::nullopt;
  }
  const std::uint32_t tag_size =
      (static_cast<std::uint32_t>(bytes[6]) << 21U) |
      (static_cast<std::uint32_t>(bytes[7]) << 14U) |
      (static_cast<std::uint32_t>(bytes[8]) << 7U) |
      static_cast<std::uint32_t>(bytes[9]);
  const std::uint64_t frame_begin = 10U + tag_size +
      ((bytes[3] == 4U && (bytes[5] & 0x10U) != 0) ? 10U : 0U);
  if (frame_begin + 4U > file_size) {
    return std::nullopt;
  }
  return frame_begin;
}

bool mp3_audio_probe_matches(
    const std::array<unsigned char, kMediaAudioProbeBytes>& probe,
    const std::size_t probe_size,
    const std::uint64_t audio_offset,
    const std::uintmax_t file_size) {
  std::size_t frame_offset = 0;
  while (frame_offset < probe_size && probe[frame_offset] == 0) {
    ++frame_offset;
  }
  const auto frame_length = mpeg_audio_frame_length(
      probe.data() + frame_offset, probe_size - frame_offset);
  return frame_length.has_value() && *frame_length >= 24U &&
      audio_offset + frame_offset + *frame_length <= file_size;
}

bool media_magic_matches(
    const MediaKind kind,
    const std::array<unsigned char, kMediaMagicBytes>& bytes,
    const std::size_t size,
    const std::uintmax_t file_size) {
  switch (kind) {
    case MediaKind::png: {
      constexpr std::array<unsigned char, 8> signature{
          0x89U, 0x50U, 0x4eU, 0x47U, 0x0dU, 0x0aU, 0x1aU, 0x0aU};
      return size >= signature.size() &&
          std::equal(signature.begin(), signature.end(), bytes.begin());
    }
    case MediaKind::jpeg:
      return size >= 3 && bytes[0] == 0xffU && bytes[1] == 0xd8U &&
          bytes[2] == 0xffU;
    case MediaKind::webp:
      return size >= 12 && bytes[0] == 'R' && bytes[1] == 'I' &&
          bytes[2] == 'F' && bytes[3] == 'F' && bytes[8] == 'W' &&
          bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
    case MediaKind::mp4:
      return valid_mp4_header(bytes, size, file_size);
    case MediaKind::webm:
      return valid_webm_header(bytes, size, file_size);
    case MediaKind::mp3:
      // MP3 can place its first MPEG frame after a large ID3 tag. The caller
      // validates it through the already-open source handle.
      return false;
    case MediaKind::wav:
      return valid_wav_header(bytes, size, file_size);
    case MediaKind::ogg:
      return valid_ogg_audio_header(bytes, size);
  }
  return false;
}

}  // namespace vnengine::backend
