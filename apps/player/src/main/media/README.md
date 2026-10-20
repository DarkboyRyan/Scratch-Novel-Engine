# Player Media

[中文](./README.md) | [English](./README.en.md)

[返回 Player Main](../README.md)

媒体模块通过受控的 `vn-game-asset://` URL 向 Renderer 提供当前游戏的图片、音频和视频，隐藏磁盘路径。URL 绑定运行包代次和随机资源令牌。

请求会校验协议、类别、代次、令牌与方法，再通过安全文件接口核对路径、文件快照、大小、MIME 和魔数。音视频支持单段字节范围，图片返回完整内容。切换游戏、关闭窗口或销毁服务会终止活动流并使旧 URL 失效。

新增格式需同步共享媒体契约、魔数策略、加载器和测试，不能只依赖扩展名或浏览器 MIME。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerMediaPolicy.test.ts \
  tests/unit/playerMediaService.test.ts
```

## 主要文件

- [`PlayerMediaService.ts`](./PlayerMediaService.ts)
- [`mediaPolicy.ts`](./mediaPolicy.ts)
- [`mediaRange.ts`](./mediaRange.ts)
