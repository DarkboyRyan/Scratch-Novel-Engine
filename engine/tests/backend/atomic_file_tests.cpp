// 文件职责：验证跨平台原子文件写入在成功和故障路径下的耐久语义。
// 关键覆盖：临时文件、替换前失败、旧文件保留与清理。
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <string_view>

#include "atomic_file.hpp"

namespace {

void check(const bool condition, const std::string& expression) {
  if (!condition) {
    throw std::runtime_error("check failed: " + expression);
  }
}

#define CHECK(expression) check((expression), #expression)

class TemporaryDirectory final {
 public:
  TemporaryDirectory() {
    const auto nonce = std::chrono::steady_clock::now()
                           .time_since_epoch()
                           .count();
    path_ = std::filesystem::temp_directory_path() /
        ("vn-engine-atomic-file-tests-" + std::to_string(nonce));
    if (!std::filesystem::create_directory(path_)) {
      throw std::runtime_error("could not create temporary directory");
    }
  }

  ~TemporaryDirectory() {
    std::error_code ignored;
    std::filesystem::remove_all(path_, ignored);
  }

  TemporaryDirectory(const TemporaryDirectory&) = delete;
  TemporaryDirectory& operator=(const TemporaryDirectory&) = delete;

  const std::filesystem::path& path() const { return path_; }

 private:
  std::filesystem::path path_;
};

void write_file(
    const std::filesystem::path& path,
    const std::string_view contents) {
  std::ofstream output(path, std::ios::binary);
  output.write(
      contents.data(), static_cast<std::streamsize>(contents.size()));
  if (!output) {
    throw std::runtime_error("could not write test file");
  }
}

std::string read_file(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("could not read test file");
  }
  return std::string(
      std::istreambuf_iterator<char>(input),
      std::istreambuf_iterator<char>());
}

[[noreturn]] void fail_before_replace() {
  throw std::runtime_error("injected failure before replace");
}

void before_replace_failure_preserves_regular_file() {
  TemporaryDirectory temporary;
  const std::filesystem::path target =
      temporary.path() / "project.vn.json";

  // Include a NUL byte so this assertion verifies binary contents rather than
  // only ordinary text produced by JSON serialization.
  constexpr char original_bytes[] = "old project bytes\n\0tail";
  const std::string original(
      original_bytes, sizeof(original_bytes) - 1);
  write_file(target, original);

  bool failed_at_hook = false;
  try {
    vnengine::backend::atomic_write_file(
        target,
        "replacement project bytes\n",
        fail_before_replace);
  } catch (const std::runtime_error& error) {
    failed_at_hook =
        std::string_view(error.what()) ==
        "injected failure before replace";
  }

  CHECK(failed_at_hook);
  CHECK(std::filesystem::is_regular_file(target));
  CHECK(read_file(target) == original);

  const std::string temporary_prefix = ".project.vn.json.tmp-";
  for (const auto& entry :
       std::filesystem::directory_iterator(temporary.path())) {
    CHECK(!entry.path().filename().string().starts_with(temporary_prefix));
  }
}

}  // namespace

int main() {
  try {
    before_replace_failure_preserves_regular_file();
    std::cout
        << "[PASS] before-replace failure preserves regular file\n";
  } catch (const std::exception& error) {
    std::cerr
        << "[FAIL] before-replace failure preserves regular file: "
        << error.what() << '\n';
    return 1;
  }

  return 0;
}
