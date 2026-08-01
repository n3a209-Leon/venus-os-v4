# LIMU v20.38

保留 v20.37 的「班級設定分頁起滑被拉住」修正，並補上 v20.36 就存在、v20.37 未處理的問題。

## A. 崩潰修正（高優先）
- `App()` 內第 13082 行的「新增今日事件」彈窗，取消鈕引用了未宣告的 `nerv`
  （該變數只存在於 `SettingsView`）。點擊即拋 `ReferenceError`，React 卸載整棵樹，
  畫面全白且必須重開 App。改為同作用域的 `isNerv`。

## B. CSS 語法修正
- 第 730、843 行兩處註解缺少 `/*` 開頭，中文說明文字掉進宣告區塊；
  其中一處連帶吃掉 nebula 卡片的 `box-shadow`。補回開頭符號。

## C. 設定頁 :active filter 抑制範圍還原
- v20.36 為 `.settings-view button:active{filter:none}`（涵蓋座號／組別大量按鈕），
  v20.37 縮到只剩 `.settings-tab-btn`。座號格重新恢復全域 `button:active` 的 filter，
  起滑時仍可能建圖層。還原為 v20.36 的範圍，分頁鈕規則保留。

## D. 互動元素 touch-action
- v20.37 把 `button/td/[class*=cell]…` 的 `touch-action:manipulation` 一併移除。
  `manipulation` 允許 pan 與 pinch，僅停用雙擊縮放，比 v20.37 自訂的 `pan-y` 寬鬆，
  不影響原生捲動；移除後在座號格連點會誤觸整頁放大。已還原至互動元素（html/body 維持 auto）。

## E. 頂部安全區改由 header 吸收
- v20.37 用 `body{padding-top:var(--safe-top)}` 撐開安全區，功能正確，
  但狀態列區域顯示的是 body 背景（#07040f），與標題列漸層不同色，淺色主題下是一條黑帶。
- 改為 `header{padding-top:max(14px,var(--safe-top))}`，讓標題列漸層填滿瀏海區；
  登入頁與崩潰橫幅各自吸收安全區。已移除 body 與手機媒體查詢中的重複 padding。

## 保留不動
- v20.37 的 `role="tab"` / `aria-selected`、已選分頁 `pointer-events:none`、
  分頁列改 `position:relative`、排程器事件改用非 capture、手機端主題層合併等，全部保留。
