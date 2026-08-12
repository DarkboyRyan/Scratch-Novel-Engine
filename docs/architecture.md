# VN Engine：当前架构

## 1. 迁移目标

编辑器继续使用 Electron + React 构建桌面界面，但项目数据和业务规则由
C++ 负责。这里的“后端”不是远程网站服务器，而是由 Electron Main 启动的
本地 C++ 进程。

```text
React UI
  ↓ window.vnEngine（窄接口）
Preload
  ↓ Electron IPC
Electron Main
  ↓ stdin/stdout JSON Lines
vn_engine_backend
  ↓
C++ Project Core
```

这种结构让编辑器界面仍然可以快速迭代，同时让剧情数据、文件保存、运行时和
未来的导出工具共享同一套 C++ 核心。

## 2. 每一层负责什么

### React Renderer

React 只负责当前窗口里的交互状态：

- 当前选中的场景和对白
- 输入框里尚未提交的草稿
- 实时预览
- 删除确认框
- 按钮禁用、加载中和错误提示

React 不再生成项目实体 ID，也不再直接修改 `project.scenes` 或
`scene.nodes`。

### Preload

Preload 使用 `contextBridge` 暴露明确的业务接口，例如：

```ts
window.vnEngine.addScene()
window.vnEngine.addDialogue(sceneId, afterNodeId)
window.vnEngine.updateDialogue(sceneId, nodeId, speaker, text)
```

Renderer 看不到 `ipcRenderer`、Node 文件系统和子进程 API，避免任意网页内容
获得桌面权限。

### Electron Main

Electron Main 负责：

- 创建窗口
- 校验 Renderer 发来的命令
- 启动和关闭 `vn_engine_backend`
- 为每个请求分配 ID
- 管理超时、进程退出和错误
- 把 C++ 返回的数据传回 Renderer

它是系统桥接层，不决定场景应该如何删除或对白应该插入到哪里。

### C++ Core

C++ Core 是项目数据和规则的唯一权威来源：

- `Project / Scene / Dialogue` 数据模型
- UUID v4 生成
- 场景新增、重命名和删除
- 删除入口场景后的入口替换规则
- 对白新增、更新、删除和移动
- 在当前对白后插入空对白
- 对白规范化和项目不变量检查

以后保存、打开、Undo/Redo、剧情运行时和导出也应该继续放在这一层。

## 3. 为什么 C++ 返回完整 Project 快照

每次修改成功后，C++ 返回：

```json
{
  "id": 3,
  "ok": true,
  "result": {
    "project": {},
    "sceneId": "可选的新场景 ID",
    "nodeId": "可选的新对白 ID"
  }
}
```

React 直接用新的 `project` 替换旧快照。这样不会出现“React 认为删除成功，
但 C++ 因为规则拒绝删除”的双重状态问题。`sceneId` 和 `nodeId` 用来让 UI
自动选中由 C++ 创建的新实体。

命令现在是异步的，所以界面在请求期间会暂时禁用修改按钮，并显示
“C++ 处理中”。

## 4. 空对白与已提交对白

点击工具栏“对白 +”时，C++ 允许创建 speaker/text 都为空的占位节点。这是
编辑器草稿，不代表它已经可以导出。

通过表单提交时，C++ 会执行最终规范化：

- 文本去掉首尾空白
- 空文本被拒绝
- 角色名去掉首尾空白
- 空角色名变为“旁白”

React 也做一次空文本检查，只是为了立即提示；最终决定仍由 C++ 作出。

## 5. 目录结构

```text
engine/
├── include/vnengine/
│   ├── model.hpp
│   └── project.hpp
├── src/
│   ├── core/project.cpp
│   └── backend/
│       ├── backend.cpp/.hpp
│       ├── main.cpp
│       └── serialization.cpp/.hpp
└── tests/core/project_tests.cpp

apps/editor/src/
├── main.ts                    # Electron 生命周期入口
├── preload.ts                 # contextBridge 业务 API
├── main/
│   ├── createEditorWindow.ts
│   ├── backend/
│   └── ipc/
├── renderer/
│   ├── index.tsx
│   ├── App.tsx
│   ├── components/            # 两种编辑模式共享的 UI
│   ├── features/form-editor/  # 当前表单编辑模式
│   ├── hooks/useEngineProject.ts
│   └── styles/
└── shared/
    ├── engineProtocol.ts
    ├── projectTypes.ts
    └── global.d.ts
```

`vn_engine_core` 不依赖 Electron，也不依赖 JSON。`nlohmann/json` 只存在于
进程通信边界，因此未来可以把 Core 用在命令行工具、原生 Player 或 WASM。

TypeScript 的依赖方向固定为 `shared ← main / preload / renderer`。`shared` 不能
导入 React、Electron 或 Node；Renderer 也不能导入 Main 和 Preload 的实现。

## 6. JSON Lines 协议

Electron 每行发送一个 JSON 请求：

```json
{"id":1,"method":"scene.add","params":{}}
```

C++ 每行返回一个 JSON 响应：

```json
{"id":1,"ok":true,"result":{"project":{},"sceneId":"..."}}
```

请求 ID 让 Electron 能把响应交还给正确的 Promise。C++ 的 stdout 只能写协议，
普通日志必须写到 stderr，否则会导致 JSON 解析失败。

## 7. 常用命令

在仓库根目录运行：

```sh
fnm exec --using=24 pnpm --dir apps/editor start
```

`start` 会先配置并编译 C++ Debug 后端，再启动 Electron。

运行全部 C++ 核心和 JSONL 协议测试：

```sh
fnm exec --using=24 pnpm --dir apps/editor test
```

只做 TypeScript 检查：

```sh
fnm exec --using=24 pnpm --dir apps/editor typecheck
fnm exec --using=24 pnpm --dir apps/editor lint
```

生成正式 Electron 应用：

```sh
fnm exec --using=24 pnpm --dir apps/editor package
```

Release C++ 后端会先被安装到 `engine/stage/backend`，Forge 再把整个目录复制到
应用的 `Resources/backend`。可执行文件不能放在 `app.asar` 里面。

## 8. TypeScript 边界

原来的 `projectReducer`、`sceneReducer`、TypeScript factory 以及对应测试已经
删除。Renderer 只保留 `ProjectDocument / SceneDocument / DialogueNode` DTO，
用于描述 C++ 返回的 JSON 形状；这些类型不生成 ID，也不包含数据修改规则。

当前项目数据的创建、校验和修改只有一份实现，全部位于 C++ Core。

## 9. 图形化编辑阶段

“表单编辑 / 图形化编辑”双模式骨架已经建立。`App` 持有唯一的
`useEngineProject`，因此切换界面不会复制 C++ Project，也不会丢失表单草稿。

接下来的纵向顺序是：

1. 在现有 `features/block-editor/` 中接入 Blockly 工作区。
2. 先打通一个对白积木：拖入积木、C++ 创建节点、实时预览、切回表单仍可编辑。
3. 扩展人物与通用剧情节点后，再加入背景、跳转、选择支和条件积木。
4. 在复杂分支之前完成项目保存/打开；积木布局数据与游戏项目数据分开保存。
