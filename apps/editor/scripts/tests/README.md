# Editor release tool tests

这里使用 Node 内置测试运行器验证发布工具，不需要真实签名证书，也不会启动 Electron 窗口。测试创建真实 ASAR 与 ZIP 临时制品，结束后自动清理。

| 文件 | 覆盖内容 |
| --- | --- |
| `editorReleaseTools.node-test.mjs` | internal/release 预检、ASAR 元数据、PE 架构、唯一应用定位、Editor Windows 签名描述、ZIP 全树哈希/额外文件/链接逃逸防护、macOS/Windows 双平台发布集 |

运行：

```bash
pnpm --dir apps/editor test:release-tools
```
