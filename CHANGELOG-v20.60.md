# LIMU v20.60

## 回首頁鈕改為面板內的 sticky 列

### v20.59 為什麼還是重疊

上一版把按鈕設為 `position:fixed` 貼在視窗左下角，並在面板底部留 78px
空白讓開。實機仍然壓到內容，原因是：

**面板有 `maxHeight:88vh`——內容一長就會捲動。** 那段 78px 留白位在捲動
內容的最末端，畫面往上捲時它在視野外；而 `position:fixed` 的按鈕永遠貼著
視窗底部，於是照樣壓在當下可見的內容上。

Chromium 測試沒抓到，是因為測試資料短、面板不會捲動——**斷言只驗到了
內容剛好塞得下的那種情況**。這是我上一版寫斷言時的盲點。

### 改法

按鈕移進面板內，包在一個 sticky 列裡：

```css
.sheet-home-dock{
  position:sticky; bottom:0; z-index:20;
  display:flex; align-items:center;
  margin-top:18px; padding:12px 0 2px;
  background:inherit;          /* 取面板本身的底色 */
}
.sheet-home-dock::before{      /* 上緣極淡漸層，讓內容自然淡出 */
  content:""; position:absolute; left:0; right:0; top:-20px; height:20px;
  background:linear-gradient(180deg,rgba(0,0,0,0),currentColor); opacity:.05;
}
```

sticky 列**佔有實際版面**：捲到底時它就是內容的最後一段，捲到中間時
吸附在面板下緣。結構上不可能與內容重疊，不必再靠留白閃避。

面板底部留白同步移除多留的 78px，回到單純吃安全區。

四個面板（今日工作台、輔導紀錄中心、全域搜尋、功能選單）都改用同一個
`.sheet-home-dock`。功能選單的水平內距對齊清單項目（28px）。

### 補上的斷言

`visual-check` 新增／強化兩項：

- **重疊檢查涵蓋「面板可捲動」的情況**：測試會把面板的 `maxHeight`
  暫時壓成 260px 強制觸發捲動、捲回頂端，再用 `elementFromPoint`
  確認按鈕中心命中的仍是它自己。這正是上一版漏掉的情境。
- **按鈕必須位於 `position:sticky` 的容器內**，避免日後又被改回 fixed。

目前 **27/27 通過**。

---

## 驗證

- `visual-check` 27/27（真實 Chromium、iPhone 直式尺寸）
- jsdom 端對端 32/32
- 無 IndexedDB 降級 7/7
- 146 個按鈕與月曆格巡覽零錯誤
- `bump-version` 同步 9 處版本識別後 `--check` 一致
- CSS 解析、各 script 區塊語法零錯誤
