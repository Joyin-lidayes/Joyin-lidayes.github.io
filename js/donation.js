/* =========================================================
   jar 游戏小站 · 捐赠页二维码大图预览（原生 JS）
   ========================================================= */
(function () {
    'use strict';

    var bigpic = document.getElementById('bigpic');
    var paypic = document.getElementById('paypic');
    var alipay = document.getElementById('alipay');
    var wechat = document.getElementById('wechat');

    function show(id) {
        var img = document.getElementById(id);
        if (!img || !paypic || !bigpic) return;
        paypic.src = img.src;
        paypic.alt = img.alt;
        bigpic.classList.add('open');
    }

    if (alipay) alipay.addEventListener('click', function () { show('alipay'); });
    if (wechat) wechat.addEventListener('click', function () { show('wechat'); });
    if (bigpic) bigpic.addEventListener('click', function () { bigpic.classList.remove('open'); });
})();
