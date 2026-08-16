/* =========================================================
   jar 游戏小站 · 首页逻辑（原生 JS，无 jQuery）
   - 搜索 / 全部游戏 / 随机游戏
   - 分页渲染（上一页/下一页 + 可输入页码跳转 + 每页条数选择）
   - Base64 解码、session 存取、QQ 群复制、公告弹窗、回到顶部
   - 捐赠名单：来自 donation.json
   ========================================================= */
(function () {
    'use strict';

    var GAMES = window.allGame || [];
    var pageSize = 100;
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

    /* ---------- 工具 ---------- */
    function decodeBase64(s) {
        try {
            var bin = atob(s);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            return s;
        }
    }

    function splitEntry(entry) {
        var i = entry.indexOf(',');
        if (i < 0) return { name: entry, src: '' };
        return { name: entry.slice(0, i), src: decodeBase64(entry.slice(i + 1)) };
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
        var items = GAMES.map(function (entry) {
            return { entry: entry, name: splitEntry(entry).name };
        });
        items.sort(function (a, b) {
            return collator.compare(a.name, b.name);
        });
        sortedGames = items.map(function (item) { return item.entry; });
        return sortedGames;
    }

    /* ---------- 渲染 ---------- */
    var NAME_LIMIT = 14;

    function truncateName(name) {
        if (name.length <= NAME_LIMIT) return name;
        return name.slice(0, NAME_LIMIT) + '…';
    }

    function cardHtml(entry) {
        var g = splitEntry(entry);
        var displayName = truncateName(g.name);
        return '<li class="game-card"><a href="html/detail.html" data-name="' +
            escapeHtml(g.name) + '" data-src="' + escapeHtml(g.src) + '" title="' + escapeHtml(g.name) + '">' +
            '<span class="game-icon mono">▶</span>' +
            '<span class="game-name">' + escapeHtml(displayName) + '</span>' +
            '</a></li>';
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
        scrollToGames();
    }

    function setList(arr, title) {
        currentList = arr.slice();
        currentPage = 1;

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
    function search() {
        var kw = input.value.trim();
        if (!kw) {
            window.toast('请输入游戏名称');
            input.focus();
            return;
        }
        var sorted = getSortedGames();
        var arr = [];
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].indexOf(kw) >= 0) arr.push(sorted[i]);
        }
        setList(arr, '搜索「' + kw + '」的结果');
    }

    function showAll() {
        setList(getSortedGames(), '全部游戏');
    }

    function showRandom() {
        var n = 20;
        var arr = [];
        for (var j = 0; j < n; j++) {
            arr.push(GAMES[Math.floor(Math.random() * GAMES.length)]);
        }
        setList(arr, '随机推荐');
    }

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

    /* ---------- 事件绑定 ---------- */
    function bind() {
        // 游戏卡片点击（事件委托）：写入 session 供详情页读取
        grid.addEventListener('click', function (e) {
            var a = e.target.closest('a[data-name]');
            if (!a) return;
            window.store.set('gname', a.getAttribute('data-name'));
            window.store.set('gsrc', a.getAttribute('data-src'));
        });

        var searchBtn = document.getElementById('searchBtn');
        if (searchBtn) searchBtn.addEventListener('click', search);
        document.querySelector('.allGame').addEventListener('click', showAll);
        document.querySelector('.classGame').addEventListener('click', showRandom);

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') search();
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
                pageSize = parseInt(pageSizeSel.value, 10) || 100;
                currentPage = Math.floor(firstIndex / pageSize) + 1;
                renderPage();
                scrollToGames();
            });
        }

        // 我要上传
        var upload = document.getElementById('upload');
        if (upload) {
            upload.addEventListener('click', function () {
                alert('上传请联系群主（QQ群：580458820）');
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
        if (input) input.placeholder = '在 ' + GAMES.length + ' 个游戏中搜索...';
        if (heroCount) heroCount.textContent = GAMES.length;
        bind();
        loadDonation();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
