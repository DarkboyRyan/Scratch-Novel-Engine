#pragma once

#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include <nlohmann/json_fwd.hpp>

#include "vnengine/model.hpp"

namespace vnengine::backend {

inline constexpr std::string_view kProjectFileFormat = "vn-engine-project";
inline constexpr int kProjectFileVersion = 1;

struct ProjectFileDocument {
  Project project;
  std::vector<Asset> assets;

  bool operator==(const ProjectFileDocument&) const = default;
};

enum class ProjectFileErrorKind {
  invalid_document,
  unsupported_format,
};

class ProjectFileError final : public std::runtime_error {
 public:
  ProjectFileError(ProjectFileErrorKind kind, std::string message);

  ProjectFileErrorKind kind() const noexcept;

 private:
  ProjectFileErrorKind kind_;
};

// project_to_json is the renderer-facing Project snapshot and deliberately
// excludes the persistence envelope and asset manifest.
nlohmann::json project_to_json(const Project& project);

// The file representation is versioned independently from the in-memory
// model. project_file_from_json performs strict structural and invariant
// validation before returning a candidate that may replace Backend state.
nlohmann::json project_file_to_json(const ProjectFileDocument& document);
ProjectFileDocument project_file_from_json(const nlohmann::json& value);

}  // namespace vnengine::backend
