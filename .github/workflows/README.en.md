# GitHub Actions workflows

[中文](./README.md) | **English**

These workflows run cross-platform checks, build standalone games, and publish applications.

| Workflow | Purpose |
| --- | --- |
| [editor-release.yml](./editor-release.yml) | Build Editor from `editor-v*-mac` / `editor-v*-windows` tags, verify resources, and create draft prereleases; also supports manual builds |
| [player-ci.yml](./player-ci.yml) | Check Runtime, Player, Editor, and C++ on macOS, Windows, and Linux for PRs, main pushes, or manual runs |
| [player-game-build.yml](./player-game-build.yml) | Reusable workflow for trusted callers: validate a `.vngame` bundle, embed it in Player, and build a standalone game |
| [player-release.yml](./player-release.yml) | Sign, notarize, and publish Player from `player-v*` tags in a protected environment |

Bundle and artifact validation uses the [Player scripts](../../apps/player/scripts/README.en.md). When script interfaces change, update workflow arguments and environment variables as needed.

## Changes and validation

- Grant only the permissions needed and pin external Actions to full commit SHAs.
- Validate inputs through repository scripts before using them in shells, paths, or application metadata.
- Fail official releases if signing, notarization, or GPG materials are missing. Keep temporary certificates, keychains, and bundles in the runner temporary directory.
- Run the relevant local checks, then verify all three CI platforms. Validate release changes through manual builds or candidate rehearsals.

[Automation guide (Chinese)](../AUTOMATION.md) · [Editor release steps (Chinese)](../../docs/editor-release.md)
