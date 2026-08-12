#include <iostream>
#include <string>

#include "backend.hpp"

int main() {
  vnengine::backend::Backend backend;
  std::string line;

  while (std::getline(std::cin, line)) {
    // stdout is reserved for one JSON response per line. Human-readable logs
    // must always go to stderr so Electron can parse this stream safely.
    std::cout << backend.process_line(line) << '\n' << std::flush;
  }

  return 0;
}
