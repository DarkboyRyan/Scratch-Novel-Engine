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

}  // namespace vnengine::project_detail
