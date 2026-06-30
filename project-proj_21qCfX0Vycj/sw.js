// 股小蜜 Service Worker
const CACHE_NAME = 'guxiaomi-v5.0-yahoo-proxy';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/ziwei.html',
  '/paipan.html',
  '/news.html',
  '/analysis.html',
  '/stock-detail.html',
  '/manifest.json'
];

// CDN资源缓存配置
const CDN_CACHE_NAME = 'guxiaomi-cdn-v1';
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  'https://resource.trickle.so/vendor_lib/unpkg/react@18/umd/react.production.min.js',
  'https://resource.trickle.so/vendor_lib/unpkg/react-dom@18/umd/react-dom.production.min.js',
  'https://resource.trickle.so/vendor_lib/unpkg/@babel/standalone/babel.min.js',
  'https://resource.trickle.so/vendor_lib/unpkg/lucide-static@0.516.0/font/lucide.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap'
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => {
        console.log('[SW] 缓存应用资源');
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(CDN_CACHE_NAME).then(cache => {
        console.log('[SW] 缓存CDN资源');
        return cache.addAll(CDN_URLS);
      })
    ]).then(() => {
      console.log('[SW] 安装完成');
      return self.skipWaiting();
    })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== CDN_CACHE_NAME) {
            console.log('[SW] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] 激活完成');
      return self.clients.claim();
    })
  );
});

// 请求拦截 - 网络优先，失败时使用缓存
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API请求不使用缓存
  if (url.hostname.includes('alphavantage') ||
      url.hostname.includes('bing') ||
      url.hostname.includes('tushare') ||
      url.hostname.includes('akshare') ||
      url.hostname.includes('frankfurter')) {
    return;
  }

  // CDN资源：缓存优先
  if (url.hostname.includes('cdn') ||
      url.hostname.includes('trickle') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CDN_CACHE_NAME).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(() => {
          return cached || new Response('离线状态', { status: 503 });
        });
      })
    );
    return;
  }

  // 本地资源：网络优先
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) {
            return cached;
          }
          // 离线页面
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('离线状态', { status: 503 });
        });
      })
  );
});

// 消息处理 - 清除缓存
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      return Promise.all(names.map(name => caches.delete(name)));
    });
  }
});

// 推送通知处理（预留）
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || '您有新的股票提醒',
      icon: 'https://app.trickle.so/storage/app/46bdde6b-ce0a-436d-9861-f705820c2391.png',
      badge: 'https://app.trickle.so/storage/app/46bdde6b-ce0a-436d-9861-f705820c2391.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'stock-alert',
      data: data.url || '/'
    };
    event.waitUntil(
      self.registration.showNotification(data.title || '股小蜜提醒', options)
    );
  }
});

// 通知点击处理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});
