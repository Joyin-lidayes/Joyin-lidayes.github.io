#!/usr/bin/env node
/* =========================================================
   拉取 Cloudinary 游戏图标清单，供 build.js 生成详情页分享图。
   必需环境变量：
   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'game-icon-status.json');
const PREFIX = 'jarsite_games_icon/icon_game.';
const GAME_ID_RE = /^[a-f0-9]{16}$/;

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

function required(name, value) {
    if (!value) throw new Error('缺少环境变量：' + name);
    return value;
}

async function requestPage(cursor) {
    const url = new URL('https://api.cloudinary.com/v1_1/' + encodeURIComponent(cloudName) + '/resources/image/upload');
    url.searchParams.set('prefix', PREFIX);
    url.searchParams.set('max_results', '500');
    if (cursor) url.searchParams.set('next_cursor', cursor);

    const auth = Buffer.from(apiKey + ':' + apiSecret).toString('base64');
    const response = await fetch(url, {
        headers: { Authorization: 'Basic ' + auth }
    });
    if (!response.ok) {
        throw new Error('Cloudinary Admin API 请求失败：HTTP ' + response.status + ' ' + response.statusText);
    }
    return response.json();
}

async function main() {
    required('CLOUDINARY_CLOUD_NAME', cloudName);
    required('CLOUDINARY_API_KEY', apiKey);
    required('CLOUDINARY_API_SECRET', apiSecret);

    const iconIds = new Set();
    let cursor = '';
    let pages = 0;

    do {
        const payload = await requestPage(cursor);
        pages += 1;
        (payload.resources || []).forEach(function (resource) {
            const publicId = String(resource.public_id || '');
            if (!publicId.startsWith(PREFIX)) return;
            const id = publicId.slice(PREFIX.length);
            if (GAME_ID_RE.test(id)) iconIds.add(id);
        });
        cursor = payload.next_cursor || '';
    } while (cursor);

    const status = {
        generatedAt: new Date().toISOString(),
        cloudName: cloudName,
        icons: Array.from(iconIds).sort()
    };

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(status, null, 2) + '\n');
    console.log('synced Cloudinary icons: ' + status.icons.length + ' icons from ' + pages + ' page(s)');
}

main().catch(function (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
});
