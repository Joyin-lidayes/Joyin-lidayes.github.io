/* =========================================================
   jar 游戏小站 · 首页逻辑（原生 JS，无 jQuery）
   - 数据来自构建生成的轻量首页索引（[id, 名称, 拼音全拼, 拼音首字母]）
   - 搜索 / 全部游戏 / 随机游戏
   - 分页渲染（上一页/下一页 + 可输入页码跳转 + 每页条数选择）
   - 公告弹窗、QQ 群复制、回到顶部
   - 捐赠名单：来自 donation.json
   ========================================================= */
(function () {
    'use strict';

    var GAMES = [];          // [{ id, name }]
    var pendingAction = null; // 数据加载完成后执行最后一次操作
    var gamesState = 'idle'; // idle / loading / ready / error
    var pageSize = 60;
    var currentPage = 1;

    var BASE = window.SITE_BASE || '';
    if (!BASE) {
        try {
            if (document.currentScript && document.currentScript.src) {
                BASE = document.currentScript.src.replace(/js\/main\.js(\?.*)?$/, '');
            }
        } catch (e) { /* ignore */ }
    }

    var input = document.getElementById('gameName');
    var grid = document.getElementById('setGame');
    var countEl = document.getElementById('gNum');
    var titleEl = document.getElementById('gameTitle');
    var footEl = document.getElementById('foot');
    var heroCount = document.getElementById('heroCount');
    var gamesSection = document.getElementById('games');
    var gamesLoading = document.getElementById('gamesLoading');
    var gamesLoadingText = document.getElementById('gamesLoadingText');

    var pagerEl = document.getElementById('pager');
    var prevBtn = document.getElementById('prevPage');
    var nextBtn = document.getElementById('nextPage');
    var pageInput = document.getElementById('pageInput');
    var totalPagesEl = document.getElementById('totalPages');
    var pageSizeSel = document.getElementById('pageSizeSel');

    var currentList = [];
    var viewState = null;
    var VIEW_STATE_KEY = 'gameListView';
    var VISITED_GAMES_KEY = 'visitedGameIds';
    var INDEX_CACHE_PREFIX = 'gamesIndex:';
    var visitedGameIds = getVisitedGameIds();
    var PAGE_SIZE_KEY = 'jarSite:pageSize';
    var ANNOUNCEMENT_KEY = 'firstEnterPage';
    var restoringState = false;
    var restoreTimer = null;
    var scrollSaveTimer = null;
    var donationReady = false;
    var finishScrollRestore = null;

    function readPreference(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    function writePreference(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* optional preference */ }
    }

    function snapshotViewState() {
        return {
            view: viewState, page: currentPage, pageSize: pageSize,
            scrollY: Math.max(0, window.scrollY || window.pageYOffset || 0)
        };
    }

    function replaceHistoryState(state) {
        try {
            var entry = Object.assign({}, history.state || {});
            entry.jarGameList = state;
            history.replaceState(entry, '', window.location.href);
        } catch (e) { /* history may be unavailable */ }
    }

    // 统计事件：Umami 未加载（被广告拦截器挡掉或加载失败）时静默跳过，绝不影响页面功能。
    function track(name, data) {
        try {
            if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data);
        } catch (e) { /* ignore */ }
    }

    function cancelScrollRestore() {
        if (restoreTimer !== null) window.clearTimeout(restoreTimer);
        restoreTimer = null;
        finishScrollRestore = null;
        restoringState = false;
    }

    function beginNavigation() {
        // 目标尚未恢复时保留它原有的历史快照，不用未完成布局下的位置覆盖。
        if (restoringState) cancelScrollRestore();
        else saveViewState();
    }

    function saveViewState() {
        if (restoringState || gamesState !== 'ready') return;
        var state = snapshotViewState();
        if (window.store) {
            try { window.store.set(VIEW_STATE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
        }
        replaceHistoryState(state);
    }

    // 已访问标记只在当前标签页会话内有效，不写 Cookie/localStorage。
    function getVisitedGameIds() {
        try {
            var raw = window.sessionStorage.getItem(VISITED_GAMES_KEY);
            var ids = raw ? JSON.parse(raw) : [];
            return Array.isArray(ids) ? ids : [];
        } catch (e) {
            return [];
        }
    }

    function markGameVisited(id) {
        if (visitedGameIds.indexOf(id) >= 0) return;
        visitedGameIds.push(id);
        try { window.sessionStorage.setItem(VISITED_GAMES_KEY, JSON.stringify(visitedGameIds)); } catch (e) { /* ignore */ }
    }

    function getSavedViewState() {
        if (!window.store) return null;
        try {
            var value = window.store.get(VIEW_STATE_KEY);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            return null;
        }
    }

    /* ---------- 工具 ---------- */
    var PAGE_SIZES = [12, 20, 60, 100, 200];
    var RANDOM_SEED_RE = /^[0-9a-f]{1,8}$/i;

    function normalizePageSize(value) {
        value = parseInt(value, 10);
        return PAGE_SIZES.indexOf(value) >= 0 ? value : 60;
    }

    function normalizeSeed(value) {
        value = String(value || '').trim();
        if (!RANDOM_SEED_RE.test(value)) return null;
        return ('00000000' + (parseInt(value, 16) >>> 0).toString(16)).slice(-8);
    }

    function getUrlState() {
        var params = new URLSearchParams(window.location.search);
        var seed = normalizeSeed(params.get('r'));
        var query = (params.get('q') || '').trim();
        var requestedSize = params.get('size');
        return {
            seed: seed,
            query: query,
            page: Math.max(1, parseInt(params.get('page'), 10) || 1),
            pageSize: requestedSize === null ? null : normalizePageSize(requestedSize),
            all: params.get('view') === 'all',
            hasView: !!seed || !!query || params.get('view') === 'all'
        };
    }

    function syncUrl(mode) {
        var url = new URL(window.location.href);
        url.searchParams.delete('q');
        url.searchParams.delete('r');
        url.searchParams.delete('page');
        url.searchParams.delete('size');
        url.searchParams.delete('view');
        if (viewState && viewState.type === 'search') {
            url.searchParams.set('q', viewState.query);
        } else if (viewState && viewState.type === 'random') {
            url.searchParams.set('r', viewState.seed);
        } else if (viewState && viewState.type === 'all') {
            url.searchParams.set('view', 'all');
        }
        if (viewState) {
            url.searchParams.set('page', currentPage);
            url.searchParams.set('size', pageSize);
        }
        try {
            var entry = Object.assign({}, history.state || {});
            entry.jarGameList = snapshotViewState();
            history[mode || 'pushState'](entry, '', url.pathname + url.search + url.hash);
        } catch (e) { /* URL persistence is optional */ }
        saveViewState();
    }

    function createSeededRandom(seed) {
        return function () {
            var t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function createRandomSeed() {
        var values = new Uint32Array(1);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(values);
            return ('00000000' + values[0].toString(16)).slice(-8);
        }
        // 极旧浏览器的降级路径；现代浏览器均会使用上方安全随机源。
        return ('00000000' + Math.floor(Math.random() * 0x100000000).toString(16)).slice(-8);
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ---------- 排序（中文按拼音、英文按字母） ---------- */
    var collator = (function () {
        try {
            return new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base', numeric: true });
        } catch (e) {
            return new Intl.Collator('zh-CN', { sensitivity: 'base' });
        }
    })();

    var sortedGames = null;

    function getSortedGames() {
        if (sortedGames) return sortedGames;
        sortedGames = GAMES.slice().sort(function (a, b) {
            return collator.compare(a.name, b.name);
        });
        return sortedGames;
    }

    /* ---------- 搜索匹配（大小写不敏感 / 拼音 / 首字母 / 空格分词） ---------- */
    function matchTerm(g, t) {
        return g.n.indexOf(t) >= 0 || g.p.indexOf(t) >= 0 || g.i.indexOf(t) >= 0;
    }

    function matchAllTerms(g, terms) {
        for (var k = 0; k < terms.length; k++) {
            if (!matchTerm(g, terms[k])) return false;
        }
        return true;
    }

    function termScore(g, t) {
        if (g.n === t) return 0;              // 原名完全相等
        if (g.n.indexOf(t) === 0) return 1;   // 原名前缀
        var ni = g.n.indexOf(t);
        if (ni > 0) return 10 + ni;           // 原名子串，越靠前越优
        if (g.p.indexOf(t) === 0) return 100; // 全拼前缀
        if (g.i.indexOf(t) === 0) return 110; // 首字母前缀
        if (g.p.indexOf(t) >= 0) return 200;  // 全拼子串
        if (g.i.indexOf(t) >= 0) return 300;  // 首字母子串
        return 999;
    }

    function searchGames(kw, games) {
        var terms = String(kw || '').toLowerCase().split(/\s+/).filter(function (s) { return !!s; });
        if (terms.length === 0) return [];
        var scored = [];
        for (var i = 0; i < games.length; i++) {
            var g = games[i];
            if (!matchAllTerms(g, terms)) continue;
            var total = 0;
            for (var k = 0; k < terms.length; k++) total += termScore(g, terms[k]);
            scored.push({ g: g, score: total });
        }
        scored.sort(function (a, b) {
            if (a.score !== b.score) return a.score - b.score;
            return collator.compare(a.g.name, b.g.name);
        });
        return scored.map(function (item) { return item.g; });
    }

    /* ---------- 渲染 ---------- */
    var NAME_LIMIT = 14;

    function truncateName(name) {
        if (name.length <= NAME_LIMIT) return name;
        return name.slice(0, NAME_LIMIT) + '…';
    }

    function cardHtml(g) {
        var displayName = truncateName(g.name);
        var visitedClass = visitedGameIds.indexOf(g.id) >= 0 ? ' is-visited' : '';
        return '<li class="game-card' + visitedClass + '"><a href="g/s' + g.id + '.html" data-game-id="' + escapeHtml(g.id) + '" title="' + escapeHtml(g.name) + '">' +
            '<span class="game-icon mono">▶</span>' +
            '<span class="game-name">' + escapeHtml(displayName) + '</span>' +
            '</a></li>';
    }

    function bindGameCardLinks() {
        var links = grid ? grid.querySelectorAll('a[data-game-id]') : [];
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function () {
                markGameVisited(this.getAttribute('data-game-id'));
                // 让浏览器后退命中 bfcache 时也能立即保留已访问外观。
                if (this.parentNode) this.parentNode.classList.add('is-visited');
                saveViewState();
            });
        }
    }

    function totalPages() {
        return Math.max(1, Math.ceil(currentList.length / pageSize));
    }

    function renderPage() {
        var start = (currentPage - 1) * pageSize;
        var end = Math.min(start + pageSize, currentList.length);
        var frag = '';
        for (var i = start; i < end; i++) {
            frag += cardHtml(currentList[i]);
        }
        grid.innerHTML = frag;
        bindGameCardLinks();
        updateMeta();
    }

    function updateMeta() {
        if (countEl) countEl.textContent = '共 ' + currentList.length + ' 个游戏';

        var tp = totalPages();
        if (pagerEl) pagerEl.style.display = (currentList.length > pageSize) ? 'flex' : 'none';
        if (totalPagesEl) totalPagesEl.textContent = tp;
        if (pageInput) pageInput.value = currentPage;
        if (prevBtn) prevBtn.disabled = (currentPage <= 1);
        if (nextBtn) nextBtn.disabled = (currentPage >= tp);
        if (footEl) footEl.style.display = (currentList.length > 0 && currentPage >= tp) ? 'block' : 'none';
    }

    function showSection() {
        if (gamesSection) gamesSection.style.display = 'block';
    }

    function hideSection() {
        if (gamesSection) gamesSection.style.display = 'none';
    }

    function showGamesLoading() {
        showSection();
        if (!gamesLoading) return;
        if (gamesLoadingText) gamesLoadingText.textContent = '正在载入游戏库…';
        gamesLoading.classList.remove('is-error');
        gamesLoading.classList.add('is-visible');
        gamesLoading.setAttribute('aria-busy', 'true');
    }

    function hideGamesLoading() {
        if (!gamesLoading) return;
        gamesLoading.classList.remove('is-visible', 'is-error');
        gamesLoading.setAttribute('aria-busy', 'false');
    }

    function showGamesLoadError(message) {
        showSection();
        if (gamesLoading) {
            gamesLoading.classList.add('is-visible', 'is-error');
            gamesLoading.setAttribute('aria-busy', 'false');
        }
        if (gamesLoadingText) gamesLoadingText.textContent = message;
    }

    function scrollToGames() {
        if (gamesSection) gamesSection.scrollIntoView({ behavior: 'auto', block: 'start' });
    }

    function goToPage(p) {
        var tp = totalPages();
        p = Math.max(1, Math.min(tp, parseInt(p, 10) || 1));
        if (p === currentPage) {
            if (pageInput) pageInput.value = currentPage;
            return;
        }
        beginNavigation();
        currentPage = p;
        renderPage();
        scrollToGames();
        syncUrl('pushState');
    }

    function setList(arr, title, state) {
        currentList = arr.slice();
        currentPage = (state && state.page) || 1;
        currentPage = Math.max(1, Math.min(totalPages(), currentPage));
        viewState = state && state.view ? state.view : null;

        if (titleEl) titleEl.textContent = title || '游戏列表';

        if (arr.length === 0) {
            grid.innerHTML = '<li class="empty">搜索的游戏好特殊<br>反馈给我添加吧！</li>';
            if (countEl) countEl.textContent = '';
            if (pagerEl) pagerEl.style.display = 'none';
            if (footEl) footEl.style.display = 'none';
            showSection();
            return;
        }

        renderPage();
        showSection();
    }

    /* ---------- 交互动作 ---------- */
    function waitForGames(action) {
        if (gamesState === 'ready') return false;
        pendingAction = action;
        showSection();
        if (gamesState !== 'loading') loadGames();
        return true;
    }

    function runSearch(kw, state) {
        if (waitForGames(function () { runSearch(kw, state); })) return;
        if (state && state.syncUrl) beginNavigation();
        var arr = searchGames(kw, getSortedGames());
        setList(arr, '搜索「' + kw + '」的结果', {
            view: { type: 'search', query: kw },
            page: state && state.page
        });
        if (state && state.syncUrl) {
            syncUrl('pushState');
            // 只在用户主动搜索时上报（URL 回放不重复计数），results=0 即“搜了但没有结果”。
            track('搜索', { keyword: kw.slice(0, 50), results: arr.length });
        }
    }

    function search() {
        var kw = input.value.trim();
        if (!kw) {
            window.toast('请输入游戏名称');
            input.focus();
            return;
        }
        runSearch(kw, { page: 1, syncUrl: true });
    }

    function showAll(state) {
        if (waitForGames(function () { showAll(state); })) return;
        if (!state || !state.fromUrl) beginNavigation();
        setList(getSortedGames(), '全部游戏', {
            view: { type: 'all' },
            page: state && state.page
        });
        if (!state || !state.fromUrl) syncUrl('pushState');
    }

    function showRandom(state) {
        if (waitForGames(function () { showRandom(state); })) return;
        if (!state || !state.fromUrl) beginNavigation();
        var n = 20;
        var arr = [];
        var seed = normalizeSeed(state && state.view && state.view.seed) || createRandomSeed();
        var random = createSeededRandom(parseInt(seed, 16) >>> 0);
        for (var i = 0; i < n; i++) {
            // 保持原有的有放回抽样：同一游戏可出现多次。
            arr.push(GAMES[Math.floor(random() * GAMES.length)]);
        }
        setList(arr, '随机推荐', {
            view: { type: 'random', seed: seed },
            page: state && state.page
        });
        if (!state || !state.fromUrl) syncUrl('pushState');
    }

    function restoreScrollPosition(state) {
        if (restoreTimer !== null) window.clearTimeout(restoreTimer);
        restoringState = true;
        var y = Math.max(0, parseInt(state && state.scrollY, 10) || 0);
        // 等列表与 hash 布局完成；恢复期间不让 scroll/pagehide 覆盖已保存的位置。
        function finish() {
            window.scrollTo(0, y);
            restoreTimer = null;
            finishScrollRestore = null;
            restoringState = false;
            saveViewState();
        }
        finishScrollRestore = function () {
            restoreTimer = window.setTimeout(finish, 0);
        };
        if (donationReady) finishScrollRestore();
    }

    function resetListView() {
        currentList = [];
        viewState = null;
        currentPage = 1;
        if (input) input.value = '';
        if (grid) grid.innerHTML = '';
        if (titleEl) titleEl.textContent = '游戏列表';
        updateMeta();
        if (pagerEl) pagerEl.style.display = 'none';
        hideSection();
    }

    function renderSavedView(state) {
        if (!state || !state.view) return false;
        pageSize = normalizePageSize(state.pageSize || pageSize);
        if (pageSizeSel) pageSizeSel.value = pageSize;
        var replay = { page: state.page, view: state.view, fromUrl: true };
        if (state.view.type === 'search' && state.view.query) {
            if (input) input.value = state.view.query;
            runSearch(state.view.query, replay);
        } else if (state.view.type === 'random' && normalizeSeed(state.view.seed)) {
            showRandom(replay);
        } else if (state.view.type === 'all') {
            if (input) input.value = '';
            showAll(replay);
        } else {
            return false;
        }
        return true;
    }

    function matchesView(a, b) {
        return !!(a && b && a.view && b.view &&
            a.view.type === b.view.type && a.view.query === b.view.query &&
            a.view.seed === b.view.seed && a.page === b.page && a.pageSize === b.pageSize);
    }

    function applyUrlState(saved) {
        var url = getUrlState();
        if (!url.hasView) return false;
        var state = {
            view: url.seed ? { type: 'random', seed: url.seed } :
                url.query ? { type: 'search', query: url.query } : { type: 'all' },
            page: url.page,
            pageSize: url.pageSize || pageSize
        };
        renderSavedView(state);
        state.page = currentPage; // 按实际有效页码匹配，并规范化越界 URL。
        var target = matchesView(state, saved) ? saved : Object.assign({}, state, { scrollY: 0 });
        restoringState = true;
        syncUrl('replaceState');
        replaceHistoryState(target);
        // 仅同一视图/页码/条数才复用旧位置，分享链接不会误用另一个搜索的滚动值。
        restoreScrollPosition(target);
        return true;
    }

    function restoreInitialView() {
        var entry = history.state && history.state.jarGameList;
        var saved = entry || getSavedViewState();
        if (applyUrlState(saved)) return;
        if (entry && !entry.view) {
            resetListView();
            restoreScrollPosition(entry);
        } else if (renderSavedView(saved)) {
            // 恢复会话不是一次新的导航，不能 pushState。
            restoringState = true;
            syncUrl('replaceState');
            replaceHistoryState(saved);
            restoreScrollPosition(saved);
        } else {
            resetListView();
            saveViewState();
        }
    }

    function restoreHistoryView() {
        var entry = history.state && history.state.jarGameList;
        if (!applyUrlState(entry)) {
            resetListView();
            restoreScrollPosition(entry);
        }
    }

    /* ---------- 复制 ---------- */
    function copy(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(
                function () { window.toast('QQ群号已复制：' + text); },
                function () { fallbackCopy(text); }
            );
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            window.toast('QQ群号已复制：' + text);
        } catch (e) {
            window.toast('复制失败，请长按复制');
        }
        document.body.removeChild(ta);
    }

    /* ---------- 捐赠名单（donation.json） ---------- */
    function loadDonation() {
        var list = document.getElementById('donorList');
        if (!list) {
            donationReady = true;
            return;
        }

        fetch(BASE + 'donation.json', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!Array.isArray(data) || data.length === 0) {
                    list.innerHTML = '<li class="empty">暂无捐赠记录</li>';
                    return;
                }
                var html = '';
                data.forEach(function (d) {
                    html += '<li><span class="dname">' + escapeHtml(d.name || '') + '</span>' +
                        '<span class="amount">捐赠 ' + escapeHtml(d.amount || '') + ' 元</span>' +
                        (d.time ? '<span class="dtime">' + escapeHtml(d.time) + '</span>' : '') +
                        '</li>';
                });
                list.innerHTML = html;
            })
            .catch(function () {
                list.innerHTML = '<li class="empty">捐赠名单加载失败</li>';
            }).then(function () {
                donationReady = true;
                if (finishScrollRestore) finishScrollRestore();
            });
    }

    /* ---------- 游戏索引加载（构建生成的 [id, 名称, 拼音全拼, 拼音首字母]） ---------- */
    // 索引带内容哈希、体积较大，抓到后缓存到 localStorage；哈希变了 key 就变，下次自动重新拉取。
    function readIndexCache(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeIndexCache(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (e) {
            // 只有配额不足才清旧索引腾空间；禁用存储等异常不应触发删除。
            if (!e || (e.name !== 'QuotaExceededError' && e.name !== 'NS_ERROR_DOM_QUOTA_REACHED')) return false;
            pruneIndexCache(key);
            try { window.localStorage.setItem(key, value); } catch (retryError) { return false; }
        }
        pruneIndexCache(key);
        return true;
    }
    function pruneIndexCache(keepKey) {
        try {
            var remove = [];
            for (var i = 0; i < window.localStorage.length; i++) {
                var k = window.localStorage.key(i);
                if (k && k.indexOf(INDEX_CACHE_PREFIX) === 0 && k !== keepKey) remove.push(k);
            }
            for (var j = 0; j < remove.length; j++) window.localStorage.removeItem(remove[j]);
        } catch (e) { /* ignore */ }
    }

    function applyIndexText(text) {
        var data = JSON.parse(text);
        if (!Array.isArray(data) || data.length === 0) throw new Error('empty catalogue');
        GAMES = data.map(function (row) {
            var name = (row && row[1]) || '';
            return {
                id: (row && row[0]) || '',
                name: name,
                n: name.toLowerCase(),
                p: (row && row[2]) || '',
                i: (row && row[3]) || ''
            };
        }).filter(function (game) {
            return game.id && game.name;
        });
        if (GAMES.length === 0) throw new Error('invalid catalogue');
        if (input) input.placeholder = '在 ' + GAMES.length + ' 个游戏中搜索...';
        if (heroCount) heroCount.textContent = GAMES.length;

        sortedGames = null;
        gamesState = 'ready';
        hideGamesLoading();
        if (pendingAction) {
            var action = pendingAction;
            pendingAction = null;
            action();
        } else {
            restoreInitialView();
        }
    }

    // 镜像和本站索引同时请求，完整下载最先成功的一份立即使用，并中止其余请求。
    // 仅镜像设置超时；本站 GitHub Pages 不设人为超时，以兼容慢速网络。
    function createIndexRequest(url, timeoutMs) {
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller && timeoutMs > 0 ? window.setTimeout(function () { controller.abort(); }, timeoutMs) : null;
        var options = controller ? { signal: controller.signal } : {};
        var finished = false;
        function clearTimer() {
            if (timer) {
                window.clearTimeout(timer);
                timer = null;
            }
        }
        return {
            url: url,
            promise: fetch(url, options).then(function (r) {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.text();
            }).then(function (text) {
                finished = true;
                clearTimer();
                return text;
            }, function (error) {
                finished = true;
                clearTimer();
                throw error;
            }),
            cancel: function () {
                clearTimer();
                if (!finished && controller) controller.abort();
            }
        };
    }

    function loadIndexFromSources(sources, mirrorTimeoutMs) {
        return new Promise(function (resolve, reject) {
            var pending = sources.length;
            var errors = [];
            var settled = false;
            var requests = sources.map(function (source, index) {
                // 最后一个是本站相对地址：没有前端超时；其余为镜像，快速失败即可。
                return createIndexRequest(source, index < sources.length - 1 ? mirrorTimeoutMs : 0);
            });

            requests.forEach(function (request) {
                request.promise.then(function (text) {
                    if (settled) return;
                    settled = true;
                    requests.forEach(function (other) {
                        if (other !== request) other.cancel();
                    });
                    resolve({ text: text, source: request.url });
                }, function (error) {
                    if (settled) return;
                    errors.push({ source: request.url, error: error });
                    pending -= 1;
                    try { console.warn('游戏索引源加载失败：', request.url, error); } catch (e) { /* ignore */ }
                    if (pending === 0) reject(errors);
                });
            });
        });
    }

    function loadGames() {
        if (gamesState === 'loading' || gamesState === 'ready') return;
        gamesState = 'loading';
        showGamesLoading();
        if (grid) grid.innerHTML = '';

        var config = window.SITE_CONFIG || {};
        if (!config.gamesIndexUrl) {
            gamesState = 'error';
            showGamesLoadError('游戏索引配置缺失，请刷新后重试');
            if (grid) grid.innerHTML = '';
            return;
        }

        // 缓存键只由内容哈希文件名决定，CDN 和本站回退源会共享同一份本地缓存。
        var cacheKey = INDEX_CACHE_PREFIX + config.gamesIndexUrl;
        var cached = readIndexCache(cacheKey);
        if (cached) {
            try {
                applyIndexText(cached);
                pruneIndexCache(cacheKey);
                return;
            } catch (e) {
                // 缓存损坏（被篡改/写入不完整）→ 清掉并回落到网络
                try { window.localStorage.removeItem(cacheKey); } catch (e2) { /* ignore */ }
            }
        }

        var mirrors = Array.isArray(config.gamesIndexMirrors) ? config.gamesIndexMirrors : [];
        var sources = mirrors.filter(function (url) { return typeof url === 'string' && url; });
        // 相对地址确保始终请求当前 GitHub Pages 站点，而非 jsDelivr。
        sources.push(BASE + config.gamesIndexUrl);
        var mirrorTimeoutMs = parseInt(config.gamesIndexTimeoutMs, 10) || 10000;

        loadIndexFromSources(sources, mirrorTimeoutMs)
            .then(function (result) {
                applyIndexText(result.text);
                writeIndexCache(cacheKey, result.text);
            })
            .catch(function () {
                gamesState = 'error';
                showGamesLoadError('游戏数据加载失败，请再次点击搜索、全部游戏或随机游戏重试');
                if (grid) grid.innerHTML = '';
            });
    }

    /* ---------- 事件绑定 ---------- */
    function bind() {
        var searchBtn = document.getElementById('searchBtn');
        if (searchBtn) searchBtn.addEventListener('click', search);
        document.querySelector('.allGame').addEventListener('click', function () {
            track('全部游戏');
            showAll();
        });
        document.querySelector('.classGame').addEventListener('click', function () {
            track('随机游戏');
            showRandom();
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') search();
        });

        window.addEventListener('popstate', function () {
            // 不能在此保存旧 UI：浏览器此时已经切到了目标历史项。
            if (scrollSaveTimer !== null) window.clearTimeout(scrollSaveTimer);
            if (gamesState === 'ready') restoreHistoryView();
            else pendingAction = restoreHistoryView;
        });
        function cancelRestoreOnInteraction(event) {
            if (event.type === 'keydown' && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(event.key) < 0) return;
            if (restoringState) {
                cancelScrollRestore();
                saveViewState();
            }
        }
        window.addEventListener('wheel', cancelRestoreOnInteraction, { passive: true });
        window.addEventListener('touchstart', cancelRestoreOnInteraction, { passive: true });
        window.addEventListener('keydown', cancelRestoreOnInteraction);
        window.addEventListener('scroll', function () {
            if (restoringState || gamesState !== 'ready') return;
            if (scrollSaveTimer !== null) window.clearTimeout(scrollSaveTimer);
            scrollSaveTimer = window.setTimeout(function () {
                scrollSaveTimer = null;
                saveViewState();
            }, 150);
        });
        window.addEventListener('pagehide', function () { saveViewState(); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') saveViewState();
        });
        window.addEventListener('pageshow', function (event) {
            if (event.persisted) saveViewState();
        });

        // 分页
        if (prevBtn) prevBtn.addEventListener('click', function () { goToPage(currentPage - 1); });
        if (nextBtn) nextBtn.addEventListener('click', function () { goToPage(currentPage + 1); });
        if (pageInput) {
            pageInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') goToPage(parseInt(pageInput.value, 10));
            });
            pageInput.addEventListener('blur', function () {
                pageInput.value = currentPage; // 未按回车则还原
            });
        }
        if (pageSizeSel) {
            pageSizeSel.addEventListener('change', function () {
                beginNavigation();
                var firstIndex = (currentPage - 1) * pageSize;
                pageSize = normalizePageSize(pageSizeSel.value);
                writePreference(PAGE_SIZE_KEY, String(pageSize));
                currentPage = Math.floor(firstIndex / pageSize) + 1;
                renderPage();
                scrollToGames();
                syncUrl('pushState');
            });
        }

        // 公告里的 QQ 群复制
        var qq = document.getElementById('QQqun');
        if (qq) {
            qq.addEventListener('click', function () { copy('580458820'); });
        }

        // 公告只在当前标签页会话内记住关闭状态，刷新不重复展示。
        // 清除上版长期确认数据，不读取或迁移它。
        try { window.localStorage.removeItem('jarSite:announcement'); } catch (e) { /* optional cleanup */ }
        if (window.store.remove) window.store.remove('jarSite:announcement');
        var gg = document.getElementById('gg');
        if (gg) {
            if (!window.store.get(ANNOUNCEMENT_KEY)) gg.classList.add('open');
            var closeAnnouncement = function () {
                window.store.set(ANNOUNCEMENT_KEY, 'ok');
                gg.classList.remove('open');
            };
            var closegg = gg.querySelector('.closegg');
            var closeX = gg.querySelector('.gg-close');
            if (closegg) closegg.addEventListener('click', closeAnnouncement);
            if (closeX) closeX.addEventListener('click', closeAnnouncement);
        }

        // 捐赠区关闭
        var x = document.getElementById('x');
        if (x) {
            x.addEventListener('click', function () {
                var d = document.getElementById('donation');
                if (d) d.style.display = 'none';
            });
        }

        // 回到顶部
        var up = document.getElementById('upup');
        if (up) {
            up.addEventListener('click', function () {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            window.addEventListener('scroll', function () {
                var threshold = (window.innerWidth < 560) ? 500 : 300;
                up.classList.toggle('show', window.scrollY > threshold);
            });
        }
    }

    /* ---------- 初始化 ---------- */
    function init() {
        pageSize = normalizePageSize(readPreference(PAGE_SIZE_KEY));
        if (pageSizeSel) pageSizeSel.value = pageSize;
        try { history.scrollRestoration = 'manual'; } catch (e) { /* optional */ }
        bind();
        loadDonation();
        loadGames();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();