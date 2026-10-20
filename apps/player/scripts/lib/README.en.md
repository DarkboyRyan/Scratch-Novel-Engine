# Player Release Libraries

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

This directory holds validation and platform rules shared by release scripts. `releaseTools.mjs` handles bundles, hashes, template ownership, artifact receipts, and release-set consistency. Other modules provide macOS app checks, fixed-argument Windows commands, and restricted signing options.

Normalize and constrain paths before accessing data. Avoid shell-command concatenation, undeclared extra files, and secret values in logs. Tests use real temporary files and ASAR/template structures; new rules should cover success, tampering, and path traversal.

## Run and verify

```bash
pnpm --dir apps/player test:release-tools
```

## Source files

- [`macosPlayerTemplate.mjs`](./macosPlayerTemplate.mjs)
- [`releaseTools.mjs`](./releaseTools.mjs)
- [`signingPolicy.mjs`](./signingPolicy.mjs)
- [`windowsPowerShellPolicy.mjs`](./windowsPowerShellPolicy.mjs)
