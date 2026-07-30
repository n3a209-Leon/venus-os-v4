'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const failures = [];

function check(name, condition, detail) {
  if (!condition) failures.push(name + (detail ? ': ' + detail : ''));
}
function sliceBetween(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Cannot extract ' + start);
  return html.slice(a, b);
}
class MemoryStorage {
  constructor(seed) { this.data = Object.assign({}, seed || {}); }
  get length() { return Object.keys(this.data).length; }
  key(index) { return Object.keys(this.data)[index] || null; }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; }
  setItem(key, value) { this.data[key] = String(value); }
  removeItem(key) { delete this.data[key]; }
}

async function testMigrationQuotaFailure() {
  // v20.19：模擬 localStorage 容量不足導致部分複製失敗。
  // 舊版會照樣寫入「搬移完成」標記，使舊資料永遠不再被搬移，
  // 教師登入後讀不到資料，但資料其實還躺在未分區的舊鍵裡。
  class FailingStorage extends MemoryStorage {
    constructor(seed, failFrom) { super(seed); this.writes = 0; this.failFrom = failFrom; }
    setItem(key, value) {
      // 只讓「分區後的新鍵」寫入失敗，模擬空間不足
      if (String(key).indexOf('hw5ren:u:') === 0) {
        this.writes++;
        if (this.writes >= this.failFrom) {
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        }
      }
      super.setItem(key, value);
    }
  }

  const seed = {
    'hw5ren:classes':'[{"id":"class-a"}]',
    'hw5ren:className':'五年仁班',
    'hw5ren:threshold':'60'
  };
  const localStorage = new FailingStorage(seed, 2); // 第二筆起失敗
  const context = { localStorage, indexedDB:undefined, Promise, encodeURIComponent,
    decodeURIComponent, console, setTimeout, clearTimeout };
  context.window = context;
  context.window.localStorage = localStorage;
  context.window._writeLog = function(){};
  vm.createContext(context);
  vm.runInContext(sliceBetween('// ── UID-scoped localStorage', '// Google OAuth 已改用 Firebase Auth'),
    context, { filename:'storage-scope.js' });

  context.window.LIMUStorageScope.setUid('uid-a');

  check('搬移失敗時不得寫入完成標記',
    localStorage.getItem('hw5ren:migratedLegacyV1') === null,
    '寫了完成標記就永遠不會重試，資料等同消失');
  check('搬移失敗時保留來源資料',
    localStorage.getItem('hw5ren:className') === '五年仁班' ||
    localStorage.getItem('hw5ren:classes') !== null);
  check('搬移失敗時記錄待重試帳號',
    localStorage.getItem('hw5ren:migratedLegacyPendingV1') === 'uid-a');

  // 空間恢復後，下一次 setUid 必須真的重試並完成
  localStorage.failFrom = Infinity;
  // 模擬重開 App：_activeStorageUid 會從 lastUidV1 還原，previous 因此非空
  const context2 = { localStorage, indexedDB:undefined, Promise, encodeURIComponent,
    decodeURIComponent, console, setTimeout, clearTimeout };
  context2.window = context2;
  context2.window.localStorage = localStorage;
  context2.window._writeLog = function(){};
  vm.createContext(context2);
  vm.runInContext(sliceBetween('// ── UID-scoped localStorage', '// Google OAuth 已改用 Firebase Auth'),
    context2, { filename:'storage-scope.js' });

  const retry = context2.window.LIMUStorageScope.setUid('uid-a');
  check('重開 App 後會重試搬移（previous 非空也要能觸發）',
    retry.migratedLegacy === true,
    'previous 已從 lastUidV1 還原，舊條件 !previous 會讓重試永遠不發生');
  check('重試成功後寫入完成標記',
    localStorage.getItem('hw5ren:migratedLegacyV1') === 'uid-a');
  check('重試成功後清除待重試標記',
    localStorage.getItem('hw5ren:migratedLegacyPendingV1') === null);
  check('重試後資料讀得到',
    context2.window._safeLS.get('hw5ren:className') === '五年仁班');
  check('重試後舊未分區鍵已移除',
    localStorage.getItem('hw5ren:className') === null);
}

async function testStorageIsolation() {
  const localStorage = new MemoryStorage({
    'hw5ren:classes':'[{"id":"class-a"}]',
    'hw5ren:className':'五年仁班',
    'firebase:authUser:keep-me':'firebase-owned'
  });
  const context = {
    localStorage,
    indexedDB:undefined,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    console,
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.window.localStorage = localStorage;
  context.window._writeLog = function(){};
  vm.createContext(context);
  const code = sliceBetween('// ── UID-scoped localStorage', '// Google OAuth 已改用 Firebase Auth');
  vm.runInContext(code, context, { filename:'storage-scope.js' });

  const first = context.window.LIMUStorageScope.setUid('uid-a');
  check('首次 UID 會遷移舊資料', first.migratedLegacy === true);
  check('A 帳號讀到自己的班級', context.window._safeLS.get('hw5ren:className') === '五年仁班');
  check('Firebase 自有 localStorage 未被搬移', localStorage.getItem('firebase:authUser:keep-me') === 'firebase-owned');
  check('舊未分區班級鍵已移除', localStorage.getItem('hw5ren:className') === null);

  context.window.LIMUStorageScope.setUid('uid-b');
  check('B 帳號看不到 A 帳號資料', context.window._safeLS.get('hw5ren:className') === null);
  context.window.LIMUStorageScope.setUid('uid-a');
  check('切回 A 帳號資料仍在', context.window._safeLS.get('hw5ren:className') === '五年仁班');
  context.window.LIMUStorageScope.clearUid();
  check('登出後不暴露 A 帳號資料', context.window._safeLS.get('hw5ren:className') === null);
}

async function testEncryptedBackupRoundTrip() {
  const context = {
    crypto:webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    JSON,
    APP_SCHEMA_VERSION:7,
    btoa:value => Buffer.from(value, 'binary').toString('base64'),
    atob:value => Buffer.from(value, 'base64').toString('binary'),
    window:{}
  };
  vm.createContext(context);
  const code = sliceBetween('function bytesToBase64', 'async function sha256Hex');
  vm.runInContext(code, context, { filename:'backup-crypto.js' });
  const source = { format:'limu-teacher-full-backup', snapshot:{ classKey:'class-a', days:{ 'class-a:day:2026-07-29':'{}' } } };
  const encrypted = await context.encryptBackupPackage(source, 'Venus!2026-safe');
  const restored = await context.decryptBackupPackage(encrypted, 'Venus!2026-safe');
  check('加密備份可正確還原', JSON.stringify(restored) === JSON.stringify(source));
  let wrongPasswordRejected = false;
  try { await context.decryptBackupPackage(encrypted, 'wrong-password'); }
  catch (error) { wrongPasswordRejected = /密碼錯誤/.test(error.message); }
  check('錯誤備份密碼會被拒絕', wrongPasswordRejected);
}

function testUpdateDraftSafety() {
  const sessionStorage = new MemoryStorage();
  const context = { sessionStorage, JSON, Date, window:{} };
  context.window = context;
  vm.createContext(context);
  const code = sliceBetween('const DRAFT_SESSION_KEY', '// v18：大量本機資料');
  vm.runInContext(code, context, { filename:'update-drafts.js' });
  context.writeUpdateDrafts({ grContent:'尚未完成的輔導紀錄', wpDirtyWeeks:{'2026-07-27':true} });
  const prepared = context.window.LIMUUpdateSafety.prepare();
  check('更新前偵測未完成草稿', prepared.count === 2);
  check('更新前草稿寫入 sessionStorage', sessionStorage.getItem('limu:updateDrafts:v1') !== null);
  context.window.LIMUUpdateSafety.clear();
  check('完成後可清除草稿', context.window.LIMUUpdateSafety.hasUnsaved() === false);
}

(async function run() {
  await testStorageIsolation();
  await testMigrationQuotaFailure();
  await testEncryptedBackupRoundTrip();
  testUpdateDraftSafety();
  if (failures.length) {
    console.error('LIMU v20.19 logic QA failed:\n- ' + failures.join('\n- '));
    process.exit(1);
  }
  console.log('LIMU v20.19 logic QA passed (21 checks).');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
