#include "atomic_file.hpp"

#include <algorithm>
#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
#include <utility>

#ifdef _WIN32
#define NOMINMAX
#include <windows.h>

#include <random>
#else
#include <fcntl.h>
#include <unistd.h>

#include <vector>
#endif

namespace vnengine::backend {
namespace {

[[noreturn]] void fail(const std::string_view operation) {
  throw std::runtime_error(
      "could not " + std::string(operation) + " project file");
}

std::filesystem::path parent_directory(
    const std::filesystem::path& target) {
  if (target.empty() || target.filename().empty()) {
    fail("resolve target for");
  }

  std::filesystem::path parent = target.parent_path();
  if (parent.empty()) {
    parent = std::filesystem::path(".");
  }

  std::error_code error;
  if (!std::filesystem::is_directory(parent, error) || error) {
    fail("open destination directory for");
  }
  return parent;
}

#ifdef _WIN32

class WindowsFile final {
 public:
  explicit WindowsFile(HANDLE handle) : handle_(handle) {}
  ~WindowsFile() {
    if (handle_ != INVALID_HANDLE_VALUE) {
      CloseHandle(handle_);
    }
  }

  WindowsFile(const WindowsFile&) = delete;
  WindowsFile& operator=(const WindowsFile&) = delete;

  HANDLE get() const { return handle_; }

  void close() {
    if (handle_ != INVALID_HANDLE_VALUE) {
      if (!CloseHandle(handle_)) {
        handle_ = INVALID_HANDLE_VALUE;
        fail("close temporary");
      }
      handle_ = INVALID_HANDLE_VALUE;
    }
  }

 private:
  HANDLE handle_;
};

std::filesystem::path create_temporary_path(
    const std::filesystem::path& target,
    HANDLE& handle) {
  std::random_device random;
  const std::filesystem::path parent = parent_directory(target);
  const std::wstring base = L"." + target.filename().wstring() + L".tmp-";

  for (int attempt = 0; attempt < 128; ++attempt) {
    const auto nonce = static_cast<unsigned long long>(random()) << 32U |
        static_cast<unsigned long long>(random());
    const std::filesystem::path candidate =
        parent / (base + std::to_wstring(nonce));
    handle = CreateFileW(
        candidate.c_str(),
        GENERIC_WRITE,
        0,
        nullptr,
        CREATE_NEW,
        FILE_ATTRIBUTE_NORMAL,
        nullptr);
    if (handle != INVALID_HANDLE_VALUE) {
      return candidate;
    }
    if (GetLastError() != ERROR_FILE_EXISTS) {
      fail("create temporary");
    }
  }
  fail("create unique temporary");
}

#else

class PosixFile final {
 public:
  explicit PosixFile(const int descriptor) : descriptor_(descriptor) {}
  ~PosixFile() {
    if (descriptor_ >= 0) {
      ::close(descriptor_);
    }
  }

  PosixFile(const PosixFile&) = delete;
  PosixFile& operator=(const PosixFile&) = delete;

  int get() const { return descriptor_; }

  void close() {
    if (descriptor_ >= 0) {
      const int descriptor = std::exchange(descriptor_, -1);
      if (::close(descriptor) != 0) {
        fail("close temporary");
      }
    }
  }

 private:
  int descriptor_;
};

std::pair<std::filesystem::path, int> create_temporary_file(
    const std::filesystem::path& target) {
  const std::filesystem::path pattern =
      parent_directory(target) /
      ("." + target.filename().string() + ".tmp-XXXXXX");
  std::string native_pattern = pattern.string();
  std::vector<char> writable_pattern(
      native_pattern.begin(), native_pattern.end());
  writable_pattern.push_back('\0');

  const int descriptor = ::mkstemp(writable_pattern.data());
  if (descriptor < 0) {
    fail("create temporary");
  }
  return {
      std::filesystem::path(writable_pattern.data()),
      descriptor,
  };
}

void flush_descriptor(const int descriptor) {
  while (::fsync(descriptor) != 0) {
    if (errno != EINTR) {
      fail("flush temporary");
    }
  }
}

void flush_parent_directory(const std::filesystem::path& target) {
  const std::filesystem::path parent = parent_directory(target);
#ifdef O_DIRECTORY
  constexpr int directory_flag = O_DIRECTORY;
#else
  constexpr int directory_flag = 0;
#endif
  const int descriptor = ::open(parent.c_str(), O_RDONLY | directory_flag);
  if (descriptor < 0) {
    fail("open destination directory after replacing");
  }

  PosixFile directory(descriptor);
  while (::fsync(directory.get()) != 0) {
    // Some POSIX-derived filesystems do not implement directory fsync. The
    // file itself is already durable and atomically visible in that case.
    if (errno == EINVAL || errno == ENOTSUP) {
      break;
    }
    if (errno != EINTR) {
      fail("flush destination directory after replacing");
    }
  }
}

#endif

}  // namespace

void atomic_write_file(
    const std::filesystem::path& target,
    const std::string_view contents,
    const AtomicWriteBeforeReplaceHook before_replace) {
#ifdef _WIN32
  HANDLE raw_handle = INVALID_HANDLE_VALUE;
  const std::filesystem::path temporary =
      create_temporary_path(target, raw_handle);
  WindowsFile file(raw_handle);
  bool replaced = false;

  try {
    std::size_t offset = 0;
    while (offset < contents.size()) {
      const DWORD chunk = static_cast<DWORD>(std::min<std::size_t>(
          contents.size() - offset,
          static_cast<std::size_t>(std::numeric_limits<DWORD>::max())));
      DWORD written = 0;
      if (!WriteFile(
              file.get(), contents.data() + offset, chunk, &written, nullptr) ||
          written == 0) {
        fail("write temporary");
      }
      offset += written;
    }
    if (!FlushFileBuffers(file.get())) {
      fail("flush temporary");
    }
    file.close();

    if (before_replace != nullptr) {
      before_replace();
    }

    if (!MoveFileExW(
            temporary.c_str(),
            target.c_str(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
      fail("replace destination");
    }
    replaced = true;
  } catch (...) {
    if (!replaced) {
      std::error_code ignored;
      std::filesystem::remove(temporary, ignored);
    }
    throw;
  }
#else
  auto [temporary, raw_descriptor] = create_temporary_file(target);
  PosixFile file(raw_descriptor);
  bool replaced = false;

  try {
    std::size_t offset = 0;
    while (offset < contents.size()) {
      const std::size_t remaining = contents.size() - offset;
      const std::size_t maximum_write = static_cast<std::size_t>(
          std::numeric_limits<ssize_t>::max());
      const std::size_t chunk = std::min(remaining, maximum_write);
      const ssize_t written = ::write(
          file.get(), contents.data() + offset, chunk);
      if (written < 0 && errno == EINTR) {
        continue;
      }
      if (written <= 0) {
        fail("write temporary");
      }
      offset += static_cast<std::size_t>(written);
    }

    flush_descriptor(file.get());
    file.close();
    if (before_replace != nullptr) {
      before_replace();
    }
    if (::rename(temporary.c_str(), target.c_str()) != 0) {
      fail("replace destination");
    }
    replaced = true;
    flush_parent_directory(target);
  } catch (...) {
    if (!replaced) {
      std::error_code ignored;
      std::filesystem::remove(temporary, ignored);
    }
    throw;
  }
#endif
}

}  // namespace vnengine::backend
