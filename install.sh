#!/usr/bin/env bash
set -euo pipefail

# Antigravity 2.0 简体中文 UI 汉化工具（macOS / Linux）
# 用法：
#   ./install.sh              # 交互式菜单
#   ./install.sh install      # 安装永久汉化补丁（自动备份）
#   ./install.sh uninstall    # 一键还原官方英文原版
#   ./install.sh launch       # 无侵入启动中文版（不修改原程序）
#   ./install.sh status       # 查看安装与汉化状态

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

while true; do
  echo "=============================================================="
  echo "         Antigravity 2.0 简体中文 UI 汉化工具 (macOS/Linux)"
  echo "=============================================================="
  echo "  [1] 安装永久中文汉化补丁（自动备份原版）"
  echo "  [2] 无侵入启动中文版（零修改原程序）"
  echo "  [3] 一键还原官方英文原版"
  echo "  [4] 查看当前状态"
  echo "  [0] 退出"
  echo "  提示：运行时按 Control+Option+L / Ctrl+Alt+L 可随时秒切中英文"
  echo "=============================================================="
  read -r -p "请选择 [1-4/0]: " choice
  case "$choice" in
    1)
      run_patcher install || true
      if [[ "$(uname -s)" == "Darwin" ]]; then
        echo ""
        echo "ℹ️ macOS 提示：如修改 app.asar 后遇到系统签名拦截，可执行："
        echo "   codesign --force --deep --sign - /Applications/Antigravity.app"
        echo "   或直接改用选项 [2] 无侵入启动模式。"
      fi
      ;;
    2) run_patcher launch || true ;;
    3) run_patcher uninstall || true ;;
    4) run_patcher status || true ;;
    0) exit 0 ;;
    *) echo "无效选项，请重试。" ;;
  esac
  echo ""
done
