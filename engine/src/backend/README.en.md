# JSONL Backend

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

Backend is the process boundary between Electron Main and Core. It handles strict protocol parsing, Author migration, safe media imports, and atomic saves.

## Requests and storage

Each stdin line goes to `Backend::handle`, which checks request IDs, methods, exact fields, and sessions before calling Core. Changes increment `revision`; no-op requests preserve it. stdout contains only single-line JSON responses; diagnostics go to stderr.

Undo and redo restore the entire Author aggregate. `documentRevision` follows historical states to identify save points. History is limited to 100 entries and 64 MiB. The Main-only `project.checkpoint` writes recovery snapshots without changing history or save points. See [undo and recovery](../../../docs/editor-history-and-recovery.md).

- `scene.content.replace` accepts nested drafts without hidden markers, limited to 2 MiB, 10,000 entities, and 16 control levels. CG bodies allow dialogue only. A scene is replaced only after the complete candidate project passes validation.
- `project.open` accepts a stable content snapshot read by Main. Reader supports Author v1–v22 and replaces the session only after migration and validation. Writer always emits v22. Versions v1–v20 receive 100% image scales; v1–v21 receive safe default page styles.
- `asset.import` checks extensions, magic bytes, size, and regular-file identity through the same file handle, then publishes without overwriting. Supported media: PNG/JPEG/WebP, MP4/WebM, MP3/WAV/Ogg.
- `project.save` protects existing files with a temporary file in the same directory, flush, and atomic replacement.
- `asset.rename` changes display names only. `asset.deleteMany` requires nonempty, unique IDs and commits only if all assets are unreferenced. Neither changes asset paths, and Backend does not delete physical files.

## Source

- [`main.cpp`](./main.cpp): JSONL loop.
- [`backend.cpp`](./backend.cpp): sessions and method dispatch.
- [`serialization.cpp`](./serialization.cpp): strict reading, migration, and writing.
- [`asset_import.cpp`](./asset_import.cpp), [`media_sniffer.cpp`](./media_sniffer.cpp): media identification and safe publication.
- [`atomic_file.cpp`](./atomic_file.cpp): durable atomic replacement.

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R "vn_engine_(backend|atomic_file|asset_import)_tests" --output-on-failure
```

Protocol, format, and file-rule changes need malformed-input, migration, rollback, and cross-platform path coverage.
