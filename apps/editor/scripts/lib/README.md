# Editor release library

本目录保存 CLI 共享的严格校验实现。所有文件系统目标都先解析为明确路径，并拒绝链接、额外平台模板、ZIP 路径穿越、关键文件篡改和版本/架构不一致。

| 文件 | 主要导出与职责 |
| --- | --- |
| `editorReleaseTools.mjs` | `locatePackagedEditor` 定位应用；`verifyPackagedEditor` 验证 ASAR、原生后端、Web/Player 模板和签名；`archiveEditorApplication` 与 `verifyEditorArchive` 归档并回读 ZIP；`collectEditorArtifacts` 和 `verifyEditorReleaseSet` 汇总候选制品 |

发布回执除五个启动关键文件外，还记录完整应用树中每个文件、目录和受限符号链接的哈希、权限与链接目标。ZIP 验证器会逐项对账，并在原生平台临时解压后再次比较整棵树和验证签名，因此丢失 Framework 链接、追加 DLL 或“验证一个目录、归档另一个目录”的替换都不会通过门禁。
