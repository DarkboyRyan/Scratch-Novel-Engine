# 领域 API

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

- [`model.hpp`](./model.hpp)：项目、场景、资源、CG 和时间线节点，包括 `ProjectAggregate`、`SceneNode` 和人物特效。
- [`project.hpp`](./project.hpp)：`IdGenerator`、创建、查询、校验和原子编辑命令。

变更通过命令完成：先检查目标、资源、锚点和控制范围，再一次提交；预期失败通过结果枚举返回。

If/Else、Repeat 和 CG 使用配对标记。人物 `show` 占位与 `clear` 各有约束；剧情背景和立绘缩放为 10–300 的整数，空背景与 `clear` 必须为 100。CG 画廊每页恰好九个槽，资源引用在整个项目范围内校验。

其他格式约束：

- 标题上方文字默认 `A VN ENGINE STORY`，空字符串表示隐藏；不得有首尾 ASCII 空白或 NUL，最多 256 个 UTF-8 字节。
- 人物 `show + assetId:null` 可用于编辑占位，但导出必须拒绝；`clear` 的资源、精确位置和特效都必须为空。
- CG 画廊至少一页，每页九个可空图片槽；非空资源 ID 在整个画廊内不得重复。剧情 CG 只包含对白，入场等待为 0–60 秒。
- 页面样式只包含固定枚举、受限整数和规范 `#RRGGBB` 颜色，不保存 CSS、JS 或 URL。变量和控制条件使用受限逻辑 AST，不执行任意脚本。

新增节点时，同步更新模型、查询、命令结果、控制范围和聚合校验，再补 Backend 映射、迁移与完整 CTest。
