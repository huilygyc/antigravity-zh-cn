@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title Antigravity 2.0 zh-CN Tool v3.1

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "CORE_DIR=%ROOT_DIR%\core"
set "CUSTOM_PATH="

:DETECT
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
    echo ==============================================================
    echo   Antigravity 2.0 zh-CN Tool v3.1
    echo ==============================================================
    echo.
    echo Antigravity.exe was not found in default paths and Node.js is missing.
    echo Please drag the Antigravity folder or Antigravity.exe here and press Enter:
    echo.
    set /p "CUSTOM_PATH=Path: "
    set "CUSTOM_PATH=!CUSTOM_PATH:"=!"
    if not defined CUSTOM_PATH exit /b 1
    goto DETECT
)

:MENU
cls
call :RUN print-menu
set "CHOICE="
set /p "CHOICE=>>> "

if "%CHOICE%"=="1" goto DO_DEPLOY
if "%CHOICE%"=="2" goto DO_INSTALL
if "%CHOICE%"=="3" goto DO_LAUNCH
if "%CHOICE%"=="4" goto DO_UNDEPLOY
if "%CHOICE%"=="5" goto DO_STATUS
if "%CHOICE%"=="6" goto DO_SETPATH
if "%CHOICE%"=="0" exit /b 0
if /i "%CHOICE%"=="q" exit /b 0
goto MENU

:RUN
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
call :RUN deploy
echo.
pause
goto MENU

:DO_INSTALL
echo.
call :RUN install
echo.
pause
goto MENU

:DO_LAUNCH
echo.
call :RUN launch
echo.
pause
goto MENU

:DO_UNDEPLOY
echo.
call :RUN undeploy
echo.
pause
goto MENU

:DO_STATUS
echo.
call :RUN status
echo.
pause
goto MENU

:DO_SETPATH
echo.
echo Drag Antigravity folder or Antigravity.exe here (leave blank for auto-detect):
set "NEW_PATH="
set /p "NEW_PATH=>>> "
set "NEW_PATH=!NEW_PATH:"=!"
set "CUSTOM_PATH=!NEW_PATH!"
goto DETECT
