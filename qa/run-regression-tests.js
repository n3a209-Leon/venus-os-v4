'use strict';

// LIMU v20.16 迴歸測試
//
// 這一支專門補 run-static-tests.js 測不到的東西。原本那 25 條檢查有 23 條是
// html.includes('某字串')，驗證的是「這段字有沒有寫進去」，不是「這段邏輯對不對」。
// 下面每一條都對應一個 v20.15 實際出貨的缺陷，改壞了會直接紅燈。

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const failures = [];
let checks = 0;

function check(name, condition, detail) {
  checks++;
  if (!condition) failures.push(name + (detail ? ': ' + detail : ''));
}

// ── 極簡 PNG 解碼器（僅支援 bitDepth 8、非交錯；足以驗證 App 圖示）──────────
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error('僅支援 bitDepth 8，實際為 ' + bitDepth);
  if (interlace !== 0) throw new Error('不支援交錯 PNG');

  const channels = { 0:1, 2:3, 3:1, 4:2, 6:4 }[colorType];
  if (!channels) throw new Error('不支援的 colorType ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prior = y > 0 ? out.slice((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = (prior && i >= channels) ? prior[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error('未知的 filter ' + filter);
      cur[i] = value & 0xff;
    }
  }

  return {
    width, height,
    pixel(x, y) {
      const i = y * stride + x * channels;
      if (colorType === 3) {
        const p = out[i] * 3;
        return [palette[p], palette[p + 1], palette[p + 2]];
      }
      if (colorType === 0 || colorType === 4) return [out[i], out[i], out[i]];
      return [out[i], out[i + 1], out[i + 2]];
    }
  };
}

// ── #1 P0：onAuthStateChanged 的所有 return 路徑都必須解鎖 authLoading ──────
// v20.15 在 activateStorageOwner() 失敗時直接 return，且保底 timer 已被清掉，
// 導致 authLoading 永遠是 true、畫面卡在已淡出的 Splash（全黑無反應）。
{
  const start = html.indexOf('firebase.auth().onAuthStateChanged');
  const body = start >= 0 ? html.slice(start, start + 2600) : '';
  const hasFinally = /\}\s*finally\s*\{[^}]*setAuthLoading\(false\)/.test(body);
  check('auth 回呼以 finally 保證解鎖 authLoading', hasFinally,
    '找不到包住整段的 finally { setAuthLoading(false) }');
  // 早退仍然存在是正常的，重點是它們必須被 finally 包住
  check('auth 回呼確實存在早退路徑（確認測試有效）',
    /if\s*\(!\(await activateStorageOwner/.test(body));
}

// ── #2 首次安裝不得誤報「已有新版本」──────────────────────────────────
// SW 的 activate 會呼叫 clients.claim()，首次安裝時 controllerchange 必然觸發。
{
  const start = html.indexOf("addEventListener('controllerchange'");
  const body = start >= 0 ? html.slice(start, start + 500) : '';
  check('controllerchange 有區分首次接管', /hadController/.test(body),
    '缺少首次 claim 的防護，新使用者第一眼就會看到假的更新提示');
}

// ── #3 字串字面不得出現雙重跳脫的 \n ────────────────────────────────────
{
  const offenders = html.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => line.includes('\\\\n'))
    // 白名單：ICS 反跳脫本來就要處理字面的 \n，屬正確用法
    .filter(([, line]) => !line.includes("replace(/\\\\n/gi"));
  check('沒有雙重跳脫的 \\n（會讓對話框印出字面 \\n）',
    offenders.length === 0,
    offenders.map(([i]) => '行 ' + i).join('、'));
}

// ── #4 maskable 圖示必須有安全區 ────────────────────────────────────────
// v20.15 把滿版到邊的圖標成 "any maskable"，Android 圓形遮罩會削掉頂部日蝕。
{
  const maskables = manifest.icons.filter(i => String(i.purpose || '').split(/\s+/).includes('maskable'));
  check('manifest 至少有一個 maskable 圖示', maskables.length > 0);
  maskables.forEach(icon => {
    const file = icon.src.replace(/^\.\//, '');
    const full = path.join(root, file);
    if (!fs.existsSync(full)) { check('maskable 圖示存在 ' + file, false); return; }
    let png;
    try { png = decodePng(fs.readFileSync(full)); }
    catch (e) { check('maskable 圖示可解碼 ' + file, false, e.message); return; }

    const band = Math.floor(png.width * 0.09);
    const [r0, g0, b0] = png.pixel(0, 0);
    let impure = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const edge = x < band || x >= png.width - band || y < band || y >= png.height - band;
        if (!edge) continue;
        const [r, g, b] = png.pixel(x, y);
        // 容許輕微壓縮誤差
        if (Math.abs(r - r0) > 6 || Math.abs(g - g0) > 6 || Math.abs(b - b0) > 6) impure++;
      }
    }
    check('maskable 安全區 ' + file, impure === 0,
      '外圈 9% 有 ' + impure + ' 個像素不是純底色，套圓形遮罩會被裁掉');
  });

  // 同一筆圖示不應同時宣告 any 與 maskable：兩者對留白的要求相反。
  const mixed = manifest.icons.filter(i => {
    const p = String(i.purpose || '').split(/\s+/);
    return p.includes('any') && p.includes('maskable');
  });
  check('沒有 any 與 maskable 混寫的圖示', mixed.length === 0,
    mixed.map(i => i.src).join('、'));
}

// ── #5 iOS 主畫面名稱必須與 manifest 的 short_name 一致 ─────────────────
{
  const m = /<meta\s+name="apple-mobile-web-app-title"\s+content="([^"]*)"/.exec(html);
  check('有宣告 apple-mobile-web-app-title', !!m);
  if (m) {
    check('iOS 主畫面名稱與 short_name 一致', m[1] === manifest.short_name,
      `HTML 是「${m[1]}」，manifest 是「${manifest.short_name}」`);
  }
}

// ── #16 meta theme-color 必須與 manifest 的 theme_color 一致 ────────────
{
  const m = /<meta\s+name="theme-color"\s+content="([^"]*)"/.exec(html);
  check('有宣告 theme-color', !!m);
  if (m) {
    check('theme-color 與 manifest 一致',
      m[1].toLowerCase() === String(manifest.theme_color).toLowerCase(),
      `HTML 是 ${m[1]}，manifest 是 ${manifest.theme_color}`);
  }
}

// ── #6 SW 預快取必須涵蓋頁面實際引用的所有 assets ───────────────────────
// v20.15 只列 9 個，缺的 13 個慕夏／奧德賽／星雲素材首次離線會整片破圖。
{
  const referenced = new Set(
    (html.match(/(?:\.\/)?assets\/[A-Za-z0-9._-]+/g) || []).map(s => s.replace(/^\.\//, ''))
  );
  const precacheBlock = /const PRECACHE_URLS = \[([\s\S]*?)\];/.exec(sw);
  const precached = new Set(
    (precacheBlock ? precacheBlock[1].match(/'([^']+)'/g) || [] : [])
      .map(s => s.slice(1, -1).replace(/^\.\//, ''))
  );
  const missing = [...referenced].filter(a => !precached.has(a)).sort();
  check('SW 預快取涵蓋所有引用的 assets', missing.length === 0,
    '缺少 ' + missing.length + ' 個：' + missing.join('、'));

  // manifest 的圖示也必須離線可用
  const iconMissing = manifest.icons
    .map(i => i.src.replace(/^\.\//, ''))
    .filter(src => !precached.has(src));
  check('SW 預快取涵蓋 manifest 圖示', iconMissing.length === 0, iconMissing.join('、'));

  // 預快取清單裡的檔案必須真的存在，否則安裝時會少東西
  const ghosts = [...precached].filter(f => !fs.existsSync(path.join(root, f)));
  check('預快取清單沒有不存在的檔案', ghosts.length === 0, ghosts.join('、'));
}

// ── #19 素材預快取失敗不得讓整個 SW 裝不起來 ────────────────────────────
{
  check('素材預快取採容錯（單檔失敗不中斷安裝）',
    /PRECACHE_URLS\.map[\s\S]{0,400}?\.catch\(/.test(sw),
    '仍是整包 Promise.all，一個檔 404 就會讓 SW 永遠不啟用');
}

// ── #18 靜態資源比對必須忽略 query string ───────────────────────────────
{
  check('caches.match 對靜態資源使用 ignoreSearch',
    /caches\.match\(event\.request,\s*\{\s*ignoreSearch\s*:\s*true\s*\}/.test(sw),
    '帶 ?v= 的請求會 miss 掉預快取');
}

// ── #7 開場圖必須預載 ───────────────────────────────────────────────────
{
  check('splash-art 有 preload',
    /<link\s+rel="preload"[^>]*href="\.\/assets\/splash-art\.jpg"/.test(html),
    '否則要等 React 掛載後才開始下載，開場全程黑底');
  // preload 必須出現在 React 之前才有意義
  const preloadAt = html.indexOf('rel="preload"');
  const reactAt = html.indexOf('react-dom.production.min.js');
  check('preload 位置早於 ReactDOM 載入', preloadAt >= 0 && preloadAt < reactAt);
}

// ── #15 開場退場動畫不得在播完前被 unmount ──────────────────────────────
{
  // 注意：CSS 寫成 .34s（無前導 0），正規表示式必須把小數點一起捕捉進來，
  // 否則 .34 會被讀成 34，變成 34000ms。
  const cssDuration = /animation:spl-fadeout\s+(\d*\.?\d+)s/.exec(html);
  const jsDelay = /var EXIT_FADE_MS = reduceMotion \? \d+ : (\d+)/.exec(html);
  check('退場動畫時長與 JS 等待時間相符', !!cssDuration && !!jsDelay);
  if (cssDuration && jsDelay) {
    const cssMs = Math.round(parseFloat(cssDuration[1]) * 1000);
    check('unmount 前有等完 spl-fadeout',
      Number(jsDelay[1]) >= cssMs,
      `CSS 是 ${cssMs}ms，JS 只等 ${jsDelay[1]}ms`);
  }
}

// ── #8 錯誤日誌必須有上限 ───────────────────────────────────────────────
{
  check('_errLog 有長度上限',
    /_errLog\.length > _LOG_MAX|_errLog\.splice\(/.test(html),
    '無上限成長 + 每次全量 stringify 會造成 O(n²)');
  check('debug log 寫入有 debounce', /_logFlushTimer/.test(html));
}

// ── #9 MutationObserver 不得監聽整個 body 的所有變動 ────────────────────
{
  check('themeObserver 使用 attributeFilter',
    /attributeFilter:\s*\['data-theme'\]/.test(html),
    'React 每次 re-render 都會觸發大量 mutation records');
  check('themeObserver 沒有對 data-theme 反向早退',
    !/attributeName === 'data-theme'\) return;/.test(html),
    '舊版把唯一該處理的事件跳過了');
}

// ── #11 SW 更新輪詢必須節流 ─────────────────────────────────────────────
{
  check('reg.update() 有節流', /function throttledUpdate\(/.test(html));
  const unthrottled = (html.match(/visibilitychange[\s\S]{0,220}?reg\.update\(\)\.catch/g) || []);
  check('visibilitychange 不直接呼叫 reg.update()', unthrottled.length === 0);
}

// ── #20 解密時的 iterations 必須夾上限 ──────────────────────────────────
{
  check('備份解密夾住 iterations 上限',
    /Math\.min\(Math\.floor\(rawIterations\)/.test(html),
    '被竄改的備份檔可讓 PBKDF2 凍住瀏覽器');
}

// ── 版本一致性（涵蓋圖示檔名）──────────────────────────────────────────
{
  const version = JSON.parse(read('version.json'));
  const stale = [];
  ['index.html', 'sw.js', 'manifest.webmanifest'].forEach(f => {
    const text = read(f);
    if (/v20-15/.test(text)) stale.push(f);
  });
  check('沒有殘留的舊版檔名 v20-15', stale.length === 0, stale.join('、'));
  check('APP_VERSION 與 version.json 一致',
    html.includes('const APP_VERSION = "' + version.version + '"'),
    'version.json 是 ' + version.version);
}

if (failures.length) {
  console.error('LIMU v20.16 迴歸測試失敗:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('LIMU v20.16 迴歸測試通過 (' + checks + ' 項)。');
