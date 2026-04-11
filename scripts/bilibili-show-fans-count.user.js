// ==UserScript==
// @name         B站显示UP主粉丝数
// @namespace    https://github.com/HenryXi/tampermonkey-scripts
// @version      1.1.0
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

    // 首页卡片：UP主链接选择器
    const HOME_OWNER_LINK = 'a.bili-video-card__info--owner';
    // 搜索页卡片：UP主链接选择器（搜索页 .up-name 或通用 space 链接）
    const SEARCH_OWNER_LINK = 'a.up-name, a[href*="space.bilibili.com"]';

    function processCard(card) {
        if (card.dataset.fansLoaded) return;

        // 首页优先，再尝试搜索页选择器
        let ownerLink = card.querySelector(HOME_OWNER_LINK);
        let isSearchCard = false;
        if (!ownerLink) {
            ownerLink = card.querySelector(SEARCH_OWNER_LINK);
            isSearchCard = true;
        }
        // 卡片还是 skeleton，跳过但不标记，等内容加载后再处理
        if (!ownerLink) return;

        card.dataset.fansLoaded = 'true';

        const mid = ownerLink.href.match(/space\.bilibili\.com\/(\d+)/)?.[1];
        if (!mid) return;

        const fansEl = document.createElement('span');
        if (isSearchCard) {
            // 搜索页没有现成的日期样式类，直接内联小字灰色样式
            fansEl.style.cssText = 'font-size:12px;color:#999;margin-left:4px;';
        } else {
            // 首页复用日期样式类
            fansEl.className = 'bili-video-card__info--date';
        }
        fansEl.textContent = '· …';
        ownerLink.appendChild(fansEl);

        fetchFollowers(mid).then(follower => {
            fansEl.textContent = '· ' + formatNumber(follower);
        }).catch(() => {
            fansEl.remove();
        });
    }

    function processAllCards() {
        // 首页卡片 + 搜索页卡片（两者都可能含 .bili-video-card）
        const selector = isSearch
            ? '.video-list-item:not([data-fans-loaded]), .bili-video-card:not([data-fans-loaded])'
            : '.bili-video-card:not([data-fans-loaded])';
        document.querySelectorAll(selector).forEach(processCard);
    }

    // 延迟初始处理，等 Vue 渲染完成
    setTimeout(processAllCards, 1000);

    // 监听动态加载的新卡片
    const observer = new MutationObserver(processAllCards);
    observer.observe(document.body, { childList: true, subtree: true });
})();
