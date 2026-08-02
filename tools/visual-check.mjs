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
  const label = el.querySelector('.dock-label');
  const lcs = label ? getComputedStyle(label) : null;
  return {
    vh: window.innerHeight, vw: window.innerWidth,
    rect: { left: r.left, right: r.right, bottom: r.bottom, height: r.height },
    radius: cs.borderRadius,
    backdrop: cs.backdropFilter,
    count: btns.length,
    labelVisible: lcs ? (lcs.clipPath === 'none' && lcs.position !== 'absolute') : null,
    iconSize: getComputedStyle(el.querySelector('.dock-icon')).fontSize,
  };
});
check('工作欄為懸浮膠囊（左右離邊、未貼底）',
  dock.rect.left > 6 && dock.rect.right < dock.vw - 6 && dock.rect.bottom < dock.vh - 4,
  `left ${Math.round(dock.rect.left)} right ${Math.round(dock.vw - dock.rect.right)} 底距 ${Math.round(dock.vh - dock.rect.bottom)}`);
check('工作欄為全圓角', parseFloat(dock.radius) >= 24, dock.radius);
check('工作欄沒有 backdrop-filter（捲動效能）',
  dock.backdrop === 'none' || !dock.backdrop, dock.backdrop);
check('工作欄 5 個按鈕、純圖示', dock.count === 5 && dock.labelVisible === false,
  `${dock.count} 個，標籤可見=${dock.labelVisible}`);
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
    home: hr && { left: hr.left, bottom: hr.bottom, w: hr.width, h: hr.height, text: home.textContent.trim() },
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
check('回首頁鈕在左下角、為圖示圓鈕',
  !!sheet.home && sheet.home.left < 40 && (sheet.vh - sheet.home.bottom) < 60 &&
  Math.abs(sheet.home.w - sheet.home.h) < 4 && sheet.home.text === '⌂',
  sheet.home ? `left ${Math.round(sheet.home.left)} 底距 ${Math.round(sheet.vh - sheet.home.bottom)} ${Math.round(sheet.home.w)}×${Math.round(sheet.home.h)} "${sheet.home.text}"` : '找不到');
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

// ══ 4. 班級設定：不得有巢狀捲動容器 ══════════════════════════════════════
await page.locator('.mobile-dock-btn').nth(4).click();
await sleep(500);
const gearItem = page.locator('text=班級設定').first();
if (await gearItem.count()) {
  await gearItem.click();
  await page.waitForSelector('.settings-view', { timeout: 8000 });
  await sleep(700);
  const settings = await page.evaluate(() => {
    const el = document.querySelector('.settings-view');
    const cs = getComputedStyle(el);
    return { overflowY: cs.overflowY, contentVisibility: cs.contentVisibility };
  });
  check('班級設定沒有巢狀捲動容器', settings.overflowY === 'visible', settings.overflowY);
  check('班級設定不使用 content-visibility:auto',
    settings.contentVisibility !== 'auto', settings.contentVisibility);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, '04-settings.png') });
}

check('全程零 console 錯誤', consoleErrors.length === 0,
  [...new Set(consoleErrors)].slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通過`);
if (SHOTS) console.log(`截圖：${SHOTS}`);
process.exit(failed.length ? 1 : 0);
