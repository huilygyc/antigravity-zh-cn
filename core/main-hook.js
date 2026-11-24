'use strict';

/**
 * Antigravity 2.0 Electron 主进程汉化钩子
 *
 * 同时支持两种运行模式（共用同一套代码）：
 *   1. 永久补丁模式：由 app.asar 内 dist/main.js 首行加载
 *   2. 无侵入启动模式：由启动脚本通过 NODE_OPTIONS=--require 加载（零修改原程序）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// 严格隔离：仅在 Electron 主进程 ('browser') 中生效，绝不干扰子进程、终端脚本、MCP 服务器或 ELECTRON_RUN_AS_NODE
if (
  process.env.ELECTRON_RUN_AS_NODE ||
  !process.versions ||
  !process.versions.electron ||
  (process.type && process.type !== 'browser')
) {
  return;
}

// 防止重复安装（例如同时使用了补丁与无侵入启动器）
if (global.__AGY_ZH_CN_MAIN_INSTALLED__) {
  return;
}
global.__AGY_ZH_CN_MAIN_INSTALLED__ = true;

// 清理 NODE_OPTIONS 中的本钩子参数，避免被子进程（语言服务器、终端、MCP 等）继承
(function sanitizeNodeOptions() {
  const raw = process.env.NODE_OPTIONS;
  if (!raw || raw.indexOf('main-hook.js') === -1) return;
  try {
    const cleaned = raw
      .replace(/(?:--require|-r)(?:=|\s+)(?:"[^"]*main-hook\.js"|'[^']*main-hook\.js'|\S*main-hook\.js)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (cleaned) {
      process.env.NODE_OPTIONS = cleaned;
    } else {
      delete process.env.NODE_OPTIONS;
    }
  } catch (_) {}
})();

const { EXACT_DICT } = require('./dict');
const { PATTERN_SPECS } = require('./patterns');
const { buildRendererScript } = require('./renderer');

function loadJsonDictSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('_')) continue;
      if (typeof v === 'string' && v.trim()) {
        out[k] = v;
      }
    }
    return out;
  } catch (_) {
    return {};
  }
}

// 合并内置词典 + 目录内 user-dict.json + 用户主目录 ~/.antigravity-zh-cn-dict.json
const MERGED_DICT = Object.assign(
  {},
  EXACT_DICT,
  loadJsonDictSafe(path.join(__dirname, 'user-dict.json')),
  loadJsonDictSafe(path.join(os.homedir(), '.antigravity-zh-cn-dict.json'))
);

const COMPILED_PATTERNS = PATTERN_SPECS.map(([src, flags, rep]) => [new RegExp(src, flags), rep]);
const RENDERER_SCRIPT = buildRendererScript(MERGED_DICT, PATTERN_SPECS);

function translateMainText(text) {
  if (typeof text !== 'string' || !text) return text;
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m) return text;
  const [, lead, core, trail] = m;
  if (!core) return text;

  if (Object.prototype.hasOwnProperty.call(MERGED_DICT, core)) {
    return lead + MERGED_DICT[core] + trail;
  }
  for (let i = 0; i < COMPILED_PATTERNS.length; i++) {
    const [re, rep] = COMPILED_PATTERNS[i];
    if (re.test(core)) {
      return lead + core.replace(re, rep) + trail;
    }
  }
  return text;
}

// 这些顶级容器 role 在 buildFromTemplate 中若与 submenu 同传会覆盖自定义子菜单，因此克隆时移除容器 role，保留已展开的 submenu
const CONTAINER_ROLES_TO_STRIP = new Set(['filemenu', 'editmenu', 'viewmenu', 'appmenu', 'windowmenu']);

// Electron 原生 role 菜单项兜底中文名（覆盖由 role 隐式生成且未显式翻译的菜单项，如 Maximize/Minimize/Close/Speech 等）
const ROLE_ZH_LABELS = {
  filemenu: '文件',
  editmenu: '编辑',
  viewmenu: '视图',
  windowmenu: '窗口',
  help: '帮助',
  services: '服务',
  about: '关于',
  hide: '隐藏',
  hideothers: '隐藏其他',
  unhide: '显示全部',
  quit: '退出',
  undo: '撤销',
  redo: '重做',
  cut: '剪切',
  copy: '复制',
  paste: '粘贴',
  pasteandmatchstyle: '粘贴并匹配样式',
  delete: '删除',
  selectall: '全选',
  reload: '重新加载',
  forcereload: '强制重新加载',
  toggledevtools: '切换开发者工具',
  resetzoom: '实际大小',
  zoomin: '放大',
  zoomout: '缩小',
  togglefullscreen: '切换全屏',
  minimize: '最小化',
  maximize: '最大化',
  unmaximize: '还原窗口',
  zoom: '缩放',
  front: '前置全部窗口',
  close: '关闭',
  startspeaking: '开始朗读',
  stopspeaking: '停止朗读',
};

function cloneMenuItemsToTemplate(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const tpl = {};
    const roleLower = typeof item.role === 'string' ? item.role.toLowerCase() : '';

    if (item.id) tpl.id = item.id;
    if (item.type) tpl.type = item.type;
    if (typeof item.label === 'string' && item.label) {
      const tr = translateMainText(item.label);
      tpl.label = (tr === item.label && roleLower && ROLE_ZH_LABELS[roleLower])
        ? ROLE_ZH_LABELS[roleLower]
        : tr;
    } else if (roleLower && ROLE_ZH_LABELS[roleLower]) {
      tpl.label = ROLE_ZH_LABELS[roleLower];
    }
    if (typeof item.sublabel === 'string' && item.sublabel) tpl.sublabel = translateMainText(item.sublabel);
    if (typeof item.toolTip === 'string' && item.toolTip) tpl.toolTip = translateMainText(item.toolTip);
    if (item.accelerator) tpl.accelerator = item.accelerator;
    if (typeof item.enabled === 'boolean') tpl.enabled = item.enabled;
    if (typeof item.visible === 'boolean') tpl.visible = item.visible;
    if (typeof item.checked === 'boolean') tpl.checked = item.checked;
    if (typeof item.registerAccelerator === 'boolean') tpl.registerAccelerator = item.registerAccelerator;

    const hasSubmenu = item.submenu && Array.isArray(item.submenu.items) && item.submenu.items.length > 0;

    if (hasSubmenu) {
      tpl.submenu = cloneMenuItemsToTemplate(item.submenu.items);
      if (roleLower && !CONTAINER_ROLES_TO_STRIP.has(roleLower)) {
        tpl.role = item.role;
      }
    } else if (roleLower) {
      tpl.role = item.role;
    }

    if (typeof item.click === 'function' && !hasSubmenu) {
      // 回调时传回原始 item（保留其英文 label），确保诸如 updateActions[menuItem.label] 之类的内部查表 100% 正常
      tpl.click = (_translatedItem, focusedWindow, event) => {
        try {
          return item.click(item, focusedWindow, event);
        } catch (err) {
          console.error('[antigravity-zh-cn] 菜单回调异常:', err);
        }
      };
    }

    return tpl;
  });
}

function isEligibleRendererUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  // Antigravity Hub 本地服务页面（渲染脚本内部还会进一步校验 jetbox.css / 标题，避免误注入用户自己的本地项目）
  if (
    url.startsWith('https://127.0.0.1:') ||
    url.startsWith('http://127.0.0.1:') ||
    url.startsWith('https://localhost:') ||
    url.startsWith('http://localhost:')
  ) {
    return true;
  }
  // 内置 HTML 提示页（如 WSL 初始化、SSH 断开页、欢迎向导），跳过空白背景幕布
  if (url.startsWith('data:text/html') && url.length > 260) {
    return true;
  }
  return false;
}

function injectIntoWebContents(wc) {
  try {
    if (!wc || wc.isDestroyed()) return;
    if (typeof wc.getType === 'function' && wc.getType() === 'webview') return;

    const url = typeof wc.getURL === 'function' ? wc.getURL() : '';
    if (!isEligibleRendererUrl(url)) return;

    if (typeof wc.executeJavaScriptInIsolatedWorld === 'function') {
      wc.executeJavaScriptInIsolatedWorld(1999, [{ code: RENDERER_SCRIPT }]).catch(() => {
        // 某些受限 data: 页面可能回退至普通 executeJavaScript
        if (!wc.isDestroyed() && typeof wc.executeJavaScript === 'function') {
          wc.executeJavaScript(RENDERER_SCRIPT).catch(() => {});
        }
      });
    } else if (typeof wc.executeJavaScript === 'function') {
      wc.executeJavaScript(RENDERER_SCRIPT).catch(() => {});
    }
  } catch (_) {}
}

let hooksApplied = false;

function installElectronHooks(electron) {
  if (hooksApplied) return;
  if (!electron || typeof electron !== 'object' || !electron.app) return;
  hooksApplied = true;

  const { app, Menu, Tray, dialog } = electron;

  // 1. 代理应用菜单（克隆翻译副本，不修改调用方持有的原始 Menu，确保异步插入 WSL 菜单、检查更新回调等 100% 稳定）
  if (Menu && typeof Menu.setApplicationMenu === 'function' && typeof Menu.buildFromTemplate === 'function') {
    const origSetAppMenu = Menu.setApplicationMenu.bind(Menu);
    const origBuildFromTemplate = Menu.buildFromTemplate.bind(Menu);

    Menu.setApplicationMenu = function patchedSetApplicationMenu(menu) {
      if (!menu || !Array.isArray(menu.items)) {
        return origSetAppMenu(menu);
      }
      try {
        const tpl = cloneMenuItemsToTemplate(menu.items);
        const translatedMenu = origBuildFromTemplate(tpl);
        return origSetAppMenu(translatedMenu);
      } catch (err) {
        console.error('[antigravity-zh-cn] 应用菜单汉化回退:', err);
        return origSetAppMenu(menu);
      }
    };

    // 2. 代理系统托盘菜单（支持运行中智能体数量实时变化、WSL 子菜单异步插入）
    if (Tray && Tray.prototype && typeof Tray.prototype.setContextMenu === 'function') {
      const origSetContextMenu = Tray.prototype.setContextMenu;
      Tray.prototype.setContextMenu = function patchedSetContextMenu(menu) {
        if (!menu || !Array.isArray(menu.items)) {
          return origSetContextMenu.call(this, menu);
        }
        try {
          const tpl = cloneMenuItemsToTemplate(menu.items);
          const translatedMenu = origBuildFromTemplate(tpl);
          return origSetContextMenu.call(this, translatedMenu);
        } catch (err) {
          console.error('[antigravity-zh-cn] 托盘菜单汉化回退:', err);
          return origSetContextMenu.call(this, menu);
        }
      };
    }

    // 3. macOS Dock 菜单汉化
    if (app.dock && typeof app.dock.setMenu === 'function') {
      const origDockSetMenu = app.dock.setMenu.bind(app.dock);
      app.dock.setMenu = function patchedDockSetMenu(menu) {
        if (!menu || !Array.isArray(menu.items)) return origDockSetMenu(menu);
        try {
          const tpl = cloneMenuItemsToTemplate(menu.items);
          return origDockSetMenu(origBuildFromTemplate(tpl));
        } catch (_) {
          return origDockSetMenu(menu);
        }
      };
    }
  }

  // 4. 代理系统原生对话框（确认退出、检查更新提示、选择工作区等）
  if (dialog) {
    const translateDialogOptions = (opts) => {
      if (!opts || typeof opts !== 'object') return opts;
      const copy = Object.assign({}, opts);
      if (typeof copy.title === 'string') copy.title = translateMainText(copy.title);
      if (typeof copy.message === 'string') copy.message = translateMainText(copy.message);
      if (typeof copy.detail === 'string') copy.detail = translateMainText(copy.detail);
      if (typeof copy.buttonLabel === 'string') copy.buttonLabel = translateMainText(copy.buttonLabel);
      if (Array.isArray(copy.buttons)) {
        copy.buttons = copy.buttons.map((b) => (typeof b === 'string' ? translateMainText(b) : b));
      }
      return copy;
    };

    for (const fnName of ['showMessageBox', 'showMessageBoxSync', 'showOpenDialog', 'showOpenDialogSync']) {
      if (typeof dialog[fnName] === 'function') {
        const origFn = dialog[fnName].bind(dialog);
        dialog[fnName] = function patchedDialog(...args) {
          try {
            if (args.length >= 2 && args[1] && typeof args[1] === 'object') {
              return origFn(args[0], translateDialogOptions(args[1]), ...args.slice(2));
            }
            if (args.length >= 1 && args[0] && typeof args[0] === 'object') {
              return origFn(translateDialogOptions(args[0]), ...args.slice(1));
            }
          } catch (_) {}
          return origFn(...args);
        };
      }
    }

    if (typeof dialog.showErrorBox === 'function') {
      const origErr = dialog.showErrorBox.bind(dialog);
      dialog.showErrorBox = function patchedErrorBox(title, content) {
        try {
          return origErr(translateMainText(title), translateMainText(content));
        } catch (_) {
          return origErr(title, content);
        }
      };
    }
  }

  // 5. 监听所有新建 WebContents，仅对 Antigravity 自身界面注入隔离世界 DOM 汉化脚本
  app.on('web-contents-created', (_event, wc) => {
    if (!wc) return;
    wc.on('dom-ready', () => injectIntoWebContents(wc));
    wc.on('did-finish-load', () => injectIntoWebContents(wc));
    wc.on('did-navigate', () => injectIntoWebContents(wc));
  });
}

// 尝试立即挂钩；若通过 NODE_OPTIONS 提前加载时尚未注册 electron 模块，则在首次 require('electron') 时挂钩
let hookedNow = false;
try {
  const maybeElectron = require('electron');
  if (maybeElectron && typeof maybeElectron === 'object' && maybeElectron.app) {
    installElectronHooks(maybeElectron);
    hookedNow = true;
  }
} catch (_) {}

if (!hookedNow) {
  const origLoad = Module._load;
  Module._load = function patchedModuleLoad(request, parent, isMain) {
    const exported = origLoad.apply(this, arguments);
    if (!hooksApplied && request === 'electron' && exported && typeof exported === 'object' && exported.app) {
      try {
        installElectronHooks(exported);
      } catch (err) {
        console.error('[antigravity-zh-cn] 挂钩 electron 失败:', err);
      } finally {
        Module._load = origLoad;
      }
    }
    return exported;
  };
}
