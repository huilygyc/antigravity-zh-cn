# Antigravity 2.0 简体中文 UI 汉化包 (`antigravity-zh-cn`)

[![Release](https://img.shields.io/github/v/release/1-abxi/antigravity-zh-cn?color=blue&label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC)](https://github.com/1-abxi/antigravity-zh-cn/releases/latest)
[![Platform](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20%7C%20macOS%20%7C%20Linux-success)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

一套面向 **Google Antigravity 2.0 桌面版** 的非破坏性、零外部依赖简体中文界面汉化工具，开箱即用，无需安装 Node.js、Python 或任何第三方依赖。

> **快速下载**：直接前往 [**Releases 页面**](https://github.com/1-abxi/antigravity-zh-cn/releases/latest) 下载最新的 `Source code (zip)`（或点击右上角 `Code -> Download ZIP`）解压即可使用。

## 核心特点

- **零依赖开箱即用**：Windows 下直接复用 Antigravity 自带的 Electron Node 运行时，拿到文件夹双击即可使用。
- **双模式可选**：
  - **永久一键汉化模式**：向 `resources/app.asar` 写入轻量钩子，并自动备份原版 `app.asar.zh-backup`；从此点击桌面原图标、任务栏、开始菜单全部直接显示中文，支持一键还原。
  - **无侵入启动模式**：完全不修改 `app.asar` 及任何安装目录文件，通过启动器即时挂载中文界面，适合先体验或不想改动原程序的用户。
- **全界面深度覆盖 (v2.0)**：覆盖原生菜单栏（含 Electron 默认菜单项如最大化/最小化/编辑/视图）、系统托盘、更新提示与确认弹窗、左侧边栏、对话右键/更多菜单、聊天输入框、斜杠命令菜单 (`/btw` `/goal` `/compact` `/schedule` `/browser` `/plan` `/grill-me` `/teamwork` `/learn` `/boost`)、思考与工具执行步骤、侧边追问、右侧辅助面板（子智能体/后台任务/产物/变更文件/终端/内置浏览器）、全部设置页面（含模型配额/AI 额度/编排器/主题自定义）、权限与沙盒、插件市场、技能/规则/钩子/MCP、自动化定时任务等 **2,300+ 条真实界面词条**及 **159 条动态模板正则**。
- **规范化查表 + 中文字体渲染优化**：自动兼容弯引号/省略号/多行换行差异，并安全优化 UI 中文字体回退清晰度（绝不影响代码等宽字体与 Material Symbols 图标字体）。
- **手术级“物理免疫”保护**：严格跳过用户聊天内容、AI 回复 Markdown 正文、Lexical 输入框、内置终端输出、代码块与 Diff 行、文件树文件名、网址栏以及 Material Symbols 图标字体——绝不会误译代码、乱改图标或导致 React 界面报错。
- **运行时中英瞬切与漏译采集**：
  - 按 **`Ctrl + Alt + L`**（macOS：`Control + Option + L`）：在**简体中文 / English** 之间无刷新瞬切，偏好自动记忆。
  - 按 **`Ctrl + Alt + Shift + D`**：一键扫描当前可见界面中尚未汉化的英文词条并复制到剪贴板，方便随时增补自定义词典。
- **支持自定义词典**：可随时调整个别翻译措辞，无需修改代码。

---

## Windows 使用方法（推荐）

将整个 `antigravity-zh-cn` 文件夹解压到任意位置（请勿解压后就删除，特别是使用“无侵入模式”时需要保留此文件夹）：

### 方式一：永久一键汉化（最省心）

1. **先彻底退出 Antigravity**（注意：点击右上角关闭后可能仍在右下角系统托盘运行，请右键托盘图标点击 `Quit` 彻底退出）。
2. 双击运行 **`一键汉化工具.bat`**。
3. 输入 **`1`** 并回车，等待提示 `✅ 汉化补丁安装成功！`。
4. 像往常一样打开 Antigravity 即可看到简体中文界面。

> **如何还原英文原版？**  
> 彻底退出 Antigravity 后，双击 `一键汉化工具.bat`，输入 **`4`** 回车即可一键还原备份。

### 方式二：无侵入启动（零修改原程序）

1. 确保没有已打开的英文原版 Antigravity（先从托盘彻底退出）。
2. 直接双击 **`无侵入启动中文版.bat`**，即可零修改启动中文版 Antigravity。
3. 你也可以在 `一键汉化工具.bat` 中选择 **`3`**，在桌面生成一个带官方图标的 `Antigravity (中文无侵入版)` 快捷方式。

---

## macOS / Linux 使用方法

在终端进入本目录并运行：

```bash
chmod +x install.sh
./install.sh
```

或直接使用子命令：

```bash
./install.sh status      # 查看安装与汉化状态
./install.sh install     # 安装永久汉化补丁
./install.sh uninstall   # 一键还原英文原版
./install.sh launch      # 无侵入启动中文版
```

> **macOS 说明**：若使用永久补丁修改 `/Applications/Antigravity.app` 后遇到系统签名验证提示，可执行：
> ```bash
> codesign --force --deep --sign - /Applications/Antigravity.app
> ```
> 或改用 `./install.sh launch` 无侵入启动。

---

## 常见问题

### 1. Antigravity 自动更新后变回英文了怎么办？
Antigravity 官方升级时会替换新的 `app.asar`。只需彻底退出 Antigravity，重新双击 `一键汉化工具.bat` 选择 **`1`** 即可重新生效（工具会自动识别新版本并刷新原版备份）。

### 2. 想临时对照英文原词怎么办？
在 Antigravity 窗口内按 **`Ctrl + Alt + L`** 即可一键切换回原版英文界面，再按一次即可切回简体中文，不需要重启软件。

### 3. 如何自定义某个词条的翻译？
- **无侵入模式**：直接编辑本目录下的 `core/user-dict.json`。
- **永久补丁模式**：在用户主目录（Windows 为 `C:\Users\<你的用户名>\.antigravity-zh-cn-dict.json`，macOS/Linux 为 `~/.antigravity-zh-cn-dict.json`）新建 JSON 文件，填入键值对即可，重启生效，无需重新打补丁：
  ```json
  {
    "Subagents": "协作子代理",
    "Artifacts": "生成产物"
  }
  ```

### 4. 这个汉化包支持 Antigravity IDE（VS Code 架构版）吗？
本汉化包专门针对 **Antigravity 2.0 桌面应用（Electron 独立客户端）**。  
如果你使用的是基于 VS Code 的 **Antigravity IDE**，可以直接在 IDE 左侧扩展商店搜索并安装微软官方的 **`Chinese (Simplified) Language Pack for Visual Studio Code`** 汉化主界面。

---

## 文件结构

```text
antigravity-zh-cn/
├── 一键汉化工具.bat          # Windows 交互式一键安装 / 还原 / 启动工具
├── 无侵入启动中文版.bat       # Windows 零修改原程序启动器
├── install.sh                # macOS / Linux 安装与启动脚本
├── README.md                 # 使用说明
└── core/
    ├── patcher.js            # 安装、备份、校验、还原与启动核心（零依赖）
    ├── asar-codec.js         # 纯标准库 ASAR 编解码器（严格保留 SHA-256 校验与元数据）
    ├── main-hook.js          # Electron 主进程钩子（菜单 / 托盘 / 对话框 / 隔离世界注入）
    ├── renderer.js           # 渲染进程 DOM 汉化引擎（React 安全 + 物理免疫 + 热键切换）
    ├── dict.js               # 简体中文精确词典
    ├── patterns.js           # 动态文案正则匹配规则
    └── user-dict.json        # 可选自定义词典
```
