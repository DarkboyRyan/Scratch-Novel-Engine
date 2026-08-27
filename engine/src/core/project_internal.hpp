// 文件职责：集中 Core 内部复用但不公开的轻量值校验辅助。
// 关键实现：ASCII 空白裁剪、人物位置/层级及 CharacterEffect 参数验证。
#pragma once

#include <cstddef>
#include <string>
#include <string_view>

#include "vnengine/model.hpp"

namespace vnengine::project_detail {

inline std::string trim_ascii_whitespace(std::string value) {
  constexpr std::string_view whitespace = " \t\n\r\f\v";
  const std::size_t first = value.find_first_not_of(whitespace);

  if (first == std::string::npos) {
    return {};
  }

  const std::size_t last = value.find_last_not_of(whitespace);
  return value.substr(first, last - first + 1);
}

inline bool is_valid_character_slot(const CharacterSlot slot) {
  switch (slot) {
    case CharacterSlot::left:
    case CharacterSlot::center:
    case CharacterSlot::right:
      return true;
  }
  return false;
}

inline bool is_valid_character_effect(const CharacterEffect& effect) {
  if (effect.duration_ms < 100 || effect.duration_ms > 10000) {
    return false;
  }
  const auto valid_intensity = [](const CharacterEffectIntensity intensity) {
    switch (intensity) {
      case CharacterEffectIntensity::subtle:
      case CharacterEffectIntensity::normal:
      case CharacterEffectIntensity::strong:
        return true;
    }
    return false;
  };
  const auto valid_direction = [](const CharacterEffectDirection direction) {
    switch (direction) {
      case CharacterEffectDirection::left:
      case CharacterEffectDirection::right:
      case CharacterEffectDirection::up:
      case CharacterEffectDirection::down:
        return true;
    }
    return false;
  };
  if (effect.intensity.has_value() && !valid_intensity(*effect.intensity)) {
    return false;
  }
  if (effect.direction.has_value() && !valid_direction(*effect.direction)) {
    return false;
  }
  switch (effect.type) {
    case CharacterEffectType::shake:
    case CharacterEffectType::jump:
    case CharacterEffectType::breathe:
    case CharacterEffectType::flash:
      return effect.intensity.has_value() && !effect.direction.has_value();
    case CharacterEffectType::fade_in:
    case CharacterEffectType::fade_out:
      return !effect.intensity.has_value() && !effect.direction.has_value();
    case CharacterEffectType::slide_in:
      return effect.intensity.has_value() && effect.direction.has_value();
  }
  return false;
}

}  // namespace vnengine::project_detail
