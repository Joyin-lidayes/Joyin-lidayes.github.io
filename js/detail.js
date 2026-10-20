/* =========================================================
   jar 游戏小站 · 游戏详情页（原生 JS）
   - 短链 ?g=<下标 base36> 定位游戏
   - 数据来自 games.json（对象：名称、链接、类型、贡献者、图标、简介、提取码）
   - 分享按钮：navigator.share + 剪贴板复制兜底
   ========================================================= */
(function () {
    'use strict';

    var BASE = window.SITE_BASE || (location.origin + '/');
    var DEFAULT_COVER_BASE = 'https://res.cloudinary.com/exnfmed6/image/upload/jarsite_games_icon/icon_game.';
    var FALLBACK_COVER = '../img/none.png';

    var titleEl = document.getElementById('gameTitle');
    var gameNameEl = document.getElementById('gameName');
    var download = document.getElementById('download');
    var img = document.getElementById('gameImg');
    var gameIconWrap = document.getElementById('gameIconWrap');
    var intro = document.getElementById('intro');
    var gameTypeTag = document.getElementById('gameTypeTag');
    var contributor = document.getElementById('contributor');
    var source = document.getElementById('source');
    var extractCodeRow = document.getElementById('extractCodeRow');
    var extractCode = document.getElementById('extractCode');
    var copyCodeBtn = document.getElementById('copyCodeBtn');
    var shareBtn = document.getElementById('shareBtn');
    var backToGames = document.getElementById('backToGames');

    var current = null; // { id, name, src }

    function bindBackNavigation() {
        if (!backToGames) return;
        backToGames.addEventListener('click', function (e) {
            // 从首页进入详情页时优先回退历史记录，以恢复原页面而非重新加载。
            try {
                var referrer = new URL(document.referrer);
                var sameSite = referrer.origin === location.origin;
                var isHome = /\/(?:index\.html)?$/.test(referrer.pathname);
                if (sameSite && isHome && history.length > 1) {
                    e.preventDefault();
                    history.back();
                }
            } catch (err) { /* 无来源页面时继续使用链接兜底 */ }
        });
    }

    bindBackNavigation();

    function getGParam() {
        var m = location.search.match(/[?&]g=([^&]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    }

    // 依据下载链接推断来源（优先使用数据的 source 字段）
    function detectSource(url) {
        if (!url) return '';
        var u = String(url).toLowerCase();
        if (/lanzou|woozooo|lanpv|i5soft\.com|yushukeji/i.test(u)) return '蓝奏云';
        if (/pan\.baidu|baidupan|bdwp/i.test(u)) return '百度网盘';
        if (/123pan|123684|123912/i.test(u)) return '123 云盘';
        if (/quark|pan\.quark/i.test(u)) return '夸克网盘';
        if (/aliyundrive|alipan|aliyun/i.test(u)) return '阿里云盘';
        if (/cowtransfer|cow\.alicloud/i.test(u)) return '奶牛快传';
        if (/ctfile|t00y/i.test(u)) return '城通网盘';
        var m = String(url).match(/^https?:\/\/([^/]+)/i);
        return m ? m[1] : '未知来源';
    }

    function setNotFound(msg) {
        document.title = '游戏详情';
        if (gameNameEl) gameNameEl.textContent = '未找到游戏';
        else if (titleEl) titleEl.textContent = '未找到游戏';
        if (gameTypeTag) gameTypeTag.hidden = true;
        if (extractCodeRow) extractCodeRow.hidden = true;
        if (intro) intro.textContent = msg || '未找到游戏信息，请返回首页重新选择游戏。';
        if (download) {
            download.removeAttribute('href');
            download.textContent = '暂无下载链接';
        }
        if (shareBtn) shareBtn.style.display = 'none';
    }

    function render(id, game) {
        // 兼容旧数组格式：[名称, 链接]；新格式请使用对象字段。
        var isLegacy = Array.isArray(game);
        var name = isLegacy ? ((game && game[0]) || '') : ((game && game.name) || '');
        var src = isLegacy ? ((game && game[1]) || '') : ((game && game.url) || '');
        // 以下字段在 games.json 缺省时统一使用站点默认值；有差异时才需要写入 JSON。
        var type = isLegacy ? 'jar' : ((game && game.type) || 'jar');
        var author = isLegacy ? 'Joyin' : ((game && game.contributor) || 'Joyin');
        // 详情页封面始终按游戏 ID 从 Cloudinary 加载；仅加载失败时才回退默认图。
        var cover = DEFAULT_COVER_BASE + id + '.png';
        var desc = isLegacy ? '暂无简介信息' : ((game && game.description) || '暂无简介信息');
        // 提取码没有默认展示值：必须在 JSON 中明确填写有效值才显示。
        var code = isLegacy ? '' : ((game && game.extractCode) || '');
        var sourceName = isLegacy ? '' : ((game && game.source) || '');

        current = { id: id, name: name, src: src };

        setShareMeta(name);
        document.title = name ? name + ' - 游戏详情' : '游戏详情';
        if (gameNameEl) gameNameEl.textContent = name || '未知游戏';
        else if (titleEl) titleEl.textContent = name || '未知游戏';

        if (download) {
            if (src) {
                download.href = src;
                download.textContent = '↓ 立即下载';
            } else {
                download.removeAttribute('href');
                download.textContent = '暂无下载链接';
            }
        }

        if (img) {
            var coverAttempts = 0;
            var maxCoverAttempts = 3;
            var fallbackUrl = new URL(FALLBACK_COVER, location.href).href;

            function finishCoverLoading() {
                if (gameIconWrap) {
                    gameIconWrap.classList.remove('is-loading');
                    gameIconWrap.setAttribute('aria-busy', 'false');
                }
            }

            function loadCover() {
                coverAttempts += 1;
                // 重试时添加参数，避免移动端/CDN 复用已失败的缓存连接。
                var retrySuffix = coverAttempts > 1 ? '?retry=' + Date.now() : '';
                img.src = cover + retrySuffix;
            }

            if (gameIconWrap) {
                gameIconWrap.classList.add('is-loading');
                gameIconWrap.setAttribute('aria-busy', 'true');
            }
            img.onload = finishCoverLoading;
            img.onerror = function () {
                if (img.src === fallbackUrl) {
                    finishCoverLoading();
                } else if (coverAttempts < maxCoverAttempts) {
                    window.setTimeout(loadCover, coverAttempts * 500);
                } else {
                    // Cloudinary 连续失败后才显示默认图。
                    img.src = FALLBACK_COVER;
                }
            };
            loadCover();
            img.alt = name ? name + '封面' : '游戏封面';
        }

        if (intro) intro.textContent = desc;
        if (gameTypeTag) {
            gameTypeTag.textContent = type;
            gameTypeTag.hidden = false;
        }
        if (contributor) contributor.textContent = author;
        if (source) source.textContent = sourceName || detectSource(src) || '暂无详细信息';
        // 仅当 JSON 中明确填写有效提取码时显示；空值或「无提取码」都不显示。
        var hasExtractCode = String(code).trim() && String(code).trim() !== '无提取码';
        if (extractCodeRow) extractCodeRow.hidden = !hasExtractCode;
        if (extractCode) extractCode.textContent = hasExtractCode ? String(code).trim() : '';
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

    function copyText(text, successMessage) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(
                function () { window.toast(successMessage || '已复制游戏分享文案，去QQ/微信粘贴给好友'); },
                function () { fallbackCopy(text, successMessage); }
            );
        } else {
            fallbackCopy(text, successMessage);
        }
    }

    function fallbackCopy(text, successMessage) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            window.toast(successMessage || '已复制游戏分享文案，去QQ/微信粘贴给好友');
        } catch (e) {
            window.toast('复制失败，请长按复制页面链接');
        }
        document.body.removeChild(ta);
    }

    function bindCopyCode() {
        if (!copyCodeBtn) return;
        copyCodeBtn.addEventListener('click', function () {
            if (!extractCode || !extractCode.textContent) return;
            copyText(extractCode.textContent, '已复制提取码');
        });
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
                var game = null;
                if (g !== null) {
                    for (var i = 0; i < data.length; i++) {
                        if (data[i] && data[i].id === g) {
                            game = data[i];
                            break;
                        }
                    }
                }
                if (!game) {
                    setNotFound();
                    return;
                }
                render(g, game);
            })
            .catch(function () {
                setNotFound('游戏数据加载失败，请刷新重试。');
            });
    }

    bindCopyCode();
    bindShare();
    load();
})();