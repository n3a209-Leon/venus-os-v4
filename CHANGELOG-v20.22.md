# v20.16 除錯與抓漏（修補版）

本版不新增功能，也不更動教師資料格式（`schemaVersion` 維持 7）。
全部改動皆為修正 v20.15 出貨後發現的缺陷。

## 嚴重：App 會永久卡死

- **修正登入時 `authLoading` 可能永遠不解鎖的死結。** `onAuthStateChanged` 回呼在
  `activateStorageOwner()` 失敗時直接 return，而保底 timer 已在回呼開頭被清掉，
  導致 `authLoading` 停在 `true`、畫面卡在已淡出的開場動畫（全黑、無任何反應），
  只能強制關閉 App。現改為以 `try/finally` 包住整段回呼，任何路徑都保證解鎖。
  觸發情境包含 IndexedDB 被系統清除、Safari 無痕模式、儲存空間已滿，
  以及另一個分頁佔住資料庫（`IDB blocked`）——正是自 v20.13 升級的典型情境。

## 使用者可見的錯誤

- 修正**首次安裝就跳出「已有新版本」**的假更新提示。Service Worker 的 `activate`
  會呼叫 `clients.claim()`，首次安裝時 `controllerchange` 必然觸發，舊版未區分
  「首次接管」與「真的換版」。
- 修正四處字串**雙重跳脫**，對話框先前會印出字面的 `\n\n`（登入失敗、本機模式
  啟動失敗、資料分區失敗、安全更新確認）。
- 修正 **App Icon 在 Android 被裁切**。v20.15 將滿版到邊的圖示宣告為
  `any maskable`，但該圖沒有安全區，套用圓形／squircle 遮罩會削掉頂部日蝕。
  現拆為兩筆宣告，並新增 `app-icon-512-maskable-v20-16.png`（內容縮至 80%，
  四周保留 10% 安全區，底色與啟動畫面一致）。
- 修正 **iPhone 主畫面名稱仍顯示舊的「作業記錄」**，現與 manifest 的
  `short_name` 一致為 `LIMU`。
- 修正 **13 個主題素材未被預快取**，導致首次離線切換到慕夏／奧德賽／星雲主題時
  裝飾整片破圖。預快取項目由 9 項擴充至 23 項，涵蓋頁面實際引用的全部資源。
- **開場圖改為預載。** 舊版要等 992 KB 的 HTML 解析完、ReactDOM 載入、React 掛載後
  才由 `createElement` 觸發下載；網路稍慢時 2.8 秒的開場會全程只有黑底。
- 修正**開場退場動畫被硬切**。舊版在淡出開始後僅等 120 ms 就卸載，但 CSS 的
  `spl-fadeout` 是 340 ms，等於播到約三分之一就中斷。
- 「減少動態效果」現在也會套用到退場動畫（舊版漏掉 `.spl-exit` 與 `.spl-img-exit`）。
- 保底逾時改為依實際時長推算，不再固定 3.6 秒；開啟減少動態效果時開場僅 0.42 秒，
  舊值會讓異常時多等 3 秒以上。

## 效能與資源洩漏

- **錯誤日誌不再無上限成長。** `_errLog` 舊版沒有長度限制，且每寫入一筆就把整個
  陣列重新序列化寫進 localStorage（成本 O(n²)）。現加上 50 筆上限並改為 debounce 寫入。
- **主題監聽器不再監聽整個 body 的所有變動。** 舊版以
  `{childList, subtree, attributes}` 觀察 `document.body`，React 每次 re-render
  都會產生大量 mutation records，每一筆都執行兩次 DOM 查詢。現改用
  `attributeFilter: ['data-theme']`，並修正原本「偵測到 data-theme 變動就跳過」
  的反向判斷。
- **星點繪製迴圈現在會真正停止。** 舊版在非星雲主題時以 `setTimeout(draw, 600)`
  無限遞迴，即使使用者從未使用星雲主題也會持續執行。
- **Service Worker 更新輪詢加上 15 秒節流。** 舊版每次 `pageshow`／
  `visibilitychange`／回到線上都會發出更新請求。使用者主動按「安全更新」時不受影響。
- **MessagePort 用完會關閉**，不再持續累積。
- 修正**連點按鈕會讓 inline 樣式永久殘留**。舊版每次點擊都重讀當前樣式當作「原值」，
  450 ms 內連點兩次就再也無法還原，殘留的 `overflow:hidden` 會裁掉按鈕內的
  下拉、提示與徽章。

## 健壯性

- **單一素材上傳失敗不再讓整個 Service Worker 裝不起來。** 舊版素材預快取採
  `Promise.all`，任何一個檔案 404 就會使 install reject、SW 永不啟用，
  離線能力靜默消失。現改為容錯處理，並在 Console 列出缺漏的檔名。
- 靜態資源比對加上 `ignoreSearch`，帶查詢字串的請求不再 miss 掉預快取
  （manifest 先前即因 `?v=` 而離線取不到，此版一併移除該查詢字串）。
- 備份還原時的 PBKDF2 迭代次數**夾住上限**，避免被竄改的備份檔凍住瀏覽器。
  僅限制上限，不拉高下限，以免舊版低迭代次數的備份永遠無法還原。
  瀏覽器不支援 Web Crypto 時不再被誤報為「密碼錯誤」。
- `<meta theme-color>` 與 manifest 的 `theme_color` 統一為 `#0a2731`。
- 補上 `mobile-web-app-capable` 與 manifest 的 `id`。

## 已知未處理

- **開場圖採 `object-fit: cover`**，與 v20.15 CHANGELOG「保留人物與裸足完整構圖」
  的描述不符。素材 709×1536 與 iPhone 全螢幕比例幾乎相同，手機上不會裁切；
  但 iPad 等較寬螢幕會被 `@media (min-aspect-ratio:3/4)` 切掉下緣。
  「滿版」與「完整構圖」互斥，需由設計決定要哪一個，本版維持現狀並修正錯誤註解。
- **`safeGet`／`safeSet` 重複定義**，內外層對「找不到」的回傳值不同（`null` 對 `''`）。
  影響橫跨一萬多行且呼叫點極多，建議獨立重構，不併入修補版。
- **導覽請求仍會完整讀取 index.html 文字。** 原評估為效能問題，複查後確認
  `buildId` 出現在檔案 23.4% 與 98.9% 兩處，尾端該處正是用來確認檔案完整傳完；
  改為只讀開頭會讓半套上傳的檔案通過檢查，反而削弱部署一致性保護，故維持原狀。
- App Icon 為 256 色索引色，漸層有輕微色階斷層。轉為 24 位元色無法補回已損失的
  色階（僅使檔案膨脹約 2.6 倍），需自原始高色彩母檔重新輸出方能改善。

---

# v20.17（緊急修正：Google 登入）

修正 v20.16 回報的「iPhone 主畫面 PWA 選完帳號後回到登入頁」。共兩個成因，
一個是 v20.16 引入的回歸，一個是自舊版即存在的缺陷。

## v20.16 引入的回歸

- **首次登入會閃出登入頁。** v20.16 為修正 P0 死結而加上的 `finally`，
  在 `activateStorageOwner()` 觸發 `window.location.reload()` 時也會解鎖
  `authLoading`。React 於是在 reload 生效前的空檔渲染出登入畫面——PWA 下
  要重新載入約 1 MB 的 index.html，這個空檔清楚可見，看起來就像「選完帳號
  被踢回登入頁」。現以 `__LIMU_RELOADING__` 旗標抑制該路徑的解鎖。
  P0 的保證不受影響：資料分區失敗的錯誤路徑不會設此旗標，一樣會解鎖。

## 舊版即存在的缺陷

- **redirect 備援登入永遠無法完成。** `gSignIn()` 在 popup 不可用時會退回
  `signInWithRedirect`，但全檔案沒有任何 `getRedirectResult()`，註解甚至寫著
  「popup 模式不需要」。回程沒有任何程式接手，使用者選完帳號就回到登入頁。
  現於啟動時處理 redirect 結果，並在有待處理 redirect 卻取不到 user 時
  明確提示可能是跨網域儲存分割所致。
- **iOS standalone 直接改走 redirect。** 「加入主畫面」模式下 `window.open`
  會被導向另一個 Safari context，popup 與 opener 之間的 postMessage 完全斷掉，
  `signInWithPopup` 不是無聲卡死就是丟出各種錯誤碼。舊版僅在
  `auth/popup-blocked` 時才備援，等於在最需要備援的環境反而沒有備援。
- popup 備援的判斷擴充至 `auth/operation-not-supported-in-this-environment`
  與 `auth/web-storage-unsupported`。
- **登入錯誤訊息帶上 `err.code`。** 舊版只顯示 `message`，但真正能定位問題的是
  錯誤碼（例如 `auth/unauthorized-domain`）。

## 可能仍需在 Firebase Console 設定

若上述修正後 iPhone 仍無法登入，多半是 Safari 的跨網域儲存分割（ITP）擋掉了
`attendance-pwa-9fa73.firebaseapp.com` 上的 auth handler。這無法單靠前端解決，
需在 Firebase Console：

1. 確認 Authentication → Settings → 授權網域，已加入實際部署的網域。
2. 將 `authDomain` 改為與 App 同網域的自訂網域，並依 Firebase 文件把
   `/__/auth/` 代理到 Firebase。這是 Firebase 官方對 Safari／iOS 的建議做法。

---

# v20.18（切換帳號與文件修正）

## 切換 Google 帳號

- **`switchGoogleAccount()` 改走 `gSignIn()`。** 舊版直接呼叫
  `firebase.auth().signInWithPopup()`，完全繞過 `gSignIn()` 的環境判斷，
  因此 v20.17 為 iPhone 加的 redirect 路徑對它一律無效。iOS 主畫面 PWA 下
  popup 常是無聲卡死而非拋出錯誤，連 `catch` 都不會進入。
- **移除切換前的 `signOut()`。** `prompt:'select_account'` 本來就會強制跳出
  帳號選擇畫面，不需要先登出；而先登出會在登入失敗或使用者中途取消時，
  把人留在「已登出且本機分區已清空」的狀態。現在取消或失敗都會停留在
  原帳號，資料不受影響，也不再需要 reload 收拾殘局。
- 切換失敗的提示訊息改為附上 `err.code`。
- redirect 回程若拿不到 user，會依情境顯示「切換帳號未能完成，仍停留在原帳號」
  而非一般登入失敗訊息。

### 已知的小行為

若在帳號選擇畫面挑了「同一個」帳號，登入狀態沒有變化，`onAuthStateChanged`
不會觸發，畫面因此不會有任何反應。這在語意上是正確的（沒有切換就沒有變化），
本版不額外處理，以避免為了邊緣情境增加改動面。

## 文件

- `README-部署說明.md` 與 `QA-測試說明.md` 的版本標示更新至 v20.18。
- 修正 README 指向不存在的 `CHANGELOG-v20.16.md`。
- 迴歸測試新增「文件版本必須與 `version.json` 一致」與「README 引用的
  CHANGELOG 必須真的存在」兩項檢查，避免同樣的漂移再次發生。

## 尚未處理（需要環境或流程配合）

- **Firebase authDomain。** Safari 16.1 之後，跨網域 `signInWithRedirect()`
  需要自訂 authDomain、反向代理或自行託管登入 helper。若 App 部署在
  GitHub Pages 而 authDomain 仍是 `firebaseapp.com`，登入可能依裝置而
  成功或失敗。最穩定的做法是改用同一個 Firebase 專案的 Firebase Hosting。
  這無法單靠前端解決。
- **真機自動化測試。** 目前 111 項檢查仍屬靜態與獨立邏輯層級，
  沒有真正點擊登入、切換帳號、首次安裝、離線冷啟動與更新流程。
  連續兩版的登入回歸都是這類檢查攔不到的，建議列為下一版首要工作。

---

# v20.19（資料搬移可靠度）

## P0：舊資料搬移可能被誤標為完成

- **完成標記改為與驗證同條件。** 舊版把 `hw5ren:migratedLegacyV1` 寫在
  `if (verified)` 之外：複製失敗時（例如 localStorage 容量不足，例外被
  `rawStorageSet` 吞掉）來源資料雖然正確保留了，卻仍被標記為已完成。
  結果是搬移永不重試，舊鍵長期躺在未分區的位置沒人讀取，
  教師登入後看到的就是資料消失——但資料其實還在。
- **重試條件一併放寬。** 只是不寫完成標記並不足以產生重試：
  `_activeStorageUid` 在載入時就從 `hw5ren:lastUidV1` 還原，重開 App 後
  `previous` 必然有值，而舊條件要求 `!previous`。現改為記錄
  `hw5ren:migratedLegacyPendingV1`（歸屬帳號），下次同一帳號登入時重試。
  若待重試標記屬於另一個帳號則跳過搬移，比舊版更保守。
- 搬移未完成時寫入錯誤日誌，可由 `localStorage.getItem('hw5ren:debugLog')` 取得。

### 新增行為測試

`qa/run-logic-tests.js` 新增 `testMigrationQuotaFailure()`，
以會拋出 `QuotaExceededError` 的假 localStorage 實際執行搬移邏輯，驗證：

- 失敗時不得寫入完成標記
- 失敗時保留來源資料
- 失敗時記錄待重試帳號
- 重開 App（`previous` 非空）後仍能觸發重試
- 重試成功後寫入完成標記、清除待重試標記、資料讀得到、舊鍵已移除

此測試在修正前會紅五項，是本專案第一個真正執行搬移邏輯的行為測試，
而非字串比對。

## 雲端查詢失敗不再完全無聲

`wpGetAll()` 與 `grGetAll()` 原本以 `catch(e) { return []; }` 靜默吞掉錯誤。
現維持回傳 `[]`（不更動呼叫端契約），但會寫入錯誤日誌。

經確認，此問題**不會造成資料遺失**：`mergeSecondaryRecords()` 是 union 合併，
remote 缺少的紀錄會因 `!remote` 判定 localWins 而保留；雲端寫入亦為單筆
（`wpSave`／`grSave`），不存在整批覆蓋。實際危害是換新裝置時查詢失敗會看到
空白，教師可能誤以為資料遺失而重新輸入造成重複。
正式的「雲端載入失敗」提示待真機測試框架建立後再補。

## 尚未處理

- **Firebase authDomain**：仍為 `attendance-pwa-9fa73.firebaseapp.com`。
  這是目前唯一還會讓 iPhone 登入時好時壞的因素，且無法由前端解決。
- **真機自動化測試**：本版新增的是 Node 環境下的行為測試，
  仍不等於在 iPhone 上實際點擊登入、切換帳號與更新流程。
- **`safeGet`／`safeSet` 統一**：建議待真機測試建立後再進行。
- **查詢範圍與分頁**：週計畫與輔導紀錄仍以 classKey 全量查詢後在手機端篩選日期。

---

# v20.20（介面調整）

## 輔導紀錄中心不隨主題變色

根因是 **`--card-bg` 從來沒有被定義過**。四處元件都寫成
`var(--card-bg, #1a1e2e)`，只有 fallback 生效，因此無論切到哪個主題，
面板永遠是那個寫死的深藍。受影響的不只輔導紀錄中心，還有 `.gr-dialog`、
`.gr-formal-box` 與另一處卡片。

現為五套主題各自定義完整色票：`--card-bg`、`--card-fg`、`--card-chip`、
`--card-accent`、`--card-line`，四處元件一次修正。

連帶處理：

- 面板文字色改吃 `--card-fg`，否則淺色主題會變成淺底淺字。
- 分頁鈕原本是 `rgba(255,255,255,.07)`，這種白色疊層只在深色底上看得見，
  切到慕夏或奧德賽等淺色主題會完全消失。改用 `--card-chip`。
- 選中的分頁由固定紫色改為 `--card-accent`。

## 底部黑條

底部彈出面板的 padding 原本是固定值（`32px`），沒有納入
`var(--safe-bottom)`，因此 iPhone Home 指示條那一段不會被面板底色蓋住，
露出底下接近黑色的背景，看起來就是一條黑帶。

`.gr-center-box`、`.gr-formal-box` 與齒輪選單的底部間距均改為
`calc(… + var(--safe-bottom))`。

## 齒輪選單的帳號區整合

原本佔用三列（帳號信箱、切換 Google 帳號、登出 Google 帳號），
現整合為單一橫列：左側顯示信箱（過長自動截斷），右側為「切換」與「登出」
兩顆小按鈕。未登入時則顯示本機模式與單顆「登入」按鈕。

選單因此縮短兩列。按鈕色彩同樣走 `--card-chip` / `--card-accent` 色票。

## 備註

新增區塊內一律使用 `theme === 'nerv'` 而非 `isNerv`，與齒輪選單周圍既有寫法
一致，避免作用域風險。

---

# v20.21（幹部跳窗配色）

## 黑色方格

幹部新增跳窗重用了週作業計畫的 `.wp-input-*` 樣式，整組是為**深色底**寫死的：
外框 `#1e1b3a`、輸入框 `rgba(255,255,255,.08)` 配 `color:#fff`、
placeholder `rgba(255,255,255,.3)`。外框被淺色主題覆寫成白色之後，
輸入框沒有跟著改，就變成白框裡嵌一格格深色區塊。

與 v20.20 的 `--card-bg` 是同一類問題，改用同一套卡片色票：

- `.wp-input-box`：`var(--card-bg)` + `var(--card-fg)`
- `.wp-input-field`：`var(--card-chip)` / `var(--card-line)`，文字改 `inherit`
- placeholder 改 `currentColor` + `opacity`，不再寫死白色
- `.wp-type-btn`、`.wp-preset-tag` 一併改走色票
- 底部間距補上 `var(--safe-bottom)`

## 未處理（需要你的決定或下一輪）

- **幹部快速選項內容**：「副班長」等字串在程式碼中完全不存在，
  這份清單是儲存在使用者資料中的自訂字串，不是寫死的預設。
  因此「妖乐股長」「粟長」是資料層的問題，無法由改程式修正。
- **頁面滑動卡住**：尚未調查。

---

# v20.22（幹部職稱預設）

## 修正寫死預設中的錯字

程式碼中原本有**兩份** `DEFAULT_OFFICER_PRESETS`，內容不同且互相遮蔽：
外層一份、元件內層一份。內層那份含有錯字「妖乐股長」（簡體「乐」）與
「粟長」，並且因為位於區塊作用域而實際生效。

（這兩個字串以 unicode 跳脫寫成 `\u5996\u4E50\u80A1\u9577`，
一般以中文搜尋原始碼會找不到。）

現已移除重複宣告，統一為單一來源，並更新為實際使用的 13 個職稱：

班長、副班長、風紀股長、體育股長、衛生股長、資訊股長、學藝股長、
東路隊長、西路隊長、外掃區長、內掃區長、機動隊長-服務股長、機動隊員

## 新增「↺ 重設」按鈕

幹部跳窗的快速選項區新增重設按鈕，可一鍵套用上述預設清單。
會先確認，且**只影響快速選項，不影響已指派的幹部名單**。
清空所有選項時也會自動回到預設。

## 輸入框黑底

幹部跳窗的三個輸入框使用 inline style 且未指定 `background`。
iPhone 在深色模式下，UA 預設樣式會把未指定背景的 `<input>` 畫成黑底，
形成白色跳窗中嵌著黑色方格。現已補上明確的背景與文字色。

（v20.21 修正的 `.wp-input-*` 是週作業計畫的樣式，與此為不同的兩處問題。）
