# VN Engine C++ Core

This directory contains the editor's C++20 business core and a JSON Lines
backend process. React remains responsible for UI state; C++ owns the
authoritative project state and the rules that mutate it.

## Directory layout

```text
engine/
├── include/vnengine/
│   ├── model.hpp       # Project, Scene, and Dialogue data types
│   └── project.hpp     # ID generation and project operations
├── src/
│   ├── core/
│   │   └── project.cpp # dependency-free business rules
│   └── backend/
│       ├── backend.cpp/.hpp # protocol dispatch and in-memory state
│       ├── main.cpp
│       ├── serialization.cpp
│       └── serialization.hpp
└── tests/
    └── core/
        └── project_tests.cpp
```

Code that only reads the domain model should include `vnengine/model.hpp`.
Code that creates or changes a project should include `vnengine/project.hpp`.

Dependencies flow in one direction: `vn_engine_backend` depends on
`vn_engine_core`. The core target has no JSON dependency; `nlohmann/json` is
kept inside the backend process boundary.

## Build and test

The first configure downloads the pinned `nlohmann/json` v3.11.3 dependency.

```sh
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Debug
cmake --build engine/build
ctest --test-dir engine/build --output-on-failure
```

The development backend executable is:

```text
engine/build/vn_engine_backend
```

## JSONL protocol

Each stdin line is one request:

```json
{"id":1,"method":"project.create","params":{}}
```

Each stdout line is one response. Logs are written only to stderr:

```json
{"id":1,"ok":true,"result":{"project":{"schemaVersion":1}}}
```

`scene.add` also returns `result.sceneId`, and `dialogue.add` returns
`result.nodeId`, allowing React to select the newly-created entity without
generating IDs itself.

Supported methods:

- `ping`（仅用于直接诊断 C++ 进程，不经过 Renderer API）
- `project.create`, `project.ensure`, `project.get`
- `scene.add`, `scene.rename`, `scene.delete`
- `dialogue.add`, `dialogue.update`, `dialogue.delete`, `dialogue.move`

`dialogue.add` accepts an optional `afterNodeId`. If it is absent or does not
match a node, the new dialogue is appended. Empty speaker and text fields are
valid so the editor's `+` button can immediately create an editable node.
