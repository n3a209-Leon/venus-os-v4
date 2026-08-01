# LIMU v20.53

## 版本號回到單一來源

v20.52 把開場改成靜態元素時，版本字串被複製成兩份：開場控制器裡一份、
`APP_VERSION` 一份。下次改版若漏改其中一個，開場左上角會顯示舊版本——
而那行字正是判斷 Service Worker 有沒有換版的依據，錯了會直接把除錯方向
帶偏（這一輪就吃過這個虧）。

改為由開場控制器單一定義：

```js
window.__LIMU_VERSION = '20.53.0';
...
const APP_VERSION = (typeof window !== 'undefined' && window.__LIMU_VERSION) || "20.53.0";
```

`APP_VERSION` 保留字面值當作 fallback（開場控制器若因故未執行仍有值），
但正常路徑只有一個來源。

---

## 驗證

- 開場版本號、App 版本號皆顯示 v20.53.0
- 正常環境端對端 32/32
- 無 IndexedDB 降級 7/7
- 開場退場乾淨、零 console 錯誤
