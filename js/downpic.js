function save(payId) {
    var img = document.getElementById(payId);
    var show = document.getElementById("paypic");
    imgsrc = img.getAttribute("src");
    show.setAttribute("src", imgsrc);
    var bigpic = document.getElementById("bigpic");
    bigpic.style.display = "block";
}

function closePage() {
    var show = document.getElementById("paypic");
    bigpic.style.display = "none";
}