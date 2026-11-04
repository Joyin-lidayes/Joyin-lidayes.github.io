/* =========================================================
   jar 游戏小站 · 捐赠页二维码大图预览（原生 JS）
   ========================================================= */
(function () {
    'use strict';

    var bigpic = document.getElementById('bigpic');
    var paypic = document.getElementById('paypic');
    var alipay = document.getElementById('alipay');
    var wechat = document.getElementById('wechat');

    // 统计事件：Umami 未加载（被广告拦截器挡掉或加载失败）时静默跳过，绝不影响页面功能。
    function track(name, data) {
        try {
            if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data);
        } catch (e) { /* ignore */ }
    }

    function show(id, channel) {
        var img = document.getElementById(id);
        if (!img || !paypic || !bigpic) return;
        paypic.src = img.src;
        paypic.alt = img.alt;
        bigpic.classList.add('open');
        // 只在二维码真的打开后上报，避免元素缺失时产生假点击。
        // 语义是“捐赠意向”（打开收款码），不等于实际到账。
        track('捐赠', { channel: channel });
    }

    if (alipay) alipay.addEventListener('click', function () { show('alipay', '支付宝'); });
    if (wechat) wechat.addEventListener('click', function () { show('wechat', '微信'); });
    if (bigpic) bigpic.addEventListener('click', function () { bigpic.classList.remove('open'); });
})();
