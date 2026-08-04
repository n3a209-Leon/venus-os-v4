# LIMU v20.65 — 月曆重建修正與量測探針

版本：20.65.0
建置：limu-teacher-v20-65-20260804
快取：hw-tracker-v20-65
資料格式：7（未變動）

本版**只做一件事**，外加一支用來驗證這件事的量測工具。刻意不合併其他修正，
是為了讓真機測試能單獨歸因。

---

## 修正：月曆格子每次重繪都被整片拆掉重建

### 症狀

主要優化（移除 backdrop-filter、延遲 localStorage 寫入）完成後仍殘留的捲動卡頓。

### 原因

`CalendarCell` 宣告在 `App()` 函式內部（index.html L12762），
呼叫端用 `React.createElement(CalendarCell, ...)` 把它當成元件型別。

函式宣告在 App 內，代表 **App 每重繪一次就產生一個新的函式 identity**。
React 比對前後兩次的 element 型別，看到「型別換了」，處理方式不是 diff，
而是把舊的整棵子樹 unmount、再把新的 mount 回去——一整片月曆格子走完整
DOM 重建。

App 內有 161 個 `useState`，任何一個變動都會觸發這個流程。

### 做法

`CalendarCell` 沒有任何 hook，也沒有自己的 state，本質上就是一段回傳
element 的樣板。因此：

1. 改名為 `renderCalendarCell`（小寫開頭）。
2. `key` 直接掛在它回傳的 `div` 上。
3. 呼叫端由 `React.createElement(CalendarCell, {...})` 改為直接呼叫
   `renderCalendarCell({...})`。

改完之後 React 只會看到一般的 element 陣列，走正常 diff。

改小寫開頭是刻意的：讓「再被當成元件型別使用」這件事在語法層面就顯得不對，
避免日後改回去。

### 未變動

不搬動任何閉包、不動 `monthDays` 資料流、不動格子的 class 與 DOM 結構、
不動 CSS。渲染輸出與 v20.64 完全相同。

---

## 新增：`?perf=1` 量測探針

先前的 `React.Profiler` 做法在 production build 會被編掉，量不到數字。
這支完全不碰 React，改用瀏覽器原生的 `MutationObserver` 與
`PerformanceObserver`，直接數 DOM 實際被重建幾次，結果印在畫面右上角。

**只有網址帶 `?perf=1` 才會啟動**，一般開啟不會建立任何 observer。

### 使用方式

1. 開 `…/index.html?perf=1`，停在月曆畫面。
2. 做幾個不換月份的操作（開關功能面板、等一次同步跑完、切主題）。
3. 看「格子重建」那一列：

   | 讀數 | 判讀 |
   |---|---|
   | 重建 `+0 / -0` | 修正生效 |
   | 每次操作跳 `+35` 左右 | 修正未命中，問題在別處 |

   換月份時本來就該重建一次，那不算。

4. 用力上下滑 5 秒，看「長工作」與「最長一次」。

### 主控台介面

```js
LIMUPerf.stats()   // 取得目前數字
LIMUPerf.reset()   // 歸零，可量測單一動作的成本
```

### 已知限制

`longtask` 這個 entry type，iOS Safari 不支援，所以在 iPhone 上「長工作」
會固定顯示 0——這是預期的，不是壞掉。**iPhone 上請以「格子重建」為準**，
那一列在 Safari 完全可用。長工作數字要在桌機 Chrome 上看。

---

## 驗證紀錄

- 11 段內嵌程式 + 合併後全域範圍語法：通過
- `sw.js`、2 支工具程式語法：通過
- ESLint 錯誤規則：與 v20.64 完全相同的 30 項（皆為 `window.*` 全域與 UMD 誤判），未新增任何一項
- `react-hooks/rules-of-hooks`：零違反
- AST 複驗：App 內已無「被當成元件型別的巢狀函式」
- 版本識別一致性（index.html 7 處、sw.js 3 處、version.json、README）：通過
- 預快取 30 項對照磁碟：無缺檔
- HTML 標籤配對：平衡

**未做真實瀏覽器驗證**——Chromium 在本次作業環境無法下載。
`tools/visual-check.mjs` 與 iPhone 實測仍不能省。

---

## 本版刻意未處理

以下已在稽核中確認，留待下一版，避免與本次效能修正混在一起無法歸因：

- `MemoSettingsView` 比較清單缺 `schoolEventStore`（影響學年度轉換時的學校 profile）
- 「技術診斷」「獎卡資料掃描」找不到按鈕時靜默失敗
- `login-background.jpg`（113.5KB）與 `odyssey-frame.svg` 已無人引用，卻仍在預快取清單
- `window.open` 缺 `noopener`
- 底部「更多」用 `aria-current`，應為 `aria-haspopup` / `aria-expanded`
- 功能面板 `key: item.label`，而「同步衝突」的 label 內嵌筆數
