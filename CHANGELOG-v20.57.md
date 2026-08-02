# LIMU v20.57

## 1）回首頁鈕改為純圖示

48×48 圓鈕，只顯示 `⌂`。文字改由 `aria-label` / `title` 提供給輔助技術。
位置維持左下角。

## 2）黑色方格：先確認狀況，再重寫

實機截圖逐列量測（v20.56）：

```
面板底色 rgb(17,19,41) → 一路到 873.3pt
873.3pt 以下 59pt      → rgb(7,4,15)  ← html 的 #07040f
```

也就是 **v20.54 寫的「畫布底色同步」根本沒有生效**。
那塊黑格不是新問題，是同一條老問題還在。

上一版我假設那段程式會work就出貨了，而 jsdom 測不到它
（`getBoundingClientRect` 一律回傳 0，`var()` 也不會被解析），
等於沒有任何驗證。這是我的疏忽。

### 這一版怎麼改

同樣的手法在開場畫面是成功的（v20.51 實機量到那條確實變成指定色），
差別在開場是在極早期就設定。因此改為三個管道、四個時機：

```js
function syncCanvasBg(){
    ... root.style.background = col;
        body.style.background = col;
        themeMeta.setAttribute('content', col);   // iOS 部分情況取這個填保留區
}
syncCanvasBg();                       // 立刻
requestAnimationFrame(syncCanvasBg);  // 下一幀
setTimeout(syncCanvasBg, 150);
setTimeout(syncCanvasBg, 500);
```

面板可能還沒掛好、iOS 也可能需要稍後才重新取樣，重試直接涵蓋這兩種情形。
關窗時三個管道一併還原（含 `theme-color` 的原值）。

### 說在前面

**這一版我沒有辦法在出貨前證明它有效。** jsdom 沒有版面計算也不解析
CSS 變數，這段邏輯在自動化測試裡不會真的執行到——我只能保證它不出錯。

如果實機還是有那條黑格，下一版我不再調整手法，而是直接把
`syncCanvasBg()` 的執行結果印在面板上（有沒有找到面板、讀到什麼顏色、
有沒有設定成功），一次看清楚是哪一步斷掉。

---

## 驗證

- 回首頁鈕為純圖示 `⌂`，可按、點擊後關窗並回月曆
- 跳窗開啟時工作欄收起、關閉後恢復
- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- 116 個按鈕與月曆格巡覽零錯誤
- CSS 解析零錯誤
