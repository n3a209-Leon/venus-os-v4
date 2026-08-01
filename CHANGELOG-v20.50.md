# LIMU v20.50

## 開場影像路徑上完全移除 transform

v20.49 把 transform 從圖片移到圖層之後，量到 `wrp1011`（圖層確實
932 × 1.085），畫面卻仍然切在 873——**合成層只是換了位置，問題沒變**。

再回頭比對獎卡系統，差別在動畫的結尾：

| | 獎卡系統 | LIMU（v20.49 之前） |
|---|---|---|
| 縮放 | `scale(1.04) → scale(1)` | `scale(1.085) → scale(1.015)` |
| 結束狀態 | identity（等於沒有 transform） | 非 identity，永久保留 |
| 時長 | 1.1s，開場中途就跑完 | 3.15s，整場都在跑 |

收在 `scale(1)` 時，WebKit 可以把合成層丟掉、重新畫進主圖層；
收在 `scale(1.015)` 則是 transform 永久存在，那一層連同**建立當下就固定
下來的裁切範圍**（當時視窗 873）一直留著。這解釋了為什麼排版一直量到
932，畫面卻只畫到 873。

### 修正

與其去賭「收在 identity 就會被丟掉」，這一版直接把縮放動畫拿掉：

```css
.spl-img-wrap     { animation: spl-img-reveal .9s ease-out forwards; }  /* 只有 opacity/filter */
.spl-img-wrap img { animation: spl-sea-glow 3.4s ease-in-out infinite; } /* 只有 filter */
.spl-img-wrap.spl-img-exit { animation: spl-img-fade-out .55s ...; }     /* 退場也改純 opacity */
```

影像這條路徑上**完全不碰 transform**，就不會產生合成層，也就沒有過期裁切。

視覺上的差異：少了緩慢推近的運鏡。漸顯、微光、退場淡出都還在。
確認黑塊消失之後，可以再用不觸發合成的方式（例如動 `object-position`）
把推近效果加回來。

### 保險底色微調

`html.limu-splash-bg` 由 `#202024` 改為 `#1a1a1d`——後者取自這次實機截圖
切線上方最後 4pt 的實測平均值 `rgb(26,26,29)`。前一版的 `#202024` 偏亮，
反而讓那條更明顯。若這次結構修正生效，這個底色根本不會露出來。

---

## 修正路徑

| 版本 | 假設 | 結果 |
|---|---|---|
| v20.41 | 包含區塊被縮短 | ✗ |
| v20.43 | 祖先裁切 | ✗ |
| v20.44 | 加量測 | ✓ 排除「開場層短了」 |
| v20.45 / v20.46 | 高度單位不對（dvh / lvh） | ✗ |
| v20.47 | 合成層裁切過期 → 換 key 重建 | ✗ 方向對，手段不對 |
| v20.48 | 那區畫不到 → 染同色 | 保留為保險 |
| v20.49 | transform 移到圖層 | ✗ 合成層只是搬家 |
| v20.50 | **影像路徑完全不用 transform** | 待驗證 |

## 驗證

- 確認 `.spl-img-wrap` 與其 img 規則已無任何 transform
- 開場 class 生命週期正確（掛載加上、卸載清空）
- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- CSS 解析零錯誤
