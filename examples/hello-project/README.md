# Hello Project

[返回示例项目](../README.md)

这是最小的 Author Project v1 示例，用来验证当前 C++ Reader 仍能打开最早版本的工程。
项目只有一个入口场景和一句旁白，没有媒体资源，因此适合快速确认“选择目录—读取—
内存迁移—显示剧情”的完整链路。

## 预期结果

在 Editor 中选择“打开项目”，然后选择当前 `hello-project/` 目录。打开成功后应看到：

- 项目名“示例项目：你好”；
- 入口场景“开场”；
- 旁白“这是从 project.vn.json 读取的第一句对白。”；
- 空的场景视觉状态、标题页默认值和至少一页空 CG 画廊，由 Reader 在内存中补齐。

若要点击保存，建议先复制目录。当前 Writer 会把文件直接写成 Author v20，而不是保留 v1；
Project 和 Scene 的 `schemaVersion` 仍为 1，新增的 v2–v20 字段会按兼容规则补齐，其中
标题上方文字迁移为 `A VN ENGINE STORY`。

## 文件索引

| 文件 | 格式 | 主要作用 | 关键内容 |
| --- | --- | --- | --- |
| [`project.vn.json`](./project.vn.json) | Author Project v1 JSON | 提供最早版本的兼容读取输入。 | 项目 ID、入口场景、一条 Dialogue、空 Assets |

## 验证建议

正常打开由 Editor/C++ Backend 完成。需要自动验证完整迁移矩阵时，运行：

```sh
cmake --build engine/build --parallel
ctest --test-dir engine/build -R vn_engine_backend_tests --output-on-failure
```

请继续让仓库中的 `project.vn.json` 保持 v1；新的当前格式示例应放入独立目录。
