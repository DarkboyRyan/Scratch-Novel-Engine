# Editor 发布脚本

`release.mjs` 验证 `editor-v<version>-mac/windows` 标签并选择原生 Runner；打包完成后
检查内置 Backend 与 Web 模板，收集按平台命名的安装包、校验和、来源凭据和 Release 说明。
CLI 使用 `--mode metadata` 或 `--mode collect`，由 `editor-release.yml` 调用。

运行 `pnpm --dir apps/editor test:release-tools` 验证标签、平台、产物完整性与校验和。
完整步骤见 [Editor 发布文档](../../../docs/editor-release.md)。
