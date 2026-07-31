// 教師專用小工具 PWA Service Worker
// v20.16：修正 SW 預快取涵蓋範圍、素材容錯與快取比對；延續 v20.15 的 VENUS 圖示與全螢幕開場。

const CACHE_PREFIX = 'hw-tracker-';
const CACHE_NAME = 'hw-tracker-v20-22';
const BUILD_ID = 'limu-teacher-v20-22-20260731';
// 頁面會核對這個完整字面標記；不可改回由兩段字串拼接，否則會再次誤報。
const DEPLOYMENT_MARKER = 'limu-teacher-v20-22-20260731|hw-tracker-v20-22';
// 用來判斷「這是一份完整的 App shell」，不限定版本。
const BUILD_ID_PATTERN = /limu-teacher-v\d+-\d+-\d{8}/;
const PRECACHE_URLS = [
  './react-dom.production.min.js',
  './manifest.webmanifest',
  './app-icon-192-v20-16.png',
  './app-icon-512-v20-16.png',
  './app-icon-512-maskable-v20-16.png',
  './assets/apple-touch-icon-v20-16.png',
  './assets/gallery-forward.jpg',
  './assets/login-background.jpg',
  './assets/mucha-card-frame.webp',
  './assets/mucha-corner.webp',
  './assets/mucha-divider-left.webp',
  './assets/mucha-divider-right.webp',
  './assets/mucha-empty-ornament.webp',
  './assets/mucha-gap-divider.webp',
  './assets/mucha-master-frame.webp',
  './assets/nebula-edge-left.webp',
  './assets/nebula-edge-right.webp',
  './assets/nebula-mucha-edge.webp',
  './assets/odyssey-divider.svg',
  './assets/odyssey-frame.svg',
  './assets/odyssey-sea-chart.svg',
  './assets/signature-blue-iris.webp',
  './assets/splash-art.jpg'
];

function fetchFresh(url) {
  return fetch(url, { cache:'no-store' }).then(function(response) {
    if (!response || !response.ok) throw new Error(url + ' unavailable');
    return response;
  });
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    Promise.all([
      fetchFresh('./version.json'),
      fetchFresh('./index.html'),
      fetchFresh('./sw.js')
    ]).then(function(responses) {
      return Promise.all([
        responses[0].clone().json(),
        responses[1].clone().text(),
        responses[2].clone().text()
      ]).then(function(parsed) {
        return { responses:responses, parsed:parsed };
      });
    }).then(function(bundle) {
      var info = bundle.parsed[0] || {};
      if (
        info.buildId !== BUILD_ID ||
        info.cacheName !== CACHE_NAME ||
        bundle.parsed[1].indexOf(BUILD_ID) < 0 ||
        bundle.parsed[2].indexOf(DEPLOYMENT_MARKER) < 0
      ) {
        throw new Error('LIMU deployment files are from different builds');
      }
      return caches.open(CACHE_NAME).then(function(cache) {
        // App shell 本體是關鍵路徑，任何一項失敗就該讓 install 失敗。
        var shell = Promise.all([
          cache.put('./version.json', bundle.responses[0].clone()),
          cache.put('./index.html', bundle.responses[1].clone())
        ]);
        // v20.16：素材改用 allSettled。舊版整包 Promise.all，只要有一張圖沒上傳
        // 成功，install 就 reject → SW 永遠不啟用 → 整個離線能力靜默消失，
        // 使用者只會看到一句「更新檔安裝失敗」，完全無從判斷是哪個檔。
        var assets = Promise.all(PRECACHE_URLS.map(function(url) {
          return fetchFresh(url)
            .then(function(response) { return cache.put(url, response); })
            .then(function() { return { url:url, ok:true }; })
            .catch(function(error) { return { url:url, ok:false, error:String(error && error.message || error) }; });
        })).then(function(results) {
          var failed = results.filter(function(r) { return !r.ok; });
          if (failed.length) {
            // 不中斷安裝，但把缺漏記下來，方便從 DevTools 追查是哪幾個檔沒上傳。
            console.warn('[LIMU SW] 有 ' + failed.length + ' 個素材未能預快取：',
              failed.map(function(r) { return r.url; }));
          }
          return results;
        });
        return Promise.all([shell, assets]);
      });
    })
  );
});

self.addEventListener('message', function(event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (data.type === 'GET_BUILD_INFO' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ buildId:BUILD_ID, cacheName:CACHE_NAME });
  }
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(key) {
        return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
      }).map(function(key) { return caches.delete(key); }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);

  // 第三方服務（Firebase、登入與字型）不寫入 App 快取。
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request).catch(function() {
      return new Response('', { status:503, statusText:'Offline' });
    }));
    return;
  }

  // 導覽一律繞過 HTTP 快取。
  // v20.14：只要伺服器回的是「完整的 App shell」（任何版本），就直接給使用者。
  // 舊寫法是比對本 SW 自己的 BUILD_ID，導致伺服器較新時反而回舊快取，
  // 使用者每次更新都要先看到舊版、再多載入一次才會切換。
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache:'no-store' }).then(function(response) {
        if (!response || !response.ok) throw new Error('navigation unavailable');
        var cacheCopy = response.clone();
        return response.clone().text().then(function(text) {
          if (!BUILD_ID_PATTERN.test(text)) {
            // 真的不是 App shell（例如伺服器回了錯誤頁或半套檔案）才退回快取。
            return caches.match('./index.html').then(function(cached) {
              return cached || response;
            });
          }
          if (text.indexOf(BUILD_ID) >= 0) {
            // 只有同版才寫進本 SW 的快取；新版交給新的 SW 自己預快取。
            event.waitUntil(
              caches.open(CACHE_NAME).then(function(cache) {
                return cache.put('./index.html', cacheCopy);
              }).catch(function() {})
            );
          }
          return response;
        });
      }).catch(function() {
        return caches.match('./index.html').then(function(cached) {
          return cached || new Response('App is unavailable offline.', {
            status:503,
            headers:{ 'Content-Type':'text/plain; charset=utf-8' }
          });
        });
      })
    );
    return;
  }

  // 版本檔與 Service Worker 檔永遠先讀網路，供頁面判斷是否有完整新建置。
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(event.request, { cache:'no-store' }).catch(function() {
      var fallback = url.pathname.endsWith('/version.json') ? './version.json' : './sw.js';
      return caches.match(fallback).then(function(cached) {
        return cached || new Response('{}', {
          status:503,
          headers:{ 'Content-Type':'application/json; charset=utf-8' }
        });
      });
    }));
    return;
  }

  // 其餘同源靜態資源採快取優先，背景更新。
  // v20.16：加上 ignoreSearch。預快取的鍵沒有 query，但頁面可能帶著
  // ?v=、?build= 之類的參數請求同一個檔，預設的精確比對必然 miss，
  // 離線時就取不到（manifest 先前就是這樣漏掉的）。
  event.respondWith(caches.match(event.request, { ignoreSearch:true }).then(function(cached) {
    var update = fetch(event.request).then(function(response) {
      if (response && response.ok && response.type === 'basic') {
        return caches.open(CACHE_NAME).then(function(cache) {
          return cache.put(event.request, response.clone()).then(function() {
            return response;
          });
        });
      }
      return response;
    });
    if (cached) {
      event.waitUntil(update.catch(function() {}));
      return cached;
    }
    return update.catch(function() {
      return new Response('', { status:503, statusText:'Offline' });
    });
  }));
});
