#!/usr/bin/env node
/**
 * LIMU 版面檢查（真實瀏覽器）
 * ---------------------------------------------------------------------------
 * 為什麼需要這一支：
 *
 * 既有的 jsdom 端對端測試能驗證「資料有沒有存對」，但它沒有版面引擎——
 * getBoundingClientRect 一律回傳 0、CSS 變數不會被解析、媒體查詢是假的。
 * 於是這一整類問題它完全測不到：
 *
 *   - 開場圖底部少了一塊（花了十個版本才找到）
 *   - 彈出面板下方的黑色長條
 *   - 「畫布底色同步」寫好之後其實從未生效，卻連續兩版被當成修好
 *
 * 這支腳本用真實的 Chromium 開 index.html，量實際的元素位置與 computed
 * style。上面每一條都會被下面的斷言擋下來。
 *
 * 用法：
 *   npm install playwright
 *   npx playwright install chromium
 *   node tools/visual-check.mjs                 # 跑檢查
 *   node tools/visual-check.mjs --shots out/    # 順便存截圖
 *
 * 註：Chromium 不是 Safari，iOS 特有的行為（例如畫布高度時而 873 時而 932）
 * 這裡重現不了，真機測試仍然不能省。這支負責的是「版面與樣式有沒有照
 * 我們寫的生效」。
 */

import { chromium, devices } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { mkdirSync, readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* 以 http 提供檔案。用 file:// 會因為 react-dom 那支 script 帶 crossorigin
   而被 CORS 擋下，App 永遠停在「正在載入…」。順帶讓 Service Worker
   與 IndexedDB 的行為更接近實際部署。 */
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
  '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.md':'text/plain' };
const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const path = join(ROOT, normalize(rel === '/' ? '/index.html' : rel));
  if (!path.startsWith(ROOT) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const INDEX = `http://127.0.0.1:${server.address().port}/index.html`;
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg >= 0 ? process.argv[shotsArg + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const rgbTuple = value => {
  const m = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? m.slice(1, 4).map(Number) : null;
};
const contrastRatio = (a, b) => {
  const convert = tuple => tuple.map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const aa = rgbTuple(a), bb = rgbTuple(b);
  if (!aa || !bb) return 0;
  const [ar, ag, ab] = convert(aa), [br, bg, bbv] = convert(bb);
  const la = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
  const lb = 0.2126 * br + 0.7152 * bg + 0.0722 * bbv;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** 在頁面腳本執行前注入 Firebase 替身與本機模式旗標 */
const INIT = () => {
  try { localStorage.setItem('hw5ren:localModeV1', '1'); } catch (e) {}
  try { localStorage.setItem('hw5ren:splashSeen', ''); } catch (e) {}
  const doc = {
    get: async () => ({ exists: false, data: () => ({}) }),
    set: async () => {}, update: async () => {}, delete: async () => {},
    collection: () => coll, onSnapshot: () => () => {},
  };
  const coll = {
    doc: () => doc,
    get: async () => ({ docs: [], empty: true, size: 0, forEach() {} }),
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    startAt() { return this; }, endAt() { return this; }, onSnapshot: () => () => {},
  };
  const db = {
    collection: () => coll, doc: () => doc,
    batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    runTransaction: async f => f({ get: async () => ({ exists: false, data: () => ({}) }), set() {}, update() {}, delete() {} }),
    enablePersistence: async () => {}, settings() {},
  };
  const auth = {
    onAuthStateChanged: cb => { setTimeout(() => cb(null), 0); return () => {}; },
    currentUser: null, signInWithRedirect: async () => {},
    getRedirectResult: async () => ({ user: null }), signInWithPopup: async () => ({ user: null }),
    signOut: async () => {}, setPersistence: async () => {}, useDeviceLanguage() {},
  };
  window.firebase = {
    initializeApp: () => ({}), apps: [], app: () => ({}),
    firestore: Object.assign(() => db, {
      FieldValue: { serverTimestamp: () => Date.now(), delete: () => null, increment: n => ({ __inc: n }) },
      FieldPath: { documentId: () => '__name__' },
    }),
    auth: Object.assign(() => auth, {
      GoogleAuthProvider: function () { this.addScope = () => {}; this.setCustomParameters = () => {}; },
      Auth: { Persistence: { LOCAL: 'local' } },
    }),
  };
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 優先用 Playwright 自己下載的瀏覽器；找不到就掃描機器上既有的 Chromium。
 *  （某些環境預先放了瀏覽器，但版本編號與目前的 playwright 套件對不上。） */
async function launchChromium() {
  const opts = { args: ['--no-sandbox'] };
  try { return await chromium.launch(opts); } catch (e) {
    const candidates = [];
    if (process.env.LIMU_CHROME) candidates.push(process.env.LIMU_CHROME);
    const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
                   join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
    for (const root of roots) {
      let entries = [];
      try { entries = readdirSync(root); } catch (e2) { continue; }
      for (const d of entries) {
        if (!/^chromium-/.test(d)) continue;
        for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
          const p = join(root, d, rel);
          if (existsSync(p)) candidates.push(p);
        }
      }
    }
    for (const executablePath of candidates) {
      try { return await chromium.launch({ ...opts, executablePath }); } catch (e3) {}
    }
    console.error('找不到可用的 Chromium。請先執行：npx playwright install chromium');
    console.error('原始錯誤：' + String(e.message).split('\n')[0]);
    process.exit(2);
  }
}

const browser = await launchChromium();
const ctx = await browser.newContext({
  ...devices['iPhone 13 Pro Max'],
  isMobile: true, hasTouch: true,
  // Chromium 不支援 WebKit 的 safe-area，這裡用 viewport 尺寸近似 iPhone 直式
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
});
await ctx.addInitScript(INIT);
// 外部字體與 Firebase SDK 一律不連外，測試才穩定
await ctx.route(/fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com/, r => r.abort());

const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // 測試環境刻意攔掉外部字體與 Firebase SDK，這類載入失敗不算缺陷
  if (/ERR_FAILED|Failed to load resource|net::/.test(t)) return;
  consoleErrors.push('console.error: ' + t.slice(0, 200));
});

await page.goto(INDEX);

// ══ 1. 開場畫面 ═════════════════════════════════════════════════════════════
await page.waitForSelector('#spl-static', { timeout: 8000 });
const splash = await page.evaluate(() => {
  const el = document.getElementById('spl-static');
  const img = document.querySelector('.spl-img-wrap img');
  const wrap = document.querySelector('.spl-img-wrap');
  const r = el.getBoundingClientRect();
  const ir = img ? img.getBoundingClientRect() : null;
  const wr = wrap ? wrap.getBoundingClientRect() : null;
  return {
    vh: window.innerHeight, vw: window.innerWidth,
    overlay: { top: r.top, bottom: r.bottom, height: r.height },
    img: ir && { top: ir.top, bottom: ir.bottom, height: ir.height },
    wrap: wr && { height: wr.height },
    parent: el.parentElement.tagName,
    hasTransform: [wrap, img].filter(Boolean).some(n => getComputedStyle(n).transform !== 'none'),
    build: (document.querySelector('.spl-build') || {}).textContent,
  };
});
check('開場層滿版（top=0 且 bottom=視窗高）',
  splash.overlay.top === 0 && Math.abs(splash.overlay.bottom - splash.vh) < 1,
  `top ${splash.overlay.top} bottom ${splash.overlay.bottom} / vh ${splash.vh}`);
check('開場圖填滿開場層（不留底部縫隙）',
  splash.img && Math.abs(splash.img.bottom - splash.vh) < 1,
  splash.img ? `img bottom ${Math.round(splash.img.bottom)}` : '找不到圖');
check('開場層掛在 body 底下（靜態結構）', splash.parent === 'BODY', splash.parent);
check('開場影像路徑沒有 transform（避免合成層裁切過期）',
  !splash.hasTransform, splash.hasTransform ? '仍有 transform' : '');
check('開場顯示版本號', /^v\d+\.\d+\.\d+/.test(splash.build || ''), splash.build || '');
if (SHOTS) await page.screenshot({ path: join(SHOTS, '01-splash.png') });

// ══ 2. 進入 App ═════════════════════════════════════════════════════════════
await page.click('#spl-static').catch(() => {});
await page.waitForSelector('.mobile-dock', { timeout: 10000 });
await sleep(600);
/* 本機用檔案伺服器跑時，Service Worker 的版本比對會判定「有新版」而彈出
   更新橫幅，它會蓋住底部工作欄。測試環境移除它即可，不影響待測行為。 */
await page.evaluate(() => {
  const bar = document.getElementById('limu-update-bar');
  if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
});

const dock = await page.evaluate(() => {
  const el = document.querySelector('.mobile-dock');
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const btns = [...el.querySelectorAll('.mobile-dock-btn')];
  const icons = [...el.querySelectorAll('.dock-icon svg.venus-ui-icon')];
  const themeIcon = document.querySelector('button[aria-label="切換顯示主題"] svg');
  const settingsIcon = document.querySelector('button[aria-label="開啟功能選單"] svg');
  const label = el.querySelector('.dock-label');
  const lcs = label ? getComputedStyle(label) : null;
  return {
    vh: window.innerHeight, vw: window.innerWidth,
    rect: { left: r.left, right: r.right, bottom: r.bottom, height: r.height },
    radius: cs.borderRadius,
    backdrop: cs.backdropFilter,
    count: btns.length,
    svgCount: icons.length,
    headerIconsDistinct: !!themeIcon && !!settingsIcon && themeIcon.outerHTML !== settingsIcon.outerHTML,
    labelVisible: lcs ? (lcs.clipPath === 'none' && lcs.position !== 'absolute') : null,
    iconSize: icons[0] ? getComputedStyle(icons[0]).width : null,
  };
});
check('工作欄為懸浮膠囊（左右離邊、未貼底）',
  dock.rect.left > 6 && dock.rect.right < dock.vw - 6 && dock.rect.bottom < dock.vh - 4,
  `left ${Math.round(dock.rect.left)} right ${Math.round(dock.vw - dock.rect.right)} 底距 ${Math.round(dock.vh - dock.rect.bottom)}`);
check('工作欄為全圓角', parseFloat(dock.radius) >= 24, dock.radius);
check('工作欄沒有 backdrop-filter（捲動效能）',
  dock.backdrop === 'none' || !dock.backdrop, dock.backdrop);
check('工作欄 5 個按鈕、共用線性 SVG 圖示',
  dock.count === 5 && dock.svgCount === 5 && dock.labelVisible === false,
  `${dock.count} 個按鈕／${dock.svgCount} 個 SVG，標籤可見=${dock.labelVisible}，圖示=${dock.iconSize}`);
check('主題與設定圖示不重複', dock.headerIconsDistinct === true, String(dock.headerIconsDistinct));
if (SHOTS) await page.screenshot({ path: join(SHOTS, '02-home.png') });

// ══ 3. 彈出面板 ═════════════════════════════════════════════════════════════
const rootBgBefore = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
await page.locator('.mobile-dock-btn').nth(3).click();   // 輔導
await page.waitForSelector('.gr-center-box', { timeout: 8000 });
await sleep(900);   // 讓 syncCanvasBg 的重試跑完

const sheet = await page.evaluate(() => {
  const panel = document.querySelector('.gr-center-box');
  const r = panel.getBoundingClientRect();
  const cs = getComputedStyle(panel);
  const dockEl = document.querySelector('.mobile-dock');
  const home = document.querySelector('.sheet-home-btn');
  const hr = home ? home.getBoundingClientRect() : null;
  const after = getComputedStyle(panel, '::after');
  return {
    vh: window.innerHeight,
    panelBottom: r.bottom, panelBg: cs.backgroundColor, radius: cs.borderTopLeftRadius,
    dockDisplay: dockEl ? getComputedStyle(dockEl).display : 'missing',
    rootBg: getComputedStyle(document.documentElement).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    themeColor: (document.querySelector('meta[name="theme-color"]') || {}).content,
    home: hr && { left: hr.left, bottom: hr.bottom, w: hr.width, h: hr.height, hasSvg: !!home.querySelector('svg') },
    homeSticky: home ? getComputedStyle(home.parentElement).position : null,
    // 面板強制變成可捲動時（實機因 maxHeight:88vh 常態如此），是否仍不重疊
    homeOverlapScrolled: (() => {
      if (!hr) return null;
      const prev = panel.style.maxHeight;
      panel.style.maxHeight = '260px';
      panel.scrollTop = 0;
      const r2 = home.getBoundingClientRect();
      const el = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
      const bad = !(el === home || home.contains(el));
      panel.style.maxHeight = prev;
      return bad;
    })(),
    homeSticky: home ? getComputedStyle(home.parentElement).position : null,
    // 按鈕是否壓住面板內容：取按鈕中心點，看命中的是不是按鈕自己
    homeOverlap: (() => {
      if (!hr) return null;
      const el = document.elementFromPoint(hr.left + hr.width / 2, hr.top + hr.height / 2);
      return !(el === home || home.contains(el));
    })(),
    homeOverlapWith: (() => {
      if (!hr) return '';
      const el = document.elementFromPoint(hr.left + hr.width / 2, hr.top + hr.height / 2);
      return el ? (el.className || el.tagName) : '';
    })(),
    // 面板強制變成可捲動（內容比容器高）時，是否仍不重疊
    homeOverlapScrolled: (() => {
      if (!hr) return null;
      const scroller = panel;
      const prevH = scroller.style.maxHeight;
      scroller.style.maxHeight = '260px';
      scroller.scrollTop = 0;
      const r2 = home.getBoundingClientRect();
      const el = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
      const bad = !(el === home || home.contains(el));
      window.__ovWith = el ? (el.className || el.tagName) : '';
      scroller.style.maxHeight = prevH;
      return bad;
    })(),
    homeOverlapScrolledWith: '',
    // 圖示中心與圓心的偏差
    homeIconOffset: (() => {
      if (!home) return null;
      const icon = home.querySelector('svg');
      if (!icon) return null;
      const ir = icon.getBoundingClientRect();
      return { dx: (ir.left + ir.width / 2) - (hr.left + hr.width / 2),
               dy: (ir.top + ir.height / 2) - (hr.top + hr.height / 2) };
    })(),
    grabber: after.content !== 'none' && parseFloat(after.height) > 0,
    modalOpen: document.body.classList.contains('v18-modal-open'),
  };
});
check('面板貼齊畫布底緣', Math.abs(sheet.panelBottom - sheet.vh) < 2,
  `bottom ${Math.round(sheet.panelBottom)} / vh ${sheet.vh}`);
check('面板頂部圓角 ≥ 24px', parseFloat(sheet.radius) >= 24, sheet.radius);
check('面板有把手', sheet.grabber === true);
check('面板開啟時工作欄收起', sheet.dockDisplay === 'none', sheet.dockDisplay);
check('body 標記 v18-modal-open', sheet.modalOpen === true);
// 這一條就是連續兩版沒被驗證、實際上從未生效的那個修正
check('畫布底色已同步為面板底色', sheet.rootBg === sheet.panelBg,
  `html ${sheet.rootBg} / panel ${sheet.panelBg}`);
check('body 底色同步', sheet.bodyBg === sheet.panelBg, sheet.bodyBg);
check('回首頁鈕不與面板內容重疊（含面板可捲動時）',
  sheet.homeOverlap === false && sheet.homeOverlapScrolled === false,
  sheet.homeOverlap === false && sheet.homeOverlapScrolled === false ? ''
    : `壓住 ${sheet.homeOverlapWith || sheet.homeOverlapScrolledWith}`);
check('回首頁鈕圖示在圓心（誤差 ≤ 1.5px）',
  sheet.homeIconOffset !== null && Math.abs(sheet.homeIconOffset.dx) <= 1.5 && Math.abs(sheet.homeIconOffset.dy) <= 1.5,
  sheet.homeIconOffset ? `dx ${sheet.homeIconOffset.dx.toFixed(1)} dy ${sheet.homeIconOffset.dy.toFixed(1)}` : '找不到圖示');
check('回首頁鈕位於面板內的 sticky 列（不會壓到內容）',
  sheet.homeSticky === 'sticky', String(sheet.homeSticky));
check('回首頁鈕在左下角、為圖示圓鈕',
  !!sheet.home && sheet.home.left < 40 && (sheet.vh - sheet.home.bottom) < 60 &&
  Math.abs(sheet.home.w - sheet.home.h) < 4 && sheet.home.hasSvg,
  sheet.home ? `left ${Math.round(sheet.home.left)} 底距 ${Math.round(sheet.vh - sheet.home.bottom)} ${Math.round(sheet.home.w)}×${Math.round(sheet.home.h)} svg=${sheet.home.hasSvg}` : '找不到');
if (SHOTS) await page.screenshot({ path: join(SHOTS, '03-sheet.png') });

// 關閉後必須完整還原
await page.click('.sheet-home-btn');
await sleep(700);
const restored = await page.evaluate(() => ({
  rootBg: getComputedStyle(document.documentElement).backgroundColor,
  dockDisplay: getComputedStyle(document.querySelector('.mobile-dock')).display,
  modalOpen: document.body.classList.contains('v18-modal-open'),
}));
check('關閉後畫布底色還原', restored.rootBg === rootBgBefore,
  `${restored.rootBg} / 原 ${rootBgBefore}`);
check('關閉後工作欄回復', restored.dockDisplay !== 'none', restored.dockDisplay);
check('關閉後解除 modal 標記', restored.modalOpen === false);

// ══ 4. 功能選單：回首頁鈕規格必須與其他面板一致 ═══════════════════════════
// 直接以 DOM click 開啟，避免懸浮膠囊被其他固定元素攔截點擊
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.mobile-dock-btn')];
  if (btns.length) btns[btns.length - 1].click();
});
await sleep(900);
const gearHome = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sheet-home-btn')];
  const visible = btns.filter(b => b.getBoundingClientRect().width > 0);
  if (!visible.length) return null;
  const b = visible[visible.length - 1];
  const r = b.getBoundingClientRect();
  const panel = document.querySelector('.gear-menu-panel');
  const items = [...document.querySelectorAll('.gear-menu-item')];
  return { left: r.left, bottom: r.bottom, w: r.width, h: r.height,
           hasSvg: !!b.querySelector('svg'), vh: window.innerHeight,
           listItemLeft: !!document.querySelector('.v18-sheet-panel button [style*="width: 28px"]'),
           itemCount:items.length,
           itemSvgCount:items.filter(item => !!item.querySelector('.gear-menu-icon svg.venus-ui-icon')).length,
           accountSvg:!!document.querySelector('.gear-account-icon svg.venus-ui-icon'),
           panelRadius:panel ? getComputedStyle(panel).borderTopLeftRadius : '0px',
           panelOverflow:panel ? panel.scrollWidth - panel.clientWidth : 999 };
});
if (!gearHome) {
  const diag = await page.evaluate(() => ({
    docks: document.querySelectorAll('.sheet-home-dock').length,
    btns: document.querySelectorAll('.sheet-home-btn').length,
    overlays: document.querySelectorAll('.v18-sheet-overlay').length,
    hasMenuText: document.body.innerText.includes('週作業計畫'),
    modalOpen: document.body.classList.contains('v18-modal-open'),
  }));
  console.log('  診斷:', JSON.stringify(diag));
}
check('功能選單的回首頁鈕與其他面板同規格',
  !!gearHome && gearHome.hasSvg && Math.abs(gearHome.w - 48) < 2 &&
  gearHome.left < 40 && (gearHome.vh - gearHome.bottom) < 60,
  gearHome ? `left ${Math.round(gearHome.left)} 底距 ${Math.round(gearHome.vh - gearHome.bottom)} ${Math.round(gearHome.w)}×${Math.round(gearHome.h)}` : '找不到');
check('功能選單使用共用線性 SVG，且面板無橫向溢出',
  !!gearHome && gearHome.itemCount >= 8 && gearHome.itemSvgCount === gearHome.itemCount &&
  gearHome.accountSvg && parseFloat(gearHome.panelRadius) >= 24 && gearHome.panelOverflow <= 1,
  gearHome ? `${gearHome.itemSvgCount}/${gearHome.itemCount} SVG radius=${gearHome.panelRadius} overflow=${gearHome.panelOverflow}` : '找不到');
if (SHOTS) await page.screenshot({ path: join(SHOTS, '05-gear.png') });

// ══ 5. 班級設定：不得有巢狀捲動容器 ══════════════════════════════════════
const gearItem = page.locator('text=班級設定').first();
if (await gearItem.count()) {
  const settingsOpenStarted = Date.now();
  await gearItem.click();
  await page.waitForSelector('.settings-view', { timeout: 8000 });
  const settingsOpenMs = Date.now() - settingsOpenStarted;
  await sleep(700);
  const settings = await page.evaluate(() => {
    const el = document.querySelector('.settings-view');
    const cs = getComputedStyle(el);
    const selected = document.querySelector('.settings-tab-btn[aria-selected="true"]');
    const sr = selected && selected.getBoundingClientRect();
    const hit = sr && document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
    window.scrollTo(0, Math.min(220, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)));
    return {
      overflowY: cs.overflowY,
      contentVisibility: cs.contentVisibility,
      touchAction: selected ? getComputedStyle(selected).touchAction : '',
      selectedPointerEvents: selected ? getComputedStyle(selected).pointerEvents : '',
      selectedInterceptsStart: !!selected && (hit === selected || selected.contains(hit)),
      bodyPosition: getComputedStyle(document.body).position,
      modalOpen: document.body.classList.contains('v18-modal-open'),
      scrollY: window.scrollY,
    };
  });
  check('功能選單進入班級設定回應時間合理', settingsOpenMs < 1200, `${settingsOpenMs}ms`);
  check('班級設定沒有巢狀捲動容器', settings.overflowY === 'visible', settings.overflowY);
  check('班級設定不使用 content-visibility:auto',
    settings.contentVisibility !== 'auto', settings.contentVisibility);
  check('班級分頁允許原生垂直手勢', settings.touchAction === 'pan-y', settings.touchAction);
  check('已選班級鈕不攔截起滑',
    settings.selectedPointerEvents === 'none' && settings.selectedInterceptsStart === false,
    `pointer=${settings.selectedPointerEvents} intercept=${settings.selectedInterceptsStart}`);
  check('進入設定後已解除面板捲動鎖且長頁可捲',
    settings.modalOpen === false && settings.bodyPosition !== 'fixed' && settings.scrollY > 0,
    `modal=${settings.modalOpen} position=${settings.bodyPosition} scrollY=${settings.scrollY}`);

  await page.evaluate(() => window.showVenusToast('互動測試完成', 'success', 1800));
  await sleep(80);
  const toast = await page.evaluate(() => {
    const host = document.querySelector('.venus-toast-region');
    const el = host && host.querySelector('.venus-toast');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { text:el.textContent, visible:cs.opacity === '1', h:r.height,
             pointer:getComputedStyle(host).pointerEvents, count:host.children.length };
  });
  check('Venus Toast 非阻塞且維持精簡高度',
    !!toast && toast.text === '互動測試完成' && toast.visible && toast.pointer === 'none' && toast.h >= 44 && toast.h < 96 && toast.count <= 3,
    toast ? `opacity=${toast.visible} height=${Math.round(toast.h)} pointer=${toast.pointer}` : '找不到 Toast');
  await page.evaluate(() => window.scrollTo(0, 0));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, '04-settings.png') });
}

// ══ 6. 五套主題：實際 computed style、對比與橫向版面 ════════════════════
for (const themeId of ['default', 'nerv', 'mucha', 'nebula', 'odyssey']) {
  await page.evaluate(id => localStorage.setItem('hw5ren:theme', id), themeId);
  await page.reload();
  await page.waitForSelector('#spl-static', { timeout: 8000 });
  await page.click('#spl-static').catch(() => {});
  await page.waitForSelector('.mobile-dock', { timeout: 10000 });
  await sleep(500);
  await page.evaluate(() => {
    const bar = document.getElementById('limu-update-bar');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  });

  const art = await page.evaluate(id => {
    const app = document.querySelector('.app');
    const main = document.querySelector('main');
    const calendar = document.querySelector('.calendar');
    const header = document.querySelector('header');
    const headerRow = document.querySelector('.hi-row1');
    const contextTitle = document.querySelector('.class-context-title');
    const weekday = document.querySelector('.wd');
    const mainBefore = main ? getComputedStyle(main, '::before') : null;
    const calAfter = calendar ? getComputedStyle(calendar, '::after') : null;
    const headAfter = header ? getComputedStyle(header, '::after') : null;
    const rowAfter = headerRow ? getComputedStyle(headerRow, '::after') : null;
    return {
      id, applied: app && app.getAttribute('data-theme'),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      mainBg: mainBefore && mainBefore.backgroundImage,
      mainBorderImage: mainBefore && mainBefore.borderImageSource,
      calBorderImage: calAfter && calAfter.borderImageSource,
      calendarBg: calendar && getComputedStyle(calendar).backgroundColor,
      headerAnimation: header && getComputedStyle(header).animationName,
      appAnimation: app && getComputedStyle(app).animationName,
      headerAfter: headAfter && headAfter.content,
      headerRowAfter: rowAfter && rowAfter.content,
      contextTitleColor: contextTitle && getComputedStyle(contextTitle).color,
      weekdayColor: weekday && getComputedStyle(weekday).color,
      weekdayBg: weekday && getComputedStyle(weekday.parentElement).backgroundColor,
      emptyArt: (document.querySelector('.mucha-empty-art') || {}).getAttribute?.('src') || '',
      svgDockCount: document.querySelectorAll('.mobile-dock .dock-icon svg.venus-ui-icon').length,
    };
  }, themeId);

  check(`${themeId} 主題套用且沒有橫向溢出`,
    art.applied === themeId && art.overflow <= 1 && art.svgDockCount === 5,
    `theme=${art.applied} overflow=${art.overflow} svg=${art.svgDockCount}`);

  if (themeId === 'default') {
    check('預設主題維持清晰原生表面',
      art.calendarBg === 'rgb(255, 255, 255)' || art.calendarBg === 'rgba(255, 255, 255, 0.96)',
      art.calendarBg || '找不到月曆');
  } else if (themeId === 'nerv') {
    check('NERV 手機版停用整頁無限動畫', art.appAnimation === 'none', art.appAnimation);
  } else if (themeId === 'mucha') {
    check('慕夏使用等比例角飾，不再沿長頁套 border-image',
      /mucha-corner\.webp/.test(art.mainBg || '') && art.mainBorderImage === 'none',
      `${art.mainBg} / ${art.mainBorderImage}`);
  } else if (themeId === 'nebula') {
    check('星雲改用純星圖航線與專用星圖框',
      /nebula-route-v20-62\.svg/.test(art.mainBg || '') && /nebula-frame-v20-62\.svg/.test(art.calBorderImage || ''),
      `${art.mainBg} / ${art.calBorderImage}`);
    check('星雲空狀態使用專用星盤', /nebula-empty-v20-62\.svg/.test(art.emptyArt || ''), art.emptyArt || '找不到空狀態圖');
    check('星雲頁首為靜態（無無限發光動畫）', art.headerAnimation === 'none', art.headerAnimation);
    check('星雲標題裝飾不跨過版本與按鈕', art.headerRowAfter === 'none', art.headerRowAfter);
  } else {
    check('奧德賽使用青銅羅盤與專用框',
      /odyssey-compass-v20-62\.svg/.test(art.mainBg || '') && /odyssey-frame-v20-62\.svg/.test(art.calBorderImage || ''),
      `${art.mainBg} / ${art.calBorderImage}`);
    check('奧德賽頁首文字已降低密度', /ΝΟΣΤΟΣ/.test(art.headerAfter || '') && !/LONG VOYAGE/.test(art.headerAfter || ''), art.headerAfter);
    const titleContrast = contrastRatio(art.contextTitleColor, 'rgb(11, 40, 51)');
    const weekdayContrast = contrastRatio(art.weekdayColor, 'rgb(216, 204, 180)');
    check('奧德賽定位列與星期文字對比清楚',
      titleContrast >= 7 && weekdayContrast >= 5,
      `title=${titleContrast.toFixed(1)} weekday=${weekdayContrast.toFixed(1)}`);
  }
  if (SHOTS) {
    const shotNo = { default:'06', nerv:'07', mucha:'08', nebula:'09', odyssey:'10' }[themeId];
    await page.screenshot({ path: join(SHOTS, `${shotNo}-${themeId}.png`) });
  }
}

// ══ 7. 日表 5／6／7 組：只依設定組數呈現，且不得擠出畫布 ═════════════════
for (const groupCount of [5, 6, 7]) {
  await page.evaluate(count => {
    const groups = Array.from({ length:count }, (_, i) => ({
      id:i + 1, label:`第${i + 1}組`, members:[i + 1], leader:i + 1, secretary:0
    }));
    localStorage.setItem('hw5ren:theme', 'default');
    localStorage.setItem('hw5ren:groups', JSON.stringify(groups));
    localStorage.removeItem('hw5ren:activeClass');
    [...Array(localStorage.length)].map((_, i) => localStorage.key(i)).filter(Boolean)
      .filter(key => key.includes('groupVersions:')).forEach(key => localStorage.removeItem(key));
  }, groupCount);
  await page.reload();
  await page.waitForSelector('#spl-static', { timeout:8000 });
  await page.click('#spl-static').catch(() => {});
  await page.waitForSelector('.cal-cell:not(.cal-empty)', { timeout:10000 });
  await page.locator('.cal-cell:not(.cal-empty)').first().click();
  await page.waitForSelector('.homework-group-table', { timeout:10000 });
  await sleep(300);
  const layout = await page.evaluate(count => {
    const table = document.querySelector('.homework-group-table');
    const wrap = table && table.closest('.table-wrapper');
    const headers = table ? [...table.querySelectorAll('thead .th-group')] : [];
    return {
      classOk:!!table && table.classList.contains(`group-count-${count}`),
      headers:headers.length,
      positiveWidths:headers.every(el => el.getBoundingClientRect().width >= 28),
      overflow:document.documentElement.scrollWidth - window.innerWidth,
      tableWithinWrap:!!table && !!wrap && table.getBoundingClientRect().width <= wrap.getBoundingClientRect().width + 1,
    };
  }, groupCount);
  check(`${groupCount} 組日表欄數正確且不超出畫布`,
    layout.classOk && layout.headers === groupCount && layout.positiveWidths && layout.overflow <= 1 && layout.tableWithinWrap,
    `headers=${layout.headers} class=${layout.classOk} overflow=${layout.overflow}`);
}

// ══ 8. 減少動態效果：最終版所有核心轉場必須停用 ══════════════════════════
await page.emulateMedia({ reducedMotion:'reduce' });
await page.evaluate(() => localStorage.setItem('hw5ren:theme', 'nerv'));
await page.reload();
await page.waitForSelector('#spl-static', { timeout:8000 });
await page.click('#spl-static').catch(() => {});
await page.waitForSelector('.mobile-dock', { timeout:10000 });
const reduced = await page.evaluate(() => {
  const app = document.querySelector('.app');
  const dockButton = document.querySelector('.mobile-dock-btn');
  const a = parseFloat(getComputedStyle(app).animationDuration) || 0;
  const t = Math.max(...getComputedStyle(dockButton).transitionDuration.split(',').map(v => parseFloat(v) || 0));
  return { animation:a, transition:t };
});
check('減少動態效果會停用核心動畫與轉場', reduced.animation <= 0.001 && reduced.transition <= 0.001,
  `animation=${reduced.animation}s transition=${reduced.transition}s`);

check('全程零 console 錯誤', consoleErrors.length === 0,
  [...new Set(consoleErrors)].slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通過`);
if (SHOTS) console.log(`截圖：${SHOTS}`);
process.exit(failed.length ? 1 : 0);
