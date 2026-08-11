#pragma once

#include <nlohmann/json_fwd.hpp>

#include "vnengine/model.hpp"

namespace vnengine::backend {

nlohmann::json project_to_json(const Project& project);

}  // namespace vnengine::backend
