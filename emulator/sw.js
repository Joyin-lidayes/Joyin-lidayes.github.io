/* =========================================================
   模拟器运行时缓存 Service Worker（自托管版）
   策略（已修复 ERR_FAILED）：
   - CheerpJ 用 Range 分片读 jar（128KB/片）。浏览器不缓存 206，
     而 Cache API 对 206 响应支持不稳（clone/put 会抛错导致
     net::ERR_FAILED）。因此所有 Range 请求一律直接放行，不缓存。
   - 同源的非 Range GET 静态资源（loader.js / cj3.js / *.wasm /
     cheerpOS.js / c.js / *.css / 小 jar 等）采用 cache-first，
     首次加载后二次访问直接命中缓存，这才是稳定的提速点。
   ========================================================= */
const RUNTIME_CACHE_NAME = 'jar-site-runtime-v2';

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.filter(function (k) { return k !== RUNTIME_CACHE_NAME; })
                    .map(function (k) { return caches.delete(k); })
            );
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (e) { return; }

    // 只处理本站请求
    if (url.origin !== self.location.origin) return;

    // Range 分片请求：直接放行（不缓存 206，交给浏览器原生请求）
    if (req.headers.has('range')) return;

    // 只缓存静态运行时资源，避免缓存 HTML/JSON 导致内容不更新
    if (!/\.(?:js|wasm|css|jar|png|jpe?g|gif|webp|svg|woff2?|ttf|ico)$/i.test(url.pathname)) {
        return;
    }

    event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
    const cache = await caches.open(RUNTIME_CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    const response = await fetch(req);
    if (response && response.status === 200) {
        cache.put(req, response.clone()).catch(function () {});
    }
    return response;
}
