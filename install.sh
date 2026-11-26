#!/usr/bin/env bash
set -euo pipefail

# Antigravity 2.0 简体中文 UI 汉化工具 v3.1（macOS / Linux · 智能自愈防更新版）
# 用法：
#   ./install.sh              # 交互式菜单
#   ./install.sh deploy       # 安装「智能自愈防更新版」（推荐，官方更新后点图标自动恢复）
#   ./install.sh launch       # 智能启动中文版（若官方刚更新则自动自愈并启动）
#   ./install.sh undeploy     # 彻底卸载并还原英文原版
#   ./install.sh install      # 仅安装/刷新 app.asar 补丁
#   ./install.sh uninstall    # 仅还原 app.asar 英文原版
#   ./install.sh status       # 查看状态

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCHER="$SCRIPT_DIR/core/patcher.js"

find_node_runner() {
  if command -v node >/dev/null 2>&1; then
    NODE_CMD=("node")
    return 0
  fi

  local candidates=(
    "/Applications/Antigravity.app/Contents/MacOS/Antigravity"
    "$HOME/Applications/Antigravity.app/Contents/MacOS/Antigravity"
    "/opt/Antigravity/antigravity"
    "/opt/antigravity/antigravity"
    "/usr/lib/antigravity/antigravity"
  )
  for bin in "${candidates[@]}"; do
    if [[ -x "$bin" ]]; then
      NODE_CMD=("env" "ELECTRON_RUN_AS_NODE=1" "$bin")
      return 0
    fi
  done

  echo "❌ 未检测到 Node.js 或 Antigravity 可执行文件。"
  echo "   请安装 Node.js 或手动执行：ELECTRON_RUN_AS_NODE=1 /path/to/Antigravity \"$PATCHER\" <命令>"
  exit 1
}

run_patcher() {
  "${NODE_CMD[@]}" "$PATCHER" "$@"
}

find_node_runner

if [[ $# -gt 0 ]]; then
  run_patcher "$@"
  exit $?
fi

run_patcher menu
