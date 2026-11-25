'use strict';

/**
 * Antigravity 2.0 UI 汉化包核心管理工具 v3.0（纯标准库，零外部依赖）
 *
 * 命令：
 *   node patcher.js deploy    [--path <安装目录>] [--deploy-dir <自定义常驻目录>] [--no-shortcuts]
 *   node patcher.js undeploy  [--deploy-dir <自定义常驻目录>] [--no-shortcuts]
 *   node patcher.js status    [--path <安装目录或app.asar>] [--deploy-dir <自定义常驻目录>]
 *   node patcher.js install   [--path <安装目录或app.asar>] [--force]
 *   node patcher.js uninstall [--path <安装目录或app.asar>]
 *   node patcher.js launch    [--path <安装目录或Antigravity.exe>]
 *   node patcher.js shortcut  [--path <安装目录或Antigravity.exe>]
 */

if (typeof process !== 'undefined') {
  process.noAsar = true;
}
let fs;
try {
  // 在 ELECTRON_RUN_AS_NODE=1 环境下优先使用原始 fs，避免 Electron 将 .asar 拦截成虚拟目录
  fs = require('original-fs');
} catch (_) {
  fs = require('fs');
}
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { readAsarHeader, readAsarFile, rebuildAsar, findNode } = require('./asar-codec');

const VERSION = '3.0.0';
const PATCH_MARKER = '/* __ANTIGRAVITY_ZH_CN_PATCH_V1__ */';
const PATCH_LINE = `${PATCH_MARKER} try { require("./zh-cn/main-hook.js"); } catch (e) { console.error("[antigravity-zh-cn]", e); }\n`;
const BACKUP_SUFFIX = '.zh-backup';
const CORE_FILES = ['main-hook.js', 'renderer.js', 'dict.js', 'patterns.js', 'user-dict.json'];
const DEPLOY_CORE_FILES = ['patcher.js', 'asar-codec.js', 'main-hook.js', 'renderer.js', 'dict.js', 'patterns.js', 'user-dict.json'];
const SHORTCUT_NAME = 'Antigravity 中文版';

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = (args[0] && !args[0].startsWith('-')) ? args[0].toLowerCase() : 'status';
  let customPath = '';
  let deployDir = '';
  let force = false;
  let noShortcuts = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--path' || args[i] === '-p') && args[i + 1]) {
      customPath = args[++i];
    } else if (args[i] === '--deploy-dir' && args[i + 1]) {
      deployDir = args[++i];
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true;
    } else if (args[i] === '--no-shortcuts') {
      noShortcuts = true;
    }
  }
  return { cmd, customPath, deployDir, force, noShortcuts };
}

function getDefaultDeployDir() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'antigravity-zh-cn');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'antigravity-zh-cn');
  }
  return path.join(os.homedir(), '.local', 'share', 'antigravity-zh-cn');
}

function resolveDeployDir(overrideDir) {
  return overrideDir ? path.resolve(overrideDir) : getDefaultDeployDir();
}

function queryWindowsUninstallPath() {
  const regKeys = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  for (const key of regKeys) {
    try {
      const out = execFileSync('reg', ['query', key, '/s', '/f', 'Antigravity', '/d'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      });
      const lines = out.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/(?:InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)/i);
        if (!m) continue;
        let candidate = m[1].trim().replace(/^"|"$/g, '').replace(/,\d+$/, '');
        if (candidate.toLowerCase().endsWith('.exe')) {
          candidate = path.dirname(candidate);
        }
        if (fs.existsSync(path.join(candidate, 'resources', 'app.asar'))) {
          return candidate;
        }
      }
    } catch (_) {}
  }
  return null;
}

function resolveInstallFromPath(inputPath) {
  if (!inputPath) return null;
  const resolved = path.resolve(inputPath.replace(/^"|"$/g, ''));
  if (!fs.existsSync(resolved)) return null;

  const stat = fs.statSync(resolved);

  if (stat.isFile() && path.basename(resolved).toLowerCase() === 'app.asar') {
    const resourcesDir = path.dirname(resolved);
    const rootDir = path.dirname(resourcesDir);
    return buildInstallInfo(rootDir, resourcesDir, resolved);
  }

  if (stat.isFile()) {
    const dir = path.dirname(resolved);
    const asar = path.join(dir, 'resources', 'app.asar');
    if (fs.existsSync(asar)) {
      return buildInstallInfo(dir, path.join(dir, 'resources'), asar, resolved);
    }
    const macAsar = path.resolve(dir, '..', 'Resources', 'app.asar');
    if (fs.existsSync(macAsar)) {
      return buildInstallInfo(path.resolve(dir, '..', '..'), path.dirname(macAsar), macAsar, resolved);
    }
    return null;
  }

  const candidates = [
    { root: resolved, res: path.join(resolved, 'resources'), asar: path.join(resolved, 'resources', 'app.asar') },
    { root: resolved, res: path.join(resolved, 'Contents', 'Resources'), asar: path.join(resolved, 'Contents', 'Resources', 'app.asar') },
    { root: path.dirname(resolved), res: resolved, asar: path.join(resolved, 'app.asar') },
  ];

  for (const c of candidates) {
    if (fs.existsSync(c.asar)) {
      return buildInstallInfo(c.root, c.res, c.asar);
    }
  }
  return null;
}

function buildInstallInfo(rootDir, resourcesDir, asarPath, explicitExe) {
  let exePath = explicitExe || '';
  if (!exePath) {
    if (process.platform === 'win32') {
      const p = path.join(rootDir, 'Antigravity.exe');
      if (fs.existsSync(p)) exePath = p;
    } else if (process.platform === 'darwin') {
      const p = path.join(rootDir, 'Contents', 'MacOS', 'Antigravity');
      if (fs.existsSync(p)) exePath = p;
    } else {
      for (const name of ['antigravity', 'Antigravity']) {
        const p = path.join(rootDir, name);
        if (fs.existsSync(p)) { exePath = p; break; }
      }
    }
  }

  let appVersion = '未知';
  try {
    const pkg = JSON.parse(readAsarFile(asarPath, 'package.json').toString('utf8'));
    if (pkg && pkg.version) appVersion = pkg.version;
  } catch (_) {}

  const backupPath = asarPath + BACKUP_SUFFIX;
  return { rootDir, resourcesDir, asarPath, backupPath, exePath, appVersion };
}

function findAntigravityInstall(customPath) {
  // 若未显式传路径，检查常驻目录 config.json 是否记录过自定义路径
  if (!customPath) {
    try {
      const cfgPath = path.join(path.dirname(__dirname), 'config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (cfg && cfg.customPath) {
          const fromCfg = resolveInstallFromPath(cfg.customPath);
          if (fromCfg) return fromCfg;
        }
      }
    } catch (_) {}
  }

  if (customPath) {
    const info = resolveInstallFromPath(customPath);
    if (!info) {
      throw new Error(`指定的路径中未找到 Antigravity（需要包含 resources/app.asar）：${customPath}`);
    }
    return info;
  }

  const candidates = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    candidates.push(
      path.join(localAppData, 'Programs', 'antigravity'),
      path.join(localAppData, 'Programs', 'Antigravity'),
      path.join(programFiles, 'Antigravity'),
      path.join(programFiles, 'antigravity'),
      path.join(programFilesX86, 'Antigravity')
    );
    const regPath = queryWindowsUninstallPath();
    if (regPath) candidates.unshift(regPath);
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Antigravity.app',
      path.join(os.homedir(), 'Applications', 'Antigravity.app')
    );
  } else {
    candidates.push(
      '/opt/Antigravity',
      '/opt/antigravity',
      '/usr/lib/antigravity',
      '/usr/share/antigravity',
      path.join(os.homedir(), '.local', 'share', 'antigravity')
    );
  }

  for (const dir of candidates) {
    const info = resolveInstallFromPath(dir);
    if (info) return info;
  }

  throw new Error(
    '未能自动检测到 Antigravity 安装目录。\n' +
    '请确认已安装 Antigravity 2.0 桌面版，或使用 --path 手动指定安装路径。'
  );
}

function isAsarPatched(asarPath) {
  try {
    const mainJs = readAsarFile(asarPath, 'dist/main.js').toString('utf8');
    return mainJs.includes(PATCH_MARKER);
  } catch (_) {
    return false;
  }
}

function listOtherRunningAntigravityPids() {
  const selfPid = String(process.pid);
  const parentPid = String(process.ppid || '');
  const pids = [];

  if (process.platform === 'win32') {
    try {
      const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Antigravity.exe', '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      });
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^"Antigravity\.exe","(\d+)"/i);
        if (m && m[1] !== selfPid && m[1] !== parentPid) {
          pids.push(m[1]);
        }
      }
    } catch (_) {}
  } else {
    try {
      const out = execFileSync('pgrep', ['-f', 'Antigravity'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      });
      for (const line of out.split(/\r?\n/)) {
        const pid = line.trim();
        if (/^\d+$/.test(pid) && pid !== selfPid && pid !== parentPid) {
          pids.push(pid);
        }
      }
    } catch (_) {}
  }
  return pids;
}

function createWindowsShortcut(lnkPath, targetPath, args, workingDir, iconLocation, description) {
  const esc = (s) => String(s || '').replace(/"/g, '""');
  const psScript = [
    '$ws = New-Object -ComObject WScript.Shell;',
    `$s = $ws.CreateShortcut("${esc(lnkPath)}");`,
    `$s.TargetPath = "${esc(targetPath)}";`,
    args ? `$s.Arguments = "${esc(args)}";` : '',
    workingDir ? `$s.WorkingDirectory = "${esc(workingDir)}";` : '',
    iconLocation ? `$s.IconLocation = "${esc(iconLocation)}";` : '',
    `$s.Description = "${esc(description)}";`,
    '$s.Save();',
  ].filter(Boolean).join(' ');

  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
    encoding: 'utf8',
    timeout: 12000,
  });
}

function getWindowsShortcutPaths() {
  const desktop = execFileSync(
    'powershell',
    ['-NoProfile', '-Command', '[Environment]::GetFolderPath("Desktop")'],
    { encoding: 'utf8', timeout: 8000 }
  ).trim();
  const startMenuPrograms = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs'
  );
  return {
    desktopLnk: path.join(desktop, `${SHORTCUT_NAME}.lnk`),
    startMenuLnk: path.join(startMenuPrograms, `${SHORTCUT_NAME}.lnk`),
  };
}

/**
 * v3.0 核心功能：防更新永不失效常驻无侵入部署
 * - 完全不修改官方安装目录与 app.asar
 * - 安装到独立用户目录，删掉下载包依然正常运行
 * - 生成零黑框闪烁的原生桌面/开始菜单快捷方式（可右键固定到任务栏）
 */
function cmdDeploy(customPath, overrideDeployDir, noShortcuts) {
  const info = findAntigravityInstall(customPath);
  const deployDir = resolveDeployDir(overrideDeployDir);
  const targetCoreDir = path.join(deployDir, 'core');

  console.log(`[1/4] 已定位 Antigravity v${info.appVersion}: ${info.rootDir}`);
  console.log(`[2/4] 正在部署独立常驻汉化核心 -> ${deployDir}`);

  fs.mkdirSync(targetCoreDir, { recursive: true });
  for (const fileName of DEPLOY_CORE_FILES) {
    const src = path.join(__dirname, fileName);
    const dst = path.join(targetCoreDir, fileName);
    if (!fs.existsSync(src)) {
      throw new Error(`缺少核心文件: ${src}`);
    }
    // 保留用户已自定义的 user-dict.json
    if (fileName === 'user-dict.json' && fs.existsSync(dst)) {
      continue;
    }
    fs.copyFileSync(src, dst);
  }

  fs.writeFileSync(
    path.join(deployDir, 'config.json'),
    JSON.stringify({ version: VERSION, customPath: customPath || '' }, null, 2),
    'utf8'
  );

  console.log('[3/4] 正在生成零黑框静默启动器...');
  const createdEntries = [];

  if (process.platform === 'win32') {
    const launchCmdPath = path.join(deployDir, 'launch.cmd');
    const launchVbsPath = path.join(deployDir, 'launch-silent.vbs');

    // 动态查找最新版本 Antigravity.exe（即使官方更新或重装也不失效）
    const cmdContent = [
      '@echo off',
      'chcp 65001 >nul',
      'setlocal EnableExtensions',
      'set "BASE=%~dp0"',
      'if "%BASE:~-1%"=="\\" set "BASE=%BASE:~0,-1%"',
      'set "AGY_EXE="',
      info.exePath ? `if exist "${info.exePath}" set "AGY_EXE=${info.exePath}"` : '',
      'if not defined AGY_EXE if exist "%LOCALAPPDATA%\\Programs\\antigravity\\Antigravity.exe" set "AGY_EXE=%LOCALAPPDATA%\\Programs\\antigravity\\Antigravity.exe"',
      'if not defined AGY_EXE if exist "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe" set "AGY_EXE=%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe"',
      'if not defined AGY_EXE if exist "%ProgramFiles%\\Antigravity\\Antigravity.exe" set "AGY_EXE=%ProgramFiles%\\Antigravity\\Antigravity.exe"',
      'if not defined AGY_EXE if exist "%ProgramFiles%\\antigravity\\Antigravity.exe" set "AGY_EXE=%ProgramFiles%\\antigravity\\Antigravity.exe"',
      'if not defined AGY_EXE (',
      '  where node >nul 2>&1 && (node "%BASE%\\core\\patcher.js" launch & exit /b %errorlevel%)',
      '  exit /b 1',
      ')',
      'set "ELECTRON_RUN_AS_NODE=1"',
      '"%AGY_EXE%" "%BASE%\\core\\patcher.js" launch',
      'exit /b %errorlevel%',
      '',
    ].filter((line, idx, arr) => line !== '' || idx === arr.length - 1).join('\r\n');

    fs.writeFileSync(launchCmdPath, cmdContent, 'utf8');

    const vbsContent = [
      'Set fso = CreateObject("Scripting.FileSystemObject")',
      'Set ws = CreateObject("WScript.Shell")',
      'dir = fso.GetParentFolderName(WScript.ScriptFullName)',
      'ws.Run """" & dir & "\\launch.cmd""", 0, False',
      '',
    ].join('\r\n');
    fs.writeFileSync(launchVbsPath, vbsContent, 'utf8');

    if (!noShortcuts) {
      console.log('[4/4] 正在创建桌面与开始菜单“Antigravity 中文版”快捷方式（可固定到任务栏）...');
      const wscriptExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
      const vbsArgs = `//B //Nologo "${launchVbsPath}"`;
      const iconLoc = info.exePath ? `${info.exePath},0` : '';
      const desc = 'Antigravity 简体中文版（防更新永不失效 · 零修改原程序）';
      const { desktopLnk, startMenuLnk } = getWindowsShortcutPaths();

      createWindowsShortcut(desktopLnk, wscriptExe, vbsArgs, deployDir, iconLoc, desc);
      createdEntries.push(desktopLnk);
      try {
        createWindowsShortcut(startMenuLnk, wscriptExe, vbsArgs, deployDir, iconLoc, desc);
        createdEntries.push(startMenuLnk);
      } catch (_) {}
    } else {
      console.log('[4/4] 已跳过系统快捷方式创建 (--no-shortcuts)。');
    }
  } else if (process.platform === 'darwin') {
    const launchSh = path.join(deployDir, 'launch.sh');
    const shBody = [
      '#!/usr/bin/env bash',
      'set -e',
      'DIR="$(cd "$(dirname "$0")" && pwd)"',
      info.exePath ? `BIN="${info.exePath}"` : 'BIN=""',
      '[[ -x "$BIN" ]] || BIN="/Applications/Antigravity.app/Contents/MacOS/Antigravity"',
      '[[ -x "$BIN" ]] || BIN="$HOME/Applications/Antigravity.app/Contents/MacOS/Antigravity"',
      'ELECTRON_RUN_AS_NODE=1 "$BIN" "$DIR/core/patcher.js" launch',
      '',
    ].join('\n');
    fs.writeFileSync(launchSh, shBody, { mode: 0o755 });

    if (!noShortcuts) {
      console.log('[4/4] 正在创建 ~/Applications/Antigravity 中文版.app 启动器...');
      const appBundle = path.join(os.homedir(), 'Applications', `${SHORTCUT_NAME}.app`);
      const macOsDir = path.join(appBundle, 'Contents', 'MacOS');
      const resDir = path.join(appBundle, 'Contents', 'Resources');
      fs.mkdirSync(macOsDir, { recursive: true });
      fs.mkdirSync(resDir, { recursive: true });

      // 复制官方图标
      const srcIcns = path.join(info.rootDir, 'Contents', 'Resources', 'icon.icns');
      if (fs.existsSync(srcIcns)) {
        fs.copyFileSync(srcIcns, path.join(resDir, 'icon.icns'));
      }
      const plist = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0"><dict>',
        `<key>CFBundleName</key><string>${SHORTCUT_NAME}</string>`,
        '<key>CFBundleIdentifier</key><string>com.local.antigravity-zh-cn-launcher</string>',
        `<key>CFBundleVersion</key><string>${VERSION}</string>`,
        '<key>CFBundleExecutable</key><string>launcher</string>',
        '<key>CFBundleIconFile</key><string>icon.icns</string>',
        '<key>LSUIElement</key><true/>',
        '</dict></plist>',
        '',
      ].join('\n');
      fs.writeFileSync(path.join(appBundle, 'Contents', 'Info.plist'), plist, 'utf8');
      fs.writeFileSync(
        path.join(macOsDir, 'launcher'),
        `#!/usr/bin/env bash\nexec "${launchSh}"\n`,
        { mode: 0o755 }
      );
      createdEntries.push(appBundle);
    }
  } else {
    const launchSh = path.join(deployDir, 'launch.sh');
    const shBody = [
      '#!/usr/bin/env bash',
      'set -e',
      'DIR="$(cd "$(dirname "$0")" && pwd)"',
      info.exePath ? `BIN="${info.exePath}"` : 'BIN=""',
      'for p in "/opt/Antigravity/antigravity" "/opt/antigravity/antigravity" "/usr/lib/antigravity/antigravity" "/usr/share/antigravity/antigravity" "$HOME/.local/share/antigravity/antigravity"; do',
      '  [[ -x "$BIN" ]] && break',
      '  [[ -x "$p" ]] && BIN="$p"',
      'done',
      'ELECTRON_RUN_AS_NODE=1 "$BIN" "$DIR/core/patcher.js" launch',
      '',
    ].join('\n');
    fs.writeFileSync(launchSh, shBody, { mode: 0o755 });

    if (!noShortcuts) {
      console.log('[4/4] 正在创建桌面应用入口 (.desktop)...');
      const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
      fs.mkdirSync(appsDir, { recursive: true });
      const desktopFile = path.join(appsDir, 'antigravity-zh-cn.desktop');
      const desktopContent = [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${SHORTCUT_NAME}`,
        'Comment=Antigravity 简体中文版（防更新永不失效）',
        `Exec="${launchSh}"`,
        'Terminal=false',
        'Categories=Development;Utility;',
        '',
      ].join('\n');
      fs.writeFileSync(desktopFile, desktopContent, 'utf8');
      createdEntries.push(desktopFile);
    }
  }

  console.log('');
  console.log('======================================================');
  console.log('  ✅ 「防更新永不失效版」安装成功！');
  console.log('======================================================');
  console.log(`  常驻目录 : ${deployDir}`);
  for (const e of createdEntries) {
    console.log(`  快捷方式 : ${e}`);
  }
  console.log('');
  console.log('  使用说明：');
  console.log('  1. 若当前已开着英文原版，请先右键托盘退出一次（Quit）。');
  console.log(`  2. 以后直接双击「${SHORTCUT_NAME}」图标启动（可右键固定到任务栏/程序坞）。`);
  console.log('  3. 即使官方以后自动升级版本，或你删掉下载的压缩包，中文汉化都永远不会失效！');
  console.log('  4. 运行时按 Ctrl+Alt+L 可秒切中英文，按 Ctrl+Alt+Shift+D 可一键采集漏译。');
  console.log('======================================================');
}

function cmdUndeploy(overrideDeployDir, noShortcuts) {
  const deployDir = resolveDeployDir(overrideDeployDir);
  let removedAnything = false;

  if (!noShortcuts) {
    if (process.platform === 'win32') {
      try {
        const { desktopLnk, startMenuLnk } = getWindowsShortcutPaths();
        for (const p of [desktopLnk, startMenuLnk]) {
          if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            console.log(`已移除快捷方式: ${p}`);
            removedAnything = true;
          }
        }
      } catch (_) {}
    } else if (process.platform === 'darwin') {
      const appBundle = path.join(os.homedir(), 'Applications', `${SHORTCUT_NAME}.app`);
      if (fs.existsSync(appBundle)) {
        fs.rmSync(appBundle, { recursive: true, force: true });
        console.log(`已移除应用启动器: ${appBundle}`);
        removedAnything = true;
      }
    } else {
      const desktopFile = path.join(os.homedir(), '.local', 'share', 'applications', 'antigravity-zh-cn.desktop');
      if (fs.existsSync(desktopFile)) {
        fs.unlinkSync(desktopFile);
        console.log(`已移除应用入口: ${desktopFile}`);
        removedAnything = true;
      }
    }
  }

  if (fs.existsSync(deployDir)) {
    fs.rmSync(deployDir, { recursive: true, force: true });
    console.log(`已删除常驻目录: ${deployDir}`);
    removedAnything = true;
  }

  if (removedAnything) {
    console.log('\n✅ 已彻底卸载「防更新永不失效版」，未残留任何文件或环境变量。');
  } else {
    console.log('ℹ️ 当前未检测到已安装的「防更新永不失效版」。');
  }
}

function cmdStatus(customPath, overrideDeployDir) {
  const info = findAntigravityInstall(customPath);
  const patched = isAsarPatched(info.asarPath);
  const hasBackup = fs.existsSync(info.backupPath);
  const runningPids = listOtherRunningAntigravityPids();
  const deployDir = resolveDeployDir(overrideDeployDir);
  const deployed = fs.existsSync(path.join(deployDir, 'core', 'main-hook.js'));

  console.log('======================================================');
  console.log(`  Antigravity 2.0 简体中文 UI 汉化工具 v${VERSION} - 状态检测`);
  console.log('======================================================');
  console.log(`  安装目录   : ${info.rootDir}`);
  console.log(`  应用版本   : v${info.appVersion}`);
  console.log(`  防更新常驻 : ${deployed ? '已安装 (' + deployDir + ')' : '未安装（推荐选 1 安装，官方升级不失效）'}`);
  console.log(`  传统补丁   : ${patched ? '已注入 app.asar' : '未注入（官方原版 app.asar）'}`);
  console.log(`  原版备份   : ${hasBackup ? '存在 (' + path.basename(info.backupPath) + ')' : '无'}`);
  console.log(`  运行状态   : ${runningPids.length > 0 ? '正在运行（进程数: ' + runningPids.length + '）' : '未运行'}`);
  console.log('======================================================');
}

function cmdInstall(customPath, force) {
  const info = findAntigravityInstall(customPath);
  const runningPids = listOtherRunningAntigravityPids();

  if (runningPids.length > 0 && !force) {
    throw new Error(
      `检测到 Antigravity 正在运行（进程数: ${runningPids.length}）。\n` +
      '请先彻底退出 Antigravity（包括系统托盘右键 -> Quit / 退出），然后再执行安装。\n' +
      '提示：推荐使用选项 [1]「防更新永不失效版」，无需修改 app.asar 且官方更新也不会掉！'
    );
  }

  console.log(`[1/5] 已定位 Antigravity v${info.appVersion}: ${info.asarPath}`);

  const alreadyPatched = isAsarPatched(info.asarPath);
  let sourceAsarForBuild = info.asarPath;

  if (!alreadyPatched) {
    console.log(`[2/5] 正在备份原版 app.asar -> ${path.basename(info.backupPath)} ...`);
    fs.copyFileSync(info.asarPath, info.backupPath);
  } else if (fs.existsSync(info.backupPath)) {
    console.log('[2/5] 检测到已安装过汉化补丁，正在基于原版备份刷新至最新汉化版本...');
    sourceAsarForBuild = info.backupPath;
  } else {
    console.log('[2/5] 检测到已安装过汉化补丁（无独立备份），将就地更新补丁内容...');
  }

  let mainJsText = readAsarFile(sourceAsarForBuild, 'dist/main.js').toString('utf8');
  mainJsText = mainJsText
    .split(/\r?\n/)
    .filter((line) => !line.includes(PATCH_MARKER))
    .join('\n');

  const patchedMainJs = Buffer.from(PATCH_LINE + mainJsText, 'utf8');

  const replacements = new Map();
  replacements.set('dist/main.js', patchedMainJs);
  for (const fileName of CORE_FILES) {
    const absPath = path.join(__dirname, fileName);
    if (!fs.existsSync(absPath)) {
      throw new Error(`缺少汉化核心文件: ${absPath}`);
    }
    replacements.set(`dist/zh-cn/${fileName}`, fs.readFileSync(absPath));
  }

  const tmpAsarPath = info.asarPath + '.zh-tmp';
  console.log('[3/5] 正在构建汉化版 app.asar（保留全部原始元数据与 SHA-256 校验）...');
  try {
    rebuildAsar(sourceAsarForBuild, tmpAsarPath, replacements);

    console.log('[4/5] 正在校验构建产物完整性...');
    const { header } = readAsarHeader(tmpAsarPath);
    if (!findNode(header, 'dist/main.js') || !findNode(header, 'dist/zh-cn/main-hook.js') || !findNode(header, 'package.json')) {
      throw new Error('校验失败：新 app.asar 缺少关键条目。');
    }
    const verifyMain = readAsarFile(tmpAsarPath, 'dist/main.js').toString('utf8');
    if (!verifyMain.startsWith(PATCH_MARKER)) {
      throw new Error('校验失败：补丁入口未正确写入 dist/main.js。');
    }

    console.log('[5/5] 正在写入目标文件...');
    try {
      fs.renameSync(tmpAsarPath, info.asarPath);
    } catch (_) {
      fs.copyFileSync(tmpAsarPath, info.asarPath);
      fs.unlinkSync(tmpAsarPath);
    }
  } catch (err) {
    if (fs.existsSync(tmpAsarPath)) {
      try { fs.unlinkSync(tmpAsarPath); } catch (_) {}
    }
    throw new Error(`写入 app.asar 失败（可能文件被占用或缺少权限）：${err.message}`);
  }

  console.log('');
  console.log('✅ 传统永久汉化补丁安装成功！');
  console.log('   - 现在直接打开 Antigravity 即可看到简体中文界面。');
  console.log('   - 运行时按 Ctrl+Alt+L 可随时在“简体中文 / English”之间瞬切。');
  console.log('   - 提示：如果不想以后官方更新覆盖掉补丁，推荐改用选项 [1]「防更新永不失效版」。');
}

function cmdUninstall(customPath, force) {
  const info = findAntigravityInstall(customPath);
  const runningPids = listOtherRunningAntigravityPids();

  if (runningPids.length > 0 && !force) {
    throw new Error(
      `检测到 Antigravity 正在运行（进程数: ${runningPids.length}）。\n` +
      '请先彻底退出 Antigravity（包括系统托盘右键退出），再执行还原。'
    );
  }

  if (fs.existsSync(info.backupPath)) {
    console.log(`[1/2] 正在从原版备份恢复: ${info.backupPath}`);
    fs.copyFileSync(info.backupPath, info.asarPath);
    console.log('[2/2] 正在清理备份文件...');
    fs.unlinkSync(info.backupPath);
    console.log('\n✅ 已成功还原为官方英文原版！');
    return;
  }

  if (!isAsarPatched(info.asarPath)) {
    console.log('ℹ️ 当前 app.asar 已经是官方未汉化状态，无需还原。');
    return;
  }

  console.log('[1/2] 未找到备份文件，正在直接从 app.asar 移除汉化注入...');
  let mainJsText = readAsarFile(info.asarPath, 'dist/main.js').toString('utf8');
  mainJsText = mainJsText
    .split(/\r?\n/)
    .filter((line) => !line.includes(PATCH_MARKER))
    .join('\n');

  const tmpAsarPath = info.asarPath + '.zh-tmp';
  rebuildAsar(
    info.asarPath,
    tmpAsarPath,
    new Map([['dist/main.js', Buffer.from(mainJsText, 'utf8')]]),
    ['dist/zh-cn']
  );
  fs.copyFileSync(tmpAsarPath, info.asarPath);
  fs.unlinkSync(tmpAsarPath);
  console.log('[2/2] 清理完成。');
  console.log('\n✅ 已成功移除汉化补丁并恢复原版！');
}

function cmdLaunch(customPath) {
  const info = findAntigravityInstall(customPath);
  if (!info.exePath || !fs.existsSync(info.exePath)) {
    throw new Error(`未找到 Antigravity 可执行文件（安装目录：${info.rootDir}）。`);
  }

  const runningPids = listOtherRunningAntigravityPids();
  if (runningPids.length > 0) {
    console.log('⚠️ 提示：检测到已有 Antigravity 实例正在运行。');
    console.log('   由于 Electron 单实例机制，若原实例为英文原版，新窗口会复用旧实例。');
    console.log('   请先从系统托盘完全退出 Antigravity，再启动中文版！\n');
  }

  // 关键细节：NODE_OPTIONS 会按 POSIX 规则解析反斜杠转义，Windows 下必须转为正斜杠！
  const hookPathPosix = path.join(__dirname, 'main-hook.js').replace(/\\/g, '/');
  const childEnv = Object.assign({}, process.env);
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const existingNodeOpts = (childEnv.NODE_OPTIONS || '').trim();
  const reqArg = `--require="${hookPathPosix}"`;
  childEnv.NODE_OPTIONS = existingNodeOpts ? `${existingNodeOpts} ${reqArg}` : reqArg;

  console.log(`🚀 正在以“零修改无侵入模式”启动 Antigravity v${info.appVersion} ...`);
  console.log(`   可执行文件: ${info.exePath}`);
  console.log('   说明：本模式不改动任何安装目录文件，按 Ctrl+Alt+L 可随时切换中英文。');

  const child = spawn(info.exePath, [], {
    detached: true,
    stdio: 'ignore',
    env: childEnv,
    windowsHide: false,
  });
  child.unref();
}

function cmdShortcut(customPath, overrideDeployDir) {
  // 兼容旧指令：直接执行防更新部署，生成零黑框桌面与开始菜单快捷方式
  cmdDeploy(customPath, overrideDeployDir, false);
}

function main() {
  const { cmd, customPath, deployDir, force, noShortcuts } = parseArgs(process.argv);
  try {
    switch (cmd) {
      case 'deploy':
        cmdDeploy(customPath, deployDir, noShortcuts);
        break;
      case 'undeploy':
        cmdUndeploy(deployDir, noShortcuts);
        break;
      case 'status':
        cmdStatus(customPath, deployDir);
        break;
      case 'install':
        cmdInstall(customPath, force);
        break;
      case 'uninstall':
      case 'restore':
        cmdUninstall(customPath, force);
        break;
      case 'launch':
        cmdLaunch(customPath);
        break;
      case 'shortcut':
        cmdShortcut(customPath, deployDir);
        break;
      default:
        console.log('用法: node patcher.js <deploy|undeploy|status|install|uninstall|launch> [--path <路径>]');
        process.exitCode = 1;
    }
  } catch (err) {
    console.error('\n❌ 操作未能完成：');
    console.error(err && err.message ? err.message : String(err));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
