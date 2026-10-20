# Player Source

[中文](./README.md) | [English](./README.en.md)

[返回 Player](../README.md)

桌面和 Web 宿主共用 `PlayerGateway` 与 React 界面。桌面请求经 Renderer、Preload 和 IPC 进入 Main；Web 则在浏览器中实现同一接口，并把数据存入 IndexedDB。

`main.ts` 组装桌面生命周期、窗口服务和退出刷盘，`preload.ts` 暴露白名单 API。两个宿主分别从 `renderer/index.tsx` 和 `web/index.tsx` 启动同一个 `App`。

共享模块只放类型、守卫和纯解析逻辑。宿主差异通过 Gateway 能力与结果表达；修改接口时，同步协议、IPC 校验、Preload、Gateway 和测试。系统权限留在对应宿主，内部异常与绝对路径不传给界面。

## 目录

- [`shared`](./shared/README.md)
- [`main`](./main/README.md)
- [`renderer`](./renderer/README.md)
- [`web`](./web/README.md)

## 主要文件

- [`main.ts`](./main.ts)
- [`preload.ts`](./preload.ts)
- [`renderer/index.tsx`](./renderer/index.tsx)
- [`web/index.tsx`](./web/index.tsx)
