# Domain API

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

- [`model.hpp`](./model.hpp): projects, scenes, assets, CG, and timeline nodes, including `ProjectAggregate`, `SceneNode`, and character effects.
- [`project.hpp`](./project.hpp): `IdGenerator` and commands for creation, queries, validation, and atomic edits.

Apply changes through commands: validate targets, assets, anchors, and control ranges before committing. Expected failures are returned as result enums.

If/Else, Repeat, and CG use paired markers. Character `show` placeholders and `clear` commands have distinct constraints. Story backgrounds and portraits use integer scales from 10 to 300; empty backgrounds and `clear` require 100. Each gallery page has exactly nine slots, and asset references are validated across the project.

Other format constraints:

- The title eyebrow defaults to `A VN ENGINE STORY`; an empty string hides it. It must have no leading/trailing ASCII whitespace or NUL and must fit within 256 UTF-8 bytes.
- Character `show + assetId:null` is valid as an editing placeholder but must be rejected on export. For `clear`, the asset, exact position, and effect must all be empty.
- The CG gallery has at least one page, with nine nullable image slots per page. Non-null asset IDs must be unique across the entire gallery. Story CG bodies contain dialogue only, with a lead-in from 0 to 60 seconds.
- Page styles contain only fixed enums, bounded integers, and canonical `#RRGGBB` colors, never CSS, JS, or URLs. Variables and conditions use a restricted logic AST without arbitrary script execution.

New nodes require matching model, query, command result, control range, and aggregate validation changes, followed by Backend mappings, migrations, and the full CTest suite.
