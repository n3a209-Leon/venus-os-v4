# LIMU v20.66 — 稽核 P2／P3 收斂

版本：20.66.0
建置：limu-teacher-v20-66-20260804
快取：hw-tracker-v20-66
資料格式：7（未變動）

v20.65 的月曆重建修正與 `?perf=1` 探針原樣保留，本版沒有再動月曆或任何
效能相關的程式，`?perf=1` 的讀數仍可直接用來判斷 v20.65 是否命中。

---

## P2｜學年度轉換會沿用過期的學校 profile

`startSchoolYearTransition` 直接從閉包取 `schoolEventStore.profile`
（學校名稱、schoolUrl、sourceUrls）來建立新班級。

但設定頁被 `React.memo` 包住，比較清單裡沒有 `schoolEventStore`。
背景同步更新公開行事曆之後，設定頁不會重繪，這支函式的閉包就停在舊值——
新學年度的班級因此拿到過期的學校來源設定。

**做法**：比照 `activeClassId` 在此專案既有的慣例，改成 localStorage 優先：

```js
var latestEventStore = schoolEventStore;
try {
    var evCid = _sl.get('hw5ren:activeClass') || activeClassId || '';
    var evRaw = evCid ? _sl.get('hw5ren:schoolEvents:' + evCid) : '';
    if (evRaw) latestEventStore = normalizeSchoolEventStore(safeJSON(evRaw, {}));
} catch(eEventStore) {}
```

所有寫入 `schoolEventStore` 的路徑（`saveSchoolEventStore`、遠端同步、
學年度轉換本身）都會同步寫這個鍵，因此 localStorage 不會比 state 舊。

**刻意不做**：沒有把 `schoolEventStore` 加進 memo 比較清單。那會讓設定頁
在每次行事曆同步時整頁重繪，等於把 v20.63 的成果吐回去。補救做在讀取端。

同時把整份比較清單的稽核結論寫進 `MemoSettingsView` 的註解：把每個函式型
prop 的自由變數展開後，會讀到而不在清單裡的 App state 只有 `authed`、
`activeClassId`、`schoolEventStore` 三個，前兩者已分別被 `firebaseUid` 連帶
覆蓋與 localStorage 優先讀法保護。下次不必重查一遍。

## P2｜「技術診斷」「獎卡資料掃描」按了沒反應

兩者是用 `document.querySelector('[data-day-tool="…"]')` 去點當日檢視裡的
按鈕，原本寫成 `if (btn) btn.click();`——查不到就什麼都不做，面板照樣關閉。
使用者只會覺得按了沒反應，也沒有任何線索。

**做法**：抽出 `runDayTool(toolKey, toolLabel)`。找不到目標時：

- 跳 Toast：「目前畫面上找不到「技術診斷」，請先開啟當日紀錄再試一次」
- 同時寫進 `_writeLog`，事後可從技術診斷的 log 追

---

## P3｜四項

**移除孤兒素材。** `login-background.jpg`（113.5KB）與 `odyssey-frame.svg`
自 v20.62 起已無人引用（前者因登入畫面改與開場共用影像，後者被
`odyssey-frame-v20-62.svg` 取代），卻仍留在 `PRECACHE_URLS`。
經全檔搜尋確認除該清單外無任何引用後移除，離線素材由 30 項降為 28 項，
每次安裝／更新少下載約 114KB。

**`window.open` 補上 `noopener`。** 開啟獎卡系統時改為
`window.open(url, '_blank', 'noopener')` 並補一道 `w.opener = null`。

**底部「更多」的無障礙語意。** 原本用 `aria-current="page"`，但這顆按鈕開的
是面板不是頁面，螢幕閱讀器會念成「目前頁面」。改為 `aria-haspopup="menu"`
搭配隨面板開合的 `aria-expanded`。月曆與輔導兩顆維持 `aria-current`（那兩顆
確實對應到檢視）。

**功能面板的 key。** 原本 `key: item.label`，而「同步衝突」的 label 內嵌筆數
（`同步衝突（3）`），數字一變 key 就變，React 會把該按鈕整顆拆掉重建。
每個項目改配固定 `id`。

---

## 額外：圖示名稱不再靜默失敗

`renderUiIcon` 最後的 fallback 是三個點，也就是「更多」的圖示。這對
`name === "more"` 是刻意的，但副作用是**任何打錯的圖示名稱都會安靜地變成
三個點**，看起來像有畫出來，不會有人發現。

加了一張合法名稱表（15 個，含刻意走 fallback 的 `more`）。不在表上的名稱
會在主控台留一筆警告並寫入 log，**畫面行為完全不變**——仍然給 fallback，
不讓 UI 開天窗。

這是「靜態測試全過、缺陷照樣上線」的同一類結構，這次讓它自己出聲。

---

## 驗證紀錄

- 11 段內嵌程式 + 合併後全域範圍語法：通過
- `sw.js`、2 支工具程式語法：通過
- ESLint 錯誤規則：30 項，與 v20.64／v20.65 完全相同（皆為 `window.*` 全域與 UMD 誤判），未新增任何一項
- `react-hooks/rules-of-hooks`：零違反
- 逐項斷言：14 項全數通過（含面板 10 個 id 唯一、所有字面圖示名稱與 `icon` 欄位皆在合法表內）
- 版本識別一致性（index.html 7 處、sw.js 3 處、version.json、README）：通過
- 預快取 28 項對照磁碟：無缺檔；index.html 亦無殘留引用
- HTML 標籤配對：平衡

**未做真實瀏覽器驗證**——Chromium 在本次作業環境無法下載。
`tools/visual-check.mjs` 與 iPhone 實測仍不能省。

### 建議的實測順序

1. `?perf=1` 看月曆「格子重建」——這是 v20.65 的驗收，與本版無關。
2. 當日紀錄 → 更多 → 技術診斷／獎卡資料掃描，確認正常運作；再從月曆檢視
   下確認那兩項不會出現（`hidden` 條件未變）。
3. 更多 → 開啟獎卡系統，確認仍能開啟。
4. 設定 → 學年度轉換，確認新班級的學校名稱與網址正確。
5. 五套主題各看一次功能面板與底部列，確認圖示沒有變成三個點。
