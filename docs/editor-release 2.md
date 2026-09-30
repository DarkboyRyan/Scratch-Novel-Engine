# Editor macOS / Windows 发布

第一版应用版本保持 `apps/editor/package.json` 中的 `1.0.0`。两个平台分别使用以下标签、
Release 标题和主要下载文件：

| Git 标签 / Release 标题 | 平台 | 下载文件 |
| --- | --- | --- |
| `editor-v1.0.0-mac` | macOS Apple Silicon arm64 | `editor-v1.0.0-mac.zip` |
| `editor-v1.0.0-windows` | Windows x64 | `editor-v1.0.0-windows.exe` |

首次运行默认显示 **English / Daylight**，不依赖系统语言。设置中仍可切换中文，已经保存
的语言选择会保留；导出游戏采用导出时的 Editor 语言作为首次启动语言。

## 先在 Actions 演练

涉及 Editor 发布脚本、Forge 配置或依赖的 PR 会自动构建两个平台，仅上传产物，
不创建标签或 Release；可先在 PR 中修复原生平台构建错误，再合并到 main。

将本次修改合并到 main 后，在 GitHub Actions 选择 **Editor platform release → Run workflow**，
分支选 main，分别运行 `mac` 和 `windows`。手动运行只上传构建产物，不创建标签或 Release。
运行结束后从对应的 Artifacts 下载；Actions 会额外用 ZIP 包裹整组附件，下载后先解压。

工作流在对应原生 Runner 上执行 Runtime / Player / Editor 静态检查、单元和集成测试、
C++ CTest，然后运行 `pnpm --dir apps/editor make`。打包后启动内置 C++ Backend 执行 ping，
核对 Web 模板；macOS 还检查 Editor 签名完整性和内置 Player 模板。每个产物集合携带
`SHA256SUMS` 与 `build-receipt.json`，记录校验值、源码提交、平台、架构和签名状态。

## 创建第一版草稿

确保两个平台演练都通过，并确认 main 是要发布的提交，再在仓库根目录执行：

```sh
git switch main
git pull --ff-only origin main
git tag -a editor-v1.0.0-mac -m "Editor 1.0.0 for macOS Apple Silicon"
git tag -a editor-v1.0.0-windows -m "Editor 1.0.0 for Windows x64"
git push origin editor-v1.0.0-mac editor-v1.0.0-windows
```

两个标签会各自触发对应平台的构建。全部检查成功后，各创建一个带附件和说明的
**Pre-release 草稿**。在 Releases 页面完成审阅和真实机器测试后手动发布。
草稿可以通过重跑工作流补全附件；已公开的 Release 不会被工作流覆盖。

后续版本先更新 Editor 的 `package.json`，例如 `1.0.1`，提交后再创建
`editor-v1.0.1-mac` / `editor-v1.0.1-windows`。标签中的版本必须和应用版本完全一致。
不要移动或复用已发布标签。

## 安装与验收

- macOS：解压 ZIP，把 `.app` 放到 Applications。当前只构建 arm64，不包含 Intel Mac。
- Windows：运行 `.exe`。`RELEASES` 和 `editor-1.0.0-full.nupkg` 是 Squirrel 配套文件，
  普通用户只需要下载安装程序。C++ 后端静态链接 MSVC Runtime，不要求用户安装开发工具。
- 在无开发环境的机器验证启动、新建、保存重开、图片/音频导入、表单/Blockly/Code 编辑、
  正式预览、`.vngame` 和 Web 导出；macOS 额外验证本机独立游戏导出。
- 首次启动应显示英文菜单与工作台；切换中文并重启后应仍为中文。英文导出游戏首次运行
  应为英语，游戏自身已经保存的玩家语言优先。

当前 macOS 使用 ad-hoc 签名，没有 Developer ID 公证；Windows 没有 Authenticode 签名。
系统可能提示未知发布者或阻止首次打开，因此工作流明确标记签名状态并停在预发布草稿。
这是独立的 Editor 测试发布路径，不改变正式 Player / Game 工作流的签名和凭据要求。

Windows Editor 支持 `.vngame` 与 Web ZIP 导出；Windows 独立游戏仍通过已有的 CI 构建，
尚不支持在本机 Editor 中直接生成。Intel Mac 和 Windows arm64 不在此次构建范围。
