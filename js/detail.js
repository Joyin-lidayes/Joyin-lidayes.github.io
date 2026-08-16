/* =========================================================
   jar 游戏小站 · 游戏详情页（原生 JS）
   从 session 读取 gname / gsrc，填充标题与下载链接
   ========================================================= */
(function () {
    'use strict';

    var name = window.store.get('gname');
    var src = window.store.get('gsrc');

    var titleEl = document.getElementById('gameTitle');
    var download = document.getElementById('download');
    var img = document.getElementById('gameImg');
    var intro = document.getElementById('intro');

    if (name && src) {
        document.title = name + ' - 游戏详情';
        if (titleEl) titleEl.textContent = name;
        if (download) {
            download.href = src;
            download.textContent = '点击下载';
        }
        if (img) img.alt = name;
    } else {
        document.title = '游戏详情';
        if (titleEl) titleEl.textContent = '出错了';
        if (intro) intro.textContent = '未找到游戏信息，请返回首页重新选择游戏。';
        if (download) {
            download.removeAttribute('href');
            download.textContent = '暂无下载链接';
        }
    }
})();
