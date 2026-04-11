// ==UserScript==
// @name         B站显示UP主粉丝数
// @namespace    https://github.com/HenryXi/tampermonkey-scripts
// @version      1.2.0
// @description  在B站首页和搜索页每个视频卡片下方显示UP主的粉丝数
// @author       HenryXi
// @match        https://www.bilibili.com/*
// @match        https://bilibili.com/*
// @match        https://search.bilibili.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 只在首页和搜索页运行
    const isHome = location.hostname === 'www.bilibili.com' && location.pathname === '/';
    const isSearch = location.hostname === 'search.bilibili.com';
    if (!isHome && !isSearch) return;

    // mid -> 粉丝数 缓存
    const cache = new Map();

    function formatNumber(n) {
        if (n < 1000) return '0w';
        return (n / 10000).toFixed(1) + 'w';
    }

    function fetchFollowers(mid) {
        return new Promise((resolve, reject) => {
            if (cache.has(mid)) {
                resolve(cache.get(mid));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/relation/stat?vmid=${mid}`,
                headers: {
                    'Referer': `https://space.bilibili.com/${mid}/`
                },
                onload(res) {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (json.code === 0) {
                            const follower = json.data.follower;
                            cache.set(mid, follower);
                            resolve(follower);
                        } else {
                            reject(new Error('API error: ' + json.message));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror(err) {
                    reject(err);
                }
            });
        });
    }

    function processCard(card) {
        if (card.dataset.fansLoaded) return;

        // 首页和搜索页均使用相同的 DOM 结构
        const ownerLink = card.querySelector('a.bili-video-card__info--owner');
        // 卡片还是 skeleton，跳过但不标记，等内容加载后再处理
        if (!ownerLink) return;

        card.dataset.fansLoaded = 'true';

        // href 可能是协议相对 URL（//space.bilibili.com/mid），用 getAttribute 更稳健
        const href = ownerLink.getAttribute('href') || '';
        const mid = href.match(/space\.bilibili\.com\/(\d+)/)?.[1];
        if (!mid) return;

        const fansEl = document.createElement('span');
        fansEl.className = 'bili-video-card__info--date';
        fansEl.textContent = '· …';
        ownerLink.appendChild(fansEl);

        fetchFollowers(mid).then(follower => {
            fansEl.textContent = '· ' + formatNumber(follower);
        }).catch(() => {
            fansEl.remove();
        });
    }

    function processAllCards() {
        document.querySelectorAll('.bili-video-card:not([data-fans-loaded])').forEach(processCard);
    }

    // 延迟初始处理，等 Vue 渲染完成
    setTimeout(processAllCards, 1500);

    // 监听动态加载的新卡片
    const observer = new MutationObserver(processAllCards);
    observer.observe(document.body, { childList: true, subtree: true });
})();
