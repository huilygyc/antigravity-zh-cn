'use strict';

/**
 * Antigravity 2.0 渲染进程 DOM 汉化引擎构建器 (v2.0)
 *
 * 特性：
 * 1. React 虚拟 DOM 安全：仅修改 TextNode.nodeValue 与少量文本属性，绝不增删/替换 React 节点。
 * 2. 规范化回退查表：自动兼容弯引号 (’/“/”)、省略号 (… / ...) 与 JSX 多行换行空白。
 * 3. 手术级物理免疫：严格跳过用户聊天内容、AI Markdown 正文、Lexical 输入框、xterm 终端、
 *    代码块/Diff、文件树、网址栏、Material Symbols 图标字体。
 * 4. 中文字体渲染优化：仅作用于 UI 基础字体回退，绝不干扰代码等宽字体与图标字体。
 * 5. 快捷键：
 *    - Ctrl+Alt+L：实时瞬切“简体中文 / English”
 *    - Ctrl+Alt+Shift+D：一键采集当前页面尚未汉化的英文 UI 文案到剪贴板（便于后续增补词典）
 */

/**
 * 生成可直接在隔离世界 (Isolated World) 中执行的自包含渲染脚本字符串。
 * @param {Record<string, string>} dict
 * @param {Array<[string, string, string]>} patternSpecs
 * @returns {string}
 */
function buildRendererScript(dict, patternSpecs) {
  const payload = JSON.stringify({ dict, patternSpecs });

  return `(() => {
  'use strict';
  if (window.__AGY_ZH_CN_RENDERER_ACTIVE__) return;

  // 双重校验：确保当前页面是 Antigravity 自身界面或内置提示页，绝不介入内置浏览器中的外部网页或用户本地项目
  const isAntigravitySurface =
    !!document.querySelector('link[href*="jetbox.css"]') ||
    document.title === 'Jetski Web' ||
    (typeof document.title === 'string' && document.title.indexOf('Antigravity') !== -1) ||
    location.protocol === 'data:';

  if (!isAntigravitySurface) return;
  window.__AGY_ZH_CN_RENDERER_ACTIVE__ = true;

  const DATA = ${payload};

  function normalizeLookup(s) {
    return s
      .replace(/[\\u2018\\u2019]/g, "'")
      .replace(/[\\u201C\\u201D]/g, '"')
      .replace(/\\u2026/g, '...')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  const EXACT = new Map();
  const NORM_EXACT = new Map();
  for (const [k, v] of Object.entries(DATA.dict)) {
    EXACT.set(k, v);
    const nk = normalizeLookup(k);
    if (nk && !NORM_EXACT.has(nk)) {
      NORM_EXACT.set(nk, v);
    }
  }
  const PATTERNS = DATA.patternSpecs.map(([src, flags, rep]) => [new RegExp(src, flags), rep]);

  const STORAGE_KEY = 'antigravity_zh_cn_enabled';
  let enabled = true;
  try {
    const saved = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
    if (saved === '0') enabled = false;
  } catch (_) {}

  // 仅用于节点文本的物理免疫选择器（严禁篡改用户输入、AI 正文、代码、终端、图标字体）
  const TEXT_IMMUNE_SELECTOR = [
    'script', 'style', 'noscript', 'template', 'svg',
    'code', 'pre', 'kbd', 'textarea', 'input',
    '[contenteditable="true"]', '[contenteditable=""]',
    '[role="textbox"]', '[data-lexical-slot]',
    '.material-symbols-outlined', '.material-symbols-rounded', '.material-symbols-sharp',
    '.material-icons', '[data-icon]',
    '[data-testid="user-message-content"]',
    '[data-markdown-block-index]',
    '.xterm', '.xterm-screen',
    '[data-testid="terminal-surface"]', '[data-testid="terminal-tab-surface"]', '[data-testid="standalone-terminal-view"]',
    '.monaco-editor', '.shiki',
    '[data-testid="code-gutter"]', '[data-testid="code-gutter-diff"]',
    '[data-line-number]', '[data-current-original-line]', '[data-current-modified-line]',
    '[data-testid="tab-file-tree-sidebar"]',
    '[data-testid="csv-file-viewer"]',
    '[data-testid="vcs-commit-message"]',
    '[data-testid="background-task-command"]',
    '[data-testid="browser-url-display"]', '[data-testid="browser-url-input"]',
    '[data-testid="webview-download-filename"]',
    '[data-zh-ignore="true"]'
  ].join(',');

  // 用于属性 (placeholder / title / aria-label / data-tooltip) 的免疫容器
  const ATTR_IMMUNE_SELECTOR = [
    '[data-testid="user-message-content"]',
    '[data-markdown-block-index]',
    '.xterm', '.monaco-editor', '.shiki',
    '[data-testid="tab-file-tree-sidebar"]',
    '[data-zh-ignore="true"]'
  ].join(',');

  const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label', 'data-tooltip', 'data-tooltip-content'];

  const ORIG_TEXT = new WeakMap();
  const APPLIED_TEXT = new WeakMap();
  const ORIG_ATTRS = new WeakMap();
  const APPLIED_ATTRS = new WeakMap();
  const CACHE = new Map();
  const MAX_CACHE = 6000;

  let isApplying = false;

  function translateText(raw) {
    if (!raw || typeof raw !== 'string') return null;
    if (raw.length > 420) return null;

    // 快速跳过无英文字母的字符串
    let hasAsciiLetter = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
        hasAsciiLetter = true;
        break;
      }
    }
    if (!hasAsciiLetter) return null;

    const cached = CACHE.get(raw);
    if (cached !== undefined) return cached;

    const m = raw.match(/^(\\s*)([\\s\\S]*?)(\\s*)$/);
    if (!m) return null;
    const lead = m[1];
    const core = m[2];
    const trail = m[3];
    if (!core) return null;

    // 1. 精确匹配
    let hit = EXACT.get(core);

    // 2. 规范化回退匹配（兼容弯引号、省略号、多行空白）
    let normCore = null;
    if (hit === undefined) {
      normCore = normalizeLookup(core);
      hit = NORM_EXACT.get(normCore);
    }

    // 3. 动态正则规则匹配
    if (hit === undefined) {
      for (let i = 0; i < PATTERNS.length; i++) {
        const [re, rep] = PATTERNS[i];
        if (re.test(core)) {
          hit = core.replace(re, rep);
          break;
        }
        if (normCore && normCore !== core && re.test(normCore)) {
          hit = normCore.replace(re, rep);
          break;
        }
      }
    }

    const result = hit !== undefined ? (lead + hit + trail) : null;
    if (CACHE.size >= MAX_CACHE) CACHE.clear();
    CACHE.set(raw, result);
    return result;
  }

  function isTextImmune(textNode) {
    const parent = textNode.parentElement;
    if (!parent) return true;
    try {
      return !!parent.closest(TEXT_IMMUNE_SELECTOR);
    } catch (_) {
      return true;
    }
  }

  function isAttrImmune(el) {
    if (!el || el.nodeType !== 1) return true;
    try {
      return !!el.closest(ATTR_IMMUNE_SELECTOR);
    } catch (_) {
      return true;
    }
  }

  function processTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    if (isTextImmune(node)) return;

    const cur = node.nodeValue;
    if (!enabled) {
      const orig = ORIG_TEXT.get(node);
      if (orig !== undefined && APPLIED_TEXT.get(node) === cur) {
        isApplying = true;
        try { node.nodeValue = orig; } finally { isApplying = false; }
        APPLIED_TEXT.delete(node);
      }
      return;
    }

    if (APPLIED_TEXT.get(node) === cur) return;
    const translated = translateText(cur);
    if (translated !== null && translated !== cur) {
      ORIG_TEXT.set(node, cur);
      APPLIED_TEXT.set(node, translated);
      isApplying = true;
      try { node.nodeValue = translated; } finally { isApplying = false; }
    }
  }

  function processElementAttrs(el) {
    if (!el || el.nodeType !== 1) return;
    if (isAttrImmune(el)) return;

    let origMap = ORIG_ATTRS.get(el);
    let appliedMap = APPLIED_ATTRS.get(el);

    for (let i = 0; i < TRANSLATABLE_ATTRS.length; i++) {
      const attr = TRANSLATABLE_ATTRS[i];
      if (!el.hasAttribute(attr)) continue;
      const cur = el.getAttribute(attr);
      if (!cur) continue;

      if (!enabled) {
        if (origMap && Object.prototype.hasOwnProperty.call(origMap, attr) && appliedMap && appliedMap[attr] === cur) {
          isApplying = true;
          try { el.setAttribute(attr, origMap[attr]); } finally { isApplying = false; }
          delete appliedMap[attr];
        }
        continue;
      }

      if (appliedMap && appliedMap[attr] === cur) continue;
      const translated = translateText(cur);
      if (translated !== null && translated !== cur) {
        if (!origMap) { origMap = Object.create(null); ORIG_ATTRS.set(el, origMap); }
        if (!appliedMap) { appliedMap = Object.create(null); APPLIED_ATTRS.set(el, appliedMap); }
        origMap[attr] = cur;
        appliedMap[attr] = translated;
        isApplying = true;
        try { el.setAttribute(attr, translated); } finally { isApplying = false; }
      }
    }
  }

  function walkSubtree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      processTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;

    if (root.nodeType === 1) {
      if (root.matches && root.matches('[data-testid="user-message-content"],[data-markdown-block-index],.xterm,.monaco-editor,.shiki,[data-testid="tab-file-tree-sidebar"],[data-zh-ignore="true"],svg,script,style')) {
        return;
      }
      processElementAttrs(root);
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(n) {
          if (n.nodeType === 1) {
            const tag = n.tagName;
            if (tag === 'SVG' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }
            if (n.hasAttribute && (
              n.hasAttribute('data-markdown-block-index') ||
              n.hasAttribute('data-zh-ignore') ||
              n.getAttribute('data-testid') === 'user-message-content' ||
              n.getAttribute('data-testid') === 'tab-file-tree-sidebar'
            )) {
              return NodeFilter.FILTER_REJECT;
            }
            if (n.classList && (n.classList.contains('xterm') || n.classList.contains('monaco-editor') || n.classList.contains('shiki'))) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === 3) {
        processTextNode(current);
      } else if (current.nodeType === 1) {
        processElementAttrs(current);
      }
    }
  }

  // 安全优化中文字体显示（仅作用于 body 基础回退，绝不影响代码字体与 Material Symbols 图标字体）
  const STYLE_ID = 'agy-zh-cn-typography';
  function applyDocumentMeta() {
    try {
      document.documentElement.lang = enabled ? 'zh-CN' : 'en';
      const existingStyle = document.getElementById(STYLE_ID);
      if (enabled) {
        if (!existingStyle && document.head) {
          const style = document.createElement('style');
          style.id = STYLE_ID;
          style.setAttribute('data-zh-ignore', 'true');
          style.textContent = [
            'html[lang="zh-CN"] body {',
            '  font-family: "Inter", "Google Sans", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", system-ui, -apple-system, sans-serif;',
            '  -webkit-font-smoothing: antialiased;',
            '}'
          ].join('\\n');
          document.head.appendChild(style);
        }
      } else if (existingStyle && existingStyle.parentNode) {
        existingStyle.parentNode.removeChild(existingStyle);
      }
    } catch (_) {}
  }

  // 批量调度队列，避免高频流式更新造成卡顿
  const pendingNodes = new Set();
  let flushScheduled = false;

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    const runner = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);
    runner(() => {
      flushScheduled = false;
      const batch = Array.from(pendingNodes);
      pendingNodes.clear();
      for (let i = 0; i < batch.length; i++) {
        const node = batch[i];
        if (!node || !node.isConnected) continue;
        walkSubtree(node);
      }
    });
  }

  // 轻量级状态提示吐司
  let toastTimer = null;
  function showToast(text) {
    try {
      let el = document.getElementById('agy-zh-cn-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'agy-zh-cn-toast';
        el.setAttribute('data-zh-ignore', 'true');
        Object.assign(el.style, {
          position: 'fixed',
          right: '16px',
          bottom: '16px',
          zIndex: '2147483647',
          padding: '8px 14px',
          borderRadius: '10px',
          fontSize: '12px',
          fontWeight: '500',
          fontFamily: 'system-ui, -apple-system, "Microsoft YaHei UI", "PingFang SC", sans-serif',
          color: '#F5F5F5',
          background: 'rgba(24, 24, 27, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'none',
          opacity: '0',
          transition: 'opacity 180ms ease',
        });
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = text;
      el.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (el) el.style.opacity = '0';
      }, 2000);
    } catch (_) {}
  }

  function toggleLanguage() {
    enabled = !enabled;
    try {
      if (window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      }
    } catch (_) {}
    applyDocumentMeta();
    walkSubtree(document.body || document.documentElement);
    showToast(enabled ? 'Antigravity 界面语言：简体中文（Ctrl+Alt+L 切换）' : 'Antigravity UI Language: English (Ctrl+Alt+L)');
  }

  // 开发者辅助：一键采集当前页面可见的未汉化英文 UI 文案（Ctrl+Alt+Shift+D）
  function collectUntranslated() {
    const found = {};
    const target = document.body || document.documentElement;
    if (!target) return;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (isTextImmune(node)) continue;
      const t = (node.nodeValue || '').trim();
      if (!t || t.length < 2 || t.length > 260) continue;
      if (!/[A-Za-z]{2,}/.test(t) || /[\\u4e00-\\u9fff]/.test(t)) continue;
      if (APPLIED_TEXT.get(node) === node.nodeValue) continue;
      found[t] = '';
    }
    const keys = Object.keys(found);
    const jsonText = JSON.stringify(found, null, 2);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(jsonText).catch(() => {});
      }
    } catch (_) {}
    showToast(keys.length > 0 ? ('已采集 ' + keys.length + ' 条未汉化英文到剪贴板') : '当前页面已全部汉化，无漏译词条');
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && (e.key === 'l' || e.key === 'L' || e.code === 'KeyL')) {
      e.preventDefault();
      e.stopPropagation();
      toggleLanguage();
    } else if (e.ctrlKey && e.altKey && e.shiftKey && !e.metaKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
      e.preventDefault();
      e.stopPropagation();
      collectUntranslated();
    }
  }, true);

  function startObserver() {
    const target = document.body || document.documentElement;
    if (!target) return;
    applyDocumentMeta();
    walkSubtree(target);

    const observer = new MutationObserver((mutations) => {
      if (isApplying) return;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'characterData') {
          if (m.target) pendingNodes.add(m.target);
        } else if (m.type === 'attributes') {
          if (m.target && m.target.nodeType === 1) {
            processElementAttrs(m.target);
          }
        } else if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            pendingNodes.add(m.addedNodes[j]);
          }
        }
      }
      if (pendingNodes.size > 0) scheduleFlush();
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
})();`;
}

module.exports = { buildRendererScript };
