// ==UserScript==
// @name         B站自定义首页
// @namespace    http://tampermonkey.net/
// @version      2024-05-11
// @description  拦截B站推荐API接口，用自定义页面展示视频列表，过滤短视频（小于10分钟），按时长排序
// @author       HenryXi
// @match        https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bilibili.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/js/bootstrap.min.js
// @resource     customCSS https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css
// @grant        GM_addStyle
// @grant        GM_getResourceText
// ==/UserScript==

function formatTime(seconds) {
  var hours = Math.floor(seconds / 3600);
  var minutes = Math.floor((seconds - (hours * 3600)) / 60);
  var remainingSeconds = seconds - (hours * 3600) - (minutes * 60);

  var result = "";
  if (hours > 0) {
    result += hours + ":";
  }
  result += (minutes < 10 ? "0" + minutes : minutes) + ":";
  result += (remainingSeconds < 10 ? "0" + remainingSeconds : remainingSeconds);

  return result;
}

(function() {
    'use strict';

    var newCSS = GM_getResourceText("customCSS");
    GM_addStyle(newCSS);

    var list = JSON.parse(document.body.innerText).data.item;
    list.sort(function(a, b) {
        return b.duration - a.duration;
    });

    document.getElementsByTagName('body')[0].innerHTML = '<div class="container"><div class="row"><div id="content" class="col-lg-12"></div></div></div>';
    for (var i = 0; i < list.length; i++) {
        var cur = list[i];
        if (cur.duration < 600) {
            continue;
        }
        var title = cur.title;
        var duration = cur.duration;
        var uri = cur.uri;
        var view = parseInt(cur.stat.view / 1000) + 'k';
        var like = parseInt(cur.stat.like / 1000) + 'k';
        var danmaku = parseInt(cur.stat.danmaku / 1000) + 'k';
        document.getElementById('content').innerHTML = document.getElementById('content').innerHTML
            + '<span class="list-group-item col-lg-1">' + formatTime(duration) + '</span>'
            + '<span class="list-group-item col-lg-1">' + (view + ',' + like + ',' + danmaku) + '</span>'
            + '<span class="list-group-item col-lg-10">'
            + '<a target="_blank" href="' + uri + '">' + title + '</a></span>';
    }
})();
