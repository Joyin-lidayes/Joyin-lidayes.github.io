$(document).ready(
    function() {
        $(".gList a").click(
            function() {
                var gname = $(this).attr("gname");
                var gsrc = $(this).attr("gsrc");
                $.session.set("gname", gname);
                $.session.set("gsrc", gsrc);
            });
    });