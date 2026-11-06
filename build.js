/* =========================================================
   build.js — 构建 GitHub Pages 发布产物
   - 仅复制运行时资源到 _site
   - 生成带内容哈希的首页游戏索引
   - 为每个游戏生成完整静态详情/分享页 g/s<id>.html
   运行：node build.js
   ========================================================= */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pinyin, customPinyin } = require('pinyin-pro');

// 手动纠正多音字/专名读音：key 为汉字词组，value 为带声调、逐字对应的标准拼音。
// 构建期全局生效一次，作用于所有 name（全拼与首字母会一起被修正）。
// 先用 `pinyin(name, { type: 'all' })` 排查出多音字再补充，勿凭空臆测。
customPinyin({
    // '重装机兵': 'chóng zhuāng jī bīng',
    // '朝歌': 'cháo gē',
});

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const SITE_URL = 'https://joyin-lidayes.github.io';
const COVER = SITE_URL + '/img/og-image.png';
const NO_IMAGE = SITE_URL + '/img/none.png';
const DEFAULT_COVER_BASE = 'https://res.cloudinary.com/exnfmed6/image/upload/jarsite_games_icon/icon_game.';
const ICON_STATUS_FILE = path.join(ROOT, 'data', 'game-icon-status.json');
const GAME_ID_RE = /^[a-f0-9]{16}$/;

// ---------------------------------------------------------
// Umami Cloud 流量统计（免费）
// 取值：Umami 后台 → Websites → 选中站点 → Edit → Tracking code
//       里的 data-website-id（形如 94db1cb1-74f4-4a40-ad6c-962362670409）
// 留空 = 构建时不注入任何统计脚本，产物与未接入时完全一致。
// CI 也可用环境变量 UMAMI_WEBSITE_ID 覆盖本常量。
// ---------------------------------------------------------
const UMAMI_WEBSITE_ID = (process.env.UMAMI_WEBSITE_ID || '').trim();
const UMAMI_SCRIPT_SRC = 'https://cloud.umami.is/script.js';
const UMAMI_DOMAINS = 'joyin-lidayes.github.io';
const UMAMI_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (UMAMI_WEBSITE_ID && !UMAMI_ID_RE.test(UMAMI_WEBSITE_ID)) {
    throw new Error('UMAMI_WEBSITE_ID 格式不正确（应为 Umami 网站 ID，UUID 形式），当前值："' +
        UMAMI_WEBSITE_ID + '"。请确认 secret 里填的是 data-website-id，而不是整段 <script> 代码。');
}

// 只发布站点运行所需的源文件；games.json、脚本、报告、备份等均不进入 _site。
const PUBLISH_FILES = ['index.html', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'donation.json', 'history.json', 'qa.json'];
const PUBLISH_DIRS = ['css', 'img', 'friends'];
const PUBLISH_HTML = ['QandA.html', 'donation.html', 'friend.html'];
const PUBLISH_JS = ['common.js', 'main.js', 'donation.js'];

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function text(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : (fallback || '');
}

function makeShareDescription(description, name) {
    const value = text(description).replace(/\s+/g, ' ').trim();
    if (!value) return '「' + name + '」塞班 Java 怀旧手机游戏，点击下载。';
    return '简介：' + (value.length > 90 ? value.slice(0, 90) + '…' : value);
}

function readGameIconIds() {
    if (!fs.existsSync(ICON_STATUS_FILE)) {
        throw new Error('缺少图标状态清单：data/game-icon-status.json；请先运行 node scripts/sync-game-icons.js');
    }
    const status = JSON.parse(fs.readFileSync(ICON_STATUS_FILE, 'utf8').replace(/^\uFEFF/, ''));
    if (!status || !Array.isArray(status.icons)) {
        throw new Error('图标状态清单格式不正确：data/game-icon-status.json');
    }
    return new Set(status.icons.filter(function (id) { return GAME_ID_RE.test(id); }));
}

function detectSource(url) {
    const u = String(url || '').toLowerCase();
    if (/lanzou|woozooo|lanpv|i5soft\.com|yushukeji/i.test(u)) return '蓝奏云';
    if (/pan\.baidu|baidupan|bdwp/i.test(u)) return '百度网盘';
    if (/123pan|123684|123912/i.test(u)) return '123 云盘';
    if (/quark|pan\.quark/i.test(u)) return '夸克网盘';
    if (/aliyundrive|alipan|aliyun/i.test(u)) return '阿里云盘';
    if (/cowtransfer|cow\.alicloud/i.test(u)) return '奶牛快传';
    if (/ctfile|t00y/i.test(u)) return '城通网盘';
    const match = String(url || '').match(/^https?:\/\/([^/]+)/i);
    return match ? match[1] : '暂无详细信息';
}

function umamiSnippet() {
    if (!UMAMI_WEBSITE_ID) return '';
    return '<script defer src="' + UMAMI_SCRIPT_SRC + '" data-website-id="' + UMAMI_WEBSITE_ID +
        '" data-domains="' + UMAMI_DOMAINS + '" data-exclude-search="true"></script>\n';
}

// 统计脚本统一在这里注入：静态页和 1.5 万个详情页一次覆盖，无需逐页手改。
// data-domains 让本地预览（localhost）和 fork 出去的域名不计入统计。
function withAnalytics(html) {
    const snippet = umamiSnippet();
    if (!snippet || html.indexOf(UMAMI_SCRIPT_SRC) !== -1) return html;
    const at = html.lastIndexOf('</body>');
    return at === -1 ? html + snippet : html.slice(0, at) + snippet + html.slice(at);
}

function copyPage(relativePath) {
    const from = path.join(ROOT, relativePath);
    const to = path.join(OUT, relativePath);
    if (!fs.existsSync(from)) throw new Error('缺少发布文件：' + relativePath);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, withAnalytics(fs.readFileSync(from, 'utf8')));
}

function copyFile(relativePath) {
    const from = path.join(ROOT, relativePath);
    const to = path.join(OUT, relativePath);
    if (!fs.existsSync(from)) throw new Error('缺少发布文件：' + relativePath);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

function copyDir(relativePath) {
    const from = path.join(ROOT, relativePath);
    if (!fs.existsSync(from)) throw new Error('缺少发布目录：' + relativePath);
    fs.cpSync(from, path.join(OUT, relativePath), { recursive: true });
}

function copySite() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    PUBLISH_FILES.forEach(function (name) {
        if (/\.html$/i.test(name)) copyPage(name); else copyFile(name);
    });
    PUBLISH_DIRS.forEach(copyDir);
    PUBLISH_HTML.forEach(function (name) { copyPage(path.join('html', name)); });
    PUBLISH_JS.forEach(function (name) { copyFile(path.join('js', name)); });
    fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
}

function readGames() {
    const gamesText = fs.readFileSync(path.join(ROOT, 'games.json'), 'utf8').replace(/^\uFEFF/, '');
    const games = JSON.parse(gamesText);
    if (!Array.isArray(games) || games.length === 0) throw new Error('games.json 为空或格式不正确');

    const ids = new Set();
    games.forEach(function (game, index) {
        const label = 'games.json 第 ' + (index + 1) + ' 条';
        if (!game || Array.isArray(game) || typeof game !== 'object') throw new Error(label + ' 必须是对象');
        if (!GAME_ID_RE.test(game.id || '')) throw new Error(label + ' id 必须是 16 位小写十六进制字符');
        if (ids.has(game.id)) throw new Error('games.json 中存在重复 id：' + game.id);
        if (!text(game.name)) throw new Error(label + ' name 必须是非空字符串');
        if (!text(game.url)) throw new Error(label + ' url 必须是非空字符串');
        ids.add(game.id);
    });
    return games;
}

/* ---------- 拼音（构建期，供搜索索引使用） ---------- */
function pinyinFull(text) {
    return pinyin(text, { toneType: 'none', type: 'array', v: true, nonZh: 'consecutive' })
        .join('').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pinyinFirst(text) {
    return pinyin(text, { pattern: 'first', toneType: 'none', type: 'array', v: true, nonZh: 'consecutive' })
        .join('').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function writeGamesIndex(games) {
    // 首页需要稳定 ID、名称，以及构建期预计算的拼音全拼/首字母；
    // 使用短数组避免为每条记录重复输出字段名。
    const content = JSON.stringify(games.map(function (game) {
        return [game.id, game.name, pinyinFull(game.name), pinyinFirst(game.name)];
    }));
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const relativeUrl = 'data/games-index.' + hash + '.json';
    const dataDir = path.join(OUT, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(OUT, relativeUrl), content);
    fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
    // GitHub Pages 保留本地索引作最终回退；主请求优先走 jsDelivr 的 cdn-data 分支。
    // 工作流会在本次构建后将 _site/data 发布到该分支。内容哈希使 CDN 更新不会命中旧缓存。
    const jsdelivrUrl = 'https://cdn.jsdelivr.net/gh/Joyin-lidayes/Joyin-lidayes.github.io@cdn-data/' + relativeUrl;
    fs.writeFileSync(path.join(OUT, 'js', 'site-config.js'),
        '/* 本文件由 build.js 自动生成。 */\nwindow.SITE_CONFIG = ' + JSON.stringify({
            gamesIndexUrl: relativeUrl,
            gamesIndexMirrors: [jsdelivrUrl],
            gamesIndexTimeoutMs: 10000
        }) + ';\n');
    return relativeUrl;
}

function detailPageHtml(game, gameIconIds) {
    const id = game.id;
    const name = text(game.name);
    const url = text(game.url);
    const description = text(game.description, '暂无简介信息');
    const type = text(game.type, 'jar');
    const contributor = text(game.contributor, 'Joyin');
    const source = text(game.source, detectSource(url));
    const rawExtractCode = text(game.extractCode);
    const extractCode = rawExtractCode === '无提取码' ? '' : rawExtractCode;
    const cloudinaryIcon = DEFAULT_COVER_BASE + id + '.png';
    // 详情页没有游戏图标时显示“暂无图片”；分享卡片则保持站点宣传图。
    const icon = gameIconIds.has(id) ? cloudinaryIcon : NO_IMAGE;
    const shareImage = gameIconIds.has(id) ? cloudinaryIcon : COVER;
    const pageUrl = SITE_URL + '/g/s' + id + '.html';
    const title = name + ' - 游戏详情';
    const shareDescription = makeShareDescription(description, name);
    const shareText = name + ' - jar游戏小站';
    const extractCodeRow = extractCode
        ? '<div class="info-row extract-code-row"><dt>提取码</dt><dd class="code-line"><code id="extractCode">' + escapeHtml(extractCode) + '</code><button id="copyCodeBtn" class="copy-code-btn" type="button">复制</button></dd></div>'
        : '';

    return '<!-- 本文件由 build.js 自动生成，请勿手改；改 games.json 后重新构建即可。 -->\n' +
        '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
        '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<meta name="theme-color" content="#e6e8eb">\n' +
        '<meta name="description" content="' + escapeHtml(shareDescription) + '">\n' +
        '<meta property="og:type" content="website">\n<meta property="og:site_name" content="jar游戏小站">\n' +
        '<meta property="og:title" content="' + escapeHtml(name + ' - jar游戏小站') + '">\n' +
        '<meta property="og:description" content="' + escapeHtml(shareDescription) + '">\n' +
        '<meta property="og:image" content="' + escapeHtml(shareImage) + '">\n<meta property="og:image:alt" content="' + escapeHtml(name + '图标') + '">\n<meta property="og:image:type" content="image/png">\n<meta property="og:url" content="' + pageUrl + '">\n' +
        '<meta itemprop="name" content="' + escapeHtml(name + ' - jar游戏小站') + '">\n<meta itemprop="description" content="' + escapeHtml(shareDescription) + '">\n<meta itemprop="image" content="' + escapeHtml(shareImage) + '">\n' +
        '<title>' + escapeHtml(title) + '</title>\n<link rel="icon" href="../favicon.ico">\n' +
        '<link rel="stylesheet" href="../css/base.css">\n<link rel="stylesheet" href="../css/detail.css">\n</head>\n<body>\n' +
        '<header class="site-header"><div class="container nav"><a class="brand" href="../index.html"><span class="logo">J</span><span>jar游戏小站</span></a>' +
        '<button class="nav-toggle" aria-label="打开菜单" aria-expanded="false"><span></span><span></span><span></span></button>' +
        '<nav class="nav-links"><a href="../index.html">首页</a><a href="../html/friend.html">友链</a><a href="../html/QandA.html">Q&amp;A</a><a href="../html/donation.html">捐赠</a></nav></div></header>\n' +
        '<main class="container detail-page"><a class="back-link" id="backToGames" href="../index.html" aria-label="返回游戏列表"><span aria-hidden="true">←</span> 返回游戏列表</a>' +
        '<article class="card detail-card"><header class="game-hero"><div class="game-icon-wrap is-loading" id="gameIconWrap" aria-busy="true"><span class="game-icon-loader" aria-hidden="true"></span><img id="gameImg" src="' + escapeHtml(icon) + '" alt="' + escapeHtml(name + '封面') + '"></div>' +
        '<div class="game-summary"><div class="game-title-line"><h1>' + escapeHtml(name) + '</h1><span class="format-tag">' + escapeHtml(type) + '</span></div>' +
        '<p class="game-subtitle">塞班 Java 怀旧手机游戏</p><div class="game-actions"><a class="btn btn-primary" href="' + escapeHtml(url) + '" target="_blank" rel="noopener" data-umami-event="下载" data-umami-event-game="' + escapeHtml(name) + '" data-umami-event-id="' + id + '">↓ 立即下载</a><button id="shareBtn" class="btn" type="button">↗ 分享游戏</button></div></div></header>' +
        '<div class="detail-content"><section class="detail-section intro-section"><h2>游戏简介</h2><p>' + escapeHtml(description) + '</p></section>' +
        '<aside class="detail-section game-info"><h2>游戏信息</h2><dl class="info-list"><div class="info-row"><dt>贡献者</dt><dd>' + escapeHtml(contributor) + '</dd></div>' +
        '<div class="info-row"><dt>下载来源</dt><dd>' + escapeHtml(source) + '</dd></div>' + extractCodeRow + '</dl></aside></div></article>' +
        '<p class="foot-note"><a href="https://qm.qq.com/cgi-bin/qm/qr?k=xBHI7DQ8itJeqWzgngV4oqzfT1dfhOuc&jump_from=webapi" target="_blank" rel="noopener">信息有误？联系我补充或修正</a></p></main>' +
        '<footer class="site-footer"></footer>\n' +
        '<script src="../js/common.js"></script>\n<script>(function(){\n' +
        'var back=document.getElementById("backToGames");if(back)back.addEventListener("click",function(e){if(document.referrer&&document.referrer.indexOf(location.origin)===0){e.preventDefault();history.back();}});\n' +
        'var img=document.getElementById("gameImg"),iconWrap=document.getElementById("gameIconWrap"),iconRetryCount=0,iconRetryLimit=3;function finishCoverLoading(){if(iconWrap){iconWrap.classList.remove("is-loading");iconWrap.setAttribute("aria-busy","false");}}function retryIconOrFallback(){if(!img)return;if(iconRetryCount<iconRetryLimit){iconRetryCount+=1;var original=img.getAttribute("data-original-src")||img.src;img.setAttribute("data-original-src",original);window.setTimeout(function(){var separator=original.indexOf("?")>=0?"&":"?";img.src=original+separator+"icon_retry="+iconRetryCount+"_"+Date.now();},800*iconRetryCount);}else{img.src="../img/none.png";finishCoverLoading();}}if(img){img.onload=finishCoverLoading;img.onerror=retryIconOrFallback;if(img.complete){if(img.naturalWidth>0)finishCoverLoading();else retryIconOrFallback();}}\n' +
        'var share=document.getElementById("shareBtn"),url=' + JSON.stringify(pageUrl) + ',text=' + JSON.stringify(shareText) + ';\n' +
        'function fallbackCopy(value){var ta=document.createElement("textarea");ta.value=value;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");window.toast("已复制游戏分享文案，去QQ/微信粘贴给好友");}catch(e){window.toast("复制失败，请长按复制页面链接");}document.body.removeChild(ta);}\n' +
        'if(share)share.addEventListener("click",function(){if(window.umami&&window.umami.track)window.umami.track("分享",{id:"' + id + '"});if(navigator.share){navigator.share({title:' + JSON.stringify(name) + ',text:text,url:url}).catch(function(e){if(!e||e.name!=="AbortError")fallbackCopy(text+"\\n"+url);});}else{fallbackCopy(text+"\\n"+url);}});\n' +
        'var copy=document.getElementById("copyCodeBtn");if(copy)copy.addEventListener("click",function(){var value=document.getElementById("extractCode").textContent;if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(value).then(function(){window.toast("已复制提取码");},function(){fallbackCopy(value);});}else{fallbackCopy(value);}});\n' +
        '})();</script>\n' + umamiSnippet() + '</body>\n</html>\n';
}

function generateDetailPages(games, gameIconIds) {
    const dir = path.join(OUT, 'g');
    fs.mkdirSync(dir, { recursive: true });
    games.forEach(function (game) {
        fs.writeFileSync(path.join(dir, 's' + game.id + '.html'), detailPageHtml(game, gameIconIds));
    });
}

function main() {
    const games = readGames();
    const gameIconIds = readGameIconIds();
    copySite();
    const indexUrl = writeGamesIndex(games);
    generateDetailPages(games, gameIconIds);
    console.log('built _site OK: ' + games.length + ' detail pages, homepage index ' + indexUrl +
        (UMAMI_WEBSITE_ID ? ', umami ' + UMAMI_WEBSITE_ID : ', analytics off (UMAMI_WEBSITE_ID 未填)'));
}

main();
