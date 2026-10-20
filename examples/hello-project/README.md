# Hello Project

[中文](./README.md) | [English](./README.en.md)

[返回上级](../README.md)

这是最小 Author v1 示例，包含一个入口场景和一句旁白，没有媒体资源。

在 Editor 中打开当前目录后，应看到项目“示例项目：你好”、场景“开场”和旁白“这是从 project.vn.json 读取的第一句对白。”。Reader 会在内存中补齐空视觉状态、标题页默认值和至少一页空 CG 画廊。

[`project.vn.json`](./project.vn.json) 应保持 v1。保存前先复制目录：Writer 会写为 Author v22，而 Project 和 Scene 的 `schemaVersion` 仍为 1。迁移会补齐标题上方文字 `A VN ENGINE STORY`、100% 剧情图片缩放，以及主界面和 CG 画廊的默认样式。当前格式的新示例应另建目录。

完整迁移测试在仓库根目录执行：

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R vn_engine_backend_tests --output-on-failure
```
