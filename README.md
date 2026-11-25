# Antigravity 2.0 简体中文 UI 汉化包 (`antigravity-zh-cn`)

[![Release](https://img.shields.io/github/v/release/huilygyc/antigravity-zh-cn?color=blue&label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC)](https://github.com/huilygyc/antigravity-zh-cn/releases/latest)
[![Platform](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20%7C%20macOS%20%7C%20Linux-success)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

一套面向 **Google Antigravity 2.0 桌面版**（已适配 `v2.34.0` / `v2.35.1` 及后续版本）的**防更新永不失效**、零外部依赖简体中文界面汉化工具，开箱即用，无需安装 Node.js 或 Python。

> **快速下载**：直接前往 [**Releases 页面**](https://github.com/huilygyc/antigravity-zh-cn/releases/latest) 下载最新的 `Source code (zip)`（或点击右上角 `Code -> Download ZIP`）解压即可使用。

## v3.0 核心特点

- **🛡️ 防更新永不失效架构（v3.0 推荐模式）**：
  - 将汉化核心部署到独立的用户常驻目录（Windows：`%LOCALAPPDATA%\antigravity-zh-cn\`，macOS：`~/Library/Application Support/antigravity-zh-cn/`，Linux：`~/.local/share/antigravity-zh-cn/`），**完全不改动官方 `app.asar` 与安装目录**。
  - 自动创建带官方图标的零黑框 **`Antigravity 中文版`** 桌面/开始菜单快捷方式（Windows 可直接右键固定到任务栏；macOS 自动生成 `~/Applications/Antigravity 中文版.app` 可拖到程序坞）。
  - **官方怎么自动更新都不会冲掉汉化**，而且安装完成后**删掉下载的压缩包也照常运行**，零污染系统环境变量，支持一键彻底卸载。
- **零外部依赖开箱即用**：Windows 下直接复用 Antigravity 自带的 Electron Node 运行时，拿到压缩包解压双击即可完成安装。
- **跨版本抗升级翻译引擎（2,350+ 精确词条 + 159 条动态正则）**：
  - 全量覆盖原生菜单栏（含最大化/最小化等角色兜底）、系统托盘、更新提示与确认弹窗、左侧边栏、对话右键菜单、聊天输入框、斜杠命令菜单 (`/btw` `/goal` `/compact` `/schedule` `/browser` `/plan` `/grill-me` `/teamwork` `/learn` `/boost`)、右侧辅助面板、模型配额/AI 额度/编排器设置、收件箱模式、插件权限、语音听写语言、主题自定义、权限沙盒、插件市场与自动化任务。
  - 新增**多词安全大小写不敏感回退匹配**：即使官方后续版本把设置标题在 `Title Case` 与 `Sentence case` 间改写（如 `v2.35.1` 的 `Automatic check for updates`），依然自动精准命中，同时严格免疫单词图标名。
- **规范化查表 + 中文字体渲染优化**：自动兼容弯引号/省略号/多行换行差异，并安全优化 UI 中文字体回退清晰度（绝不影响代码等宽字体与 Material Symbols 图标字体）。
- **手术级“物理免疫”保护**：严格跳过用户聊天正文、AI 回复 Markdown 正文、Lexical 输入框、内置终端输出、代码块与 Diff 行、文件树文件名、网址栏以及 Material Symbols 图标字体；并校验宿主进程，绝不干扰其他 Electron 应用。
- **运行时中英瞬切与漏译一键采集**：
  - 按 **`Ctrl + Alt + L`**（macOS：`Control + Option + L`）：在**简体中文 / English** 之间无刷新瞬切，偏好自动记忆。
  - 按 **`Ctrl + Alt + Shift + D`**：一键扫描当前可见界面中尚未汉化的英文词条并复制到剪贴板，贴入自定义词典即可立即补全。

---

## Windows 使用方法（推荐）

解压后双击运行 **`一键汉化工具.bat`**：

### 方式一：一键安装「防更新永不失效版」（强烈推荐！）

1. 双击 **`一键汉化工具.bat`**，输入 **`1`** 并回车。
2. 等待提示 `✅ 「防更新永不失效版」安装成功！`（装完后下载的压缩包和解压文件夹都可以直接删掉）。
3. 如果当前开着英文原版 Antigravity，**先右键右下角系统托盘点 `Quit` 彻底退出一次**。
4. 双击桌面或开始菜单新生成的 **`Antigravity 中文版`** 图标即可启动（推荐右键**固定到任务栏**，以后永远只点这个图标，官方怎么更新都不会再掉汉化！）。

> **如何卸载？**  
> 双击 `一键汉化工具.bat` 输入 **`4`** 回车，即可彻底清除常驻目录和中文版快捷方式。

### 方式二：传统永久补丁（修改 `app.asar`）

如果你习惯直接点官方原始图标，可以在 `一键汉化工具.bat` 中选择 **`2`**（需先彻底退出 Antigravity 托盘），会自动备份原版 `app.asar.zh-backup`；想还原时选 **`5`**。  
*(注：该模式在官方自动升级替换 `app.asar` 后需要重新运行选 `2`，如果嫌麻烦强烈建议用方式一。)*

---

## macOS / Linux 使用方法

在终端进入本目录并运行：

```bash
chmod +x install.sh
./install.sh
```

或直接使用子命令：

```bash
./install.sh deploy      # 安装「防更新永不失效版」（推荐，不破签名、更新不掉）
./install.sh undeploy    # 卸载「防更新永不失效版」
./install.sh status      # 查看当前状态
./install.sh install     # 传统补丁模式（修改 app.asar）
./install.sh uninstall   # 还原传统补丁
./install.sh launch      # 临时无侵入启动中文版
```

---

## 常见问题

### 1. 为什么用了「防更新版」双击图标打开还是英文？
多半是因为旧的英文原版 Antigravity 还缩在**右下角系统托盘**里没有退出！由于 Electron 单实例机制，点击新图标会直接唤起后台还没关的旧英文进程。右键托盘彻底退出（`Quit`）后，再点 **`Antigravity 中文版`** 图标即可。

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
├── 一键汉化工具.bat          # Windows 交互式工具（防更新部署 / 传统补丁 / 卸载还原）
├── 无侵入启动中文版.bat       # Windows 零修改临时启动器
├── install.sh                # macOS / Linux 防更新部署与启动脚本
├── LICENSE                   # MIT 开源协议
├── README.md                 # 使用说明
└── core/
    ├── patcher.js            # 防更新常驻部署、零黑框启动器、ASAR 补丁与状态检测（零依赖）
    ├── asar-codec.js         # 纯标准库 ASAR 编解码器（严格保留 SHA-256 校验与元数据）
    ├── main-hook.js          # Electron 主进程钩子（菜单 / 托盘 / 对话框 / 隔离世界注入）
    ├── renderer.js           # 渲染进程 DOM 汉化引擎（React 安全 + 物理免疫 + 跨版本大小写回退 + 热键切换）
    ├── dict.js               # 简体中文精确词典（2,350+ 条）
    ├── patterns.js           # 动态文案正则匹配规则（159 条）
    └── user-dict.json        # 可选自定义词典
```
