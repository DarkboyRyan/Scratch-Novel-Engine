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
{"id":1,"ok":true,"result":{"project":{"schemaVersion":1},"session":{"revision":0,"savedRevision":null,"isDirty":true}}}
```

`scene.add` also returns `result.sceneId`, and `dialogue.add` returns
`result.nodeId`, allowing React to select the newly-created entity without
generating IDs itself.

Supported methods:

- `ping`（仅用于直接诊断 C++ 进程，不经过 Renderer API）
- `project.create`, `project.open`, `project.ensure`, `project.get`
- `project.rename`, `project.save`（仅 Main 可以传入文件路径）
- `scene.add`, `scene.rename`, `scene.delete`
- `dialogue.add`, `dialogue.update`, `dialogue.delete`, `dialogue.move`

`dialogue.add` accepts an optional `afterNodeId`. If it is absent or does not
match a node, the new dialogue is appended. Empty speaker and text fields are
valid so the editor's `+` button can immediately create an editable node.

`project.open` accepts a Main-process-only `filePath` and reads project file
versions 1 and 2. Parsing and aggregate validation happen before the in-memory
project is replaced, so a missing, malformed, or unsupported file leaves the
current project unchanged. Version 1 Scenes have no `visuals` field and are
migrated to an empty visual state in memory. `project.save` always writes
version 2:

```json
{
  "format": "vn-engine-project",
  "fileVersion": 2,
  "project": {
    "schemaVersion": 1,
    "id": "project-id",
    "name": "My Story",
    "entrySceneId": "scene-id",
    "scenes": [
      {
        "schemaVersion": 1,
        "id": "scene-id",
        "name": "场景 1",
        "visuals": {
          "backgroundAssetId": null,
          "characters": [
            {
              "id": "visual-instance-id",
              "assetId": "sprite-asset-id",
              "slot": "center"
            }
          ]
        },
        "nodes": []
      }
    ]
  },
  "assets": [
    {
      "id": "sprite-asset-id",
      "type": "image",
      "relativePath": "assets/images/sprite-asset-id.png",
      "displayName": "Character sprite"
    }
  ]
}
```

Project and Scene `schemaVersion` remain 1; file version 2 extends only the
on-disk envelope with Scene visual state. `backgroundAssetId` is an image Asset
ID or `null`. Character `slot` is `left`, `center`, or `right`. The
`characters` array is authoritative back-to-front draw order: the first item
is furthest back and the last is foremost. The reader checks v1 and v2 field
sets strictly and validates all visual Asset references as part of the same
Project aggregate.

The current Renderer-facing `project` snapshot deliberately omits `visuals`
and `assets` until the public asset IPC and UI are introduced. The C++ Backend
still retains and round-trips both fields, so ordinary project or dialogue
edits cannot discard visual data loaded from a version 2 file.

Asset metadata supports `image`, `video`, and `audio`. Binary assets remain in
type-specific directories such as `assets/images/`; JSON stores only safe,
portable relative paths.

Every successful response includes `result.session`. `revision` advances only
when project data actually changes; `savedRevision` is `null` until a new
project is first saved; and `isDirty` is derived from those two values. Opening
a document starts at revision 0 and is clean. A new document starts at revision
0 with no saved revision and is dirty.

`project.save` writes file version 2 and requires a Main-process-only,
normalized absolute `filePath`
whose basename is exactly `project.vn.json`. The backend writes a
temporary sibling, flushes it, atomically replaces the destination, and flushes
the parent directory where the platform supports it. Only a completed save
updates `savedRevision`, so failed writes keep both the existing destination
and the editor's dirty state.

On POSIX, a rare parent-directory `fsync` error can happen after the atomic
rename has already made the complete new file visible. It is no longer safe to
roll that rename back, so the backend conservatively reports save failure and
leaves `savedRevision` unchanged; retrying save is safe.
