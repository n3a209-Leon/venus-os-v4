# LIMU v20.39

v20.38 的三項修正（`nerv` 崩潰、CSS 註解、`:active` filter 範圍）經稽核確認全部到位。
本版處理稽核時另外發現、v20.38 未涵蓋的殘留問題，並清掉一批死碼。

## A. 頂部安全區殘留（顯示問題）

- v20.37 用 `body{padding-top:var(--safe-top)}` 撐開瀏海區時，手機媒體查詢裡
  搭配了 `.app{min-height:calc(100dvh - var(--safe-top))}`——當時 body 已經吃掉
  一段高度，`.app` 扣回去是正確的。
- v20.38 改由 `header{padding-top:max(14px,var(--safe-top))}` 吸收安全區、
  移除了 body 的 padding，但這條扣除規則沒有跟著還原。結果 `.app` 比視窗矮了
  一個瀏海的高度（iPhone 上約 47～59px），內容不長的頁面底部會露出一條
  body 底色（深色主題下是黑帶）。
- 已改回 `.app{min-height:100dvh}`，並更新上方那段仍在描述「頂部安全區由 body
  實際佔位」的過時註解。

## B. 死碼移除

- 「🔍 診斷」按鈕的處理函式在 `alert(out); return;` 之後，還留著一整段舊版的
  IDB／localStorage 掃描與搶救邏輯（含 `doLoadMonth` 呼叫），永遠執行不到。已移除 37 行。
- 移除確認無任何引用的宣告：
  - `safeJSONParse`（`safeJSON` 的舊包裝）
  - `saveCounsel` / `loadCounselMonth` / `loadCounsel`（每日輔導已改走
    `grRecords` 路線，這三支自成一組孤島，彼此互相呼叫但沒有任何外部進入點）
  - `getCurrentGroupVersion`、`saveYearRecord`、`addRow`
  - `MAX_ROWS`、`COUNSEL_PERIODS`、`COUNSEL_TYPES`、`COUNSEL_FOLLOWUP`
  - `wpInputOpen`／`setWpInputOpen`（週計畫輸入已改由 hwpicker 處理）
  - `activeTab`／`setActiveTab`、`groupSnapshots`、`accent`、`todayStr`、`paidArr`
- 合計 index.html 減少 126 行。**未更動任何資料格式、Firebase 路徑、班級鑰匙或
  既有功能**；schema 維持 v7。

## C. firestore.rules 部署警語與子集合覆蓋

- 加上明確的部署警語：Firestore 沒有規則合併機制，部署會【整份取代】專案規則。
  LIMU、Venus OS、獎卡系統共用同一個 Firebase 專案，單獨部署這份檔案會讓
  另外兩者因「預設拒絕」而全部失效。正確做法是把 match 區塊貼進專案現行規則檔。
- `match /vc-card-users/{userId}` 補上 `/{document=**}`。原本只涵蓋單一文件，
  獎卡系統日後若改用子集合，LIMU 的獎卡掃描會拿到 permission-denied。
- 補充說明：規則是 OR 運算，`allow ... : if false` 不會否決其他 match 的放行；
  最後的 catch-all 僅作文件用途。

## 驗證方式

除既有靜態檢查外，本次改用 jsdom 實際啟動 App 做整合測試：

- 啟動路徑（登入頁 → 本機模式 → 主畫面）零 console error／warning。
- 種入一個測試班級後，自動點擊 145 個按鈕與月曆格、8 輪展開子畫面，
  全程無例外拋出，React 元件樹未卸載。
- 未登入狀態另跑一輪 124 個按鈕，同樣零錯誤。
- CSS 以 css-tree 解析零錯誤；ESLint 的 `rules-of-hooks`、`no-unreachable`、
  `no-undef`（跨 script 全域除外）皆通過。

## 保留不動

- v20.38 的 `isNerv` 修正、CSS 註解修正、`touch-action:manipulation`、
  header 吸收安全區。
- v20.37 的 `role="tab"`／`aria-selected`、已選分頁 `pointer-events:none`、
  分頁列 `position:relative`、非 capture 排程器事件、手機端主題層合併。
