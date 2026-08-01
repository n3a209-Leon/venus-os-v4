# LIMU v20.52

## 開場改寫為靜態 HTML（與獎卡系統同構）

### 為什麼

獎卡系統的開場在同一台 iPhone 上一直是滿版的，而 LIMU 的會隨機少一條。
逐項比對後，兩者最後一個結構差異是**開場元素何時存在**：

| | 獎卡系統 | LIMU（v20.51 之前） |
|---|---|---|
| 開場元素 | 寫死在 `<body>` 裡的靜態 HTML | React 元件，JS 載入後才 `createPortal` 掛上 |
| 存在時機 | 第一次繪製就在 | 等 React 掛載後才建立 |
| 佈局 | 跟著文件一起佈局 | 在 iOS 已決定畫布高度之後才插入 |

實機量測顯示 iOS 每次啟動給網頁的畫布高度會在 873pt 與 932pt 之間跳。
靜態元素從第一次繪製就存在，會跟著文件一起被佈局與重排；
後插入的元素則是在那個高度已經定案之後才建立。

### 改了什麼

**開場 markup 移到 `<body>` 開頭**，成為靜態元素：

```html
<div id="spl-static" class="spl-overlay" role="button" tabindex="0">
  <div class="spl-dust">…25 個粒子…</div>
  <div class="spl-img-wrap"><img src="./assets/splash-art.jpg" fetchpriority="high"></div>
  <div class="spl-halo"></div><div class="spl-sea-glow"></div>
  <div class="spl-titles">…</div>
  <div class="spl-status">…</div><div class="spl-skip">輕觸進入</div>
  <div class="spl-build"></div>
</div>
```

**開場控制器**改為緊接其後的一般 JS，只負責：狀態文字、`spl-quick`
長短版切換、輕觸提早結束、退場與移除。`hw5ren:splashSeen` 在儲存分區裡
屬於全域鍵，直接用 `localStorage` 讀寫，行為與原本的 `safeGet`/`safeSet` 相同。

**退場條件**：最短播放時間到、且 App 完成登入判斷，兩者都滿足才收。
App 端以 `window.LIMUSplash.appReady()` 回報（effect 宣告在 `authLoading`
之後，避免相依陣列踩到暫時性死區）。另有保底計時器，App 若異常未回報
仍會退場，不把使用者鎖在開場。

**移除** React `SplashScreen` 元件（233 行）與 `splashDone` 狀態。
App 的 early return 由 `authLoading || !splashDone` 改為只判斷 `authLoading`
——靜態開場蓋在上面，中間狀態看不到。

### 保留

- v20.51 的底部收邊漸層與 `html.limu-splash-bg`：即使這次結構修正生效，
  它們也只是讓收邊更自然，沒有副作用。
- v20.50 移除影像路徑上所有 transform 的決定。

### 量測列

暫時移除。原本的量測是寫在 React 元件裡的；若這次仍需診斷，
會以同樣形式加回靜態控制器。開場左上角保留版本號。

---

## 驗證

- 靜態開場：掛在 `BODY` 下、25 個粒子齊備、版本號與狀態文字正確
- `html.limu-splash-bg` 掛載時加上、移除後清空
- 輕觸可提早結束並正確移除節點
- App 在開場結束後正常渲染
- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- 145 個按鈕與月曆格巡覽零錯誤
- 強制關閉資料存活
- JS 各區塊語法、CSS 解析零錯誤；`SplashScreen` 已無任何殘留引用
