'use strict';

/**
 * Antigravity 2.0 UI 汉化包核心管理工具（纯标准库，零外部依赖）
 *
 * 命令：
 *   node patcher.js status    [--path <安装目录或app.asar>]
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

const PATCH_MARKER = '/* __ANTIGRAVITY_ZH_CN_PATCH_V1__ */';
const PATCH_LINE = `${PATCH_MARKER} try { require("./zh-cn/main-hook.js"); } catch (e) { console.error("[antigravity-zh-cn]", e); }\n`;
const BACKUP_SUFFIX = '.zh-backup';
const CORE_FILES = ['main-hook.js', 'renderer.js', 'dict.js', 'patterns.js', 'user-dict.json'];

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = (args[0] && !args[0].startsWith('-')) ? args[0].toLowerCase() : 'status';
  let customPath = '';
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--path' || args[i] === '-p') && args[i + 1]) {
      customPath = args[++i];
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true;
    }
  }
  return { cmd, customPath, force };
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

  // 直接指向 app.asar
  if (stat.isFile() && path.basename(resolved).toLowerCase() === 'app.asar') {
    const resourcesDir = path.dirname(resolved);
    const rootDir = path.dirname(resourcesDir);
    return buildInstallInfo(rootDir, resourcesDir, resolved);
  }

  // 直接指向 Antigravity.exe 或 Antigravity 可执行文件
  if (stat.isFile()) {
    const dir = path.dirname(resolved);
    const asar = path.join(dir, 'resources', 'app.asar');
    if (fs.existsSync(asar)) {
      return buildInstallInfo(dir, path.join(dir, 'resources'), asar, resolved);
    }
    // macOS .app/Contents/MacOS/Antigravity
    const macAsar = path.resolve(dir, '..', 'Resources', 'app.asar');
    if (fs.existsSync(macAsar)) {
      return buildInstallInfo(path.resolve(dir, '..', '..'), path.dirname(macAsar), macAsar, resolved);
    }
    return null;
  }

  // 指向安装根目录或 .app 目录或 resources 目录
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
  return {
    rootDir,
    resourcesDir,
    asarPath,
    backupPath,
    exePath,
    appVersion,
  };
}

function findAntigravityInstall(customPath) {
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

function cmdStatus(customPath) {
  const info = findAntigravityInstall(customPath);
  const patched = isAsarPatched(info.asarPath);
  const hasBackup = fs.existsSync(info.backupPath);
  const runningPids = listOtherRunningAntigravityPids();

  console.log('======================================================');
  console.log('  Antigravity 2.0 简体中文 UI 汉化工具 - 状态检测');
  console.log('======================================================');
  console.log(`  安装目录 : ${info.rootDir}`);
  console.log(`  应用版本 : v${info.appVersion}`);
  console.log(`  核心文件 : ${info.asarPath}`);
  console.log(`  汉化状态 : ${patched ? '已安装永久中文补丁' : '未安装（英文原版）'}`);
  console.log(`  原版备份 : ${hasBackup ? '存在 (' + path.basename(info.backupPath) + ')' : '无'}`);
  console.log(`  运行状态 : ${runningPids.length > 0 ? '正在运行（进程数: ' + runningPids.length + '）' : '未运行'}`);
  console.log('======================================================');
}

function cmdInstall(customPath, force) {
  const info = findAntigravityInstall(customPath);
  const runningPids = listOtherRunningAntigravityPids();

  if (runningPids.length > 0 && !force) {
    throw new Error(
      `检测到 Antigravity 正在运行（进程数: ${runningPids.length}）。\n` +
      '请先彻底退出 Antigravity（包括系统托盘右键 -> Quit / 退出），然后再执行安装。\n' +
      '提示：若想在不修改原程序的情况下体验中文界面，可使用“无侵入启动中文版”。'
    );
  }

  console.log(`[1/5] 已定位 Antigravity v${info.appVersion}: ${info.asarPath}`);

  const alreadyPatched = isAsarPatched(info.asarPath);
  let sourceAsarForBuild = info.asarPath;

  if (!alreadyPatched) {
    // 当前 app.asar 是纯净原版（含版本更新后的新原版），保存/刷新干净备份
    console.log(`[2/5] 正在备份原版 app.asar -> ${path.basename(info.backupPath)} ...`);
    fs.copyFileSync(info.asarPath, info.backupPath);
  } else if (fs.existsSync(info.backupPath)) {
    // 已打过补丁，从干净备份重建以刷新词典和逻辑
    console.log('[2/5] 检测到已安装过汉化补丁，正在基于原版备份刷新至最新汉化版本...');
    sourceAsarForBuild = info.backupPath;
  } else {
    console.log('[2/5] 检测到已安装过汉化补丁（无独立备份），将就地更新补丁内容...');
  }

  // 读取原始 dist/main.js 并去除可能残留的旧补丁行
  let mainJsText = readAsarFile(sourceAsarForBuild, 'dist/main.js').toString('utf8');
  mainJsText = mainJsText
    .split(/\r?\n/)
    .filter((line) => !line.includes(PATCH_MARKER))
    .join('\n');

  const patchedMainJs = Buffer.from(PATCH_LINE + mainJsText, 'utf8');

  // 准备写入 app.asar 的文件集合
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

    // 构建后立即回读校验
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
    } catch (renameErr) {
      // Windows 跨卷或覆盖失败时采用 copy + unlink
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
  console.log('✅ 汉化补丁安装成功！');
  console.log('   - 现在直接打开 Antigravity 即可看到简体中文界面。');
  console.log('   - 运行时按 Ctrl+Alt+L 可随时在“简体中文 / English”之间瞬切。');
  console.log('   - 如需自定义个别词条，可编辑用户目录下的 .antigravity-zh-cn-dict.json。');
  console.log('   - 如 Antigravity 后续自动升级回英文，重新运行本工具安装即可。');
}

function cmdUninstall(customPath) {
  const info = findAntigravityInstall(customPath);
  const runningPids = listOtherRunningAntigravityPids();

  if (runningPids.length > 0) {
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
    console.log('');
    console.log('✅ 已成功还原为官方英文原版！');
    return;
  }

  if (!isAsarPatched(info.asarPath)) {
    console.log('ℹ️ 当前已经是官方未汉化状态，无需还原。');
    return;
  }

  // 无备份文件但存在补丁时，从 app.asar 中干净剔除补丁行与 dist/zh-cn 目录
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
  console.log('');
  console.log('✅ 已成功移除汉化补丁并恢复原版！');
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
    console.log('   请先从系统托盘完全退出 Antigravity，再使用本无侵入启动器！');
    console.log('');
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

function cmdShortcut(customPath) {
  if (process.platform !== 'win32') {
    console.log('ℹ️ 创建桌面快捷方式功能仅适用于 Windows，macOS/Linux 请使用 install.sh。');
    return;
  }
  const info = findAntigravityInstall(customPath);
  const launcherBat = path.resolve(__dirname, '..', '无侵入启动中文版.bat');
  if (!fs.existsSync(launcherBat)) {
    throw new Error(`找不到启动脚本: ${launcherBat}`);
  }

  const psScript = [
    '$ws = New-Object -ComObject WScript.Shell;',
    '$desktop = [Environment]::GetFolderPath("Desktop");',
    '$lnkPath = Join-Path $desktop "Antigravity (中文无侵入版).lnk";',
    '$s = $ws.CreateShortcut($lnkPath);',
    `$s.TargetPath = "${launcherBat.replace(/"/g, '""')}";`,
    `$s.WorkingDirectory = "${path.dirname(launcherBat).replace(/"/g, '""')}";`,
    info.exePath ? `$s.IconLocation = "${info.exePath.replace(/"/g, '""')},0";` : '',
    '$s.WindowStyle = 7;',
    '$s.Description = "无侵入启动 Antigravity 简体中文界面（不修改原程序）";',
    '$s.Save();',
    'Write-Output $lnkPath;',
  ].filter(Boolean).join(' ');

  const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();

  console.log(`✅ 已在桌面创建中文版快捷方式：\n   ${out}`);
}

function main() {
  const { cmd, customPath, force } = parseArgs(process.argv);
  try {
    switch (cmd) {
      case 'status':
        cmdStatus(customPath);
        break;
      case 'install':
        cmdInstall(customPath, force);
        break;
      case 'uninstall':
      case 'restore':
        cmdUninstall(customPath);
        break;
      case 'launch':
        cmdLaunch(customPath);
        break;
      case 'shortcut':
        cmdShortcut(customPath);
        break;
      default:
        console.log('用法: node patcher.js <status|install|uninstall|launch|shortcut> [--path <路径>]');
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
