#!/usr/bin/env node
/* =========================================================
   scripts/download-cheerpj.js — 下载 CheerpJ 运行时到 emulator/cj/
   用于「自托管」：让 CheerpJ 全部文件走你自己的源（GitHub Pages），
   从而支持浏览器 HTTP 缓存 + Range，彻底摆脱海外 CDN 的串行往返。

   用法：node scripts/download-cheerpj.js
   说明：下载完成后需把 emulator/cj/ 提交到 git，构建/部署时一起发布。
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

// CheerpJ 运行时基地址（版本锁死在 URL 里）
const BASE = 'https://cjrtnc.leaningtech.com/20260317_2978';
const OUT = path.resolve(__dirname, '..', 'emulator', 'cj');

// 自托管所需的全部文件（Java 8 运行时，freej2me 即 Java 8）
const FILES = [
    'loader.js',
    'cj3.js',
    'cj3.wasm',
    'cj3n8.wasm',
    'cheerpOS.js',
    'c.html',
    'c.js',
    'cheerpj.css',
    // Java 8 运行时 classpath 里的 jar
    '8/jre/lib/rt.jar',
    '8/jre/lib/cheerpj-awt.jar',
    '8/jre/lib/jsse.jar',
    '8/jre/lib/jce.jar',
    '8/jre/lib/charsets.jar',
    '8/jre/lib/resources.jar',
    '8/jre/lib/javaws.jar',
    // 系统文件（时区 / 用户库 / Java 扩展目录元数据）
    'etc/users',
    'etc/localtime',
    '8/lib/ext/meta-index',
];

async function download(rel) {
    const url = BASE + '/' + rel;
    const dest = path.join(OUT, rel);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error('HTTP ' + res.status);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return buf.length;
}

async function main() {
    let okCount = 0;
    let failCount = 0;
    let totalBytes = 0;

    for (const rel of FILES) {
        const dest = path.join(OUT, rel);
        if (fs.existsSync(dest)) {
            console.log('  - ' + rel + '  (已存在，跳过)');
            okCount++;
            continue;
        }
        try {
            const size = await download(rel);
            totalBytes += size;
            okCount++;
            console.log('  \u2713 ' + rel + '  (' + (size / 1024).toFixed(1) + ' kB)');
        } catch (e) {
            failCount++;
            console.error('  \u2717 ' + rel + '  (' + e.message + ')');
        }
    }

    console.log('');
    console.log('完成：成功 ' + okCount + ' / ' + FILES.length +
        '，合计 ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MB');
    console.log('保存位置：' + OUT);
    if (failCount > 0) {
        console.error('警告：有 ' + failCount + ' 个文件下载失败，请检查网络后重试');
        process.exitCode = 1;
    }
}

main();
