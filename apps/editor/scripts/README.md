# Editor release scripts

这里集中放置 Editor 的双平台构建验收工具。它们不负责编辑器业务逻辑，而是在 Electron Forge 完成 package 后，执行定位、签名、结构验证、原生归档和跨平台发布集汇总。

internal 构建使用 macOS ad-hoc 签名和未正式签名的 Windows 包，适合每次 CI 生成可下载 ZIP。release 构建没有无签名回退：macOS 必须通过 Developer ID、公证和 stapling，Windows 必须通过带时间戳的 Authenticode 验证。

## 标准流程

1. `verifyEditorReleasePrerequisites.mjs` 校验版本、提交和凭据。
2. Electron Forge 在对应原生 runner 上生成 Editor 应用目录。
3. release 构建调用 `signEditorBuild.mjs`，macOS 随后完成公证和 stapling。
4. `verifyEditorBuild.mjs` 验证应用、C++ 后端、Web 模板、同平台 Player 模板和签名，生成回执。
5. `archiveEditorBuild.mjs` 使用平台原生归档工具生成 ZIP，并回读关键文件哈希。
6. `collectEditorArtifacts.mjs` 生成单平台候选清单。
7. `verifyEditorReleaseSet.mjs` 要求 macOS arm64 与 Windows x64 两包同时存在，输出最终发布目录。

## 文件

| 文件 | 作用 |
| --- | --- |
| `verifyEditorReleasePrerequisites.mjs` | 区分 internal/release 并校验标签、提交和八项正式签名凭据 |
| `locateEditorBuild.mjs` | 定位唯一的 Forge 应用目录，可写入 `GITHUB_OUTPUT` |
| `signEditorBuild.mjs` | 调用 Developer ID 或 Authenticode 签名入口 |
| `verifyEditorBuild.mjs` | 严格验证平台、架构、版本、资源模板及签名并写入 JSON 回执 |
| `archiveEditorBuild.mjs` | 以 `ditto` 或受限的现代 PowerShell 生成标准 ZIP，再完整回读验证 |
| `collectEditorArtifacts.mjs` | 收集一个平台 ZIP、回执和 artifact manifest |
| `verifyEditorReleaseSet.mjs` | 汇总两个平台 ZIP，生成 `release-set.json` 和 `SHA256SUMS` |
| `lib/` | 可复用的发布契约和文件校验实现 |
| `tests/` | 不依赖真实证书的 Node 发布工具测试 |
