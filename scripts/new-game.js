#!/usr/bin/env node
/* =========================================================
   scripts/new-game.js — 创建新游戏记录的 JSON 模板
   用法：node scripts/new-game.js "游戏名称" "下载链接"
   ========================================================= */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GAMES_FILE = path.join(ROOT, 'games.json');
const ID_RE = /^[a-f0-9]{16}$/;

function loadUsedIds() {
    const text = fs.readFileSync(GAMES_FILE, 'utf8').replace(/^\uFEFF/, '');
    const games = JSON.parse(text);
    if (!Array.isArray(games)) throw new Error('games.json 必须是数组');

    const usedIds = new Set();
    games.forEach(function (game, index) {
        if (!game || Array.isArray(game) || typeof game !== 'object' || !ID_RE.test(game.id || '')) {
            throw new Error('games.json 第 ' + (index + 1) + ' 条缺少合法 id；请先运行迁移并修复数据');
        }
        if (usedIds.has(game.id)) throw new Error('games.json 中存在重复 id：' + game.id);
        usedIds.add(game.id);
    });
    return usedIds;
}

function createId(usedIds) {
    let id;
    do {
        id = crypto.randomBytes(8).toString('hex');
    } while (usedIds.has(id));
    return id;
}

function main() {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('用法：node scripts/new-game.js "游戏名称" "下载链接"');
        process.exitCode = 1;
        return;
    }

    const name = args[0].trim();
    const url = args[1].trim();
    if (!name || !url) {
        console.error('游戏名称和下载链接均不能为空');
        process.exitCode = 1;
        return;
    }

    const game = { id: createId(loadUsedIds()), name: name, url: url };
    console.log(JSON.stringify(game, null, 4) + ',');
    console.error('请将以上对象添加到 games.json；生成后的 id 不要修改或重新生成。');
}

main();
