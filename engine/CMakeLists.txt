cmake_minimum_required(VERSION 3.20)

project(vn_engine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

# JSON is only used by the process boundary. The business core below remains
# independent from this dependency and can be reused by another frontend.
FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(nlohmann_json)

add_library(vn_engine_core
  src/core/project.cpp
)

target_include_directories(vn_engine_core
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(vn_engine_core PUBLIC cxx_std_20)

add_executable(vn_engine_backend
  src/backend/backend.cpp
  src/backend/main.cpp
  src/backend/serialization.cpp
)

target_link_libraries(vn_engine_backend
  PRIVATE
    vn_engine_core
    nlohmann_json::nlohmann_json
)

# `cmake --install` stages the standalone process for Electron Forge. Keeping
# it outside app.asar is required because an OS cannot execute a file in ASAR.
install(TARGETS vn_engine_backend RUNTIME DESTINATION .)

if(CMAKE_CXX_COMPILER_ID MATCHES "AppleClang|Clang|GNU")
  target_compile_options(vn_engine_core PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(vn_engine_backend PRIVATE -Wall -Wextra -Wpedantic)
elseif(MSVC)
  target_compile_options(vn_engine_core PRIVATE /W4 /permissive-)
  target_compile_options(vn_engine_backend PRIVATE /W4 /permissive-)
endif()

include(CTest)

if(BUILD_TESTING)
  add_executable(vn_engine_core_tests
    tests/core/project_tests.cpp
  )

  target_link_libraries(vn_engine_core_tests PRIVATE vn_engine_core)

  if(CMAKE_CXX_COMPILER_ID MATCHES "AppleClang|Clang|GNU")
    target_compile_options(vn_engine_core_tests PRIVATE -Wall -Wextra -Wpedantic)
  elseif(MSVC)
    target_compile_options(vn_engine_core_tests PRIVATE /W4 /permissive-)
  endif()

  add_test(NAME vn_engine_core_tests COMMAND vn_engine_core_tests)
endif()
