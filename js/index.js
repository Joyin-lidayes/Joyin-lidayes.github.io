document.onkeydown = function(e) { // 回车提交表单
    // 兼容FF和IE和Opera
    var theEvent = window.event || e;
    var code = theEvent.keyCode || theEvent.which || theEvent.charCode;
    if (code == 13) {
        searchGameByName();
    }
}

function copyTxt(text) {
    if (typeof document.execCommand !== "function") {
        alert("复制失败，请长按复制");
        return;
    }
    var dom = document.createElement("textarea");
    dom.value = text;
    dom.setAttribute('style', 'display: block;width: 1px;height: 1px;');
    document.body.appendChild(dom);
    dom.select();
    var result = document.execCommand('copy');
    document.body.removeChild(dom);
    if (result) {
        return;
    }
    if (typeof document.createRange !== "function") {
        alert("复制失败，请长按复制");
        return;
    }
    var range = document.createRange();
    var div = document.createElement('div');
    div.innerHTML = text;
    div.setAttribute('style', 'height: 1px;fontSize: 1px;overflow: hidden;');
    document.body.appendChild(div);
    range.selectNode(div);
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        selection.removeAllRanges();
    }
    selection.addRange(range);
    document.execCommand('copy');
}
//隐藏捐赠名单
function hideIt() {
    var donation = document.getElementById("donation");
    donation.style.display = "none";
    var hr = document.getElementById("hr");
    hr.style.display = "none";

}

function closegg() {
    var gg = document.getElementById("gg");
    gg.style.display = "none";

}

/**
 * 随机生成在游戏目录区间的随机数
 * @param  randomList  最随机数列表，默认0
 * @param  item        产生随机数数目
 * @return None        返回的结果
 */

function randomGame() {
    item = 20;
    randomIt = [];
    for (var i = 0; i < item; i++) {
        temp = allGame[randomRange()];
        randomIt.push(temp);
    }
    setUI(randomIt);
}
// 添加游戏
function setUI(res) {
    if (document.getElementById("game")) {
        document.getElementById("game").remove();
    }
    if (document.getElementById("foot")) {
        document.getElementById("foot").remove();
    }
    var bodyFa = document.getElementById("showGame"); //通过id号获取frameLi 的父类
    if (res.length == 0) {
        var foot = document.createElement("h3");
        foot.setAttribute("id", "foot");
        bodyFa.appendChild(foot);
        foot.innerHTML = "搜索的游戏好特殊<br>反馈给我添加吧！";
    } else {

        var frameUl = document.createElement("ul");
        frameUl.setAttribute("id", "game");
        bodyFa.appendChild(frameUl);
        var gNum = document.createElement("h3");
        gNum.setAttribute("id", "gNum");
        frameUl.appendChild(gNum);
        if (res.length < 300) {
            gNum.innerHTML = "共搜索到" + res.length + "个游戏：";
        } else {
            gNum.innerHTML = "共搜索到" + res.length + "个游戏<br>出于性能原因仅随机展示300个：";
        }
        if (res.length >= 300) {
            res = shuffle(res);
        }
        for (var i = 0; i < res.length; i++) {
            if (i >= 300) {
                break;
            }
            var temp = res[i].split(",");
            var frameLi = document.createElement("li");
            frameLi.setAttribute("class", "gList");
            var gameUrl = document.createElement("a");
            gameUrl.setAttribute("href", temp[2]);
            gameUrl.setAttribute("class", "urla");
            frameLi.appendChild(gameUrl);
            frameUl.appendChild(frameLi);
            gameUrl.innerHTML = temp[1];
        }
        var foot = document.createElement("h3");
        foot.setAttribute("id", "footer");
        frameUl.appendChild(foot);
        foot.innerHTML = "已经到底啦！！";
    }

}

/**
 * 随机生成在游戏目录区间的随机数
 * @param  min=0  最小值，默认0
 * @param  max=allGame.length-1  最大值
 * @return int          返回的结果
 */
function randomRange(min = 0, max = allGame.length - 1) {
    return ~~(Math.random() * (max - min + 1)) + min;
}
// 随机展示函数
function shuffle(arr) {
    for (var i = arr.length - 1; i >= 0; i--) {
        var randomIndex = Math.floor(Math.random() * (i + 1));
        var itemAtIndex = arr[randomIndex];　　　　
        arr[randomIndex] = arr[i];　　　　
        arr[i] = itemAtIndex;
    }　　
    return arr;
}



/**
 * 使用indexof方法实现模糊查询
 * @param  {Array}  list     进行查询的数组
 * @param  {String} keyWord  查询的关键词
 * @return {Array}           查询的结果
 */
function fuzzyQuery(list, keyWord) {
    var arr = [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].indexOf(keyWord) >= 0) {
            arr.push(list[i]);
        }
    }
    return arr;
}

function searchGameByName() {
    var gameName = document.getElementById('gameName').value;
    if (gameName == "") {
        alert("未输入内容！");
    } else {
        var res = fuzzyQuery(allGame, gameName);
        setUI(res);
    }
}