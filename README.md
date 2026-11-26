# Antigravity 2.0 简体中文 UI 汉化包 (`antigravity-zh-cn`)

[![Release](https://img.shields.io/github/v/release/huilygyc/antigravity-zh-cn?color=blue&label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC)](https://github.com/huilygyc/antigravity-zh-cn/releases/latest)
[![Platform](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20%7C%20macOS%20%7C%20Linux-success)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

一套面向 **Google Antigravity 2.0 桌面版**（已实测适配 `v2.34.0` / `v2.35.1` / `v2.35.2` 及后续版本）的**智能自愈防更新**、零外部依赖简体中文界面汉化工具，开箱即用，无需安装 Node.js 或 Python。

> **快速下载**：直接前往 [**Releases 页面**](https://github.com/huilygyc/antigravity-zh-cn/releases/latest) 下载最新的 `Source code (zip)`（或点击右上角 `Code -> Download ZIP`）解压即可使用。

## v3.1 核心特点

- **🛡️ 智能自愈防更新架构（真正解决官方升级后汉化失效！）**：
  - 将汉化核心部署到独立的用户常驻目录（Windows：`%LOCALAPPDATA%\antigravity-zh-cn\`，macOS：`~/Library/Application Support/antigravity-zh-cn/`，Linux：`~/.local/share/antigravity-zh-cn/`），**官方自动更新永远不会删掉你的常驻汉化核心**，安装完成后删掉下载的压缩包也能照常使用。
  - 自动创建带官方图标、零黑框闪烁的 **`Antigravity 中文版`** 桌面/开始菜单快捷方式（Windows 可直接右键固定到任务栏；macOS 自动生成 `~/Applications/Antigravity 中文版.app` 可拖到程序坞）。
  - **启动前 10ms 极速体检 + 0.3 秒无感自愈**：平时启动瞬间秒开；一旦官方自动更新把 `app.asar` 覆盖成英文原版，下次点击 **`Antigravity 中文版`** 图标会自动检测到更新并在 **0.3 秒内静默重新注入最新中文补丁**后直接启动！
  - **托盘冲突一键自动重启**：若刚自动更新完、英文旧进程还缩在右下角系统托盘里，点击中文图标会弹出友好中文确认框，点 **「是」** 自动安全重启并恢复中文，点 **「否」** 不打扰正在运行的对话。
- **💯 纯 ASCII 批处理引导 + Node UTF-8 菜单，彻底杜绝 Windows CMD 乱码**：
  - `.bat` 脚本内部 100% 纯 ASCII，完全规避 Windows `cmd.exe` 在 `chcp 65001` 下的 UTF-8 字节偏移截断 Bug，在 Windows 10/11 任意终端下均清晰无乱码。
- **零外部依赖开箱即用**：Windows 下直接复用 Antigravity 自带的 Electron Node 运行时，拿到压缩包解压双击即可完成安装。
- **跨版本抗升级翻译引擎（2,355 条精确词条 + 159 条动态正则）**：
  - 全量覆盖原生菜单栏（含最大化/最小化等角色兜底）、系统托盘、更新提示与确认弹窗、左侧边栏、对话右键菜单、聊天输入框、斜杠命令菜单 (`/btw` `/goal` `/compact` `/schedule` `/browser` `/plan` `/grill-me` `/teamwork` `/learn` `/boost`)、右侧辅助面板、模型配额/AI 额度/编排器设置、收件箱模式、插件权限、语音听写语言、主题自定义、权限沙盒、插件市场与自动化任务。
  - **多词安全大小写不敏感回退匹配**：即使官方后续版本把设置标题在 `Title Case` 与 `Sentence case` 间改写（如 `Automatic check for updates`），依然自动精准命中，同时严格免疫单词 Material Symbols 图标名。
- **手术级“物理免疫”保护**：严格跳过用户聊天正文、AI 回复 Markdown 正文、Lexical 输入框、内置终端输出、代码块与 Diff 行、文件树文件名、网址栏以及 Material Symbols 图标字体；并校验宿主进程，绝不干扰 VS Code 等其他 Electron 应用。
- **运行时中英瞬切与漏译一键采集**：
  - 按 **`Ctrl + Alt + L`**（macOS：`Control + Option + L`）：在**简体中文 / English** 之间无刷新瞬切，偏好自动记忆。
  - 按 **`Ctrl + Alt + Shift + D`**：一键扫描当前可见界面中尚未汉化的英文词条并复制到剪贴板，贴入自定义词典即可立即补全。

---

## Windows 使用方法（推荐）

解压后双击运行 **`一键汉化工具.bat`**：

### 方式一：一键安装「智能自愈防更新版」（强烈推荐！）

1. 双击 **`一键汉化工具.bat`**，输入 **`1`** 并回车。
2. 等待提示 `✅ 「智能自愈防更新版」部署成功！`（装完后下载的压缩包和解压文件夹都可以直接删掉）。
3. 双击桌面或开始菜单新生成的 **`Antigravity 中文版`** 图标即可启动（推荐右键**固定到任务栏**）：
   - 如果此时 Antigravity 正开着英文原版，会弹窗询问是否自动重启并恢复中文，点 **「是」** 即可 0.3 秒完成切换！
   - 以后无论官方自动升级多少次，点一次 **`Antigravity 中文版`** 图标就会自动自愈恢复中文，再也不用重新下载或重跑 `.bat`！

> **如何彻底卸载并还原英文原版？**  
> 双击 `一键汉化工具.bat` 输入 **`4`** 回车，即可一键清除常驻目录、中文版快捷方式并还原官方原版 `app.asar`。

### 方式二：仅安装/刷新补丁（不装常驻启动器）

如果你不想保留独立常驻目录，可以在 `一键汉化工具.bat` 中选择 **`2`**（需先彻底退出 Antigravity 托盘），会自动备份原版 `app.asar.zh-backup`；想还原时选 **`4`**。

---

## macOS / Linux 使用方法

在终端进入本目录并运行：

```bash
chmod +x install.sh
./install.sh
```

或直接使用子命令：

```bash
./install.sh deploy      # 安装「智能自愈防更新版」（推荐）
./install.sh launch      # 智能自愈启动中文版
./install.sh undeploy    # 彻底卸载并还原英文原版
./install.sh status      # 查看当前状态
./install.sh install     # 仅安装/刷新补丁
./install.sh uninstall   # 仅还原 app.asar 原版
```

> **macOS 签名提示**：如修改 `app.asar` 后遇到系统安全拦截，可执行一次 `codesign --force --deep --sign - /Applications/Antigravity.app`。

---

## 常见问题

### 1. 官方自动更新后变成了英文怎么办？
直接点击桌面上或任务栏里固定的 **`Antigravity 中文版`** 图标即可：
- 如果旧程序已关闭：启动器会在 **0.3 秒内静默重新应用中文补丁**并直接打开中文界面。
- 如果旧的英文版还开着或缩在托盘：会弹窗提示检测到新版本，点 **「是」** 自动重启并在 0.3 秒内恢复中文。

### 2. 想临时对照英文原词怎么办？
在 Antigravity 窗口内按 **`Ctrl + Alt + L`** 即可一键切换回原版英文界面，再按一次切回简体中文，不需要重启软件。

### 3. 如何自定义某个词条或补充新版本漏译？
在当前界面按 **`Ctrl + Alt + Shift + D`** 采集漏译词条，在用户主目录新建 `.antigravity-zh-cn-dict.json`（Windows 为 `C:\Users\<用户名>\.antigravity-zh-cn-dict.json`，macOS/Linux 为 `~/.antigravity-zh-cn-dict.json`），填入键值对，重启生效：
```json
{
  "Subagents": "协作子代理",
  "Artifacts": "生成产物"
}
```

### 4. 支持 Antigravity IDE（VS Code 架构版）吗？
本汉化包专门针对 **Antigravity 2.0 桌面应用（Electron 独立客户端）**。  
如果你使用的是基于 VS Code 的 **Antigravity IDE**，直接在扩展商店搜索安装微软官方的 **`Chinese (Simplified) Language Pack for Visual Studio Code`** 即可。

---

## 文件结构

```text
antigravity-zh-cn/
├── 一键汉化工具.bat          # Windows 交互式工具（纯 ASCII 零乱码引导）
├── 一键启动中文版.bat        # Windows 一键自愈启动快捷脚本（纯 ASCII）
├── install.sh                # macOS / Linux 智能自愈部署与交互菜单
├── LICENSE                   # MIT 开源协议
├── README.md                 # 使用说明
└── core/
    ├── patcher.js            # 智能自愈防更新部署、零黑框启动器、UTF-8 菜单与 ASAR 引擎（零依赖）
    ├── asar-codec.js         # 纯标准库 ASAR 编解码器（严格保留 SHA-256 校验与元数据）
    ├── main-hook.js          # Electron 主进程钩子（菜单 / 托盘 / 对话框 / 隔离世界注入）
    ├── renderer.js           # 渲染进程 DOM 汉化引擎（React 安全 + 物理免疫 + 跨版本大小写回退 + 热键切换）
    ├── dict.js               # 简体中文精确词典（2,355 条）
    ├── patterns.js           # 动态文案正则匹配规则（159 条）
    └── user-dict.json        # 可选自定义词典
```
