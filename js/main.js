/* =========================================================
   jar 游戏小站 · 首页逻辑（原生 JS，无 jQuery）
   - 数据来自构建生成的轻量首页索引（[id, 名称]）
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
    var visitedGameIds = getVisitedGameIds();

    function saveViewState() {
        if (!viewState || !window.store) return;
        var state = {
            view: viewState,
            page: currentPage,
            pageSize: pageSize,
            // 点击详情页前保存当前位置；返回或刷新后恢复到用户离开的位置。
            scrollY: Math.max(0, window.scrollY || window.pageYOffset || 0)
        };
        try { window.store.set(VIEW_STATE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
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
            hasView: !!seed || !!query
        };
    }

    function syncUrl(mode) {
        var url = new URL(window.location.href);
        url.searchParams.delete('q');
        url.searchParams.delete('r');
        url.searchParams.delete('page');
        url.searchParams.delete('size');
        if (viewState && viewState.type === 'search') {
            url.searchParams.set('q', viewState.query);
        } else if (viewState && viewState.type === 'random') {
            url.searchParams.set('r', viewState.seed);
        } else {
            history[mode || 'pushState'](null, '', url.pathname + url.search + url.hash);
            return;
        }
        url.searchParams.set('page', currentPage);
        url.searchParams.set('size', pageSize);
        history[mode || 'pushState'](null, '', url.pathname + url.search + url.hash);
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
        currentPage = p;
        renderPage();
        saveViewState();
        syncUrl('pushState');
        scrollToGames();
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
            saveViewState();
            return;
        }

        renderPage();
        showSection();
        saveViewState();
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
        var sorted = getSortedGames();
        var arr = [];
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].name.indexOf(kw) >= 0) arr.push(sorted[i]);
        }
        setList(arr, '搜索「' + kw + '」的结果', {
            view: { type: 'search', query: kw },
            page: state && state.page
        });
        if (state && state.syncUrl) syncUrl('pushState');
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
        setList(getSortedGames(), '全部游戏', {
            view: { type: 'all' },
            page: state && state.page
        });
        if (!state || !state.fromUrl) syncUrl('pushState');
    }

    function showRandom(state) {
        if (waitForGames(function () { showRandom(state); })) return;
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
        var y = state && parseInt(state.scrollY, 10);
        if (!y) return;
        // 等待列表渲染和浏览器 hash 定位结束后，再精确回到离开前的位置。
        window.setTimeout(function () { window.scrollTo(0, y); }, 0);
    }

    function applyUrlState() {
        var state = getUrlState();
        if (!state.hasView) return false;
        if (state.pageSize) {
            pageSize = state.pageSize;
            if (pageSizeSel) pageSizeSel.value = pageSize;
        }
        if (state.seed) {
            showRandom({ view: { seed: state.seed }, page: state.page, fromUrl: true });
            return true;
        }
        if (input) input.value = state.query;
        runSearch(state.query, { page: state.page });
        return true;
    }

    function restoreViewState() {
        var state = getSavedViewState();
        if (!state || !state.view) return false;
        if (pageSizeSel && state.pageSize) {
            pageSize = normalizePageSize(state.pageSize);
            pageSizeSel.value = pageSize;
        }
        if (state.view.type === 'search' && state.view.query) {
            if (input) input.value = state.view.query;
            runSearch(state.view.query, state);
            restoreScrollPosition(state);
            return true;
        }
        if (state.view.type === 'random' && state.view.seed) {
            showRandom(state);
            restoreScrollPosition(state);
            return true;
        }
        if (state.view.type === 'all') {
            showAll(state);
            restoreScrollPosition(state);
            return true;
        }
        return false;
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
        if (!list) return;

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
            });
    }

    /* ---------- 游戏索引加载（构建生成的 [id, 名称]） ---------- */
    function loadGames() {
        if (gamesState === 'loading' || gamesState === 'ready') return;
        gamesState = 'loading';
        if (grid) grid.innerHTML = '<li class="empty">正在加载游戏列表…</li>';

        var config = window.SITE_CONFIG || {};
        if (!config.gamesIndexUrl) {
            gamesState = 'error';
            if (grid) grid.innerHTML = '<li class="empty">游戏索引配置缺失，请刷新后重试</li>';
            return;
        }

        fetch(BASE + config.gamesIndexUrl)
            .then(function (r) {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (!Array.isArray(data) || data.length === 0) throw new Error('empty catalogue');
                GAMES = data.map(function (row) {
                    return {
                        id: (row && row[0]) || '',
                        name: (row && row[1]) || ''
                    };
                }).filter(function (game) {
                    return game.id && game.name;
                });
                if (GAMES.length === 0) throw new Error('invalid catalogue');
                if (input) input.placeholder = '在 ' + GAMES.length + ' 个游戏中搜索...';
                if (heroCount) heroCount.textContent = GAMES.length;

                sortedGames = null;
                gamesState = 'ready';
                if (pendingAction) {
                    var action = pendingAction;
                    pendingAction = null;
                    action();
                } else if (!applyUrlState() && !restoreViewState() && grid) {
                    grid.innerHTML = '';
                }
            })
            .catch(function () {
                gamesState = 'error';
                if (grid) grid.innerHTML = '<li class="empty">游戏数据加载失败，请再次点击搜索、全部游戏或随机游戏重试</li>';
            });
    }

    /* ---------- 事件绑定 ---------- */
    function bind() {
        var searchBtn = document.getElementById('searchBtn');
        if (searchBtn) searchBtn.addEventListener('click', search);
        document.querySelector('.allGame').addEventListener('click', showAll);
        document.querySelector('.classGame').addEventListener('click', showRandom);

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') search();
        });

        window.addEventListener('popstate', function () {
            if (gamesState === 'ready') {
                if (!applyUrlState() && grid) grid.innerHTML = '';
            }
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
                var firstIndex = (currentPage - 1) * pageSize;
                pageSize = normalizePageSize(pageSizeSel.value);
                currentPage = Math.floor(firstIndex / pageSize) + 1;
                renderPage();
                saveViewState();
                syncUrl('pushState');
                scrollToGames();
            });
        }

        // 公告里的 QQ 群复制
        var qq = document.getElementById('QQqun');
        if (qq) {
            qq.addEventListener('click', function () { copy('580458820'); });
        }

        // 公告弹窗：首次访问展示一次
        var gg = document.getElementById('gg');
        if (gg) {
            if (!window.store.get('firstEnterPage')) gg.classList.add('open');
            var closeAnnouncement = function () {
                window.store.set('firstEnterPage', 'ok');
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