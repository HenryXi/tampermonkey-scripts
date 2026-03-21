// ==UserScript==
// @name         B站课程隐藏购买提醒
// @namespace    https://github.com/HenryXi/tampermonkey-scripts
// @version      1.0.0
// @description  隐藏B站课程播放页的购买提醒弹窗
// @author       HenryXi
// @match        https://www.bilibili.com/cheese/play/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    function removeToast() {
        document.querySelectorAll('.bpx-player-toast-row.bpx-player-toast-unfold').forEach(el => el.remove());
    }

    removeToast();

    new MutationObserver(removeToast).observe(document.body, { childList: true, subtree: true });
})();
