# 游戏顺序预览实现技术栈

> 总体技术选型和面试问答见
> [技术栈与面试讲解指南](./technical-stack-interview-guide.md)。

## 目标

在图片资源条下方、中央预览舞台上方提供一条独立控制栏。控制栏中央是一个正方形播放按钮，不遮挡背景画面。点击后提交当前编辑草稿，读取 C++ 最新 Project 快照，并从项目入口场景开始正式游戏预览。

运行规则：

- 背景节点自动执行，不消耗玩家点击。
- 人物立绘节点自动执行，不消耗玩家点击。
- 遇到对白节点后显示对白并暂停。
- 玩家在游戏画面点击鼠标，继续执行到下一条对白。
- 执行到场景跳转节点时进入目标场景，并继续自动扫描到下一条对白。
- 到达场景末尾且没有跳转节点时显示“预览结束”，绝不根据 Scene 数组顺序隐式跳转。

## 技术栈

| 技术 | 用途 | 为什么这样选 |
| --- | --- | --- |
| React 19 | 预览组件、会话 Hook 和输入状态 | 与编辑器 UI 共用组件和生命周期 |
| TypeScript | 判别联合、纯状态机、`Map`/`Set` | 节点缩窄明确，输入输出容易单测 |
| HTML/CSS | `VisualStage` 的背景、人物和对白分层 | 当前 2D 静态画面无需引入 Canvas/Pixi |
| Electron | 复用 `vn-asset://` 图片能力 URL | 预览不需要新增本机路径接口 |
| C++20 | 提供最新权威 Project 快照 | 预览只读，不在 Renderer 复制业务数据 |
| Vitest | reducer、跳转、循环与输入规则测试 | 纯函数不需要启动整个 Electron 即可验证 |

面试时可以解释：当前预览是编辑器内的只读功能，所以先用 TypeScript 纯状态机
实现；未来做独立 Player、变量和存档时，再把同一运行语义迁移到 C++ Runtime。

## 核心边界

```text
C++ Project（唯一剧情真相）
  → Renderer 获取只读快照
  → previewRuntime 逐节点归约
  → GamePreviewRuntime（一次临时播放会话）
  → VisualStage（背景 / 立绘 / 对白）
```

预览状态不是项目数据。退出预览后直接销毁，不写 C++、不改变 revision，也不改变编辑器当前选中节点。

## 状态机

```ts
type GamePreviewRuntime = {
  status: 'playing' | 'finished' | 'runtimeError';
  sceneId: string;
  nextNodeIndex: number;
  backgroundAssetId: string | null;
  characters: TimelineCharacterState[];
  dialogue: DialogueNode | null;
  errorMessage?: string;
};
```

`nextNodeIndex` 永远指向下一条尚未执行的节点。

启动和每次点击都调用同一个 `advanceGamePreview`：

1. 从 `nextNodeIndex` 开始扫描。
2. 背景节点修改当前背景后继续扫描。
3. 立绘节点设置、替换或清除对应 layer 后继续扫描。
4. 场景跳转节点切换 `sceneId`、把 index 设为 0、清空人物并载入目标场景初始背景。
5. 使用 `Set<sceneId:index>` 检测自动节点形成的无对白循环。
6. 遇到对白节点时保存对白，把 index 移到其后，然后返回等待玩家。
7. 扫描到结尾且没有跳转时返回 `finished`。

## 组件结构

```text
renderer/features/game-preview/
├── previewRuntime.ts     # 无 React/IPC 的纯状态机
├── useGamePreview.ts     # 会话 start/advance/exit
└── GamePreview.tsx       # 全窗口播放界面和输入处理

renderer/components/
├── VisualStage.tsx       # 表单预览和游戏预览共享的视觉舞台
└── PreviewPanel.tsx      # 编辑器容器与方形播放按钮
```

`VisualStage` 的固定层次：

```text
背景 z=0
人物 z=10+layer
对白 z=30
播放/退出控件 z=40+
```

## 启动事务

播放按钮不能直接使用点击瞬间的旧 React Project：

```text
点击播放
  → prepareCurrentEdits()
  → 等待表单或 Blockly 草稿提交
  → window.vnEngine.getProject()
  → Main 校验并返回最新权威快照
  → 创建 GamePreview 会话
```

任何草稿提交失败都会留在编辑器，不启动预览。

## 输入规则

- 舞台 `pointerup`：进入下一条对白。
- `Space` / `Enter`：进入下一条对白。
- 忽略键盘长按的 `event.repeat`。
- `Escape` 或“退出预览”按钮：退出。
- 控制按钮阻止事件冒泡，不能同时触发下一条对白。
- 预览结束后点击不会重新开始，用户应退出后再次点击播放按钮。

## 当前版本不做

- 逐字显示和“第一次点击补全文字”。
- 自动播放计时。
- 选项、变量和条件分支。
- 游戏存档/读档。
- 把运行状态写入 C++。

当选择分支和变量加入后，应把同样的 reducer 语义迁移到 C++ Runtime；React 只负责发送玩家选择和渲染 C++ 返回的运行快照。

## 验收

1. 播放按钮位于图片资源条下方、中央预览舞台上方，是正方形按钮和居中的三角播放图标，不遮挡画面。
2. 点击播放会先提交当前表单草稿。
3. 从 `entrySceneId` 开始，而不是当前编辑场景或 scenes 数组第一项。
4. 开头连续背景/立绘自动执行并停在第一条对白。
5. 每次点击只前进到下一条对白。
6. 两句对白之间的背景和立绘变化在下一句出现前生效。
7. 同层人物替换、null 清除、不同层共存正确。
8. 空场景直接显示预览结束。
9. 跳转节点进入目标场景；没有跳转时不会自动进入下一个 Scene。
10. 无对白跳转循环返回明确运行错误，不让 UI 卡死。
11. `Escape` 与退出按钮可返回编辑器。
12. 预览不改变 Project、revision、编辑选择或磁盘文件。
13. 未保存项目和临时导入图片同样可预览。
14. TypeScript、ESLint、Vitest、CTest 和生产打包通过。
