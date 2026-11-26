'use strict';

/**
 * Antigravity 2.0 UI 汉化包核心管理工具 v3.1（智能自愈防更新版 · 纯标准库零依赖）
 *
 * 命令：
 *   node patcher.js menu      [--path <安装目录>]
 *   node patcher.js deploy    [--path <安装目录>] [--deploy-dir <自定义常驻目录>] [--no-shortcuts] [--skip-initial-patch]
 *   node patcher.js undeploy  [--path <安装目录>] [--deploy-dir <自定义常驻目录>] [--no-shortcuts] [--force]
 *   node patcher.js launch    [--path <安装目录>] [--gui] [--no-spawn] [--force]
 *   node patcher.js status    [--path <安装目录或app.asar>] [--deploy-dir <自定义常驻目录>]
 *   node patcher.js install   [--path <安装目录或app.asar>] [--force]
 *   node patcher.js uninstall [--path <安装目录或app.asar>] [--force]
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
const readline = require('readline');
const { execFileSync, spawn } = require('child_process');
const { readAsarHeader, readAsarFile, rebuildAsar, findNode } = require('./asar-codec');

const VERSION = '3.1.0';
const PATCH_MARKER = '/* __ANTIGRAVITY_ZH_CN_PATCH_V1__ */';
const PATCH_VER_PREFIX = '/* __ANTIGRAVITY_ZH_CN_VER=';
const PATCH_VER_SUFFIX = '__ */';
const PATCH_LINE = `${PATCH_MARKER} ${PATCH_VER_PREFIX}${VERSION}${PATCH_VER_SUFFIX} try { require("./zh-cn/main-hook.js"); } catch (e) { console.error("[antigravity-zh-cn]", e); }\n`;
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
  let gui = false;
  let noSpawn = false;
  let skipInitialPatch = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--path' || args[i] === '-p') && args[i + 1]) {
      customPath = args[++i];
    } else if (args[i] === '--deploy-dir' && args[i + 1]) {
      deployDir = args[++i];
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true;
    } else if (args[i] === '--no-shortcuts') {
      noShortcuts = true;
    } else if (args[i] === '--gui') {
      gui = true;
    } else if (args[i] === '--no-spawn') {
      noSpawn = true;
    } else if (args[i] === '--skip-initial-patch') {
      skipInitialPatch = true;
    }
  }
  return { cmd, customPath, deployDir, force, noShortcuts, gui, noSpawn, skipInitialPatch };
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

function sleepSync(ms) {
  try {
    const sab = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(sab), 0, 0, ms);
  } catch (_) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
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

function getAsarPatchInfo(asarPath) {
  try {
    const mainJs = readAsarFile(asarPath, 'dist/main.js').toString('utf8');
    const patched = mainJs.includes(PATCH_MARKER);
    if (!patched) return { patched: false, version: null };
    const m = mainJs.match(/__ANTIGRAVITY_ZH_CN_VER=([^_\s]+)__/);
    return { patched: true, version: m ? m[1] : 'legacy' };
  } catch (_) {
    return { patched: false, version: null };
  }
}

function isAsarPatched(asarPath) {
  return getAsarPatchInfo(asarPath).patched;
}

function listOtherRunningAntigravityPids() {
  const excluded = new Set([String(process.pid), String(process.ppid || '')]);
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
        if (m && !excluded.has(m[1])) {
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
        if (/^\d+$/.test(pid) && !excluded.has(pid)) {
          pids.push(pid);
        }
      }
    } catch (_) {}
  }
  return pids;
}

function psSingleQuote(s) {
  return "'" + String(s || '').replace(/'/g, "''") + "'";
}

function runPowerShellEncoded(script, timeoutMs = 15000) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return execFileSync('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', b64], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
}

function showNativeConfirm(title, message) {
  if (process.platform === 'win32') {
    try {
      const ps = [
        'Add-Type -AssemblyName System.Windows.Forms',
        `$r = [System.Windows.Forms.MessageBox]::Show(${psSingleQuote(message)}, ${psSingleQuote(title)}, [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Information)`,
        'if ($r -eq [System.Windows.Forms.DialogResult]::Yes) { Write-Output "YES" } else { Write-Output "NO" }',
      ].join('\n');
      return runPowerShellEncoded(ps, 120000).trim() === 'YES';
    } catch (_) {
      return false;
    }
  }
  if (process.platform === 'darwin') {
    try {
      const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      execFileSync('osascript', [
        '-e',
        `display dialog "${esc(message)}" with title "${esc(title)}" buttons {"稍后再说", "立即重启恢复中文"} default button 2`,
      ], { encoding: 'utf8', timeout: 120000 });
      return true;
    } catch (_) {
      return false;
    }
  }
  try {
    execFileSync('zenity', ['--question', `--title=${title}`, `--text=${message}`], { timeout: 120000 });
    return true;
  } catch (_) {
    return false;
  }
}

function showNativeMessage(title, message, isError = false) {
  if (process.platform === 'win32') {
    try {
      const icon = isError ? 'Error' : 'Information';
      const ps = [
        'Add-Type -AssemblyName System.Windows.Forms',
        `[void][System.Windows.Forms.MessageBox]::Show(${psSingleQuote(message)}, ${psSingleQuote(title)}, [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::${icon})`,
      ].join('\n');
      runPowerShellEncoded(ps, 60000);
    } catch (_) {}
  } else if (process.platform === 'darwin') {
    try {
      const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      execFileSync('osascript', ['-e', `display dialog "${esc(message)}" with title "${esc(title)}" buttons {"确定"} default button 1`], { timeout: 60000 });
    } catch (_) {}
  }
}

/**
 * 安全退出除当前脚本进程外的其他 Antigravity 进程（先优雅关闭，超时后再强制结束残留进程）
 */
function closeOtherAntigravityProcesses() {
  const initialPids = listOtherRunningAntigravityPids();
  if (initialPids.length === 0) return true;

  if (process.platform === 'win32') {
    // 第 1 步：向指定 PID 列表发送优雅退出请求（严禁使用 /IM，防止误杀当前 ELECTRON_RUN_AS_NODE 自身）
    try {
      const args = [];
      for (const pid of initialPids) args.push('/PID', pid);
      execFileSync('taskkill', args, { stdio: 'ignore', timeout: 5000 });
    } catch (_) {}

    for (let i = 0; i < 12; i++) {
      sleepSync(200);
      if (listOtherRunningAntigravityPids().length === 0) {
        sleepSync(300);
        return true;
      }
    }

    // 第 2 步：对仍未退出的残留进程执行强制结束（依然仅限非自身 PID）
    const remain = listOtherRunningAntigravityPids();
    if (remain.length > 0) {
      try {
        const args = ['/F'];
        for (const pid of remain) args.push('/PID', pid);
        execFileSync('taskkill', args, { stdio: 'ignore', timeout: 5000 });
      } catch (_) {}
    }

    for (let i = 0; i < 15; i++) {
      sleepSync(200);
      if (listOtherRunningAntigravityPids().length === 0) {
        sleepSync(350);
        return true;
      }
    }
    return listOtherRunningAntigravityPids().length === 0;
  }

  for (const sig of ['-TERM', '-KILL']) {
    const pids = listOtherRunningAntigravityPids();
    if (pids.length === 0) return true;
    try {
      execFileSync('kill', [sig, ...pids], { stdio: 'ignore', timeout: 3000 });
    } catch (_) {}
    for (let i = 0; i < 12; i++) {
      sleepSync(200);
      if (listOtherRunningAntigravityPids().length === 0) {
        sleepSync(250);
        return true;
      }
    }
  }
  return listOtherRunningAntigravityPids().length === 0;
}

function createWindowsShortcut(lnkPath, targetPath, args, workingDir, iconLocation, description) {
  const psScript = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$s = $ws.CreateShortcut(${psSingleQuote(lnkPath)})`,
    `$s.TargetPath = ${psSingleQuote(targetPath)}`,
    args ? `$s.Arguments = ${psSingleQuote(args)}` : '',
    workingDir ? `$s.WorkingDirectory = ${psSingleQuote(workingDir)}` : '',
    iconLocation ? `$s.IconLocation = ${psSingleQuote(iconLocation)}` : '',
    `$s.Description = ${psSingleQuote(description)}`,
    '$s.Save()',
  ].filter(Boolean).join('\n');

  runPowerShellEncoded(psScript, 15000);
}

function getWindowsShortcutPaths() {
  const desktop = runPowerShellEncoded('[Environment]::GetFolderPath("Desktop")', 10000).trim();
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
 * 将汉化补丁安全写入 app.asar（带备份、校验与文件句柄释放重试）
 */
function patchAsarCore(info, { silent = false } = {}) {
  const log = silent ? () => {} : console.log;
  const patchState = getAsarPatchInfo(info.asarPath);
  let sourceAsarForBuild = info.asarPath;

  log(`[1/5] 已定位 Antigravity v${info.appVersion}: ${info.asarPath}`);

  if (!patchState.patched) {
    log(`[2/5] 正在备份原版 app.asar -> ${path.basename(info.backupPath)} ...`);
    fs.copyFileSync(info.asarPath, info.backupPath);
  } else if (fs.existsSync(info.backupPath)) {
    log('[2/5] 检测到已安装过汉化补丁，正在基于原版备份刷新至最新版本...');
    sourceAsarForBuild = info.backupPath;
  } else {
    log('[2/5] 检测到已安装过汉化补丁（无独立备份），将就地更新补丁内容...');
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
  log('[3/5] 正在构建汉化版 app.asar（保留全部原始元数据与 SHA-256 校验）...');
  try {
    rebuildAsar(sourceAsarForBuild, tmpAsarPath, replacements);

    log('[4/5] 正在校验构建产物完整性...');
    const { header } = readAsarHeader(tmpAsarPath);
    if (!findNode(header, 'dist/main.js') || !findNode(header, 'dist/zh-cn/main-hook.js') || !findNode(header, 'package.json')) {
      throw new Error('校验失败：新 app.asar 缺少关键条目。');
    }
    const verifyMain = readAsarFile(tmpAsarPath, 'dist/main.js').toString('utf8');
    if (!verifyMain.startsWith(PATCH_MARKER)) {
      throw new Error('校验失败：补丁入口未正确写入 dist/main.js。');
    }

    log('[5/5] 正在写入目标文件...');
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        try {
          fs.renameSync(tmpAsarPath, info.asarPath);
        } catch (_) {
          fs.copyFileSync(tmpAsarPath, info.asarPath);
          fs.unlinkSync(tmpAsarPath);
        }
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        sleepSync(300);
      }
    }
    if (lastErr) throw lastErr;
  } catch (err) {
    if (fs.existsSync(tmpAsarPath)) {
      try { fs.unlinkSync(tmpAsarPath); } catch (_) {}
    }
    throw new Error(`写入 app.asar 失败（可能文件被占用或缺少权限）：${err.message}`);
  }
}

function restoreAsarCore(info, { silent = false } = {}) {
  const log = silent ? () => {} : console.log;
  if (fs.existsSync(info.backupPath)) {
    log(`[1/2] 正在从原版备份恢复: ${info.backupPath}`);
    fs.copyFileSync(info.backupPath, info.asarPath);
    log('[2/2] 正在清理备份文件...');
    fs.unlinkSync(info.backupPath);
    return true;
  }

  if (!isAsarPatched(info.asarPath)) {
    return false;
  }

  log('[1/2] 未找到备份文件，正在直接从 app.asar 移除汉化注入...');
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
  log('[2/2] 清理完成。');
  return true;
}

function spawnAntigravityApp(info) {
  if (!info.exePath || !fs.existsSync(info.exePath)) {
    throw new Error(`未找到 Antigravity 可执行文件（安装目录：${info.rootDir}）。`);
  }
  const childEnv = Object.assign({}, process.env);
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(info.exePath, [], {
    detached: true,
    stdio: 'ignore',
    env: childEnv,
    windowsHide: false,
  });
  child.unref();
}

/**
 * v3.1 核心功能：智能自愈防更新常驻部署
 * - 独立常驻目录，官方自动更新永远删不掉，下载包用完即可删
 * - 生成零黑框「Antigravity 中文版」桌面/开始菜单快捷方式（可固定到任务栏）
 * - 每次点击中文图标时自动检测 app.asar：正常 10ms 秒开；若官方刚更新则 0.3 秒静默自动修复再启动
 */
function cmdDeploy(customPath, overrideDeployDir, noShortcuts, skipInitialPatch) {
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

  console.log('[3/4] 正在生成零黑框智能自愈启动器...');
  const createdEntries = [];

  if (process.platform === 'win32') {
    const launchCmdPath = path.join(deployDir, 'launch.cmd');
    const launchVbsPath = path.join(deployDir, 'launch-silent.vbs');

    // 纯 ASCII + chcp 65001，杜绝 CMD 乱码，启动时调用 --gui 智能自愈启动
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
      '  where node >nul 2>&1 && (node "%BASE%\\core\\patcher.js" launch --gui & exit /b %errorlevel%)',
      '  exit /b 1',
      ')',
      'set "ELECTRON_RUN_AS_NODE=1"',
      '"%AGY_EXE%" "%BASE%\\core\\patcher.js" launch --gui',
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
      const desc = 'Antigravity 简体中文版（智能自愈防更新 · 升级后自动恢复中文）';
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
      'ELECTRON_RUN_AS_NODE=1 "$BIN" "$DIR/core/patcher.js" launch --gui',
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
      'ELECTRON_RUN_AS_NODE=1 "$BIN" "$DIR/core/patcher.js" launch --gui',
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
        'Comment=Antigravity 简体中文版（智能自愈防更新）',
        `Exec="${launchSh}"`,
        'Terminal=false',
        'Categories=Development;Utility;',
        '',
      ].join('\n');
      fs.writeFileSync(desktopFile, desktopContent, 'utf8');
      createdEntries.push(desktopFile);
    }
  }

  let initialPatchStatus = 'skipped';
  if (!skipInitialPatch) {
    const patchState = getAsarPatchInfo(info.asarPath);
    const needsPatch = !patchState.patched || patchState.version !== VERSION;
    if (!needsPatch) {
      initialPatchStatus = 'already_latest';
    } else if (listOtherRunningAntigravityPids().length === 0) {
      console.log('\n正在同步激活当前版本的中文补丁（约 0.3 秒）...');
      patchAsarCore(info, { silent: true });
      initialPatchStatus = 'patched_now';
    } else {
      initialPatchStatus = 'deferred_to_launcher';
    }
  }

  console.log('');
  console.log('======================================================');
  console.log(`  ✅ 「智能自愈防更新版」v${VERSION} 部署成功！`);
  console.log('======================================================');
  console.log(`  常驻目录 : ${deployDir}`);
  for (const e of createdEntries) {
    console.log(`  快捷方式 : ${e}`);
  }
  console.log('');
  if (initialPatchStatus === 'patched_now' || initialPatchStatus === 'already_latest') {
    console.log('  ✅ 当前版本的中文补丁已同步就绪，直接双击「Antigravity 中文版」即可体验！');
  } else if (initialPatchStatus === 'deferred_to_launcher') {
    console.log('  ℹ️ 检测到 Antigravity 当前正在运行，为避免中断你的工作暂未强制重启。');
    console.log(`  👉 下次双击桌面「${SHORTCUT_NAME}」图标时，弹窗点“是”即可 0.3 秒自动重启并恢复中文！`);
  }
  console.log('');
  console.log('  使用说明：');
  console.log(`  1. 建议将桌面「${SHORTCUT_NAME}」右键固定到任务栏，以后都点它启动。`);
  console.log('  2. 以后无论官方自动更新到什么新版本，点「Antigravity 中文版」都会 0.3 秒自动自愈恢复中文！');
  console.log('  3. 装完后可以把下载的压缩包删掉，不影响常驻使用。');
  console.log('  4. 运行时按 Ctrl+Alt+L 可秒切中英文，按 Ctrl+Alt+Shift+D 可一键采集漏译。');
  console.log('======================================================');
}

function cmdUndeploy(customPath, overrideDeployDir, noShortcuts, force) {
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

  // 同时尝试把 app.asar 还原为官方英文原版
  let asarRestoreNote = '';
  try {
    const info = findAntigravityInstall(customPath);
    if (isAsarPatched(info.asarPath) || fs.existsSync(info.backupPath)) {
      if (listOtherRunningAntigravityPids().length > 0 && !force) {
        asarRestoreNote = '⚠️ 检测到 Antigravity 正在运行，暂未还原 app.asar。请彻底退出托盘中的 Antigravity 后再次运行卸载以恢复英文原版。';
      } else {
        const restored = restoreAsarCore(info, { silent: false });
        if (restored) removedAnything = true;
      }
    }
  } catch (_) {}

  if (asarRestoreNote) {
    console.log('\n' + asarRestoreNote);
  } else if (removedAnything) {
    console.log('\n✅ 已彻底卸载汉化工具并还原官方英文原版！');
  } else {
    console.log('ℹ️ 当前未检测到已安装的汉化组件或补丁。');
  }
}

function cmdStatus(customPath, overrideDeployDir) {
  const info = findAntigravityInstall(customPath);
  const patchState = getAsarPatchInfo(info.asarPath);
  const hasBackup = fs.existsSync(info.backupPath);
  const runningPids = listOtherRunningAntigravityPids();
  const deployDir = resolveDeployDir(overrideDeployDir);
  const deployed = fs.existsSync(path.join(deployDir, 'core', 'main-hook.js'));

  const patchLabel = patchState.patched
    ? `已激活（补丁版本 v${patchState.version}${patchState.version !== VERSION ? '，可刷新至 v' + VERSION : ''}）`
    : '未激活（官方原版 app.asar，点「Antigravity 中文版」将自动自愈）';

  console.log('======================================================');
  console.log(`  Antigravity 2.0 简体中文 UI 汉化工具 v${VERSION} - 状态检测`);
  console.log('======================================================');
  console.log(`  安装目录   : ${info.rootDir}`);
  console.log(`  应用版本   : v${info.appVersion}`);
  console.log(`  防更新常驻 : ${deployed ? '已安装 (' + deployDir + ')' : '未安装（推荐选 1 安装）'}`);
  console.log(`  当前补丁   : ${patchLabel}`);
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
      '请先彻底退出 Antigravity（包括右下角系统托盘右键 -> Quit / 退出），然后再执行安装。'
    );
  }

  patchAsarCore(info, { silent: false });
  console.log('');
  console.log(`✅ 汉化补丁 v${VERSION} 安装成功！`);
  console.log('   - 现在直接打开 Antigravity 即可看到简体中文界面。');
  console.log('   - 运行时按 Ctrl+Alt+L 可随时在“简体中文 / English”之间瞬切。');
  console.log('   - 提示：推荐选 [1] 安装「智能自愈防更新版」，以后官方升级后无需手动重跑！');
}

function cmdUninstall(customPath, force) {
  const info = findAntigravityInstall(customPath);
  const runningPids = listOtherRunningAntigravityPids();

  if (runningPids.length > 0 && !force) {
    throw new Error(
      `检测到 Antigravity 正在运行（进程数: ${runningPids.length}）。\n` +
      '请先彻底退出 Antigravity（包括右下角系统托盘右键退出），再执行还原。'
    );
  }

  const restored = restoreAsarCore(info, { silent: false });
  if (restored) {
    console.log('\n✅ 已成功还原为官方英文原版！');
  } else {
    console.log('ℹ️ 当前 app.asar 已经是官方未汉化状态，无需还原。');
  }
}

/**
 * 智能自愈启动：
 * - 若 app.asar 已是最新汉化版：10ms 内直接启动 Antigravity
 * - 若刚被官方自动更新覆盖：
 *   * 无残留进程 -> 0.3 秒静默自动重新注入并启动中文版
 *   * 有英文进程在托盘运行 -> 弹窗征询确认，点“是”自动安全关闭旧进程、自愈并重开中文版
 */
function cmdLaunch(customPath, { gui = false, noSpawn = false, force = false } = {}) {
  const info = findAntigravityInstall(customPath);
  const patchState = getAsarPatchInfo(info.asarPath);
  const needsHeal = !patchState.patched || patchState.version !== VERSION;

  if (needsHeal) {
    const runningPids = listOtherRunningAntigravityPids();
    if (runningPids.length > 0 && !force) {
      if (gui) {
        const title = `Antigravity 简体中文版 — 检测到版本更新 (v${info.appVersion})`;
        const msg = [
          `检测到 Antigravity 已更新至 v${info.appVersion}，需要自动重新应用中文汉化（约 0.3 秒）。`,
          '',
          '当前后台仍有旧进程在运行（可能缩在右下角系统托盘）。',
          '是否立即自动重启 Antigravity 并恢复简体中文界面？',
          '',
          '（提示：如果正有进行中的对话，请先点“否”，待完成后再双击「Antigravity 中文版」即可自动恢复。）',
        ].join('\r\n');

        const confirmed = showNativeConfirm(title, msg);
        if (!confirmed) {
          return;
        }
        const closed = closeOtherAntigravityProcesses();
        if (!closed) {
          showNativeMessage(
            'Antigravity 简体中文版',
            '未能完全退出旧的 Antigravity 进程。\r\n请右键右下角托盘图标点击 Quit 彻底退出后，再双击「Antigravity 中文版」。',
            true
          );
          return;
        }
      } else {
        throw new Error(
          `检测到 Antigravity 已更新至 v${info.appVersion}，且后台仍有旧进程（进程数: ${runningPids.length}）。\n` +
          '请先右键右下角托盘退出 Antigravity，或直接双击桌面「Antigravity 中文版」图标一键自动重启并恢复中文！'
        );
      }
    }

    try {
      if (!gui) {
        console.log(`🔧 检测到 Antigravity v${info.appVersion} 需要应用/同步 v${VERSION} 汉化，正在自动自愈（约 0.3 秒）...`);
      }
      patchAsarCore(info, { silent: gui });
      if (!gui) {
        console.log('✅ 自动自愈完成！');
      }
    } catch (err) {
      if (gui) {
        showNativeMessage(
          'Antigravity 简体中文版 — 自动恢复失败',
          `自动应用汉化时出错：\r\n${err.message}\r\n\r\n如果安装在 Program Files 目录，请尝试右键「一键汉化工具.bat」以管理员身份运行。`,
          true
        );
        return;
      }
      throw err;
    }
  }

  if (noSpawn) {
    console.log(`[no-spawn] 已就绪：Antigravity v${info.appVersion} (${info.exePath})`);
    return;
  }

  if (!gui) {
    console.log(`🚀 正在启动 Antigravity 简体中文版 (v${info.appVersion}) ...`);
  }
  spawnAntigravityApp(info);
}

function cmdShortcut(customPath, overrideDeployDir) {
  cmdDeploy(customPath, overrideDeployDir, false, false);
}

/**
 * 交互式 UTF-8 菜单（彻底取代 .bat 中文菜单，在任意 Windows 终端下 100% 零乱码）
 */
async function cmdMenu(initialCustomPath) {
  let customPath = initialCustomPath || '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise((resolve) => rl.question(prompt, (ans) => resolve(ans)));

  try {
    while (true) {
      console.log('');
      console.log('======================================================================');
      console.log(`      Antigravity 2.0 简体中文 UI 汉化工具 v${VERSION}（智能自愈防更新）`);
      console.log('======================================================================');
      if (customPath) {
        console.log(`  当前指定路径：${customPath}`);
        console.log('');
      }
      console.log('  [1] 一键安装「智能自愈防更新版」（强烈推荐！）');
      console.log('      · 独立常驻目录，官方怎么自动更新都删不掉，装完下载包可删');
      console.log('      · 生成零黑框「Antigravity 中文版」桌面/开始菜单图标（可固定任务栏）');
      console.log('      · 官方升级覆盖后点中文图标，0.3 秒自动检测并无感恢复中文');
      console.log('');
      console.log('  [2] 仅安装/刷新补丁（直接修改 app.asar，不装常驻启动器）');
      console.log('  [3] 立即启动中文版（若官方刚更新则自动自愈并启动）');
      console.log('  [4] 卸载汉化并还原官方英文原版（清理常驻目录、快捷方式与补丁）');
      console.log('  [5] 查看当前安装路径与汉化状态');
      console.log('  [6] 手动指定 Antigravity 安装目录');
      console.log('  [0] 退出');
      console.log('');
      console.log('  快捷键：Ctrl+Alt+L 秒切中英文  |  Ctrl+Alt+Shift+D 一键采集漏译');
      console.log('======================================================================');

      const raw = (await ask('\n请输入数字选项并按回车 [1-6/0]: ')).trim();
      if (raw === '0' || raw.toLowerCase() === 'q') {
        break;
      }

      console.log('');
      try {
        switch (raw) {
          case '1':
            cmdDeploy(customPath, '', false, false);
            break;
          case '2':
            cmdInstall(customPath, false);
            break;
          case '3':
            cmdLaunch(customPath, { gui: false, noSpawn: false, force: false });
            break;
          case '4':
            cmdUndeploy(customPath, '', false, false);
            break;
          case '5':
            cmdStatus(customPath, '');
            break;
          case '6': {
            const p = (await ask('请拖入或粘贴 Antigravity 安装目录（留空恢复自动检测）: ')).trim().replace(/^"|"$/g, '');
            customPath = p;
            console.log(customPath ? `✅ 已切换目标路径为：${customPath}` : '✅ 已恢复自动检测路径。');
            break;
          }
          default:
            console.log('⚠️ 无效选项，请输入 0~6 之间的数字。');
            continue;
        }
      } catch (err) {
        console.error('\n❌ 操作未能完成：');
        console.error(err && err.message ? err.message : String(err));
      }

      await ask('\n按回车键返回主菜单...');
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const { cmd, customPath, deployDir, force, noShortcuts, gui, noSpawn, skipInitialPatch } = parseArgs(process.argv);
  try {
    switch (cmd) {
      case 'menu':
        await cmdMenu(customPath);
        break;
      case 'deploy':
        cmdDeploy(customPath, deployDir, noShortcuts, skipInitialPatch);
        break;
      case 'undeploy':
        cmdUndeploy(customPath, deployDir, noShortcuts, force);
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
        cmdLaunch(customPath, { gui, noSpawn, force });
        break;
      case 'shortcut':
        cmdShortcut(customPath, deployDir);
        break;
      default:
        console.log('用法: node patcher.js <menu|deploy|undeploy|launch|status|install|uninstall> [--path <路径>]');
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
