'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const sw = read('sw.js');
const version = JSON.parse(read('version.json'));
const manifest = JSON.parse(read('manifest.webmanifest'));
const failures = [];

function check(name, condition, detail) {
  if (!condition) failures.push(name + (detail ? ': ' + detail : ''));
}

check('版本號一致', html.includes(version.buildId) && sw.includes(version.buildId));
check('快取名稱一致', html.includes(version.cacheName) && sw.includes(version.cacheName));
check('首頁已移除 WebP base64', !html.includes('data:image/webp;base64,'));
check('首頁大小低於 1.2 MB', Buffer.byteLength(html) < 1.2 * 1024 * 1024, String(Buffer.byteLength(html)));
check('UID localStorage 分區', html.includes('scopedLocalPrefix') && html.includes('LIMUStorageScope'));
check('設定集中到 IDB', html.includes("createObjectStore('appState')") && html.includes("transaction('appState'"));
check('離線佇列獨立 store', html.includes("createObjectStore('outbox')") && html.includes('idbStoreForKey'));
check('舊資料遷移存在', html.includes('migrateLegacyIdbForCurrentUser') && html.includes('migratedLegacyV1'));
check('帳號切換存在', html.includes('switchGoogleAccount') && html.includes("prompt:'select_account'"));
check('登出存在', html.includes('signOutAccount') && html.includes("firebase.auth().signOut()"));
check('草稿安全更新', html.includes('LIMUUpdateSafety') && html.includes('DRAFT_SESSION_KEY'));
check('SW 安裝不強制接管', !/addEventListener\('install'[\s\S]*?addEventListener\('message'/.exec(sw)[0].includes('skipWaiting'));
check('SW 單次利用已驗證首頁', sw.includes("cache.put('./index.html', bundle.responses[1].clone())"));
check('班級條件查詢', html.includes("where('classKey','==',classKey)") && html.includes("where('classKey','==',scopedAlias)"));
check('ICS/CSV 正式備援', html.includes('選擇已下載的 .ics／CSV／JSON'));
check('備份密碼介面', html.includes('requestBackupPassword') && html.includes('passwordStrength'));
check('備份不再用 prompt', !/prompt\('請設定至少 8 個字元的備份密碼/.test(html));
check('移除全班分析', !html.includes('copyClassAnalysis') && !html.includes('複製全班素材'));
check('奧德賽主題', html.includes("id: 'odyssey'") && html.includes('odyssey-sea-chart.svg'));
check('Manifest 不再混用 SVG 圖示', manifest.icons.every(icon => icon.type === 'image/png'));
check('VENUS 版本化圖示', manifest.icons.every(icon => /v20-16\.png$/.test(icon.src)));
check('Apple Touch Icon 為新版 PNG', html.includes('apple-touch-icon-v20-16.png'));
check('全螢幕開場素材', html.includes('./assets/splash-art.jpg') && html.includes('ODYSSEY TEACHER SYSTEM'));
check('開場可略過並支援減少動態', html.includes('輕觸進入') && html.includes('prefers-reduced-motion:reduce'));
check('開場長短版狀態固定', html.includes('isFirstRef.current'));

const assetRefs = Array.from(new Set(
  (html + '\n' + sw + '\n' + JSON.stringify(manifest))
    .match(/(?:\.\/)?assets\/[A-Za-z0-9._-]+/g) || []
));
assetRefs.forEach(ref => {
  const relative = ref.replace(/^\.\//, '');
  check('資源存在 ' + relative, fs.existsSync(path.join(root, relative)));
});
manifest.icons.forEach(icon => {
  check('圖示存在 ' + icon.src, fs.existsSync(path.join(root, icon.src.replace(/^\.\//, ''))));
});

try {
  new vm.Script(sw, { filename:'sw.js' });
} catch (error) {
  failures.push('sw.js 語法: ' + error.message);
}

const scripts = [];
const scriptRe = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRe.exec(html))) {
  if (match[1].trim()) scripts.push(match[1]);
}
scripts.forEach((code, index) => {
  try {
    new vm.Script(code, { filename:'index-inline-' + (index + 1) + '.js' });
  } catch (error) {
    failures.push('index.html inline script ' + (index + 1) + ' 語法: ' + error.message);
  }
});

if (failures.length) {
  console.error('LIMU v20.16 QA failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('LIMU v20.16 QA passed (' + (25 + assetRefs.length + manifest.icons.length + scripts.length) + ' checks).');
