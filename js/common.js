/* =========================================================
   jar 游戏小站 · 全局共享脚本
   - 站点根路径（供 fetch 使用）
   - 移动端导航开关
   - 轻量 Toast 提示
   - session 存取（sessionStorage + Cookie 兜底）
   - 更新历史：点击 logo 图标弹出，内容来自 history.json
   ========================================================= */
(function () {
    'use strict';

    /* 站点根路径 */
    var BASE = '';
    try {
        if (document.currentScript && document.currentScript.src) {
            BASE = document.currentScript.src.replace(/js\/common\.js(\?.*)?$/, '');
        }
    } catch (e) { /* ignore */ }
    window.SITE_BASE = BASE;

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ---------- 移动端导航 ---------- */
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.nav-links');

    if (toggle && nav) {
        toggle.addEventListener('click', function () {
            var open = nav.classList.toggle('open');
            toggle.classList.toggle('open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }

    /* ---------- 轻量 Toast ---------- */
    var toastEl = null;
    var toastTimer = null;

    window.toast = function (msg) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast';
            toastEl.setAttribute('role', 'status');
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toastEl.classList.remove('show');
        }, 2000);
    };

    /* ---------- session 存取（带 Cookie 兜底） ---------- */
    var setCookie = function (k, v) {
        try {
            document.cookie = k + '=' + encodeURIComponent(v) + '; path=/';
        } catch (e) { /* ignore */ }
    };

    var getCookie = function (k) {
        var m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    };

    window.store = {
        get: function (k) {
            try {
                var v = window.sessionStorage.getItem(k);
                if (v !== null) return v;
            } catch (e) { /* ignore */ }
            return getCookie(k);
        },
        set: function (k, v) {
            try {
                window.sessionStorage.setItem(k, v);
            } catch (e) { /* ignore */ }
            setCookie(k, v);
        }
    };

    /* ---------- 更新历史（logo 图标点击弹出） ---------- */
    function initHistory() {
        var logo = document.querySelector('.brand .logo');
        if (!logo) return;

        var modal = document.createElement('div');
        modal.className = 'modal history-modal';
        modal.id = 'historyModal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', '更新历史');
        modal.innerHTML = '<div class="modal-card">' +
            '<div class="modal-head"><h2>更新历史</h2>' +
            '<button class="modal-close" type="button" aria-label="关闭">×</button></div>' +
            '<div class="h-list" id="historyList">加载中…</div></div>';
        document.body.appendChild(modal);

        logo.title = '更新历史';
        logo.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            modal.classList.add('open');
        });

        modal.addEventListener('click', function (e) {
            if (e.target === modal || e.target.closest('.modal-close')) {
                modal.classList.remove('open');
            }
        });

        fetch(BASE + 'history.json', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var list = document.getElementById('historyList');
                if (!Array.isArray(data) || data.length === 0) {
                    list.textContent = '暂无更新记录';
                    return;
                }
                var html = '';
                data.forEach(function (item, i) {
                    html += '<div class="h-item"><span class="h-no">№' + i + '</span><div>' +
                        (item.date ? '<span class="h-date">' + escapeHtml(item.date) + '</span>' : '') +
                        '<p>' + escapeHtml(item.text || '') + '</p></div></div>';
                });
                list.innerHTML = html;
            })
            .catch(function () {
                var list = document.getElementById('historyList');
                if (list) list.textContent = '更新历史加载失败';
            });
    }

    /* ---------- Q&A（qa.json，仅在 Q&A 页渲染） ---------- */
    function loadQA() {
        var list = document.getElementById('qaList');
        if (!list) return;

        fetch(BASE + 'qa.json', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!Array.isArray(data) || data.length === 0) {
                    list.innerHTML = '<div class="card qa-item"><p class="muted">暂无内容</p></div>';
                    return;
                }
                var html = '';
                data.forEach(function (item) {
                    html += '<div class="card qa-item">' +
                        '<h3><span class="q-tag">Q</span>' + escapeHtml(item.q || '') + '</h3>' +
                        '<p><span class="a-tag">A </span>' + (item.a || '') + '</p>' +
                        '</div>';
                });
                list.innerHTML = html;
            })
            .catch(function () {
                list.innerHTML = '<div class="card qa-item"><p class="muted">Q&amp;A 加载失败</p></div>';
            });
    }

    /* ---------- 友链（friends/friends.json） ---------- */
    function loadFriends() {
        var list = document.getElementById('friendList');
        if (!list) return;

        fetch(BASE + 'friends/friends.json', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!Array.isArray(data) || data.length === 0) {
                    list.innerHTML = '<p class="muted">暂无友链</p>';
                    return;
                }
                var html = '';
                data.forEach(function (f) {
                    html += '<a class="card friend-card" href="' + escapeHtml(f.url || '') + '" target="_blank" rel="noopener">' +
                        '<img src="' + escapeHtml(BASE + 'friends/' + (f.icon || '')) + '" alt="' + escapeHtml(f.name || '') + '">' +
                        '<span class="f-body">' +
                        '<span class="f-name">' + escapeHtml(f.name || '') + '</span>' +
                        '<span class="f-desc">' + escapeHtml(f.desc || '') + '</span>' +
                        '</span></a>';
                });
                list.innerHTML = html;
            })
            .catch(function () {
                list.innerHTML = '<p class="muted">友链加载失败</p>';
            });
    }

    initHistory();
    loadQA();
    loadFriends();
})();
