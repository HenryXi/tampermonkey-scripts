// ==UserScript==
// @name         B站显示UP主粉丝数
// @namespace    https://github.com/HenryXi/tampermonkey-scripts
// @version      1.0.0
// @description  在B站首页每个视频卡片下方显示UP主的粉丝数
// @author       HenryXi
// @match        https://www.bilibili.com/
// @match        https://bilibili.com/
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // mid -> 粉丝数 缓存
    const cache = new Map();

    function formatNumber(n) {
        if (n >= 100000000) {
            return (n / 100000000).toFixed(1) + '亿';
        } else if (n >= 10000) {
            return (n / 10000).toFixed(1) + '万';
        }
        return String(n);
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
        card.dataset.fansLoaded = 'true';

        // 从 space.bilibili.com/{mid} 链接中提取 mid
        const authorLink = card.querySelector('a[href*="space.bilibili.com"]');
        if (!authorLink) return;

        const match = authorLink.href.match(/space\.bilibili\.com\/(\d+)/);
        if (!match) return;

        const mid = match[1];

        // 找到 UP 主信息区域，注入粉丝数标签
        const authorEl = card.querySelector('.bili-video-card__info--author');
        if (!authorEl) return;

        const fansSpan = document.createElement('span');
        fansSpan.className = 'bili-fans-count';
        fansSpan.style.cssText = `
            font-size: 11px;
            color: #999;
            margin-left: 4px;
            white-space: nowrap;
        `;
        fansSpan.textContent = '粉丝：…';
        authorEl.appendChild(fansSpan);

        fetchFollowers(mid).then(follower => {
            fansSpan.textContent = '粉丝：' + formatNumber(follower);
        }).catch(() => {
            fansSpan.remove();
        });
    }

    function processAllCards() {
        document.querySelectorAll('.bili-video-card:not([data-fans-loaded])').forEach(processCard);
    }

    // 初始处理
    processAllCards();

    // 监听动态加载的新卡片
    const observer = new MutationObserver(() => {
        processAllCards();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
