#include "image_asset_import.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <random>
#include <string>
#include <string_view>
#include <utility>

#ifdef _WIN32
#define NOMINMAX
#include <windows.h>
#else
#include <cerrno>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#ifdef __APPLE__
#include <sys/stdio.h>
#elif defined(__linux__)
#include <linux/fs.h>
#include <sys/syscall.h>
#endif
#endif

namespace vnengine::backend {
namespace {

constexpr std::size_t kMagicBytes = 12;
constexpr std::size_t kCopyBufferBytes = 64U * 1024U;

enum class ImageKind {
  png,
  jpeg,
  webp,
};

[[noreturn]] void fail(std::string message) {
  throw ImageAssetImportError(std::move(message));
}

bool is_safe_asset_id(const std::string_view id) {
  if (id.empty() || id.size() > 128) {
    return false;
  }
  return std::all_of(id.begin(), id.end(), [](const unsigned char byte) {
    return (byte >= 'a' && byte <= 'z') ||
        (byte >= 'A' && byte <= 'Z') ||
        (byte >= '0' && byte <= '9') || byte == '-' || byte == '_';
  });
}

std::string lowercase_ascii(std::string value) {
  std::transform(
      value.begin(),
      value.end(),
      value.begin(),
      [](const unsigned char byte) {
        return static_cast<char>(std::tolower(byte));
      });
  return value;
}

std::string source_extension(const std::string_view source_file_path) {
  const std::size_t separator = source_file_path.find_last_of("/\\");
  const std::size_t filename_start = separator == std::string_view::npos
      ? 0
      : separator + 1;
  const std::size_t dot = source_file_path.find_last_of('.');
  if (dot == std::string_view::npos || dot < filename_start) {
    fail("image source must use a PNG, JPEG, or WebP extension");
  }
  return lowercase_ascii(std::string(source_file_path.substr(dot)));
}

ImageKind kind_for_extension(const std::string_view extension) {
  if (extension == ".png") {
    return ImageKind::png;
  }
  if (extension == ".jpg" || extension == ".jpeg") {
    return ImageKind::jpeg;
  }
  if (extension == ".webp") {
    return ImageKind::webp;
  }
  fail("image source must use a PNG, JPEG, or WebP extension");
}

std::string canonical_extension(const ImageKind kind) {
  switch (kind) {
    case ImageKind::png:
      return ".png";
    case ImageKind::jpeg:
      return ".jpg";
    case ImageKind::webp:
      return ".webp";
  }
  fail("image type is unsupported");
}

std::string source_display_name(
    const std::string_view source_file_path,
    const std::string_view extension) {
  const std::size_t separator = source_file_path.find_last_of("/\\");
  const std::size_t filename_start = separator == std::string_view::npos
      ? 0
      : separator + 1;
  const std::string filename(source_file_path.substr(filename_start));
  if (filename.empty()) {
    fail("image source filename is invalid");
  }

  if (filename.size() > extension.size()) {
    return filename.substr(0, filename.size() - extension.size());
  }
  return filename;
}

bool magic_matches(
    const ImageKind kind,
    const std::array<unsigned char, kMagicBytes>& bytes,
    const std::size_t size) {
  switch (kind) {
    case ImageKind::png: {
      constexpr std::array<unsigned char, 8> signature{
          0x89U, 0x50U, 0x4eU, 0x47U, 0x0dU, 0x0aU, 0x1aU, 0x0aU};
      return size >= signature.size() &&
          std::equal(signature.begin(), signature.end(), bytes.begin());
    }
    case ImageKind::jpeg:
      return size >= 3 && bytes[0] == 0xffU && bytes[1] == 0xd8U &&
          bytes[2] == 0xffU;
    case ImageKind::webp:
      return size >= 12 && bytes[0] == 'R' && bytes[1] == 'I' &&
          bytes[2] == 'F' && bytes[3] == 'F' && bytes[8] == 'W' &&
          bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
  }
  return false;
}

std::string destination_filename(const ImageAssetImportPlan& plan) {
  constexpr std::string_view prefix = "assets/images/";
  if (!std::string_view(plan.relative_path).starts_with(prefix)) {
    fail("image destination is invalid");
  }

  const std::string filename = plan.relative_path.substr(prefix.size());
  if (filename.empty() || filename.find('/') != std::string::npos ||
      filename.find('\\') != std::string::npos) {
    fail("image destination is invalid");
  }
  return filename;
}

void validate_paths(
    const std::filesystem::path& source,
    const std::filesystem::path& project_directory) {
  if (source.empty() || !source.is_absolute() ||
      source.lexically_normal() != source) {
    fail("image source path is invalid");
  }
  if (project_directory.empty() || !project_directory.is_absolute() ||
      project_directory.lexically_normal() != project_directory) {
    fail("project directory path is invalid");
  }
}

#ifdef _WIN32

class WindowsHandle final {
 public:
  explicit WindowsHandle(HANDLE handle = INVALID_HANDLE_VALUE)
      : handle_(handle) {}

  ~WindowsHandle() {
    if (handle_ != INVALID_HANDLE_VALUE) {
      CloseHandle(handle_);
    }
  }

  WindowsHandle(const WindowsHandle&) = delete;
  WindowsHandle& operator=(const WindowsHandle&) = delete;

  WindowsHandle(WindowsHandle&& other) noexcept
      : handle_(std::exchange(other.handle_, INVALID_HANDLE_VALUE)) {}

  WindowsHandle& operator=(WindowsHandle&& other) noexcept {
    if (this != &other) {
      if (handle_ != INVALID_HANDLE_VALUE) {
        CloseHandle(handle_);
      }
      handle_ = std::exchange(other.handle_, INVALID_HANDLE_VALUE);
    }
    return *this;
  }

  HANDLE get() const { return handle_; }

  void close_noexcept() noexcept {
    if (handle_ != INVALID_HANDLE_VALUE) {
      const HANDLE handle = std::exchange(handle_, INVALID_HANDLE_VALUE);
      static_cast<void>(CloseHandle(handle));
    }
  }

  void close() {
    if (handle_ != INVALID_HANDLE_VALUE) {
      const HANDLE handle = std::exchange(handle_, INVALID_HANDLE_VALUE);
      if (!CloseHandle(handle)) {
        fail("could not close imported image temporary file");
      }
    }
  }

 private:
  HANDLE handle_;
};

WindowsHandle open_safe_directory(const std::filesystem::path& path) {
  const HANDLE handle = CreateFileW(
      path.c_str(),
      FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      nullptr,
      OPEN_EXISTING,
      FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
      nullptr);
  if (handle == INVALID_HANDLE_VALUE) {
    fail("could not open project image directory safely");
  }

  WindowsHandle directory(handle);
  BY_HANDLE_FILE_INFORMATION information{};
  if (!GetFileInformationByHandle(directory.get(), &information) ||
      (information.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
      (information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
    fail("project image directory must not be a link or reparse point");
  }
  return directory;
}

WindowsHandle ensure_safe_directory(const std::filesystem::path& path) {
  if (!CreateDirectoryW(path.c_str(), nullptr) &&
      GetLastError() != ERROR_ALREADY_EXISTS) {
    fail("could not create project image directory");
  }
  return open_safe_directory(path);
}

struct WindowsSourceSnapshot {
  DWORD volume_serial = 0;
  DWORD file_index_high = 0;
  DWORD file_index_low = 0;
  DWORD size_high = 0;
  DWORD size_low = 0;
  FILETIME creation_time{};
  FILETIME last_write_time{};
};

WindowsSourceSnapshot source_snapshot(
    const BY_HANDLE_FILE_INFORMATION& information) {
  return WindowsSourceSnapshot{
      .volume_serial = information.dwVolumeSerialNumber,
      .file_index_high = information.nFileIndexHigh,
      .file_index_low = information.nFileIndexLow,
      .size_high = information.nFileSizeHigh,
      .size_low = information.nFileSizeLow,
      .creation_time = information.ftCreationTime,
      .last_write_time = information.ftLastWriteTime,
  };
}

bool equal_file_time(const FILETIME& left, const FILETIME& right) {
  return left.dwHighDateTime == right.dwHighDateTime &&
      left.dwLowDateTime == right.dwLowDateTime;
}

WindowsHandle open_safe_source(
    const std::filesystem::path& source,
    std::uintmax_t& size,
    WindowsSourceSnapshot& snapshot) {
  const HANDLE handle = CreateFileW(
      source.c_str(),
      GENERIC_READ,
      FILE_SHARE_READ,
      nullptr,
      OPEN_EXISTING,
      FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT |
          FILE_FLAG_SEQUENTIAL_SCAN,
      nullptr);
  if (handle == INVALID_HANDLE_VALUE) {
    fail("image source could not be opened safely");
  }

  WindowsHandle file(handle);
  BY_HANDLE_FILE_INFORMATION information{};
  if (!GetFileInformationByHandle(file.get(), &information) ||
      GetFileType(file.get()) != FILE_TYPE_DISK ||
      (information.dwFileAttributes &
       (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) != 0) {
    fail("image source must be a regular non-link file");
  }

  ULARGE_INTEGER length{};
  length.HighPart = information.nFileSizeHigh;
  length.LowPart = information.nFileSizeLow;
  size = static_cast<std::uintmax_t>(length.QuadPart);
  if (size == 0 || size > kMaximumImportedImageBytes) {
    fail("image source is empty or exceeds the import size limit");
  }
  snapshot = source_snapshot(information);
  return file;
}

bool same_source_snapshot(
    const WindowsHandle& source,
    const WindowsSourceSnapshot& before) {
  BY_HANDLE_FILE_INFORMATION information{};
  if (!GetFileInformationByHandle(source.get(), &information)) {
    return false;
  }
  const WindowsSourceSnapshot after = source_snapshot(information);
  return after.volume_serial == before.volume_serial &&
      after.file_index_high == before.file_index_high &&
      after.file_index_low == before.file_index_low &&
      after.size_high == before.size_high && after.size_low == before.size_low &&
      equal_file_time(after.creation_time, before.creation_time) &&
      equal_file_time(after.last_write_time, before.last_write_time);
}

std::size_t read_header(
    const WindowsHandle& source,
    std::array<unsigned char, kMagicBytes>& header) {
  LARGE_INTEGER beginning{};
  if (!SetFilePointerEx(source.get(), beginning, nullptr, FILE_BEGIN)) {
    fail("could not inspect image source");
  }

  DWORD read = 0;
  if (!ReadFile(
          source.get(),
          header.data(),
          static_cast<DWORD>(header.size()),
          &read,
          nullptr)) {
    fail("could not inspect image source");
  }
  if (!SetFilePointerEx(source.get(), beginning, nullptr, FILE_BEGIN)) {
    fail("could not rewind image source");
  }
  return static_cast<std::size_t>(read);
}

std::filesystem::path create_temporary_file(
    const std::filesystem::path& images_directory,
    const std::string& destination,
    WindowsHandle& output) {
  std::random_device random;
  for (int attempt = 0; attempt < 128; ++attempt) {
    const auto nonce = static_cast<unsigned long long>(random()) << 32U |
        static_cast<unsigned long long>(random());
    const std::filesystem::path candidate = images_directory /
        ("." + destination + ".tmp-" + std::to_string(nonce));
    const HANDLE handle = CreateFileW(
        candidate.c_str(),
        GENERIC_WRITE,
        0,
        nullptr,
        CREATE_NEW,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH,
        nullptr);
    if (handle != INVALID_HANDLE_VALUE) {
      output = WindowsHandle(handle);
      return candidate;
    }
    if (GetLastError() != ERROR_FILE_EXISTS) {
      fail("could not create imported image temporary file");
    }
  }
  fail("could not create a unique imported image temporary file");
}

void copy_source(
    const WindowsHandle& source,
    const std::uintmax_t expected_size,
    const WindowsHandle& output,
    const std::array<unsigned char, kMagicBytes>& expected_header,
    const std::size_t expected_header_size) {
  std::array<char, kCopyBufferBytes> buffer{};
  std::array<unsigned char, kMagicBytes> copied_header{};
  std::size_t copied_header_size = 0;
  std::uintmax_t total = 0;

  while (total < expected_size) {
    const DWORD chunk = static_cast<DWORD>(std::min<std::uintmax_t>(
        expected_size - total, buffer.size()));
    DWORD read = 0;
    if (!ReadFile(source.get(), buffer.data(), chunk, &read, nullptr) ||
        read == 0) {
      fail("image source changed while it was being imported");
    }

    const std::size_t header_bytes = std::min<std::size_t>(
        read, copied_header.size() - copied_header_size);
    std::copy_n(
        reinterpret_cast<const unsigned char*>(buffer.data()),
        header_bytes,
        copied_header.begin() + copied_header_size);
    copied_header_size += header_bytes;

    std::size_t offset = 0;
    while (offset < read) {
      DWORD written = 0;
      if (!WriteFile(
              output.get(),
              buffer.data() + offset,
              read - static_cast<DWORD>(offset),
              &written,
              nullptr) ||
          written == 0) {
        fail("could not write imported image temporary file");
      }
      offset += written;
    }
    total += read;
  }

  char extra = 0;
  DWORD extra_read = 0;
  if (!ReadFile(source.get(), &extra, 1, &extra_read, nullptr) ||
      extra_read != 0 || copied_header_size != expected_header_size ||
      !std::equal(
          expected_header.begin(),
          expected_header.begin() + expected_header_size,
          copied_header.begin())) {
    fail("image source changed while it was being imported");
  }
}

#else

class PosixFile final {
 public:
  explicit PosixFile(const int descriptor = -1) : descriptor_(descriptor) {}

  ~PosixFile() {
    if (descriptor_ >= 0) {
      ::close(descriptor_);
    }
  }

  PosixFile(const PosixFile&) = delete;
  PosixFile& operator=(const PosixFile&) = delete;

  PosixFile(PosixFile&& other) noexcept
      : descriptor_(std::exchange(other.descriptor_, -1)) {}

  PosixFile& operator=(PosixFile&& other) noexcept {
    if (this != &other) {
      if (descriptor_ >= 0) {
        ::close(descriptor_);
      }
      descriptor_ = std::exchange(other.descriptor_, -1);
    }
    return *this;
  }

  int get() const { return descriptor_; }

  void close() {
    if (descriptor_ >= 0) {
      const int descriptor = std::exchange(descriptor_, -1);
      // A close interrupted by a signal leaves descriptor ownership
      // platform-dependent. Retrying could close an unrelated reused fd.
      if (::close(descriptor) != 0 && errno != EINTR) {
        fail("could not close imported image temporary file");
      }
    }
  }

 private:
  int descriptor_;
};

PosixFile open_safe_source(
    const std::filesystem::path& source,
    struct stat& status) {
  const int descriptor = ::open(
      source.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
  if (descriptor < 0) {
    fail("image source could not be opened safely");
  }

  PosixFile file(descriptor);
  if (::fstat(file.get(), &status) != 0 || !S_ISREG(status.st_mode)) {
    fail("image source must be a regular non-link file");
  }
  if (status.st_size <= 0 ||
      static_cast<std::uintmax_t>(status.st_size) >
          kMaximumImportedImageBytes) {
    fail("image source is empty or exceeds the import size limit");
  }
  return file;
}

std::size_t read_header(
    const PosixFile& source,
    std::array<unsigned char, kMagicBytes>& header) {
  std::size_t offset = 0;
  while (offset < header.size()) {
    const ssize_t read = ::pread(
        source.get(),
        header.data() + offset,
        header.size() - offset,
        static_cast<off_t>(offset));
    if (read < 0 && errno == EINTR) {
      continue;
    }
    if (read < 0) {
      fail("could not inspect image source");
    }
    if (read == 0) {
      break;
    }
    offset += static_cast<std::size_t>(read);
  }
  if (::lseek(source.get(), 0, SEEK_SET) < 0) {
    fail("could not rewind image source");
  }
  return offset;
}

PosixFile open_safe_directory(const std::filesystem::path& path) {
  const int descriptor =
      ::open(path.c_str(), O_RDONLY | O_CLOEXEC | O_DIRECTORY | O_NOFOLLOW);
  if (descriptor < 0) {
    fail("could not open project image directory safely");
  }
  return PosixFile(descriptor);
}

PosixFile ensure_safe_child_directory(
    const PosixFile& parent,
    const char* name) {
  if (::mkdirat(parent.get(), name, 0755) != 0 && errno != EEXIST) {
    fail("could not create project image directory");
  }
  const int descriptor = ::openat(
      parent.get(),
      name,
      O_RDONLY | O_CLOEXEC | O_DIRECTORY | O_NOFOLLOW);
  if (descriptor < 0) {
    fail("project image directory must not be a link");
  }
  return PosixFile(descriptor);
}

std::pair<std::string, PosixFile> create_temporary_file(
    const PosixFile& images_directory,
    const std::string& destination) {
  std::random_device random;
  for (int attempt = 0; attempt < 128; ++attempt) {
    const auto nonce = static_cast<unsigned long long>(random()) << 32U |
        static_cast<unsigned long long>(random());
    const std::string candidate =
        "." + destination + ".tmp-" + std::to_string(nonce);
    const int descriptor = ::openat(
        images_directory.get(),
        candidate.c_str(),
        O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW,
        0644);
    if (descriptor >= 0) {
      return {candidate, PosixFile(descriptor)};
    }
    if (errno != EEXIST) {
      fail("could not create imported image temporary file");
    }
  }
  fail("could not create a unique imported image temporary file");
}

void write_all(
    const PosixFile& output,
    const char* data,
    const std::size_t size) {
  std::size_t offset = 0;
  while (offset < size) {
    const ssize_t written =
        ::write(output.get(), data + offset, size - offset);
    if (written < 0 && errno == EINTR) {
      continue;
    }
    if (written <= 0) {
      fail("could not write imported image temporary file");
    }
    offset += static_cast<std::size_t>(written);
  }
}

void copy_source(
    const PosixFile& source,
    const std::uintmax_t expected_size,
    const PosixFile& output,
    const std::array<unsigned char, kMagicBytes>& expected_header,
    const std::size_t expected_header_size) {
  std::array<char, kCopyBufferBytes> buffer{};
  std::array<unsigned char, kMagicBytes> copied_header{};
  std::size_t copied_header_size = 0;
  std::uintmax_t total = 0;

  while (total < expected_size) {
    const std::size_t chunk = static_cast<std::size_t>(
        std::min<std::uintmax_t>(expected_size - total, buffer.size()));
    const ssize_t read = ::read(source.get(), buffer.data(), chunk);
    if (read < 0 && errno == EINTR) {
      continue;
    }
    if (read <= 0) {
      fail("image source changed while it was being imported");
    }

    const std::size_t read_size = static_cast<std::size_t>(read);
    const std::size_t header_bytes = std::min(
        read_size, copied_header.size() - copied_header_size);
    std::copy_n(
        reinterpret_cast<const unsigned char*>(buffer.data()),
        header_bytes,
        copied_header.begin() + copied_header_size);
    copied_header_size += header_bytes;
    write_all(output, buffer.data(), read_size);
    total += read_size;
  }

  char extra = 0;
  ssize_t extra_read = 0;
  do {
    extra_read = ::read(source.get(), &extra, 1);
  } while (extra_read < 0 && errno == EINTR);
  if (extra_read != 0 || copied_header_size != expected_header_size ||
      !std::equal(
          expected_header.begin(),
          expected_header.begin() + expected_header_size,
          copied_header.begin())) {
    fail("image source changed while it was being imported");
  }
}

bool same_source_snapshot(
    const PosixFile& source,
    const struct stat& before) {
  struct stat after {};
  return ::fstat(source.get(), &after) == 0 &&
      after.st_dev == before.st_dev && after.st_ino == before.st_ino &&
      after.st_size == before.st_size &&
      after.st_mtime == before.st_mtime &&
      after.st_ctime == before.st_ctime;
}

void publish_no_clobber(
    const PosixFile& images,
    const std::string& temporary,
    const std::string& destination) {
#ifdef __APPLE__
  if (::renameatx_np(
          images.get(),
          temporary.c_str(),
          images.get(),
          destination.c_str(),
          RENAME_EXCL) != 0) {
    if (errno == EEXIST) {
      fail("image Asset destination already exists");
    }
    fail("could not publish imported image safely");
  }
#else
#if defined(__linux__) && defined(SYS_renameat2)
  if (::syscall(
          SYS_renameat2,
          images.get(),
          temporary.c_str(),
          images.get(),
          destination.c_str(),
          RENAME_NOREPLACE) == 0) {
    return;
  }
  if (errno == EEXIST) {
    fail("image Asset destination already exists");
  }
  if (errno != ENOSYS && errno != EINVAL) {
    fail("could not publish imported image safely");
  }
#endif
  if (::linkat(
          images.get(),
          temporary.c_str(),
          images.get(),
          destination.c_str(),
          0) != 0) {
    if (errno == EEXIST) {
      fail("image Asset destination already exists");
    }
    fail("could not publish imported image safely");
  }
  // The destination name is now the committed inode. Temporary-name cleanup
  // is best-effort and must not turn a successful publication into failure.
  static_cast<void>(::unlinkat(images.get(), temporary.c_str(), 0));
#endif
}

void flush_file(const PosixFile& file) {
  while (::fsync(file.get()) != 0) {
    if (errno != EINTR) {
      fail("could not flush imported image temporary file");
    }
  }
}

void flush_directory(const PosixFile& directory) {
  while (::fsync(directory.get()) != 0) {
    if (errno == EINVAL || errno == ENOTSUP) {
      return;
    }
    if (errno != EINTR) {
      fail("could not flush project image directory");
    }
  }
}

#endif

}  // namespace

ImageAssetImportError::ImageAssetImportError(std::string message)
    : std::runtime_error(std::move(message)) {}

ImageAssetImportPlan plan_image_asset_import(
    const std::string_view source_file_path,
    const std::string_view asset_id) {
  if (source_file_path.empty() ||
      source_file_path.find('\0') != std::string_view::npos) {
    fail("image source path is invalid");
  }
  if (!is_safe_asset_id(asset_id)) {
    fail("generated image Asset ID is invalid");
  }

  const std::string original_extension =
      source_extension(source_file_path);
  const ImageKind kind = kind_for_extension(original_extension);
  return ImageAssetImportPlan{
      .relative_path = "assets/images/" + std::string(asset_id) +
          canonical_extension(kind),
      .display_name =
          source_display_name(source_file_path, original_extension),
  };
}

void copy_image_asset_no_clobber(
    const std::filesystem::path& source,
    const std::filesystem::path& project_directory,
    const ImageAssetImportPlan& plan,
    const ImageImportBeforePublishHook before_publish) {
  validate_paths(source, project_directory);

  const std::string destination = destination_filename(plan);
  const std::string destination_extension =
      lowercase_ascii(std::filesystem::path(destination).extension().string());
  const ImageKind expected_kind = kind_for_extension(destination_extension);
  const std::string expected_relative_path =
      "assets/images/" +
      std::filesystem::path(destination).stem().string() +
      canonical_extension(expected_kind);
  if (plan.relative_path != expected_relative_path ||
      !is_safe_asset_id(std::filesystem::path(destination).stem().string())) {
    fail("image destination is invalid");
  }

  std::uintmax_t source_size = 0;
  std::array<unsigned char, kMagicBytes> header{};

#ifdef _WIN32
  WindowsSourceSnapshot source_status;
  WindowsHandle source_file =
      open_safe_source(source, source_size, source_status);
  const std::size_t header_size = read_header(source_file, header);
  if (!magic_matches(expected_kind, header, header_size)) {
    fail("image contents do not match the selected file extension");
  }

  WindowsHandle root = open_safe_directory(project_directory);
  const std::filesystem::path assets_path = project_directory / "assets";
  WindowsHandle assets = ensure_safe_directory(assets_path);
  const std::filesystem::path images_path = assets_path / "images";
  WindowsHandle images = ensure_safe_directory(images_path);
  static_cast<void>(root);
  static_cast<void>(assets);
  static_cast<void>(images);

  WindowsHandle temporary_file;
  const std::filesystem::path temporary =
      create_temporary_file(images_path, destination, temporary_file);
  const std::filesystem::path target = images_path / destination;
  try {
    copy_source(
        source_file,
        source_size,
        temporary_file,
        header,
        header_size);
    if (!same_source_snapshot(source_file, source_status)) {
      fail("image source changed while it was being imported");
    }
    if (!FlushFileBuffers(temporary_file.get())) {
      fail("could not flush imported image temporary file");
    }
    temporary_file.close();

    if (before_publish != nullptr) {
      before_publish();
    }
    if (!MoveFileExW(
            temporary.c_str(), target.c_str(), MOVEFILE_WRITE_THROUGH)) {
      if (GetLastError() == ERROR_ALREADY_EXISTS ||
          GetLastError() == ERROR_FILE_EXISTS) {
        fail("image Asset destination already exists");
      }
      fail("could not publish imported image safely");
    }
  } catch (...) {
    // The temp was opened with no delete sharing. Close it without throwing
    // before cleanup, otherwise a copy/flush failure would leak the file.
    temporary_file.close_noexcept();
    DeleteFileW(temporary.c_str());
    throw;
  }
#else
  struct stat source_status {};
  PosixFile source_file = open_safe_source(source, source_status);
  source_size = static_cast<std::uintmax_t>(source_status.st_size);
  const std::size_t header_size = read_header(source_file, header);
  if (!magic_matches(expected_kind, header, header_size)) {
    fail("image contents do not match the selected file extension");
  }

  PosixFile root = open_safe_directory(project_directory);
  PosixFile assets = ensure_safe_child_directory(root, "assets");
  PosixFile images = ensure_safe_child_directory(assets, "images");
  // Persist newly-created directory entries before publishing the file within
  // them. Unsupported directory fsync is tolerated by flush_directory().
  flush_directory(root);
  flush_directory(assets);
  auto [temporary, temporary_file] =
      create_temporary_file(images, destination);
  try {
    copy_source(
        source_file,
        source_size,
        temporary_file,
        header,
        header_size);
    if (!same_source_snapshot(source_file, source_status)) {
      fail("image source changed while it was being imported");
    }
    flush_file(temporary_file);
    temporary_file.close();

    if (before_publish != nullptr) {
      before_publish();
    }
    // This is the final fallible pre-commit operation. Once it succeeds the
    // caller may safely commit its already-prepared in-memory aggregate.
    publish_no_clobber(images, temporary, destination);
    // Durability sync after publication is best-effort: reporting an error now
    // would leave a file on disk while preventing the manifest commit.
    try {
      flush_directory(images);
    } catch (...) {
    }
  } catch (...) {
    ::unlinkat(images.get(), temporary.c_str(), 0);
    throw;
  }
#endif
}

}  // namespace vnengine::backend
