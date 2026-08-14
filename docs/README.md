# VN Engine 文档索引

## 面试准备推荐顺序

1. [技术栈与面试讲解指南](./technical-stack-interview-guide.md)：先掌握 30 秒介绍、
   总技术栈、四条调用链和常见问答。
2. [当前架构](./architecture.md)：理解 Renderer、Preload、Main、C++ 和文件系统
   的职责边界。
3. [项目文件夹与媒体资源](./project-folder-storage.md)：重点准备安全保存、路径隔离、
   图片/视频导入。
4. [人物立绘](./character-portrait-implementation.md)：重点准备 Asset/Node/PreviewState
   三层分离和人物 layer。
5. [游戏顺序预览](./game-preview-runtime.md)：重点准备纯状态机和临时运行会话。
6. [场景跳转](./scene-jump-implementation.md)：用作“一个功能如何贯穿全栈”的深挖案例。

## 当前真实技术栈

Electron 43、React 19、TypeScript 5.9、Blockly 13、Vite 5、Electron Forge 7、
C++20、CMake、nlohmann/json、Vitest 和 CTest。

`archive/` 中的文档是历史计划，其中可能出现 PixiJS、Zod、Zustand、Playwright
或 Web 导出等尚未采用的技术。面试时不要把历史计划当作当前实现。
