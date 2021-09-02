document.onkeydown = function(e) { // 回车提交表单
    // 兼容FF和IE和Opera
    var theEvent = window.event || e;
    var code = theEvent.keyCode || theEvent.which || theEvent.charCode;
    if (code == 13) {
        searchGameByName();
    }
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
        if (document.getElementById("game")) {
            document.getElementById("game").remove();
        }
        if (document.getElementById("foot")) {
            document.getElementById("foot").remove();
        }
        var bodyFa = document.getElementById("showGame"); //通过id号获取frameLi 的父类
        var res = fuzzyQuery(allGame, gameName);
        if (res.length == 0) {
            var foot = document.createElement("h3");
            foot.setAttribute("id", "foot");
            bodyFa.appendChild(foot);
            foot.innerHTML = "搜索的游戏好特殊<br>反馈给我添加吧！";
        } else {
            var frameUl = document.createElement("ul");
            frameUl.setAttribute("id", "game");
            bodyFa.appendChild(frameUl);
            for (var i = 0; i < res.length; i++) {
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
            foot.innerHTML = "已经到底了！！";
        }
    }
}