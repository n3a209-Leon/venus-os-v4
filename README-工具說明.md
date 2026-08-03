# LIMU 開發工具

`tools/` 底下兩支腳本，各自解決一類反覆出過事的問題。

## tools/bump-version.mjs — 版本號同步

版本識別散在 **10 個字串位置**：`index.html` 7 處、`sw.js` 3 處，另有
`version.json` 4 欄。建置日期也會在升版當天一起更新，不再沿用舊日期。
手動同步至少出過兩次事：

- 有一版 `sw.js` 被一行有副作用的批次指令清成 0 byte，是碰巧 grep 沒輸出才發現
- 有一版開場控制器與 `APP_VERSION` 各存一份版本字串，差點不同步

```bash
node tools/bump-version.mjs --check     # 只檢查一致性，不改檔案
node tools/bump-version.mjs patch       # 20.58.0 → 20.59.0
node tools/bump-version.mjs 20.61.0     # 指定版本
```

寫檔前會確認每個檔案都不是空的、替換後確實含有新的版本識別；
寫檔後再整份驗證一次。任一步不過就中止，不留下改到一半的檔案。

**每次改版前先跑 `--check`，改完再跑一次。**

## tools/visual-check.mjs — 真實瀏覽器版面檢查

既有的 jsdom 測試（`limu-e2e-test.js`）驗證「資料有沒有存對」，
但它沒有版面引擎：`getBoundingClientRect` 一律回 0、CSS 變數不解析、
媒體查詢是假的。以下這些全都測不到，也全都真的發生過：

- 開場圖底部少一塊（花了十個版本才定位）
- 彈出面板下方的黑色長條
- 「畫布底色同步」寫好之後其實從未生效，卻連續兩版被當成已修復
- 工作欄「改成純圖示」的那批修改因腳本中途拋錯而完全沒寫進檔案

```bash
npm install playwright
npx playwright install chromium
node tools/visual-check.mjs                  # 53 項斷言
node tools/visual-check.mjs --shots out/     # 順便存十張截圖
```

腳本自帶一個臨時靜態伺服器（用 `file://` 會因為 react-dom 那支 script
帶 `crossorigin` 而被 CORS 擋掉），以 iPhone 直式尺寸開啟，
量實際的元素位置與 computed style。

檢查項目涵蓋：開場層與圖片是否滿版、開場影像路徑有無 transform、
工作欄的懸浮位置／圓角／有無 backdrop-filter／是否純圖示、
面板的圓角、SVG、把手與橫向溢出、開窗時工作欄是否收起、
**畫布底色是否真的同步**、回首頁鈕的位置與尺寸、關窗後是否完整還原、
班級設定首次起滑、五套主題、5／6／7 組日表、文字對比與低動態模式。

### 它測不到什麼

Chromium 不是 Safari。iOS 特有的行為——畫布高度時而 873pt 時而 932pt、
Service Worker 換版時機、`signInWithRedirect`——這裡重現不了。
**真機測試仍然不能省**，這支負責的是「版面與樣式有沒有照我們寫的生效」。

## 建議的改版流程

```bash
node tools/bump-version.mjs --check    # 1. 確認起點乾淨
# ... 修改 ...
node tools/visual-check.mjs            # 2. 版面沒跑掉
node limu-e2e-test.js index.html       # 3. 資料仍存得住
node tools/bump-version.mjs patch      # 4. 進版
node tools/visual-check.mjs            # 5. 再確認一次
```
