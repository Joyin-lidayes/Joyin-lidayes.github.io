/* =========================================================
   jar 游戏小站 · 游戏详情页（原生 JS）
   - 短链 ?g=<下标 base36> 定位游戏
   - 数据来自 games.json（一行一个游戏：[名字, 链接, 头图?, 简介?]）
   - 分享按钮：navigator.share + 剪贴板复制兜底
   ========================================================= */
(function () {
    'use strict';

    var BASE = window.SITE_BASE || (location.origin + '/');

    var titleEl = document.getElementById('gameTitle');
    var download = document.getElementById('download');
    var img = document.getElementById('gameImg');
    var intro = document.getElementById('intro');
    var shareBtn = document.getElementById('shareBtn');

    var current = null; // { id, name, src }

    function b36toIndex(s) {
        if (!/^[0-9a-z]+$/i.test(s)) return -1;
        return parseInt(s, 36);
    }

    function getGParam() {
        var m = location.search.match(/[?&]g=([^&]+)/);
        return m ? m[1] : null;
    }

    function setNotFound(msg) {
        document.title = '游戏详情';
        if (titleEl) titleEl.textContent = '未找到游戏';
        if (intro) intro.textContent = msg || '未找到游戏信息，请返回首页重新选择游戏。';
        if (download) {
            download.removeAttribute('href');
            download.textContent = '暂无下载链接';
        }
        if (shareBtn) shareBtn.style.display = 'none';
    }

    function render(id, row) {
        var name = (row && row[0]) || '';
        var src = (row && row[1]) || '';
        var cover = (row && row[2]) || '';
        var desc = (row && row[3]) || '';

        current = { id: id, name: name, src: src };

        setShareMeta(name);
        document.title = name ? name + ' - 游戏详情' : '游戏详情';
        if (titleEl) titleEl.textContent = name || '未知游戏';

        if (download) {
            if (src) {
                download.href = src;
                download.textContent = '点击下载';
            } else {
                download.removeAttribute('href');
                download.textContent = '暂无下载链接';
            }
        }

        if (img) {
            if (cover) img.src = cover;
            img.alt = name;
        }

        if (intro) intro.textContent = desc || '暂无详细介绍';
    }

    function buildShareUrl() {
        // 指向预生成的静态分享页 /g/<id>.html；
        // QQ/微信爬虫不执行 JS，只能靠该页面写死的 og 标签识别游戏名
        return BASE + 'g/s' + (current ? current.id : '') + '.html';
    }

    // 动态写入 og 元信息，便于部分分享场景/支持执行 JS 的抓取器显示游戏名
    function setShareMeta(name) {
        function set(prop, content) {
            var el = document.querySelector('meta[property="' + prop + '"]');
            if (el) el.setAttribute('content', content);
        }
        set('og:title', name ? name + ' - jar游戏小站' : 'jar游戏小站');
        set('og:description', name
            ? '「' + name + '」塞班Java(jar)怀旧手机游戏，点击下载。'
            : '专注塞班Java(jar)怀旧手机游戏下载，收录15000+款诺基亚时代游戏。');
        set('og:url', buildShareUrl());
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(
                function () { window.toast('已复制游戏分享文案，去QQ/微信粘贴给好友'); },
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
            window.toast('已复制游戏分享文案，去QQ/微信粘贴给好友');
        } catch (e) {
            window.toast('复制失败，请长按复制页面链接');
        }
        document.body.removeChild(ta);
    }

    function bindShare() {
        if (!shareBtn) return;
        shareBtn.addEventListener('click', function () {
            if (!current || !current.name) return;
            var url = buildShareUrl();
            var text = '【' + current.name + '】jar游戏下载';
            if (navigator.share) {
                navigator.share({ title: current.name, text: text, url: url }).catch(function (err) {
                    if (err && err.name === 'AbortError') return; // 用户主动取消分享，不再复制
                    copyText(text + '\n' + url);
                });
            } else {
                copyText(text + '\n' + url);
            }
        });
    }

    function load() {
        var g = getGParam();

        fetch(BASE + 'games.json')
            .then(function (r) {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.json();
            })
            .then(function (data) {
                data = data || [];
                var idx = (g === null) ? -1 : b36toIndex(g);
                if (idx < 0 || idx >= data.length) {
                    setNotFound();
                    return;
                }
                render(g, data[idx]);
            })
            .catch(function () {
                setNotFound('游戏数据加载失败，请刷新重试。');
            });
    }

    bindShare();
    load();
})();