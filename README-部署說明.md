# LIMU 教師專用小工具 v20.15

把本資料夾內的檔案與 `assets` 資料夾完整上傳到同一個網站根目錄。請勿只更新 `index.html` 或 `sw.js`，三個版本識別檔必須同時上傳：

- `index.html`
- `sw.js`
- `version.json`

本版版本識別為：

- App：`20.15.0`
- 建置：`limu-teacher-v20-15-20260729`
- 快取：`hw-tracker-v20-15`
- 資料格式：`7`

第一次從 v20.13 升級時，舊本機資料會在登入後搬到該 Google UID 的專屬分區。搬移完成前不會刪除來源；驗證完成後才清掉未分區副本。

v20.15 更換所有安裝圖示與 VENUS 全螢幕開場素材。部署時請連同新版圖示、`assets/splash-art.jpg`、`manifest.webmanifest` 與 `sw.js` 一起更新；iPhone 主畫面若仍保留舊圖示，移除舊捷徑後重新「加入主畫面」即可。

網站行事曆若受校網 CORS 限制，請下載公開 `.ics`、`.csv` 或 `.json` 檔，再用 App 內的「選擇已下載的檔案」匯入。這是本版不依賴付費伺服器的正式備援流程。
