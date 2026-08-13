# VN Engine C++ Core

This directory contains the editor's C++20 business core and a JSON Lines
backend process. React remains responsible for UI state; C++ owns the
authoritative project state and the rules that mutate it.

## Directory layout

```text
engine/
├── include/vnengine/
│   ├── model.hpp       # Project, Scene, Asset, and timeline node data types
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
{"id":1,"ok":true,"result":{"project":{"schemaVersion":1},"assets":[],"session":{"revision":0,"savedRevision":null,"isDirty":true}}}
```

`scene.add` also returns `result.sceneId`; `dialogue.add` and
`background.add` and `character.add` return `result.nodeId`, allowing React to select the
newly-created entity without generating IDs itself.

Supported methods:

- `ping`（仅用于直接诊断 C++ 进程，不经过 Renderer API）
- `project.create`, `project.open`, `project.ensure`, `project.get`
- `project.rename`, `project.save`（仅 Main 可以传入文件路径）
- `asset.import`（仅 Main 可以传入源图片和项目文件路径）
- `scene.add`, `scene.rename`, `scene.delete`, `scene.setBackground`
- `dialogue.add`, `dialogue.update`, `dialogue.delete`, `dialogue.move`
- `background.add`, `background.update`, `background.delete`,
  `background.reorder`
- `character.add`, `character.update`
- `timeline.deleteMany`, `timeline.reorder`, `timeline.reorderMany`

`dialogue.add` accepts optional `afterNodeId`/`beforeNodeId` placement anchors.
Anchors may be any timeline node, so dialogues and background changes can be
interleaved. Empty speaker and text fields are valid so the editor's `+`
button can immediately create an editable node.

`project.open` accepts a Main-process-only `filePath` and reads project file
versions 1 through 6. Parsing and aggregate validation happen before the in-memory
project is replaced, so a missing, malformed, or unsupported file leaves the
current project unchanged. Version 1 Scenes have no `visuals` field and are
migrated to an empty visual state in memory. Versions 1 and 2 contain only
Dialogue nodes; they migrate to the unified in-memory timeline. `project.save`
always writes version 6:

```json
{
  "format": "vn-engine-project",
  "fileVersion": 6,
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
        "nodes": [
          {
            "id": "dialogue-id",
            "type": "dialogue",
            "speaker": "Alice",
            "text": "Hello"
          },
          {
            "id": "background-node-id",
            "type": "background",
            "assetId": null
          },
          {
            "id": "character-node-id",
            "type": "character",
            "assetId": "sprite-asset-id",
            "slot": "center",
            "layer": 1
          },
          {
            "id": "scene-jump-node-id",
            "type": "sceneJump",
            "targetSceneId": "another-scene-id"
          }
        ]
      },
      {
        "schemaVersion": 1,
        "id": "another-scene-id",
        "name": "场景 2",
        "visuals": {
          "backgroundAssetId": null,
          "characters": []
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

Project and Scene `schemaVersion` remain 1. File version 2 added Scene visual
state; file version 3 added discriminated background nodes to the ordered Scene
timeline; file version 4 allows a background node's `assetId` to be `null`,
which explicitly clears the active background. File version 5 adds character
timeline nodes with nullable Asset IDs, position slots, and layers 1 through
10. File version 6 adds explicit Scene jump nodes. `visuals.backgroundAssetId`
remains the initial background before the first background node. Reaching a
background node changes or clears the active image until the next background
node. Character `slot` is `left`, `center`, or `right`. The
`characters` array is authoritative back-to-front draw order: the first item
is furthest back and the last is foremost. The reader checks v1 and v2 field
sets strictly and validates all visual Asset references as part of the same
Project aggregate. The v3 reader checks every background node reference
resolves to an image Asset. Version 4 applies the same check to non-null
background references and preserves array order exactly.

`sceneJump.add` inserts an explicit jump into the mixed timeline, and
`sceneJump.update` changes its target. A jump must target another existing
Scene. Deleting a referenced target returns `scene_in_use`; reaching the end of
a Scene without a jump ends playback instead of implicitly selecting the next
Scene in the Project array.

The Renderer-facing Scene projection exposes `backgroundAssetId` directly,
but continues to hide the rest of the persisted `visuals` object until those
editing features are implemented. Every successful response separately
returns a path-free `assets` array whose items contain only `id`, `type`, and
`displayName`. Storage paths remain private to C++/Electron Main and the
project manifest. The Renderer projection includes dialogue, background,
character, and Scene jump timeline nodes. The C++ Backend retains and
round-trips the full aggregate,
so ordinary project or dialogue edits cannot discard visual data loaded from
older files.

`background.add` creates an independent, initially empty timeline command with
an optional `afterNodeId`/`beforeNodeId` anchor. `background.update` assigns an
image Asset ID or `null` to clear it. `background.update`,
`background.delete`, and `background.reorder` operate only on background nodes.
`character.add` creates an empty center-positioned node on layer 1;
`character.update` atomically sets its nullable image, slot, and layer. A later
node replaces the portrait on the same layer, while a null Asset ID clears that
layer. For Blockly mixed selections, the `timeline.*` commands accept dialogue,
background, and character IDs together. Multi-node reordering ignores payload order and
preserves the selected nodes' authoritative Scene order. All IDs and anchors
are validated before mutation, so an invalid batch leaves the timeline intact.

`scene.setBackground` accepts a Scene ID and either an image Asset ID or
`null` to clear the background:

```json
{
  "id": 2,
  "method": "scene.setBackground",
  "params": {"sceneId": "scene-id", "assetId": "image-asset-id"}
}
```

The command resolves both IDs and checks the Asset type before changing the
Scene. This static value is the compatible initial background; timeline nodes
may override it later. A missing Scene, missing Asset, or non-image Asset fails without
changing state. Reassigning the current value succeeds without advancing the
revision. The next ordinary `project.save` persists the selection in the v6
`visuals.backgroundAssetId` field.

Asset metadata supports `image`, `video`, and `audio`. Binary assets remain in
type-specific directories such as `assets/images/`; JSON stores only safe,
portable relative paths.

`asset.import` currently accepts PNG, JPEG, and WebP. Electron Main supplies a
normalized absolute `sourceFilePath` selected by the native dialog and the
active normalized `projectFilePath`. C++ opens the source without following its
final symlink/reparse point, verifies a regular file, a 128 MiB size limit, and
matching extension and magic bytes on the same handle. It streams the source to
a flushed temporary file below `assets/images/` and publishes without replacing
an existing destination. The original source is never changed. A successful
import returns `assetId`, appends the in-memory manifest, advances `revision`,
and makes the document dirty. Electron Main also supports imports before the
project has a user-selected location by creating a private per-window working
directory. The ordinary save command later publishes its assets and manifest
under a user-selected `name.vn.json`; the C++ backend still sees only its
private fixed working name `project.vn.json`.

Every successful response includes `result.session`. `revision` advances only
when project data actually changes; `savedRevision` is `null` until a new
project is first saved; and `isDirty` is derived from those two values. Opening
a document starts at revision 0 and is clean. A new document starts at revision
0 with no saved revision and is dirty.

`project.save` writes file version 6 and requires a Main-process-only,
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
