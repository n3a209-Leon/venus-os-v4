# LIMU v20.54

## A. 底部彈出面板下方的黑色長方塊

### 原因

與開場黑塊完全同源：iOS 有時只給網頁 **873pt** 的畫布（螢幕是 932pt），
下方 59pt 由系統用「頁面底色」自行填滿，網頁畫不到那裡。

App 本身是深色底，與 html 的 `#07040f` 相近，所以平常看不出來；
但底部彈出面板（輔導紀錄中心、今日工作台、全域搜尋、功能選單）是米白色，
那條深色就變得非常明顯。

### 修正

既然畫不到，就把畫布底色換成**面板本身的顏色**。
在既有的捲動鎖 effect 裡加上：

```js
var col = getComputedStyle(panel).backgroundColor;
root.style.background = col;      // 開窗時
root.style.background = prevRootBg; // 關窗時還原
```

顏色直接讀面板的 computed style，**任何佈景主題都自動吻合**，
不需要為 nerv／nebula／mucha／default 各寫一份。

只在「真的貼齊畫布底緣」的面板才套用——手機版 `.v18-sheet-overlay` 是
`align-items:flex-end`，這些面板一定貼底；桌面版則用實際位置判斷。
置中的小跳窗不會誤觸發，否則反而會讓四周的遮罩破一塊。

涵蓋 `.v18-sheet-panel`、`.gr-center-box`、`.gr-formal-box`、`.wp-box`。

## B. 彈出面板新增「⌂ 首頁」

底部面板現在都可以一鍵回月曆首頁，不必先關窗再點月曆：

- 今日工作台
- 輔導紀錄中心
- 全域搜尋
- 功能選單（清單置頂新增「回到首頁」）

按鈕放在標題列、`×` 的左側，`minHeight:32`，配色用 `currentColor`
外框，四個佈景主題都適用。

## C. 一併清掉的雜項

- **`firestore.rules` 移出部署包。**
  Firestore 規則要在 Firebase Console 設定，放在網站空間沒有作用；
  留在包內反而有被誤上傳、整份覆蓋專案規則的風險
  （Venus OS 與獎卡系統共用同一個 Firebase 專案）。
  README 的警語同步改寫。
- **CHANGELOG 只保留最近四版**（v20.50～v20.53），
  原本 19 個檔案 80K 會一起傳到網站根目錄。
- **移除 `loadGSI()`**——空殼函式 `function loadGSI(){ return Promise.resolve(); }`，
  全檔沒有任何呼叫。

剩餘 8 個未使用宣告都是解構出來沒用到的 setter
（`setWpInputDay`、`setShowHistory` 等），移除得動到解構本身，
風險大於效益，保留。

## D. 版本號

依你的意見保留在開場左上角與 App 標題列。v20.53 已改為單一來源，
不會再出現兩處不同步的情況。

---

## 驗證

- 輔導紀錄中心、全域搜尋、功能選單的回首頁按鈕：存在、可按、點擊後正確關窗
- 今日工作台的按鈕於 DOM 中確認存在（自動化腳本以底部工具列開啟時通過）
- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- 116 個按鈕與月曆格巡覽零錯誤
- 開場退場乾淨、版本號正確
- JS 各區塊語法、CSS 解析零錯誤

畫布底色的效果需實機確認——jsdom 沒有版面計算，`getBoundingClientRect`
一律回傳 0，這段邏輯在自動化測試中不會實際觸發。
