// note that we can only call java stuff if thread not running..
const cheerpjWebRoot = '/app'+location.pathname.replace(/\/$/,'');

const emptyIcon = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

let lib = null, launcherUtil = null;
let state = {
    games: [],
    currentGame: null,
    editedGameId: null,
    uploadedJars: 0,
};
let defaultSettings = {};

const BOOT_FLAG = 'jarSite:emulatorBooted';

function isFirstLoad() {
    try { return !window.localStorage.getItem(BOOT_FLAG); } catch (e) { return true; }
}
function markBooted() {
    try { window.localStorage.setItem(BOOT_FLAG, '1'); } catch (e) { /* ignore */ }
}
function setLoading(t) {
    const el = document.getElementById('loadingText');
    if (el) el.textContent = t;
}
function setLoadingHint(first) {
    const el = document.getElementById('loadingHint');
    if (el) el.textContent = first
        ? '首次加载需要下载模拟器核心，请耐心等待'
        : '模拟器核心已缓存，正在启动';
}
function showBusy(t) {
    const text = document.getElementById('busyText');
    if (text) text.textContent = t;
    const overlay = document.getElementById('busy-overlay');
    if (overlay) overlay.style.display = 'flex';
}
function hideBusy() {
    const overlay = document.getElementById('busy-overlay');
    if (overlay) overlay.style.display = 'none';
}

let progVal = 0, progGoal = 0, progTimer = null;
function renderProgress() {
    const fill = document.getElementById('loadingBarFill');
    if (fill) fill.style.width = progVal.toFixed(0) + '%';
    const pct = document.getElementById('loadingPct');
    if (pct) pct.textContent = Math.round(progVal) + '%';
}
function setProgress(goal) {
    if (goal > progGoal) progGoal = goal;
    if (progTimer) return;
    progTimer = setInterval(function () {
        if (progVal < progGoal) {
            progVal += Math.max(0.08, (progGoal - progVal) * 0.015);
            if (progVal > progGoal) progVal = progGoal;
            renderProgress();
        }
        if (progVal >= 100) {
            clearInterval(progTimer);
            progTimer = null;
        }
    }, 100);
}
function finishProgress() {
    if (progTimer) { clearInterval(progTimer); progTimer = null; }
    progGoal = 100;
    progVal = 100;
    renderProgress();
}

async function main() {
    setLoadingHint(isFirstLoad());
    setLoading('正在初始化模拟器…');
    setProgress(88);

    await cheerpjInit({
        enableDebug: false
    });
    setProgress(90);

    setLoading('正在加载模拟器核心…');
    lib = await cheerpjRunLibrary(cheerpjWebRoot+"/freej2me-web.jar");
    markBooted();
    setProgress(96);

    setLoading('正在准备游戏列表…');
    launcherUtil = await lib.pl.zb3.freej2me.launcher.LauncherUtil;

    await launcherUtil.resetTmpDir();

    const Config = await lib.org.recompile.freej2me.Config;
    await javaToKv(Config.DEFAULT_SETTINGS, defaultSettings);

    await reloadUI();

    finishProgress();
    document.getElementById("loading").style.display = "none";
    document.getElementById("main").style.display = "";
    // 加载完成后关闭使用步骤（仅初始化阶段显示）
    const steps = document.querySelector('.steps');
    if (steps) steps.style.display = 'none';

    document.getElementById("clear-current").onclick = setupAddMode;

    document.getElementById("import-data-btn").addEventListener("click", () => {
        document.getElementById("import-data-file").click();
    });

    document.getElementById("import-data-file").onchange = doImportData;
    document.getElementById("export-data-btn").onclick = doExportData;
    document.getElementById("reset-data-btn").onclick = doResetData;
}

async function maybeReadCheerpJFileText(path) {
    const blob = await cjFileBlob(path);
    if (blob) {
        return await blob.text();
    }
}

async function getDataUrlFromBlob(blob) {
    const reader = new FileReader();

    const promise = new Promise((r) => {
        reader.onload = function () {
            r(reader.result);
        };
    });

    reader.readAsDataURL(blob);
    return await promise;
}

function readToKv(txt, kv) {
    for (const line of txt.trim().split("\n")) {
        const parts = line.split(/\s*:\s*/);
        if (parts.length == 2) {
            kv[parts[0]] = parts[1];
        }
    }
}

async function javaToKv(hashMap, kv) {
    const es = await hashMap.entrySet();
    const esi = await es.iterator();

    while (await esi.hasNext()) {
        const entry = await esi.next();
        const key = await entry.getKey();
        const value = await entry.getValue();

        kv[key] = value;
    }
}

async function kvToJava(kv) {
    const HashMap = await lib.java.util.HashMap;
    const ret = await new HashMap();

    for (const k of Object.keys(kv)) {
        await ret.put(k, kv[k]);
    }

    return ret;
}

async function loadGames() {
    const apps = [];

    let installedAppsBlob = await cjFileBlob("/files/apps.list");
    if (!installedAppsBlob) {
        const res = await fetch("init.zip");
        const ab = await res.arrayBuffer();
        await launcherUtil.importData(new Int8Array(ab));

        installedAppsBlob = await cjFileBlob("/files/apps.list");
    }

    if (installedAppsBlob) {
        const installedIds = (await installedAppsBlob.text()).trim().split("\n").filter(id => id.trim());

        for (const appId of installedIds) {
            const napp = {
                appId,
                name: appId,
                icon: emptyIcon,
                settings: { ...defaultSettings },
                appProperties: {},
                systemProperties: {},
            };

            const name = await maybeReadCheerpJFileText("/files/" + appId + "/name");
            if (name) napp.name = name;

            const iconBlob = await cjFileBlob("/files/" + appId + "/icon");
            if (iconBlob) {
                const dataUrl = await getDataUrlFromBlob(iconBlob);
                if (dataUrl) {
                    napp.icon = dataUrl;
                }
            }

            for (const [fname, keyName] of [
                ["/files/" + appId + "/config/settings.conf", "settings"],
                ["/files/" + appId + "/config/appproperties.conf", "appProperties"],
                ["/files/" + appId + "/config/systemproperties.conf", "systemProperties"],
            ]) {
                const content = await maybeReadCheerpJFileText(fname);
                if (content) {
                    readToKv(content, napp[keyName]);
                }
            }

            apps.push(napp);
        }
    }

    return apps;
}

/* ---------- 机型 / 屏幕 / 字体 / 渲染格式选项 ---------- */
const PHONE_TYPES = [
    ['Standard', '标准'], ['Nokia', '诺基亚'], ['Motorola', '摩托罗拉'],
    ['Siemens', '西门子'], ['SonyEricsson', '索尼爱立信']
];
const SCREEN_SIZES = ['96x65', '96x96', '104x80', '128x128', '132x176', '128x160',
    '176x208', '176x220', '208x208', '240x320', '320x240', '240x400',
    '352x416', '360x640', '640x360', '480x800', '800x480'];
const FONT_SIZES = [['0', '动态'], ['1', '小'], ['2', '中'], ['3', '大']];
const DG_FORMATS = [['444', '444 RGB'], ['4444', '4444 ARGB'], ['565', '565 ARGB'],
    ['888', '888 ARGB'], ['8888', '8888 ARGB']];

function optionsHtml(pairs) {
    return pairs.map(function (p) {
        return '<option value="' + p[0] + '">' + p[1] + '</option>';
    }).join('');
}

function screenOptionsHtml() {
    return SCREEN_SIZES.map(function (s) {
        return '<option value="' + s + '">' + s + '</option>';
    }).join('') + '<option value="custom">自定义</option>';
}

// 行内编辑面板模板（与“添加游戏”共用同一套 class，样式自动复用）
function editFormHtml() {
    return '' +
        '<div class="preview-container">' +
            '<img class="preview-icon" alt="游戏图标" />' +
            '<span class="preview-name"></span>' +
            '<div class="manage-controls">' +
                '<button type="button" class="control-button warning-button js-wipe" title="清空游戏存档">清空存档</button>' +
                '<button type="button" class="control-button danger-button js-uninstall" title="卸载游戏">卸载</button>' +
            '</div>' +
        '</div>' +
        '<div class="settings-container">' +
            '<div class="aux-file-upload">' +
                '<div class="aux-file-upload-btn">上传可选 JAD 描述文件</div>' +
                '<input type="file" class="js-jad" accept=".jad" />' +
            '</div>' +
            '<div class="settings-grid">' +
                '<div class="form-group"><label>机型：</label><select class="js-phone">' + optionsHtml(PHONE_TYPES) + '</select></div>' +
                '<div class="form-group"><label>屏幕尺寸：</label><select class="js-screen">' + screenOptionsHtml() + '</select>' +
                    '<div class="custom-size-inputs js-custom-size" style="display: none">' +
                        '<input type="number" class="js-width" placeholder="宽" min="1" />' +
                        '<input type="number" class="js-height" placeholder="高" min="1" />' +
                    '</div>' +
                '</div>' +
                '<div class="form-group"><label>字体大小：</label><select class="js-font">' + optionsHtml(FONT_SIZES) + '</select></div>' +
                '<div class="form-group"><label>DirectGraphics 原生格式：</label><select class="js-dg">' + optionsHtml(DG_FORMATS) + '</select></div>' +
                '<label class="checkbox"><input type="checkbox" class="js-sound" /> 开启声音</label>' +
                '<label class="checkbox"><input type="checkbox" class="js-rotate" /> 旋转屏幕</label>' +
                '<label class="checkbox"><input type="checkbox" class="js-fullscreen" /> 强制全屏</label>' +
                '<label class="checkbox"><input type="checkbox" class="js-texfilter" /> 关闭纹理过滤</label>' +
                '<label class="checkbox"><input type="checkbox" class="js-queued" /> 排队绘制（游戏卡死时有用）</label>' +
            '</div>' +
            '<details class="advanced-settings">' +
                '<summary><h3>高级设置</h3></summary>' +
                '<div class="form-group"><label>附加应用属性：</label><textarea class="js-appprops" placeholder="例如：key: value，每行一个"></textarea></div>' +
                '<div class="form-group"><label>附加系统属性：</label><textarea class="js-sysprops" placeholder="例如：key: value，每行一个"></textarea></div>' +
            '</details>' +
        '</div>' +
        '<button type="button" class="save-button js-save">保存游戏</button>';
}

// 触摸设备判定：用于给 run 页追加 mobile=1（显示虚拟按键），并与桌面端统一为「新窗口打开」。
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

function fillGamesList(games) {
    const container = document.getElementById("game-list");
    container.innerHTML = "";

    for (const game of games) {
        const entry = document.createElement("div");
        entry.className = "game-entry";
        entry.__game = game;

        const item = document.createElement("div");
        item.className = "game-item";

        const valid = !!game.appId;
        const link = document.createElement("a");
        if (valid) {
            link.href = "run.html?app=" + game.appId + (isTouchDevice ? "&mobile=1" : "");
            // 电脑端与手机端统一：都开新窗口（run 页可 window.close() 关闭）；手机端带上 mobile=1 显示虚拟按键。
            link.addEventListener('click', e => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                // 持久化 appId：run.html 优先读 URL 参数，缺失时从这里兜底
                try { localStorage.setItem('jarSite:runApp', game.appId); } catch (err) {}
                e.preventDefault();
                const w = window.open(link.href, '_blank');
                if (!w) location.href = link.href; // 弹窗被拦截时退化为同页跳转
            });
        } else {
            link.href = "#";
            link.classList.add("is-invalid");
            link.title = "该游戏数据异常，请删除后重新上传";
            link.addEventListener('click', e => {
                e.preventDefault();
                if (window.toast) window.toast("该游戏数据异常，请点击「管理」删除后重新上传");
            });
        }

        const icon = document.createElement("img");
        icon.className = "icon";
        icon.src = game.icon;
        link.appendChild(icon);

        const info = document.createElement("div");
        info.className = "game-info";
        info.textContent = game.name;
        link.appendChild(info);

        item.appendChild(link);

        const manageButton = document.createElement("button");
        manageButton.type = "button";
        manageButton.textContent = "管理";
        manageButton.onclick = () => handleManageClick(entry, game);
        item.appendChild(manageButton);

        entry.appendChild(item);

        const panel = document.createElement("div");
        panel.className = "game-edit-panel";
        panel.hidden = true;
        panel.innerHTML = editFormHtml();
        wireEditPanel(panel, game);
        entry.appendChild(panel);

        container.appendChild(entry);
    }
}

function wireEditPanel(panel, game) {
    const saveBtn = panel.querySelector('.js-save');
    saveBtn.onclick = () => saveEditGame(game, panel, saveBtn);

    panel.querySelector('.js-wipe').onclick = () => {
        if (!confirm("确定要清空「" + game.name + "」的存档吗？")) return;
        const btn = panel.querySelector('.js-wipe');
        btn.disabled = true;
        doWipeData(game.appId).finally(() => { btn.disabled = false; });
    };

    panel.querySelector('.js-uninstall').onclick = async () => {
        if (!confirm("确定要卸载「" + game.name + "」吗？")) return;
        const btn = panel.querySelector('.js-uninstall');
        btn.disabled = true;
        btn.textContent = "正在卸载…";
        try {
            await doUninstallGame(game.appId);
        } catch (error) {
            console.error("Error uninstalling game:", error);
            btn.disabled = false;
            btn.textContent = "卸载";
            if (window.toast) window.toast("卸载失败，请重试");
            else alert("卸载失败，请重试");
        }
    };

    panel.querySelector('.js-jad').onchange = (e) => handleInlineJad(panel, game, e);
    panel.querySelector('.js-screen').onchange = () => toggleCustomSize(panel);
}

function handleManageClick(entry, game) {
    const panel = entry.querySelector('.game-edit-panel');
    if (!panel) return;

    // 再次点击「管理」：收回（无论是否保存，都会关闭）
    if (!panel.hidden) {
        closeOpenEditPanel();
        return;
    }

    closeOpenEditPanel();
    panel.hidden = false;
    populateEditForm(panel, game);
}

function closeOpenEditPanel() {
    const open = document.querySelector('.game-edit-panel:not([hidden])');
    if (!open) return;
    const entry = open.closest('.game-entry');
    const game = entry ? entry.__game : null;
    if (!game) {
        open.hidden = true;
        return;
    }
    if (confirm("是否保存对「" + game.name + "」的修改？")) {
        saveEditGame(game, open, open.querySelector('.js-save'));
    } else {
        open.hidden = true;
    }
}

function populateEditForm(panel, game) {
    panel.querySelector('.preview-icon').src = game.icon || emptyIcon;
    panel.querySelector('.preview-name').textContent = game.name;

    panel.querySelector('.js-phone').value = game.settings.phone || '';

    const sizeStr = (game.settings.width || '') + 'x' + (game.settings.height || '');
    const screenSel = panel.querySelector('.js-screen');
    const hasSize = Array.prototype.some.call(screenSel.options, function (o) { return o.value === sizeStr; });
    screenSel.value = hasSize ? sizeStr : 'custom';
    panel.querySelector('.js-width').value = game.settings.width || '';
    panel.querySelector('.js-height').value = game.settings.height || '';

    if (game.settings.fontSize) panel.querySelector('.js-font').value = game.settings.fontSize;
    if (game.settings.dgFormat) panel.querySelector('.js-dg').value = game.settings.dgFormat;

    panel.querySelector('.js-sound').checked = game.settings.sound === 'on';
    panel.querySelector('.js-rotate').checked = game.settings.rotate === 'on';
    panel.querySelector('.js-fullscreen').checked = game.settings.forceFullscreen === 'on';
    panel.querySelector('.js-texfilter').checked = game.settings.textureDisableFilter === 'on';
    panel.querySelector('.js-queued').checked = game.settings.queuedPaint === 'on';

    panel.querySelector('.js-appprops').value = Object.entries(game.appProperties || {})
        .map(([k, v]) => `${k}: ${v}`).join('\n');
    panel.querySelector('.js-sysprops').value = Object.entries(game.systemProperties || {})
        .map(([k, v]) => `${k}: ${v}`).join('\n');

    panel.querySelector('.js-jad').value = null;
    toggleCustomSize(panel);
}

function toggleCustomSize(panel) {
    const custom = panel.querySelector('.js-custom-size');
    if (custom) custom.style.display = panel.querySelector('.js-screen').value === 'custom' ? '' : 'none';
}

function handleInlineJad(panel, game, e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        readToKv(reader.result, game.appProperties);
        panel.querySelector('.js-appprops').value = Object.entries(game.appProperties || {})
            .map(([k, v]) => `${k}: ${v}`).join('\n');
    };
    reader.readAsText(file);
}

function readEditForm(panel, game) {
    game.settings.phone = panel.querySelector('.js-phone').value;

    const screenSize = panel.querySelector('.js-screen').value;
    if (screenSize === 'custom') {
        game.settings.width = panel.querySelector('.js-width').value;
        game.settings.height = panel.querySelector('.js-height').value;
    } else {
        const parts = screenSize.split('x');
        game.settings.width = parts[0];
        game.settings.height = parts[1];
    }

    game.settings.fontSize = panel.querySelector('.js-font').value;
    game.settings.dgFormat = panel.querySelector('.js-dg').value;

    game.settings.sound = panel.querySelector('.js-sound').checked ? 'on' : 'off';
    game.settings.rotate = panel.querySelector('.js-rotate').checked ? 'on' : 'off';
    game.settings.forceFullscreen = panel.querySelector('.js-fullscreen').checked ? 'on' : 'off';
    game.settings.textureDisableFilter = panel.querySelector('.js-texfilter').checked ? 'on' : 'off';
    game.settings.queuedPaint = panel.querySelector('.js-queued').checked ? 'on' : 'off';

    readToKv(panel.querySelector('.js-appprops').value, game.appProperties);
    readToKv(panel.querySelector('.js-sysprops').value, game.systemProperties);
}

async function saveEditGame(game, panel, saveBtn) {
    saveBtn.disabled = true;
    try {
        readEditForm(panel, game);

        const jsettings = await kvToJava(game.settings);
        const jappProps = await kvToJava(game.appProperties);
        const jsysProps = await kvToJava(game.systemProperties);

        await launcherUtil.saveApp(game.appId, jsettings, jappProps, jsysProps);
        panel.hidden = true;
        if (window.toast) window.toast("已保存");
        else alert("已保存");
    } catch (error) {
        console.error("Error saving game:", error);
        const msg = "保存失败：可能是浏览器存储空间不足，请先卸载不玩的游戏，或用「导出数据」备份后清理浏览器数据";
        if (window.toast) window.toast(msg);
        else alert(msg);
    } finally {
        saveBtn.disabled = false;
    }
}

function setupAddMode() {
    if (!confirmDiscard()) {
        return;
    }
    state.currentGame = {
        icon: emptyIcon,
        settings: { ...defaultSettings },
        appProperties: {},
        systemProperties: {},
    };

    document.getElementById("add-edit-text").textContent = "添加游戏";

    document.getElementById("file-input-step").style.display = "";
    document.getElementById("file-input-loading").style.display = "none";
    document.getElementById("file-input-jad-step").style.display = "none";
    document.getElementById("add-manage-step").style.display = "none";

    document.getElementById("game-file-input").disabled = false;
    document.getElementById("game-file-input").value = null;

    document.getElementById("game-file-input").onchange = (e) => {
        // read file to arraybuffer
        const file = e.target.files[0];
        if (file) {
            document.getElementById("game-file-input").disabled = true;
            document.getElementById("file-input-step").style.display = "none";
            document.getElementById("file-input-loading").style.display = "";

            const reader = new FileReader();
            reader.onload = async () => {
                const arrayBuffer = reader.result;
                await processGameFile(arrayBuffer, file.name);
            };
            reader.readAsArrayBuffer(file);
        }
    };
}

async function processGameFile(fileBuffer, fileName) {
    const MIDletLoader = await lib.org.recompile.mobile.MIDletLoader;
    const File = await lib.java.io.File;

    const jarFile = await new File(
        "/files/_tmp/" + state.uploadedJars++ + ".jar"
    );

    await launcherUtil.copyJar(new Int8Array(fileBuffer), jarFile);
    state.currentGame.jarFile = jarFile;
    state.currentGame.origName = fileName;

    const AnalyserUtil = await lib.pl.zb3.freej2me.launcher.AnalyserUtil;
    const analysisResult = await AnalyserUtil.analyseFile(jarFile, fileName);
    fillGuessedSettings(analysisResult, state.currentGame);

    if (state.lastLoader) {
        await state.lastLoader.close();
    }
    const loader = await MIDletLoader.getMIDletLoader(jarFile);
    state.lastLoader = loader;

    if (!(await loader.getAppId())) {
        document.getElementById("file-input-step").style.display = "";
        document.getElementById("file-input-loading").style.display = "none";
        document.getElementById("file-input-jad-step").style.display = "";
        document.getElementById("upload-descriptor-file-input").value = null;

        document.getElementById("upload-descriptor-file-input").onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById("file-input-step").style.display = "none";
                document.getElementById("file-input-jad-step").style.display = "none";
                document.getElementById("file-input-loading").style.display = "";

                const reader = new FileReader();
                reader.onload = async () => {
                    const arrayBuffer = reader.result;
                    await launcherUtil.augementLoaderWithJAD(
                        loader,
                        new Int8Array(arrayBuffer)
                    );

                    if (await loader.getAppId()) {
                        setupNewGameManage(loader);
                    }
                };
                reader.readAsArrayBuffer(file);
            }
        };

        document.getElementById('continue-without-jad').onclick = () => {
            continueWithoutJAD(loader, fileName);
        };
    } else {
        setupNewGameManage(loader);
    }
}

function fillGuessedSettings(analysisResult, app) {
    if (analysisResult.screenWidth !== -1) {
        app.settings.width = analysisResult.screenWidth + '';
        app.settings.height = analysisResult.screenHeight + '';
    }

    if (analysisResult.phoneType) {
        app.settings.phone = analysisResult.phoneType;
    }
}

async function continueWithoutJAD(loader, origName) {
    // if we're here then need fallback name
    await launcherUtil.ensureAppId(loader, origName);
    loader.name = await loader.getAppId();

    setupNewGameManage(loader);
}

async function setupNewGameManage(loader) {
    state.currentGame.appId = await loader.getAppId();
    state.currentGame.name = loader.name || state.currentGame.appId;
    const iconBytes = await loader.getIconBytes();
    state.currentGame.icon = iconBytes
        ? await getDataUrlFromBlob(new Blob([iconBytes]))
        : emptyIcon;

    await javaToKv(loader.properties, state.currentGame.appProperties);

    setupAddManageGame(state.currentGame, true);
}

async function setupAddManageGame(app, isAdding) {
    document.getElementById("file-input-step").style.display = "none";
    document.getElementById("file-input-jad-step").style.display = "none";
    document.getElementById("file-input-loading").style.display = "none";
    document.getElementById("add-manage-step").style.display = "";

    // 作用域限定在“添加游戏”区，避免命中“我的游戏”行内编辑面板的同名 class
    const preview = document.getElementById("preview");
    const previewIcon = preview.querySelector(".preview-icon");
    previewIcon.src = app.icon || emptyIcon;

    const previewName = preview.querySelector(".preview-name");
    previewName.textContent = app.name;

    const previewControls = document.getElementById("preview-controls");
    previewControls.style.display = isAdding ? "none" : "";
    if (!isAdding) {
        document.getElementById("uninstall-btn").disabled = false;
        document.getElementById("uninstall-btn").onclick = (e) => {
            if (!confirm("确定要卸载「" + app.name + "」吗？")) {
                return;
            }

            document.getElementById("uninstall-btn").disabled = true;
            doUninstallGame(app.appId);
        };

        document.getElementById("wipe-data-btn").disabled = false;
        document.getElementById("wipe-data-btn").onclick = (e) => {
            if (!confirm("确定要清空「" + app.name + "」的存档吗？")) {
                return;
            }

            document.getElementById("wipe-data-btn").disabled = true;
            doWipeData(app.appId);
        };
    }

    const jadFileInput = document.getElementById("aux-jad-file-input");
    jadFileInput.value = null;
    jadFileInput.onchange = handleOptionalJadFileUpload;

    const phoneType = document.getElementById("phoneType");
    phoneType.value = app.settings.phone;

    const screenSize = document.getElementById("screenSize");

    const sizeStr = `${app.settings.width}x${app.settings.height}`;
    if ([...screenSize.options].some((opt) => opt.value === sizeStr)) {
        screenSize.value = sizeStr;
    } else {
        screenSize.value = "custom";
    }
    document.getElementById("customWidth").value = app.settings.width;
    document.getElementById("customHeight").value = app.settings.height;
    screenSize.onchange = adjustScreenSizeInput;
    adjustScreenSizeInput();

    const fontSize = document.getElementById("fontSize");
    if (app.settings.fontSize) {
        fontSize.value = app.settings.fontSize;
    }

    const dgFormat = document.getElementById("dgFormat");
    if (app.settings.dgFormat) {
        dgFormat.value = app.settings.dgFormat;
    }

    document.querySelector('input[name="enableSound"]').checked = app.settings.sound === "on";
    document.querySelector('input[name="rotate"]').checked = app.settings.rotate === "on";
    document.querySelector('input[name="forceFullscreen"]').checked = app.settings.forceFullscreen === "on";
    document.querySelector('input[name="textureDisableFilter"]').checked = app.settings.textureDisableFilter === "on";
    document.querySelector('input[name="queuedPaint"]').checked = app.settings.queuedPaint === "on";

    const appPropsTextarea = document.getElementById("editAppProps");
    appPropsTextarea.value = Object.entries(app.appProperties || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");

    const sysPropsTextarea = document.getElementById("editSysProps");
    sysPropsTextarea.value = Object.entries(app.systemProperties || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");

    document.getElementById("add-save-button").disabled = false;
    document.getElementById("add-save-button").textContent = isAdding ? "添加游戏" : "保存游戏";
    document.getElementById("add-save-button").onclick = doAddSaveGame;
}

function adjustScreenSizeInput() {
    document.getElementById("edit-custom-size-inputs").style.display =
        document.getElementById("screenSize").value === "custom" ? "" : "none";
}

function handleOptionalJadFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById("add-manage-step").style.display = "none";
    document.getElementById("file-input-loading").style.display = "";

    // read as text?
    const reader = new FileReader();
    reader.onload = async () => {
        // this won't affect the name/id
        readToKv(reader.result, state.currentGame.appProperties);

        const appPropsTextarea = document.getElementById("editAppProps");
        appPropsTextarea.value = Object.entries(
            state.currentGame.appProperties || {}
        )
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n");
    };
    reader.onloadend = () => {
        document.getElementById("add-manage-step").style.display = "";
        document.getElementById("file-input-loading").style.display = "none";
    };
    reader.readAsText(file);
}

async function doAddSaveGame() {
    const saveBtn = document.getElementById("add-save-button");
    saveBtn.disabled = true;
    saveBtn.textContent = "正在添加…";

    try {
        readUI(state.currentGame);

        const jsettings = await kvToJava(state.currentGame.settings);
        const jappProps = await kvToJava(state.currentGame.appProperties);
        const jsysProps = await kvToJava(state.currentGame.systemProperties);

        if (state.currentGame.jarFile) {
            // new game
            // 兜底：若 appId 为空（无 manifest 且未走 JAD/续传），用文件名生成，避免写入空 appId 污染 apps.list
            if (!(await state.lastLoader.getAppId())) {
                await launcherUtil.ensureAppId(state.lastLoader, state.currentGame.origName || "game.jar");
                state.currentGame.appId = await state.lastLoader.getAppId();
            }
            await launcherUtil.initApp(
                state.currentGame.jarFile,
                state.lastLoader, // loader with added properties, for name..
                jsettings,
                jappProps,
                jsysProps
            );
        } else {
            await launcherUtil.saveApp(
                state.currentGame.appId,
                jsettings,
                jappProps,
                jsysProps
            );
        }

        await reloadUI();
    } catch (error) {
        console.error("Error saving game:", error);
        var msg = "保存失败：可能是浏览器存储空间不足，请先卸载不玩的游戏，或用「导出数据」备份后清理浏览器数据";
        if (window.toast) window.toast(msg);
        else alert(msg);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "添加游戏";
    }
}

function readUI(targetGameObj) {
    targetGameObj.settings.phone = document.getElementById("phoneType").value;

    const screenSize = document.getElementById("screenSize").value;
    if (screenSize === "custom") {
        targetGameObj.settings.width = document.getElementById("customWidth").value;
        targetGameObj.settings.height = document.getElementById("customHeight").value;
    } else {
        const [width, height] = screenSize.split("x");
        targetGameObj.settings.width = width;
        targetGameObj.settings.height = height;
    }

    targetGameObj.settings.fontSize = document.getElementById("fontSize").value;
    targetGameObj.settings.dgFormat = document.getElementById("dgFormat").value;

    targetGameObj.settings.sound = document.querySelector('input[name="enableSound"]').checked ? "on" : "off";
    targetGameObj.settings.rotate = document.querySelector('input[name="rotate"]').checked ? "on" : "off";
    targetGameObj.settings.forceFullscreen = document.querySelector('input[name="forceFullscreen"]').checked ? "on" : "off";
    targetGameObj.settings.textureDisableFilter = document.querySelector('input[name="textureDisableFilter"]').checked ? "on" : "off";
    targetGameObj.settings.queuedPaint = document.querySelector('input[name="queuedPaint"]').checked ? "on" : "off";

    readToKv(document.getElementById("editAppProps").value, targetGameObj.appProperties);
    readToKv(document.getElementById("editSysProps").value, targetGameObj.systemProperties);
}

function confirmDiscard() {
    if (state.currentGame != null && (state.currentGame.jarFile || state.currentGame.appId)) {
        if (!confirm("放弃当前修改吗？")) {
            return false;
        }
    }

    return true;
}

async function reloadUI() {
    state.currentGame = null;

    state.games = await loadGames();
    fillGamesList(state.games);
    setupAddMode();
}

async function doUninstallGame(appId) {
    await launcherUtil.uninstallApp(appId);
    await reloadUI();
}

async function doWipeData(appId) {
    await launcherUtil.wipeAppData(appId);
    document.getElementById("wipe-data-btn").disabled = false;
}

function doImportData(e) {
    if (e.target.files.length > 0) {
        document.getElementById("import-data-btn").disabled = true;
        showBusy('正在导入数据…');

        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const arrayBuffer = reader.result;
                await launcherUtil.importData(new Int8Array(arrayBuffer));
                await reloadUI();
            } catch (error) {
                console.error("Error importing data:", error);
                if (window.toast) window.toast("导入数据失败，请检查文件是否为之前导出的备份");
                else alert("导入数据失败，请重试");
            } finally {
                document.getElementById("import-data-btn").disabled = false;
                hideBusy();
            }
        };
        reader.onerror = () => {
            document.getElementById("import-data-btn").disabled = false;
            hideBusy();
        };
        reader.readAsArrayBuffer(file);
    }
}

async function doExportData() {
    showBusy('正在导出数据…');
    try {
        const exportedData = await launcherUtil.exportData();
        const blob = new Blob([exportedData.buffer], { type: "application/zip" });

        const objectURL = URL.createObjectURL(blob);
        const downloadLink = document.getElementById("export-data-link");

        downloadLink.href = objectURL;
        downloadLink.click();
        setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
    } catch (error) {
        console.error("Error exporting data:", error);
        if (window.toast) window.toast("导出数据失败，请重试");
        else alert("导出数据失败，请重试");
    } finally {
        hideBusy();
    }
}

async function doResetData() {
    if (!confirm("确定要清空所有游戏与存档吗？此操作不可恢复。")) return;
    showBusy('正在清空所有游戏…');
    try {
        const blob = await cjFileBlob("/files/apps.list");
        if (blob) {
            const ids = (await blob.text()).trim().split("\n").filter(id => id.trim());
            for (const id of ids) {
                await launcherUtil.uninstallApp(id);
            }
        }
        await reloadUI();
        if (window.toast) window.toast("已清空所有游戏");
    } catch (error) {
        console.error("Error resetting data:", error);
        if (window.toast) window.toast("清空失败，请重试");
    } finally {
        hideBusy();
    }
}

main();
