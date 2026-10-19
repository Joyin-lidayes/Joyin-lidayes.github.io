/* =========================================================
   build.js — 构建 GitHub Pages 发布产物
   1) 复制站点全部静态资源到 _site
   2) 依据 games.json 为每个游戏生成一个静态分享页 g/<id>.html
      （把游戏名直接写进 og 标签，供 QQ/微信爬虫生成分享卡片）
   运行：node build.js
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const SITE_URL = 'https://joyin-lidayes.github.io';
const COVER = SITE_URL + '/img/og-image.png';

// 复制整个站点时跳过的目录/文件
const SKIP = new Set(['_site', '.git', '.github', 'node_modules', '.gitignore', 'build.js']);

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c];
    });
}

function copySite() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    for (const entry of fs.readdirSync(ROOT)) {
        if (SKIP.has(entry)) continue;
        fs.cpSync(path.join(ROOT, entry), path.join(OUT, entry), { recursive: true });
    }
    // 发布走 Actions artifact，不会被 Jekyll 二次处理，写入占位更稳
    fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
}

function sharePageHtml(name, id) {
    const title = name + ' - jar游戏小站';
    const desc = '「' + name + '」塞班Java(jar)怀旧手机游戏，点击下载。';
    // 前缀 s 用于避开 Windows 保留设备名（aux/con/nul 等）无法作为文件名的问题
    const url = SITE_URL + '/g/s' + id + '.html';
    const redir = '../html/detail.html?g=' + id;
    return '<!-- 本文件由 build.js 自动生成，请勿手改；改 games.json 后重新构建即可 -->\n' +
        '<!DOCTYPE html>\n' +
        '<html lang="zh-CN">\n' +
        '<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<meta property="og:type" content="website">\n' +
        '<meta property="og:site_name" content="jar游戏小站">\n' +
        '<meta property="og:title" content="' + escapeHtml(title) + '">\n' +
        '<meta property="og:description" content="' + escapeHtml(desc) + '">\n' +
        '<meta property="og:image" content="' + COVER + '">\n' +
        '<meta property="og:url" content="' + url + '">\n' +
        '<title>' + escapeHtml(name) + '</title>\n' +
        '<meta http-equiv="refresh" content="0;url=' + redir + '">\n' +
        '<script>location.replace(' + JSON.stringify(redir) + ');</script>\n' +
        '</head>\n' +
        '<body>\n' +
        '<p style="font-family:sans-serif;padding:20px;">正在打开游戏下载页… <a href="' + redir + '">若无跳转请点这里</a></p>\n' +
        '</body>\n' +
        '</html>\n';
}

function generateSharePages() {
    // 兼容编辑器意外写入的 UTF-8 BOM，避免 JSON.parse 构建失败。
    const gamesText = fs.readFileSync(path.join(ROOT, 'games.json'), 'utf8').replace(/^\uFEFF/, '');
    const games = JSON.parse(gamesText);
    if (!Array.isArray(games) || games.length === 0) {
        throw new Error('games.json 为空或格式不正确');
    }
    const dir = path.join(OUT, 'g');
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        const name = Array.isArray(game) ? ((game && game[0]) || '') : ((game && game.name) || '');
        const id = i.toString(36);
        fs.writeFileSync(path.join(dir, 's' + id + '.html'), sharePageHtml(name, id));
    }
    return games.length;
}

function main() {
    copySite();
    const n = generateSharePages();
    console.log('built _site OK, generated ' + n + ' share pages');
}

main();