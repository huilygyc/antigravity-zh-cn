@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title Antigravity 2.0 简体中文 UI 汉化工具 v3.0（防更新永不失效版）

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
    echo   Antigravity 2.0 简体中文 UI 汉化工具 v3.0
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
echo ======================================================================
echo       Antigravity 2.0 简体中文 UI 汉化工具 v3.0（防更新永不失效）
echo ======================================================================
echo.
echo   [1] 一键安装「防更新永不失效版」（强烈推荐！）
echo       · 不改 app.asar，官方怎么自动升级都不会掉汉化
echo       · 独立常驻目录，装完删掉下载包照常使用
echo       · 自动生成零黑框“Antigravity 中文版”桌面/开始菜单图标（可固定任务栏）
echo.
echo   [2] 安装传统补丁（直接修改 app.asar，点原图标即生效，更新后需重跑）
echo   [3] 临时无侵入体验一次（不安装、不改任何文件）
echo   [4] 卸载「防更新永不失效版」（清理常驻目录与中文版快捷方式）
echo   [5] 还原传统补丁（恢复官方原版 app.asar）
echo   [6] 查看当前安装路径与汉化状态
echo   [7] 手动指定 Antigravity 安装目录
echo   [0] 退出
echo.
echo   快捷键：Ctrl+Alt+L 秒切中英文  ^|  Ctrl+Alt+Shift+D 一键采集漏译
echo ======================================================================
echo.
set "CHOICE="
set /p "CHOICE=请输入数字选项并按回车 [1-7/0]: "

if "%CHOICE%"=="1" goto DO_DEPLOY
if "%CHOICE%"=="2" goto DO_INSTALL
if "%CHOICE%"=="3" goto DO_LAUNCH
if "%CHOICE%"=="4" goto DO_UNDEPLOY
if "%CHOICE%"=="5" goto DO_UNINSTALL
if "%CHOICE%"=="6" goto DO_STATUS
if "%CHOICE%"=="7" goto DO_SETPATH
if "%CHOICE%"=="0" exit /b 0
echo.
echo 无效选项，请重新输入。
timeout /t 1 >nul
goto MENU

:RUN_PATCHER
set "ACTION=%~1"
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

:DO_DEPLOY
echo.
call :RUN_PATCHER deploy
echo.
pause
goto MENU

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

:DO_UNDEPLOY
echo.
call :RUN_PATCHER undeploy
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
