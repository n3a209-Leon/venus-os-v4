# LIMU v20.34（正式精簡版）

本版以 v20.33 為基礎，只清除已完成任務的效能量測工具，不變更任何使用功能或資料格式。

## 已移除

- `?perf=1`／`?perf=0` 效能診斷入口。
- 右下角 ⏱ 報告按鈕與報告視窗。
- 計時器漂移、rAF 掉幀、pointerdown 互動延遲取樣。
- v20.32 殘留的 `React.Profiler` 報告區塊。
- 儲存、dirty-map、備援寫入與雲端同步中的量測打點。
- 正式部署包內的 `qa` 測試程式與 QA 測試說明。

## 完整保留的卡頓修正

- 手指拖曳與慣性捲動期間，延後 appState、dirty-map、localStorage 備援及雲端同步。
- 同一輪 appState 寫入合併成單一 IndexedDB transaction，同一 key 只保留最新值。
- 快速連按時，舊儲存結果不再覆蓋最新畫面。
- 彈窗內容切換不再反覆解除與重套 body 捲動鎖。
- iPhone 長頁停用容易延後排版的 `content-visibility:auto`。
- 捲動期間暫停非必要裝飾動畫與主題濾鏡。

資料 schema 維持 7；座號、按鍵、班級 ID、Firebase 文件路徑、Venus OS 與既有功能皆未變更。
