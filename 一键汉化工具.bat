@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title Antigravity 2.0 简体中文 UI 汉化工具

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "CORE_DIR=%ROOT_DIR%\core"
set "CUSTOM_PATH="

:DETECT_RUNTIME
set "NODE_BIN="
set "USE_ELECTRON_NODE=0"

if defined CUSTOM_PATH (
    if exist "%CUSTOM_PATH%\Antigravity.exe" (
        set "NODE_BIN=%CUSTOM_PATH%\Antigravity.exe"
        set "USE_ELECTRON_NODE=1"
    ) else if /i "%CUSTOM_PATH:~-15%"=="Antigravity.exe" (
        if exist "%CUSTOM_PATH%" (
            set "NODE_BIN=%CUSTOM_PATH%"
            set "USE_ELECTRON_NODE=1"
        )
    )
)

if not defined NODE_BIN (
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
)

if not defined NODE_BIN (
    where node >nul 2>&1
    if !errorlevel! equ 0 (
        set "NODE_BIN=node"
        set "USE_ELECTRON_NODE=0"
    )
)

if not defined NODE_BIN (
    cls
    echo ==============================================================
    echo   Antigravity 2.0 简体中文 UI 汉化工具
    echo ==============================================================
    echo.
    echo 未在默认目录检测到 Antigravity.exe，且系统未安装 Node.js。
    echo 请直接把 Antigravity 的安装目录或 Antigravity.exe 拖到本窗口，然后按回车：
    echo.
    set /p "CUSTOM_PATH=路径: "
    set "CUSTOM_PATH=!CUSTOM_PATH:"=!"
    if not defined CUSTOM_PATH exit /b 1
    goto DETECT_RUNTIME
)

:MENU
cls
echo ==============================================================
echo          Antigravity 2.0 简体中文 UI 汉化工具
echo ==============================================================
echo.
echo   [1] 一键安装永久中文汉化（推荐，直接双击原图标即生效，自动备份原版）
echo   [2] 无侵入启动中文版（零修改原程序，免改 app.asar，适合先体验）
echo   [3] 在桌面创建“无侵入中文版”快捷方式
echo   [4] 一键还原官方英文原版
echo   [5] 查看当前安装路径与汉化状态
echo   [6] 手动指定 Antigravity 安装目录（当前: 自动检测）
echo   [0] 退出
echo.
echo   提示：运行 Antigravity 时按 Ctrl+Alt+L 可随时秒切 中/英 界面！
echo ==============================================================
echo.
set "CHOICE="
set /p "CHOICE=请输入数字选项并按回车 [1-6/0]: "

if "%CHOICE%"=="1" goto DO_INSTALL
if "%CHOICE%"=="2" goto DO_LAUNCH
if "%CHOICE%"=="3" goto DO_SHORTCUT
if "%CHOICE%"=="4" goto DO_UNINSTALL
if "%CHOICE%"=="5" goto DO_STATUS
if "%CHOICE%"=="6" goto DO_SETPATH
if "%CHOICE%"=="0" exit /b 0
echo.
echo 无效选项，请重新输入。
timeout /t 1 >nul
goto MENU

:RUN_PATCHER
set "ACTION=%~1"
set "PATH_ARG="
if defined CUSTOM_PATH set "PATH_ARG=--path"

if "%USE_ELECTRON_NODE%"=="1" (
    set "ELECTRON_RUN_AS_NODE=1"
) else (
    set "ELECTRON_RUN_AS_NODE="
)

if defined CUSTOM_PATH (
    "%NODE_BIN%" "%CORE_DIR%\patcher.js" %ACTION% --path "%CUSTOM_PATH%"
) else (
    "%NODE_BIN%" "%CORE_DIR%\patcher.js" %ACTION%
)
set "ELECTRON_RUN_AS_NODE="
exit /b %errorlevel%

:DO_INSTALL
echo.
call :RUN_PATCHER install
echo.
pause
goto MENU

:DO_LAUNCH
echo.
call :RUN_PATCHER launch
echo.
pause
goto MENU

:DO_SHORTCUT
echo.
call :RUN_PATCHER shortcut
echo.
pause
goto MENU

:DO_UNINSTALL
echo.
call :RUN_PATCHER uninstall
echo.
pause
goto MENU

:DO_STATUS
echo.
call :RUN_PATCHER status
echo.
pause
goto MENU

:DO_SETPATH
echo.
echo 请拖入 Antigravity 安装目录（或 app.asar / Antigravity.exe），留空则恢复自动检测：
set "NEW_PATH="
set /p "NEW_PATH=路径: "
set "NEW_PATH=!NEW_PATH:"=!"
set "CUSTOM_PATH=!NEW_PATH!"
goto DETECT_RUNTIME
