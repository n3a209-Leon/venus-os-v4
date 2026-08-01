# LIMU v20.41

兩項都是實機回報、jsdom 測不到的視覺問題。

## A. 開場畫面底部露出一條底色

### 實測

從 iPhone 螢幕截圖逐列取樣，開場圖在 y=873pt 處**硬切**，
以下 59pt 是純色 `#07040f`——正是 `<html>` 的行內背景色。
螢幕 932pt，59pt 恰好等於該機種的頂部安全區高度。

### 原因

`.spl-overlay` 原本用 `position:fixed; inset:0`。`inset` 是相對「包含區塊」
計算的，而某個祖先把包含區塊的高度縮短了一個頂部安全區，
於是開場層只有 `100dvh − 59pt` 高，底下就露出 html 底色。

### 修正

改成不依賴包含區塊的寫法：

```css
position:fixed;
top:0; left:0; right:0;
height:100vh;      /* 舊瀏覽器 */
height:100dvh;     /* dvh 相對「視窗」，不受祖先影響 */
```

`dvh` 是視窗單位，不管祖先怎麼變都一定滿版。
底色同時由 `#080b10` 改成與 html/body 一致的 `#07040f`，
萬一還有 1px 殘縫也看不出來。

## B. 進入班級設定時畫面會跳一次

### 原因

三套字體共用同一個 Google Fonts 請求，且用 `display=swap`：

```
family=Cinzel+Decorative&family=Noto+Sans+TC&family=Share+Tech+Mono&display=swap
```

Noto Sans TC 是完整中文字型，檔案大、下載慢，一定晚於首次繪製才到。
`swap` 的行為是「到了就換上去」——換上去的瞬間，整頁文字的行高與字寬
全部改變，畫面整體位移一次。因為只會發生一次（之後字體已在記憶體），
症狀就是「會動，但只有一開始」。

### 修正

拆成兩個請求，內文字體改用 `display=optional`：

- `Noto Sans TC` → `display=optional`：字體若沒在極短時間內就緒，
  這一輪就不換，**永遠不會位移**。進了 HTTP 快取之後
  （也就是第二次開啟起），從第一次繪製就直接套用。
- `Cinzel Decorative` + `Share Tech Mono` → 維持 `display=swap`。
  這兩套只用在開場標題，是絕對定位置中的元素，換字體看不出位移。

### 取捨

第一次安裝、且字體還沒進快取的那一次開啟，中文會顯示成系統字體
（iPhone 上是蘋方）。之後每一次都會是 Noto Sans TC，而且不再跳動。
以每天使用的 PWA 來說這個交換是划算的。

---

## 驗證

- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- 未登入狀態 124 個按鈕點擊巡覽，零錯誤
- CSS 以 css-tree 解析零錯誤

視覺結果仍需實機確認：開場底部黑帶是否消失、進入班級設定是否還會跳。
