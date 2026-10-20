# Player Release Libraries

[中文](./README.md) | [English](./README.en.md)

[返回 Player Scripts](../README.md)

本目录集中维护发布脚本共用的校验与平台规则。`releaseTools.mjs` 处理运行包、哈希、模板所有权、制品收据和发布集一致性；其余模块封装 macOS 应用校验、Windows 固定参数调用和受限签名选项。

函数应先规范化并约束路径，再读写数据。不要拼接 shell 命令、容忍未声明的额外文件或输出秘密值。测试使用真实临时文件及 ASAR/模板结构，新增规则需覆盖成功、篡改和路径逃逸。

## 验证与运行

```bash
pnpm --dir apps/player test:release-tools
```

## 主要文件

- [`macosPlayerTemplate.mjs`](./macosPlayerTemplate.mjs)
- [`releaseTools.mjs`](./releaseTools.mjs)
- [`signingPolicy.mjs`](./signingPolicy.mjs)
- [`windowsPowerShellPolicy.mjs`](./windowsPowerShellPolicy.mjs)
