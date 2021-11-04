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

function search() {
    let arr = [];

    let keyWord = $("#gameName").val();
    if (keyWord == "") alert("未输入内容");
    else {
        for (var i = 0; i < allGame.length; i++) {
            if (allGame[i].indexOf(keyWord) >= 0) {
                arr.push(allGame[i]);
            }
        }
        setUI(arr);
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
        alert("QQ群号已复制入剪切板！");
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


function fuzzyQuery(list, keyWord) {
    var arr = [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].indexOf(keyWord) >= 0) {
            arr.push(list[i]);
        }
    }
    return arr;
}

function setUI(arr) {
    let appenditem = "";
    let gname = "";
    let gsrc = "";
    $.session.set("sessionGameListStr", JSON.stringify(arr));
    $("#setGame").remove();
    $("#showGame").append("<ul id='setGame'></ul>");
    if (arr.length == 0) {
        appenditem = "<h3 id='foot'>搜索的游戏好特殊<br>反馈给我添加吧！</h3>";
        $("#setGame").append(appenditem);
    } else {
        appenditem = "<h3 id='gNum'>共搜索到" + arr.length + "个游戏：</h3>"
        $("#setGame").append(appenditem);
        for (let i = 0; i < arr.length; i++) {
            let temp = arr[i].split(",");
            gname = temp[0];
            gsrc = temp[1];
            appenditem = "<li class='gList'><a class='urla' href='" + gsrc + "'>" + gname + "</a></li>";
            $("#setGame").append(appenditem);
        }
        appenditem = "<h3 id='footer'>已经到底啦！！</h3>";
        $("#setGame").append(appenditem);
    }
}

$(document).keypress(
    function(event) {
        if (event.keyCode == 13) {
            search();
        }
    }
);


$(document).ready(
    function() {



        if ($.session.get("firstEnterPage") == null) {
            $("#gg").css("display", "block");
        }
        if ($.session.get("sessionGameListStr") != null) {
            var sessionGameList = JSON.parse($.session.get("sessionGameListStr"));
            setUI(sessionGameList);
        }

        $("#upup").click(
            function() {
                scrollTo(0, 0);
            }
        );

        $(window).scroll(
            function() {
                if ($(this).scrollTop() > 100) $("#upup").fadeIn(300);
                else $("#upup").fadeOut(300);

            }
        );

        $(".allGame").click(
            function() {
                setUI(allGame);
            }
        );

        $("#x").click(
            function() {
                $("#donation").fadeOut(300);
                $("#hr").fadeOut(300);
            }
        );

        $(".closegg").click(
            function() {
                $.session.set("firstEnterPage", "ok");
                $("#gg").fadeOut(300);
            }
        );

        $(".search").click(
            function() {
                search();
            }
        );

        $(".classGame").click(
            function() {
                item = 20;
                randomIt = [];
                for (var i = 0; i < item; i++) {
                    temp = allGame[randomRange()];
                    randomIt.push(temp);
                }
                setUI(randomIt);
            }
        );

        $("#QQqun").click(
            function() {
                copyTxt("580458820");
            }
        );
    }
);