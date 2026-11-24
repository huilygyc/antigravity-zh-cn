@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title 启动 Antigravity（简体中文无侵入模式）

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "CORE_DIR=%ROOT_DIR%\core"

set "NODE_BIN="
set "USE_ELECTRON_NODE=0"

for %%P in (
    "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe"
    "%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe"
    "%ProgramFiles%\Antigravity\Antigravity.exe"
    "%ProgramFiles%\antigravity\Antigravity.exe"
    "%ProgramFiles(x86)%\Antigravity\Antigravity.exe"
) do (
    if not defined NODE_BIN if exist %%~P (
        set "NODE_BIN=%%~P"
        set "USE_ELECTRON_NODE=1"
    )
)

if not defined NODE_BIN (
    where node >nul 2>&1
    if !errorlevel! equ 0 (
        set "NODE_BIN=node"
        set "USE_ELECTRON_NODE=0"
    )
)

if not defined NODE_BIN (
    echo ❌ 未能自动找到 Antigravity.exe，请改用“一键汉化工具.bat”并手动指定路径。
    pause
    exit /b 1
)

if "%USE_ELECTRON_NODE%"=="1" set "ELECTRON_RUN_AS_NODE=1"
"%NODE_BIN%" "%CORE_DIR%\patcher.js" launch
set "ERR=%errorlevel%"
set "ELECTRON_RUN_AS_NODE="

if not "%ERR%"=="0" (
    echo.
    pause
    exit /b %ERR%
)
exit /b 0
