$(document).ready(function() {
    if ($.session.get("gname") && $.session.get("gsrc")) {
        var gname = $(".texts h3").text();
        gname = gname + ":" + $.session.get("gname");
        $(".texts h3").text(gname);
        $(".size h3 a").attr("href", $.session.get("gsrc"));
        $("#detail .img img").attr("alt", $.session.get("gname"));
        // $("#detail .img img").attr("src", "../img/none.png");
        $.session.remove("gname");
        $.session.remove("gsrc");
    } else {
        alert("错误！请退出重试！！");

    }

});