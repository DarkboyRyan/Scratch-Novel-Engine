<!-- 文件职责：记录 Editor 正式预览状态机；关键内容：输入、媒体、选择、跳转和会话生命周期。 -->

# 游戏顺序预览实现技术栈

> 总体技术选型和面试问答见
> [技术栈与面试讲解指南](./technical-stack-interview-guide.md)。

## 目标

在图片资源条下方、中央预览舞台上方提供一条独立控制栏。控制栏中央是一个正方形播放按钮，不遮挡背景画面。普通剧情场景点击后会提交当前编辑草稿、读取 C++ 最新 Project 快照，并从当前选中场景的开头开始预览；它不会先经过 Player 主界面，也不会临时改写项目的 `entrySceneId`。选择软件托管的主界面时，播放按钮改为预览完整标题页；独立的 `startScreen.title`、标题页背景、循环音乐和“开始游戏 / 读取游戏 / CG画廊 / 选项 / 退出游戏”与正式 Player 共用同一个 `TitleScreen` 组件，点击“开始游戏”后才从 `entrySceneId` 进入剧情。Editor 中的“读取游戏”只显示预览说明，只有正式 Player 才访问本地存档。

运行规则：

- 背景节点自动执行，不消耗玩家点击。
- 人物立绘节点自动执行，不消耗玩家点击。
- BGM 节点自动切换/停止循环音乐，不消耗玩家点击。
- 变量 Set/Change 自动执行；If/Else 只执行条件命中的分支，Repeat 按固定次数执行内部剧情。
- 空视频节点自动跳过；绑定视频的节点阻塞播放，ended 或按 Enter 后继续。
- 空选项节点自动跳过；存在选项时显示居中选择框并等待玩家点击。
- 遇到对白节点后显示对白并暂停。
- 对白若绑定语音，会从头播放一次；推进时停止旧语音。
- 玩家在游戏画面点击鼠标，继续执行到下一条对白。
- 执行到场景跳转节点时进入目标场景，并继续自动扫描到下一条对白。
- 玩家选择后进入该选项的目标场景；目标背景和人物重置，BGM 延续。
- 到达场景末尾且没有跳转节点时显示“预览结束”，绝不根据 Scene 数组顺序隐式跳转。
- 正式 Player 仍先显示主界面，点击“开始游戏”后从 `entrySceneId` 进入剧情；Editor 的普通场景预览不改变这一正式入口语义，主界面整体预览则刻意复现它。
- 主界面标题、五个纵向按钮与间距作为一个整体，按实际 Player 窗口或 Editor 预览容器的可用宽高等比缩放；内嵌 16:9 预览不会依赖浏览器窗口的媒体查询，因此在窄栏和低高度下也不会裁掉按钮。

## 技术栈

| 技术 | 用途 | 为什么这样选 |
| --- | --- | --- |
| React 19 | 预览组件、会话 Hook 和输入状态 | 与编辑器 UI 共用组件和生命周期 |
| TypeScript | 判别联合、纯状态机、`Map`/`Set` 与显式 loop stack | 节点缩窄明确，逻辑和输入输出容易单测 |
| HTML/CSS | `VisualStage` 的背景、人物、对白、选项和视频分层 | 当前画面无需引入 Canvas/Pixi |
| ResizeObserver + CSS transform | 测量标题菜单与实际容器，并从中心等比缩放整张菜单卡 | 同时适配 Player、全屏预览和表单内嵌预览，避免固定像素高度裁切 |
| Electron | 复用 `vn-asset://` 图片/音频/视频能力 URL与 Range | 预览不需要新增本机路径接口 |
| HTMLAudioElement | 独立 BGM/voice 播放通道 | BGM 循环和对白语音生命周期互不干扰 |
| HTMLVideoElement | 阻塞式 MP4/WebM 播放 | 无进度条的沉浸式播放，ended、Enter 跳过、错误和清理生命周期明确 |
| C++20 | 提供最新权威 Project 快照 | 预览只读，不在 Renderer 复制业务数据 |
| Vitest | reducer、跳转、选项、循环与输入规则测试 | 纯函数不需要启动整个 Electron 即可验证 |

面试时可以解释：当前预览是编辑器内的只读功能，使用已抽离到
`@vnengine/runtime` 的纯 TypeScript reducer；Editor、桌面 Player 与 Web Player
共用条件、循环、变量和错误语义。只有未来需要任意脚本或跨语言确定性回放时，才需要
评估把同一运行协议迁到 C++/WASM Runtime。

## 核心边界

```text
C++ Project（唯一剧情真相）
  → Renderer 获取只读快照
  → @vnengine/runtime 预编译控制流并逐节点归约
  → GamePreviewRuntime（一次临时播放会话）
  → VisualStage（背景 / 立绘 / 对白 / 选项 / 视频）
```

预览状态不是项目数据。退出预览后直接销毁，不写 C++、不改变 revision，也不改变编辑器当前选中节点。

## 状态机

```ts
type GamePreviewRuntime = {
  status:
    | 'playing'
    | 'playingVideo'
    | 'choosing'
    | 'finished'
    | 'runtimeError';
  sceneId: string;
  nextNodeIndex: number;
  backgroundAssetId: string | null;
  bgmAssetId: string | null;
  bgmSequence: number;
  dialogueSequence: number;
  videoAssetId: string | null;
  videoSequence: number;
  characters: TimelineCharacterState[];
  dialogue: DialogueNode | null;
  choices: ChoiceOption[];
  variables: Record<string, boolean | number | string>;
  loopStack: RuntimeLoopFrame[];
  errorCode?: RuntimeErrorCode;
  errorMessage?: string;
};
```

`nextNodeIndex` 永远指向下一条尚未执行的节点。

启动和每次点击都调用同一个 `advanceGamePreview`：

1. 从 `nextNodeIndex` 开始扫描。
2. 背景节点修改当前背景后继续扫描。
3. 立绘节点设置、替换或清除对应 layer 后继续扫描。
4. BGM 节点更新 BGM ID 和播放序号，之后继续扫描。
5. VariableSet 写入严格值；VariableChange 从现值或默认 `0` 增减，非数字或溢出进入错误态。
6. LogicIf 严格比较变量/字面量并跳到 Then 或 Else；LogicElse 跳到配对 EndIf。
7. LogicRepeat 推入显式循环帧；EndRepeat 减少剩余次数并回到 body，结束后弹栈。
8. 空 VideoNode 直接跳过；非空 VideoNode 增加 occurrence 序号并返回 `playingVideo`，index 已指向视频之后。
9. 空 ChoiceNode 直接跳过；非空 ChoiceNode 返回 `choosing`，index 已指向选项节点之后。
10. 场景跳转节点切换 `sceneId`、把 index 设为 0、清空人物并载入目标场景初始背景；BGM 保持。
11. 使用包含变量与循环栈的执行签名检测重复状态；每次推进最多自动执行 10000 步。
12. 遇到对白节点时保存对白并增加 occurrence 序号，把 index 移到其后，然后返回等待玩家。
13. 视频 ended 或 Enter 跳过由 `completeVideo()` 从已保存的 index 继续扫描。
14. `selectGamePreviewChoice()` 用 optionId 验证当前阻塞节点和目标场景，然后按场景跳转语义继续扫描。
15. 扫描到结尾且没有跳转时返回 `finished`。

选择跳转和 SceneJumpNode 共享视觉边界：目标场景使用自己的初始背景、清空上一
场景人物层，同时保留跨场景 BGM。选择界面会停止上一句对白语音。

## 组件结构

```text
renderer/features/game-preview/
├── previewRuntime.ts     # 无 React/IPC 的纯状态机与选项分支
├── previewAudioController.ts # 两个 HTMLAudioElement 与异步 URL 竞态
├── usePreviewAudio.ts    # 将 runtime 期望状态同步为音频副作用
├── PreviewVideo.tsx      # capability URL、HTMLVideoElement 和自然 ended
├── useGamePreview.ts     # 会话 start/advance/exit
└── GamePreview.tsx       # 全窗口播放、选项按钮和输入处理

renderer/components/
├── VisualStage.tsx       # 表单预览和游戏预览共享的视觉舞台
└── PreviewPanel.tsx      # 编辑器容器与方形播放按钮
```

`VisualStage` 的固定层次：

```text
背景 z=0
人物 z=10+layer
对白 z=30
选项层 z=40
阻塞视频 z=50
全局退出控件 z=1040
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
- `playingVideo` 时鼠标点击和 Space 不推进；ended 或非长按 Enter 调用 `completeVideo()`。
- `choosing` 时舞台点击、Space 和 Enter 不推进；只有点击选项按钮才调用 `selectChoice(optionId)`。
- 对推进和视频跳过忽略键盘长按的 `event.repeat`；Escape 始终可退出。
- `Escape` 或“退出预览”按钮：退出。
- 控制按钮阻止事件冒泡，不能同时触发下一条对白。
- 预览结束后点击不会重新开始，用户应退出后再次点击播放按钮。

## 当前版本不做

- 逐字显示和“第一次点击补全文字”。
- 自动播放计时。
- 复合 `and/or/not`、任意脚本、条件选项可见性和选项副作用。
- Editor 预览中的持久化存档/读档；正式 Player 已提供本地手动槽和快速槽。
- BGM 淡入淡出、音量自动化、波形和音效节点。
- 视频裁剪、字幕、转码、淡入淡出和节点级音量。
- 把运行状态写入 C++。

独立 Player 与 Web Player 已复用抽离后的 TypeScript reducer，保证编辑器预览与
导出游戏语义一致。未来引入任意脚本或跨语言确定性回放时，可再评估把同一语义下沉到
C++ RuntimeSession/WASM。

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
13. BGM 循环、显式停止、同曲重启和跨场景跳转持续正确。
14. 对白语音播放一次，推进/结束/错误/退出会停止；循环回到同一对白会重播。
15. 空视频节点自动跳过；非空视频节点阻塞播放，ended/Enter 后继续且同一视频再次出现会重播。
16. 视频期间人物语音停止，BGM 暂停并在视频结束后从原进度恢复。
17. 视频 capability 支持 MP4/WebM MIME、HEAD/GET、单段 Range 及跨项目失效。
18. 未保存项目和临时导入图片/音频/视频同样可预览。
19. 空 ChoiceNode 自动跳过；非空节点进入 `choosing` 且普通推进输入不穿透。
20. 选项按钮固定 54px 高并整体垂直居中；数量增加只改变列表高度和坐标，超量时列表内部滚动。
21. 点击选项按稳定 optionId 跳转，目标场景重置背景/人物但延续 BGM；坏引用进入明确错误。
22. 变量 Set/Change、If/Else 和 Repeat 在 Editor、桌面 Player 与 Web Player 中得到相同结果。
23. 自动执行超过 10000 步返回 `logicStepLimit`，不会让预览卡死或请求超时。
22. TypeScript、ESLint、Vitest、CTest 和生产打包通过。
