# LIMU v20.40

本版來自一次以「所有紀錄都要存得住」為目標的深度稽核。做法是用 jsdom 真的把
App 跑起來，接上 `fake-indexeddb`（真的 IndexedDB）與一個會實際保存資料的
假 Firestore，模擬教師的完整操作流程，再關掉重開驗證資料回得來。

八類紀錄（作業、出勤、回條、今日事件、輔導、幹部、班級設定、activeClass）
在正常環境下全部通過。過程中發現一個只在特定裝置條件下才會出現、
但一旦出現就完全無法使用的缺陷。

---

## A. 【P0】IndexedDB 不可用時，登入被永久擋住

### 症狀

在 IndexedDB 無法使用的裝置上，教師輸入 Google 帳號登入成功後，
畫面仍停在登入頁，怎麼點都進不去，連「先使用本機模式」也一樣卡住。
沒有錯誤訊息、Console 沒有紅字，看起來就像登入沒有反應。

會落入這個狀態的情況：

- Safari 無痕模式
- iOS 設定裡關閉了網站資料儲存，或「清除網站資料」後的第一次開啟
- 裝置儲存空間耗盡，IndexedDB 開啟失敗
- 企業／學校裝置管理政策封鎖了本機儲存

### 原因

`activateStorageOwner()` 把 `hydrate()` 與 IDB 舊資料搬移的任何失敗
一律當成致命錯誤，`return false` 中止登入：

```js
try {
    if (scope.hydrate) await scope.hydrate(uid);
    await migrateLegacyIdbForCurrentUser();
} catch(eMigration) {
    if (result && result.changed) scope.clearUid();
    showError('本機資料分區尚未完成，為避免讀錯帳號已停止登入。…');
    return false;      // ← IndexedDB 整個不可用時，這裡必然踩到
}
```

擋下來的原始用意是對的——資料分區沒做完就進去，有讀到別的帳號資料的風險。
但它沒有區分兩種完全不同的失敗：

1. **IndexedDB 整個不可用**：`hydrate` 必然 reject，而且會一直 reject。
   這時候並沒有跨帳號風險——未 hydrate 時 `safeGet()` 讀的是
   `scopedLocalKey()`，本來就已經按 uid 分區了。
2. **IndexedDB 可用，但搬移到一半失敗**：這才真的可能留下跨帳號殘留，
   應該擋。

開機路徑（`waitForReact`）本來就有 `.catch → startApp()` 的降級處理，
登入路徑卻沒有，兩邊不一致。

### 修正

新增 `LIMUStorageScope.probeIdb()`：單次探測 IndexedDB 是否真的能開，
回傳 boolean、永不 reject。`activateStorageOwner()` 先探測：

- **IDB 可用** → 照舊執行 hydrate 與搬移，失敗仍然擋下登入（原行為不變）。
- **IDB 不可用** → 跳過 hydrate 與搬移，記一筆日誌，改以 localStorage
  分區繼續運作。

日資料原本就有 `idbSet` 失敗時改寫 localStorage 的備援，
設定類資料也有 `flushScopedStateQueue` 的 catch 降級，
所以降級後功能是完整的，只是少了 IDB 這一層。

## B. 未 hydrate 時的「寫完馬上讀讀到舊值」

`safeSet()` 無論有沒有 hydrate 都會把值收進 `_scopeMemory`，
但舊版 `safeGet()` 在未 hydrate 時直接跳過記憶體去讀 localStorage，
而 localStorage 那份要等延後佇列 flush（最長約 3.5 秒）才會寫進去。
中間這段空窗期讀到的是舊值或 null。

平常看不到這個問題，因為開機時 hydrate 都會成功；但 A 項修好之後，
「未 hydrate」變成一個會實際長期存在的狀態，這條就必須一起補。

已改為先查 `_scopeMemory`（記憶體隨 `setUid` 換帳號時清空，不會跨帳號），
查不到才回退 localStorage。`visibleStorageKeys()` 同步比照處理。

---

## 驗證

### 正常環境端對端：32 項全過

建班級 → 作業（整組全交／整組未交）→ 出勤 → 回條 → 今日事件 → 輔導紀錄
→ 幹部，關掉 App 重開，逐項確認：畫面有反應、寫進 IndexedDB、
上傳 Firestore、重開後還原。兩個 session 皆零 console error／warning。

實際落地的當日紀錄：

```json
{"rows":[{"hwName":"聯絡簿","groupData":{"1":[7,9,4,5,26,8],"2":[]}}],
 "attendance":{"personal":[1],"sick":[],"public":[],"late":[]},
 "slips":[{"name":"運動會同意書","paid":[]}]}
```

### 無 IndexedDB 降級：7 項全過

以兩種真實失敗模式模擬（`open()` 直接丟例外、`open()` 回傳的 request
觸發 onerror）：可正常進入 App、班級寫入後立刻讀得到、出勤可登記、
日資料落在 localStorage、重開後班級與出勤都還原。

### 強制關閉（不觸發 pagehide）

登記完立即關閉視窗，延遲 0／100／400／1500ms 四種情境，
日資料與設定類資料都存活。

### 靜態檢查

CSS 以 css-tree 解析零錯誤；ESLint `rules-of-hooks`、`no-unreachable`、
`no-undef`（跨 script 全域除外）全數通過。

---

## 已知限制（不修，記錄備查）

`flushScopedStateQueue()` 是非同步的 IndexedDB 交易，`pagehide` 觸發後
不保證跑得完。若 iOS 在事件觸發後立刻凍結頁面，最後那一批設定類寫入
理論上仍可能掉。這是 IndexedDB 的本質限制，除非再加一層同步的
localStorage 鏡像才能完全消除，代價是每次操作都要多一次同步寫入，
會把 v20.36 好不容易改掉的捲動卡頓帶回來。目前的設計
（idle + maxWait 3.5 秒 + pagehide 同步觸發）是合理的平衡。

## 測不到的部分

jsdom 沒有真正的排版引擎與捲動，所以視覺與手感問題一律測不到：
安全區黑邊、捲動卡頓、iOS PWA 的 `signInWithRedirect` 行為、
真實 Firestore 的權限與跨裝置衝突，仍然需要 iPhone 實機確認。
v20.39 的 `.app` 高度修正（頁面底部黑邊）尤其需要在真機看一眼。
