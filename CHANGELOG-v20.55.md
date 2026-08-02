# LIMU v20.55

## A. 底部工作欄改為懸浮膠囊

原本是貼齊螢幕底緣的整條列。改成離開邊緣、四周留白的膠囊：

```css
.mobile-dock{
  position:fixed;
  left:max(14px,env(safe-area-inset-left,0px));
  right:max(14px,env(safe-area-inset-right,0px));
  bottom:calc(max(12px,var(--safe-bottom)));
  display:flex; gap:4px; min-height:58px; padding:6px;
  border-radius:999px;
  box-shadow:0 12px 32px rgba(20,42,74,.26),0 2px 8px rgba(20,42,74,.14);
}
```

順帶解決一個結構問題：iOS 有時只給網頁 873pt 畫布、下方 59pt 由系統填底色，
工作欄原本正好壓在那條邊界上。改成懸浮之後它不再碰到邊界，
那 59pt 只會露出 App 自己的底色。

### 選取中才展開成文字膠囊

未選取的項目只顯示圖示，**選取中的項目展開成帶文字的膠囊**
（`flex-grow:2.1`，`.dock-label` 由 `display:none` 轉為 `inline`，
`.22s` 過渡，並尊重 `prefers-reduced-motion`）。

這樣既有截圖裡那種乾淨的圖示列，又不必猜圖示的意思——
目前在哪一頁隨時看得到，其餘四個保持安靜。純圖示對每天要用的
教學工具來說辨識成本偏高，這是折衷後的選擇。

**沒有使用 backdrop-filter。** 固定元素套毛玻璃會讓捲動掉幀，
這是 v20.36 就確認過的，不重蹈覆轍。

### 四個佈景主題都跟著調整

- nerv：`border-radius` 由 `4px 4px 0 0` 改為 `999px`
- mucha：選取態的 `18px 18px 13px 13px` 改為 `999px`
- mucha／nebula：原本貼在整條列上緣的飾條已隱藏（膠囊沒有那條邊）
- odyssey：`border-top` 改為整圈 `border`，陰影改為環繞

內容底部留白由 66px 增為 82px（膠囊 58 + 下緣 12 + 間隙 12）。

## B. 彈出面板配合更新

- 圓角 22px → **28px**，與膠囊的 999px 同一種語彙
- 頂端加上**可視的把手**（38×4 圓角條，`currentColor` 22% 不透明度），
  明確指出這是可以往下收的面板——之前只有右上角的 × 看得出來
- 底部留白改成「安全區 + 58px」，內容不會被懸浮的工作欄壓住
- 陰影加深為 `0 -16px 44px rgba(0,0,0,.34)`

涵蓋 `.v18-sheet-panel`、`.gr-center-box`、`.gr-formal-box`、`.wp-box`，
把手用 `::after` 實作（`::before` 已被 mucha 主題佔用）。

---

## 驗證

- 工作欄 5 個按鈕、5 個標籤齊備，選取態正確
- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- 116 個按鈕與月曆格巡覽零錯誤
- 回首頁按鈕、開場退場皆正常
- CSS 解析零錯誤

視覺效果需實機確認：膠囊的留白比例、把手的明顯度、
以及選取項展開時的動態是否順暢。
