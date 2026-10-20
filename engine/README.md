# C++ Engine

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

`engine/` 包含 C++20 业务核心和 JSON Lines Backend。Core 管理权威项目、实体 ID、引用校验和原子编辑；Backend 负责协议、文件和媒体导入。

## 格式与边界

- Author：读取 v1–v22，迁移并校验成功后才替换当前项目；始终写出 v22。
- Runtime：Editor Main 导出 v13，并注入 Editor 默认语言；剧情执行属于共享 Runtime。
- Snapshot：Player 使用 v5 保存进度，与 Author 文件分开。

Backend 依赖 Core，Core 不依赖 JSON、Electron 或文件系统。只读模型使用 `vnengine/model.hpp`，编辑和校验使用 `vnengine/project.hpp`。Renderer 只接收隐藏存储路径的项目数据。

## 构建与验证

在仓库根目录执行。首次配置会获取 `nlohmann/json` v3.11.3。

```sh
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTING=ON
cmake --build engine/build --parallel
ctest --test-dir engine/build --output-on-failure
```

开发 Backend 位于 `engine/build/vn_engine_backend`。发布构建：

```sh
pnpm --dir apps/editor engine:stage:release
```

## 目录

- [公共头文件](./include/README.md)：领域模型和编辑 API。
- [实现](./src/README.md)：Core 业务规则与 Backend 协议、迁移和存储。
- [测试](./tests/README.md)：领域、协议、媒体导入和原子写入回归。

修改 Author 字段时，同步更新模型、Core 校验、Backend 迁移、协议测试和 Editor 导出器。
