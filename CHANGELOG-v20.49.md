# LIMU v20.49

## 獎卡系統給了答案

獎卡系統在**同一台 iPhone** 上，開場圖一路畫到 931.7pt，完全沒有黑塊。
而它用的是最單純的寫法：

```css
#splash          { position:fixed; inset:0; }
.splash-img-wrap { position:absolute; inset:0; overflow:hidden;
                   animation:splash-rise 1.1s ...; }   /* transform 在圖層 */
.splash-img-wrap img { width:100%; height:100%; object-fit:cover;
                       animation:splash-shimmer 3s ...; }  /* 只有 filter */
```

這一次證明了三件事：

1. 不是裝置的問題
2. 不是 `inset:0` 或 `height:100%` 的問題（v20.41～v20.46 全都白改）
3. 不是 `position:fixed` 被裁的問題

逐項比對後，LIMU 多出來的只有一件事：

```css
.spl-img-wrap img {
  animation: spl-odyssey-drift ...;   /* transform: scale() translate3d() */
  will-change: transform;             /* ← 獎卡系統沒有 */
}
```

`will-change:transform` 加上 `translate3d`，會讓**圖片本身**在啟動極早期
被提升成獨立的 GPU 合成層。那一層的裁切範圍在建立當下就固定下來
（當時視窗還是 873），之後視窗長到 932 也不會重新光柵化。

這正好解釋 v20.46 那組矛盾的數字：`ovl932`、`wrp932`、`img1011`
排版全部滿版，畫面卻只畫到 873。**排版對、繪製沒跟上。**

## 修正：結構比照獎卡系統

| | 之前 | 現在 |
|---|---|---|
| 開場層 | `height:100lvh` | `inset:0` |
| 圖層 | `height:100lvh`，只有 opacity 動畫 | `inset:0`，承接 transform 動畫 |
| 圖片 | `height:100lvh` + `will-change:transform` + `translate3d` | `height:100%`，只留 filter 動畫 |

`spl-odyssey-drift` 移除 `translate3d`，只保留縮放，並移到圖層上；
圖片改用純 `filter` 的微光動畫。視覺效果維持，但**圖片不再獨立成層**。

## 保留

v20.48 的開場底色替換（`html.limu-splash-bg{background:#202024}`）保留當作
保險。若這次結構修正生效，圖會蓋滿整個畫面，那條底色根本不會露出來；
萬一某些啟動時序下仍有殘縫，它會讓縫隙看不出來。

## 修正路徑

| 版本 | 假設 | 結果 |
|---|---|---|
| v20.41 | 包含區塊被縮短 → `dvh` | ✗ |
| v20.43 | 祖先裁切 → `portal` | ✗ |
| v20.44 | 加量測 | ✓ 排除「開場層短了」 |
| v20.45 | 百分比推算錯 → 圖層改 `dvh` | ✗ |
| v20.46 | dvh 不穩 → 改 `lvh` | ✗ 但確認排版已滿版 |
| v20.47 | 合成層裁切過期 → 換 key 重建 | ✗ 方向對，手段不夠 |
| v20.48 | 那區畫不到 → 染成同色 | 保留為保險 |
| v20.49 | **移除圖片的合成層提升** | 待驗證 |

v20.47 其實已經指出「合成層裁切過期」，但我用換 `key` 重建節點去繞，
而不是直接消除提升成合成層的原因。有現成的對照組（獎卡系統）就在手邊，
早該拿來比對。

---

## 驗證

- 開場 class 生命週期正確
- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- 145 個按鈕巡覽零錯誤
- CSS 解析零錯誤；確認開場圖片已無 `will-change`
