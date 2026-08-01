# LIMU v20.44

## A. 開場黑塊：停止猜測，改在實機上量

v20.43 已確認在手機上執行（開場左上角顯示 v20.43.0），但切線仍在
**y = 2618px（872.7pt）**，與前兩次完全相同。也就是說：

- v20.41 的 `height:100dvh` → 沒有改變切線
- v20.43 的 `createPortal` 掛到 body → 也沒有改變切線

portal 之後開場層已經是 `<body>` 的直接子節點，不可能再被任何祖先的
包含區塊或 `overflow:hidden` 影響。既然還是 873pt，代表**這台裝置回報給
網頁的視窗高度本身就是 873pt**，比螢幕的 932pt 少了 59pt，
`100dvh` 只是忠實照著算。CSS 這一側已經沒有東西可以改。

因此本版在開場畫面左上角直接印出實機量到的數字：

```
v20.44.0
scr932 inn??? cli??? vis???
dvh??? svh??? lvh??? ovl???
sat59 sab34 dpr3 SA
```

| 欄位 | 意義 |
|---|---|
| `scr` | `screen.height`，螢幕高 |
| `inn` | `window.innerHeight` |
| `cli` | `documentElement.clientHeight` |
| `vis` | `visualViewport.height` |
| `dvh` / `svh` / `lvh` | 實測 `100dvh` / `100svh` / `100lvh` 各等於多少 |
| `ovl` | 開場層實際算出來的高度 |
| `sat` / `sab` | 安全區上緣 / 下緣 |
| `SA` / `DM` / `BR` | 獨立 App／display-mode／瀏覽器 |

看到這幾個數字就能判斷是哪一環在少 59pt：
若 `inn` 是 932 而 `dvh` 是 873，問題在 dvh 的解析，改用 `innerHeight` 即可；
若全部都是 873，就是 WebView 本身比螢幕短，要從 viewport meta 或
安裝方式著手。確認之後這段量測會移除。

## B. 班級設定頁「一開始滑不動」：找到具體原因

`.settings-view` 帶著行內樣式：

```js
React.createElement("main", { className:"settings-view",
    style: { padding:12, overflowY:"auto", flex:1 } }, ...)
```

`overflowY:auto` 讓它在**本來就會捲動的頁面裡，又多了一個捲動容器**。
iOS 在 `touchstart` 當下必須先決定這一手要交給哪一層捲動，而內層到底能不能
捲，要等版面算完（班級清單、幹部名單都是非同步載入）才知道。
這段判定期間手指是拉不動的；判定完成、交棒給頁面之後就恢復正常——
正好是「卡開頭，後面就不卡」。

手機端已加上 `overflow:visible !important`（行內樣式優先權高，必須用
`!important`），只留頁面一個捲動層。

前兩版針對這個症狀做的推測性修正（v20.42 換頁捲動歸零、v20.41 字體
`display:optional`）都保留——它們各自解決的是別的問題，只是都不是這一個。

---

## 驗證

- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- 145 個按鈕與月曆格自動巡覽，零錯誤
- CSS 以 css-tree 解析零錯誤

## 部署後

1. 整包上傳，App 完全關閉再重開。
2. **把開場畫面左上角那四行字截圖給我**，黑塊的成因就能定案。
3. 順便看班級設定頁還會不會卡開頭。
