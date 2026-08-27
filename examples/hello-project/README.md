# Hello project

| 文件 | 格式 | 主要作用 | 关键内容 |
| --- | --- | --- | --- |
| [`project.vn.json`](./project.vn.json) | Author Project v1 JSON | 验证最早版本项目的兼容读取与保存迁移。 | 项目名、入口场景和一条旁白。 |

在编辑器中点击“打开”，然后选择同目录中的 `project.vn.json`。

这个示例用于验证项目文件 v1：打开成功后，项目名应变为“示例项目：你好”，
场景“开场”中应包含一条旁白。`assets` 已预留给后续图片、视频和音频导入。

这里的 `project.vn.json` 会继续保留为 v1 向后兼容测试文件。编辑器读取时会
在内存中补上空的场景视觉状态；首次保存后，文件会自动迁移为 v2，并为每个
场景写入 `visuals`。Project 和 Scene 的 `schemaVersion` 仍保持为 1。
