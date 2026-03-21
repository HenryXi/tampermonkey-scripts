// ==UserScript==
// @name         B站自定义推荐视频
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  在B站视频播放页右侧推荐区域添加指定UP主的视频
// @author       You
// @match        https://www.bilibili.com/video/*
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @run-at       document-start
// @updateURL    https://rawgithubusercontent.com/HenryXi/bilibili_play_page_change/raw/refs/heads/main/bilibili-custom-recommendations.user.js
// @downloadURL  https://rawgithubusercontent.com/HenryXi/bilibili_play_page_change/raw/refs/heads/main/bilibili-custom-recommendations.user.js
// @supportURL   https://github.com/HenryXi/bilibili_play_page_change/issues
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置区域 ==========
    // 在这里添加你想要推荐的UP主的UID（mid）
    const TARGET_UP_MIDS = [
        '326427334','254463269','192063031','26108626','1537646108','3546856531429665','1423802684','2000819931','563396855'

    ];

    // 推荐视频数量
    const RECOMMEND_COUNT = 15;
    // 原始推荐视频保留数量
    const ORIGINAL_RECOMMEND_COUNT = 0;
    // ==============================

    // 存储获取到的视频
    let allVideos = [];

    // 添加CSS样式，提前隐藏原始推荐视频（立即执行，在DOM加载前）
    if (document.head) {
        const style = document.createElement('style');
        style.textContent = `
            /* 隐藏播放器结束界面的原始推荐 */
            .bpx-player-ending-related-item:not(.custom-end-recommend) {
                display: none !important;
            }
            /* 隐藏右侧原始推荐视频卡片 */
            .video-page-card-small:not(.custom-recommend-card) {
                display: none !important;
            }
            /* 隐藏接下来播放 */
            .next-play {
                display: none !important;
            }
            /* 隐藏其他可能的原始推荐容器 */
            .rec-list:not(.custom-recommend-section) {
                display: none !important;
            }
            /* 隐藏推荐列表容器（但会被自定义内容覆盖） */
            .video-page-card-small[data-report*="related_rec"] {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    } else {
        // 如果head还不存在，等待head出现后立即注入
        const injectStyleWhenReady = setInterval(() => {
            if (document.head) {
                clearInterval(injectStyleWhenReady);
                const style = document.createElement('style');
                style.textContent = `
                    /* 隐藏播放器结束界面的原始推荐 */
                    .bpx-player-ending-related-item:not(.custom-end-recommend) {
                        display: none !important;
                    }
                    /* 隐藏右侧原始推荐视频卡片 */
                    .video-page-card-small:not(.custom-recommend-card) {
                        display: none !important;
                    }
                    /* 隐藏接下来播放 */
                    .next-play {
                        display: none !important;
                    }
                    /* 隐藏其他可能的原始推荐容器 */
                    .rec-list:not(.custom-recommend-section) {
                        display: none !important;
                    }
                    /* 隐藏推荐列表容器（但会被自定义内容覆盖） */
                    .video-page-card-small[data-report*="related_rec"] {
                        display: none !important;
                    }
                `;
                document.head.appendChild(style);
            }
        }, 10);
    }

    // WBI签名相关
    const mixinKeyEncTab = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
        33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
        61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
        36, 20, 34, 44, 52
    ];

    // 获取混淆后的密钥
    function getMixinKey(orig) {
        return mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32);
    }

    // 对参数进行编码
    function encWbi(params, img_key, sub_key) {
        const mixin_key = getMixinKey(img_key + sub_key);
        const curr_time = Math.round(Date.now() / 1000);
        const chr_filter = /[!'()*]/g;

        Object.assign(params, { wts: curr_time });
        const query = Object.keys(params)
            .sort()
            .map(key => {
                const value = params[key].toString().replace(chr_filter, '');
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            })
            .join('&');

        const wbi_sign = md5(query + mixin_key);
        return query + '&w_rid=' + wbi_sign;
    }

    // MD5实现
    function md5(string) {
        function md5_RotateLeft(lValue, iShiftBits) {
            return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
        }
        function md5_AddUnsigned(lX, lY) {
            var lX4, lY4, lX8, lY8, lResult;
            lX8 = (lX & 0x80000000);
            lY8 = (lY & 0x80000000);
            lX4 = (lX & 0x40000000);
            lY4 = (lY & 0x40000000);
            lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
            if (lX4 & lY4) return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
            if (lX4 | lY4) {
                if (lResult & 0x40000000) return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
                else return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
            } else {
                return (lResult ^ lX8 ^ lY8);
            }
        }
        function md5_F(x, y, z) { return (x & y) | ((~x) & z); }
        function md5_G(x, y, z) { return (x & z) | (y & (~z)); }
        function md5_H(x, y, z) { return (x ^ y ^ z); }
        function md5_I(x, y, z) { return (y ^ (x | (~z))); }
        function md5_FF(a, b, c, d, x, s, ac) {
            a = md5_AddUnsigned(a, md5_AddUnsigned(md5_AddUnsigned(md5_F(b, c, d), x), ac));
            return md5_AddUnsigned(md5_RotateLeft(a, s), b);
        }
        function md5_GG(a, b, c, d, x, s, ac) {
            a = md5_AddUnsigned(a, md5_AddUnsigned(md5_AddUnsigned(md5_G(b, c, d), x), ac));
            return md5_AddUnsigned(md5_RotateLeft(a, s), b);
        }
        function md5_HH(a, b, c, d, x, s, ac) {
            a = md5_AddUnsigned(a, md5_AddUnsigned(md5_AddUnsigned(md5_H(b, c, d), x), ac));
            return md5_AddUnsigned(md5_RotateLeft(a, s), b);
        }
        function md5_II(a, b, c, d, x, s, ac) {
            a = md5_AddUnsigned(a, md5_AddUnsigned(md5_AddUnsigned(md5_I(b, c, d), x), ac));
            return md5_AddUnsigned(md5_RotateLeft(a, s), b);
        }
        function md5_ConvertToWordArray(string) {
            var lWordCount, lMessageLength = string.length, lNumberOfWords_temp1 = lMessageLength + 8,
                lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64,
                lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16, lWordArray = Array(lNumberOfWords - 1),
                lBytePosition = 0, lByteCount = 0;
            while (lByteCount < lMessageLength) {
                lWordCount = (lByteCount - (lByteCount % 4)) / 4;
                lBytePosition = (lByteCount % 4) * 8;
                lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
                lByteCount++;
            }
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
            lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
            lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
            return lWordArray;
        }
        function md5_WordToHex(lValue) {
            var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
            for (lCount = 0; lCount <= 3; lCount++) {
                lByte = (lValue >>> (lCount * 8)) & 255;
                WordToHexValue_temp = "0" + lByte.toString(16);
                WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
            }
            return WordToHexValue;
        }
        function md5_Utf8Encode(string) {
            string = string.replace(/\r\n/g, "\n");
            var utftext = "";
            for (var n = 0; n < string.length; n++) {
                var c = string.charCodeAt(n);
                if (c < 128) {
                    utftext += String.fromCharCode(c);
                } else if ((c > 127) && (c < 2048)) {
                    utftext += String.fromCharCode((c >> 6) | 192);
                    utftext += String.fromCharCode((c & 63) | 128);
                } else {
                    utftext += String.fromCharCode((c >> 12) | 224);
                    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                    utftext += String.fromCharCode((c & 63) | 128);
                }
            }
            return utftext;
        }
        var x = Array(), k, AA, BB, CC, DD, a, b, c, d, S11 = 7, S12 = 12, S13 = 17, S14 = 22, S21 = 5, S22 = 9,
            S23 = 14, S24 = 20, S31 = 4, S32 = 11, S33 = 16, S34 = 23, S41 = 6, S42 = 10, S43 = 15, S44 = 21;
        string = md5_Utf8Encode(string);
        x = md5_ConvertToWordArray(string);
        a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
        for (k = 0; k < x.length; k += 16) {
            AA = a; BB = b; CC = c; DD = d;
            a = md5_FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
            d = md5_FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
            c = md5_FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
            b = md5_FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
            a = md5_FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
            d = md5_FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
            c = md5_FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
            b = md5_FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
            a = md5_FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
            d = md5_FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
            c = md5_FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
            b = md5_FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
            a = md5_FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
            d = md5_FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
            c = md5_FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
            b = md5_FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
            a = md5_GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
            d = md5_GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
            c = md5_GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
            b = md5_GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
            a = md5_GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
            d = md5_GG(d, a, b, c, x[k + 10], S22, 0x2441453);
            c = md5_GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
            b = md5_GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
            a = md5_GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
            d = md5_GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
            c = md5_GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
            b = md5_GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
            a = md5_GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
            d = md5_GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
            c = md5_GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
            b = md5_GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
            a = md5_HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
            d = md5_HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
            c = md5_HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
            b = md5_HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
            a = md5_HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
            d = md5_HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
            c = md5_HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
            b = md5_HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
            a = md5_HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
            d = md5_HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
            c = md5_HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
            b = md5_HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
            a = md5_HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
            d = md5_HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
            c = md5_HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
            b = md5_HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
            a = md5_II(a, b, c, d, x[k + 0], S41, 0xF4292244);
            d = md5_II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
            c = md5_II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
            b = md5_II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
            a = md5_II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
            d = md5_II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
            c = md5_II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
            b = md5_II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
            a = md5_II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
            d = md5_II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
            c = md5_II(c, d, a, b, x[k + 6], S43, 0xA3014314);
            b = md5_II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
            a = md5_II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
            d = md5_II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
            c = md5_II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
            b = md5_II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
            a = md5_AddUnsigned(a, AA); b = md5_AddUnsigned(b, BB);
            c = md5_AddUnsigned(c, CC); d = md5_AddUnsigned(d, DD);
        }
        return (md5_WordToHex(a) + md5_WordToHex(b) + md5_WordToHex(c) + md5_WordToHex(d)).toLowerCase();
    }

    // 获取WBI密钥
    async function getWbiKeys() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bilibili.com/x/web-interface/nav',
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.code === 0) {
                            const img_url = data.data.wbi_img.img_url;
                            const sub_url = data.data.wbi_img.sub_url;
                            const img_key = img_url.substring(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
                            const sub_key = sub_url.substring(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));
                            resolve({ img_key, sub_key });
                        } else {
                            reject(new Error('获取WBI密钥失败'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

    // 获取UP主的视频列表（带WBI签名）
    async function fetchUploaderVideos(mid, wbiKeys) {
        return new Promise((resolve, reject) => {
            try {
                // 准备请求参数
                const params = {
                    mid: mid,
                    ps: 30,
                    tid: 0,
                    pn: 1,
                    keyword: '',
                    order: 'pubdate',
                    platform: 'web',
                    web_location: 1550101,
                    order_avoided: true
                };

                // 生成WBI签名
                const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
                const url = `https://api.bilibili.com/x/space/wbi/arc/search?${query}`;

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: {
                        'Referer': 'https://www.bilibili.com',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    onload: function(response) {
                        try {
                            const data = JSON.parse(response.responseText);
                            if (data.code === 0 && data.data && data.data.list && data.data.list.vlist) {
                                resolve(data.data.list.vlist);
                            } else {
                                console.warn(`获取UP主 ${mid} 的视频失败:`, data);
                                resolve([]);
                            }
                        } catch (e) {
                            console.error(`解析UP主 ${mid} 的数据失败:`, e);
                            resolve([]);
                        }
                    },
                    onerror: function(error) {
                        console.error(`请求UP主 ${mid} 的视频失败:`, error);
                        resolve([]);
                    }
                });
            } catch (e) {
                console.error(`构建请求失败:`, e);
                resolve([]);
            }
        });
    }

    // 随机打乱数组
    function shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    // 格式化播放量
    function formatPlayCount(count) {
        if (count >= 100000000) {
            return (count / 100000000).toFixed(1) + '亿';
        } else if (count >= 10000) {
            return (count / 10000).toFixed(1) + '万';
        }
        return count.toString();
    }

    // 格式化时长
    function formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // 创建视频卡片HTML
    function createVideoCard(video) {
        const card = document.createElement('div');
        card.className = 'video-page-card-small custom-recommend-card';
        card.style.cssText = 'margin-bottom: 12px; cursor: pointer !important; border: 2px solid #00a1d6; border-radius: 4px; padding: 4px; background: #f0f9ff; position: relative; pointer-events: auto !important;';
        card.setAttribute('data-bvid', video.bvid);

        const videoUrl = `https://www.bilibili.com/video/${video.bvid}`;

        card.innerHTML = `
            <div style="display: flex; text-decoration: none; color: inherit; position: relative; z-index: 1; pointer-events: none;">
                <div style="position: relative; width: 160px; height: 90px; flex-shrink: 0; border-radius: 4px; overflow: hidden;">
                    <img src="${video.pic}@160w_90h_1c.webp" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;" />
                    <div style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; padding: 2px 4px; border-radius: 2px; font-size: 12px; pointer-events: none;">
                        ${formatDuration(video.length.split(':').reduce((acc, time) => (60 * acc) + +time, 0))}
                    </div>
                    <div style="position: absolute; top: 4px; left: 4px; background: #00a1d6; color: white; padding: 2px 6px; border-radius: 2px; font-size: 11px; font-weight: bold; pointer-events: none;">
                        推荐
                    </div>
                </div>
                <div style="flex: 1; margin-left: 8px; display: flex; flex-direction: column; justify-content: space-between; min-width: 0;">
                    <div style="font-size: 13px; line-height: 18px; max-height: 36px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-all; color: #212121; font-weight: 500; pointer-events: none;">
                        ${video.title}
                    </div>
                    <div style="font-size: 12px; color: #999; pointer-events: none;">
                        <div style="margin-bottom: 2px;">${video.author}</div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>▶ ${formatPlayCount(video.play)}</span>
                            <span>💬 ${formatPlayCount(video.comment)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 使用捕获阶段的事件监听，优先级更高
        const clickHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.log('点击了视频:', video.title, videoUrl);
            window.open(videoUrl, '_blank');
        };

        // 同时添加多种事件监听，确保能捕获到点击
        card.addEventListener('click', clickHandler, true); // 捕获阶段
        card.addEventListener('click', clickHandler, false); // 冒泡阶段
        card.addEventListener('mousedown', clickHandler, true);

        // 鼠标悬停效果
        card.addEventListener('mouseenter', function() {
            card.style.background = '#e6f7ff';
            card.style.transform = 'translateY(-2px)';
            card.style.transition = 'all 0.2s ease';
        });

        card.addEventListener('mouseleave', function() {
            card.style.background = '#f0f9ff';
            card.style.transform = 'translateY(0)';
        });

        return card;
    }

    // 限制原始推荐视频数量
    function limitOriginalRecommendations() {
        // 查找右侧推荐区域的所有原始视频卡片
        const videoCards = document.querySelectorAll('.video-page-card-small:not(.custom-recommend-card)');

        if (videoCards.length > ORIGINAL_RECOMMEND_COUNT) {
            // 隐藏超过限制数量的视频卡片
            videoCards.forEach((card, index) => {
                if (index >= ORIGINAL_RECOMMEND_COUNT) {
                    card.style.display = 'none';
                }
            });
            console.log(`✅ 已限制原始推荐视频为 ${ORIGINAL_RECOMMEND_COUNT} 个`);
        }
    }

    // 注入自定义推荐视频
    function injectCustomRecommendations() {
        // 查找右侧推荐区域
        const rightContainer = document.querySelector('#reco_list, .video-page-card-small, .rec-list');

        if (!rightContainer) {
            console.log('未找到推荐区域，稍后重试...');
            return false;
        }

        // 查找或创建容器
        let container = rightContainer.closest('.right-container, .right-container-inner');
        if (!container) {
            container = rightContainer.parentElement;
        }

        // 检查是否已经添加过
        if (document.querySelector('.custom-recommend-section')) {
            return true;
        }

        // 创建自定义推荐区域
        const customSection = document.createElement('div');
        customSection.className = 'custom-recommend-section';
        customSection.style.cssText = 'margin-bottom: 20px;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #212121; display: flex; align-items: center; gap: 8px;';
        title.innerHTML = '<span style="color: #00a1d6;">★</span> 为你精选';

        customSection.appendChild(title);

        // 随机选择视频并创建卡片
        const selectedVideos = shuffleArray(allVideos).slice(0, RECOMMEND_COUNT);
        selectedVideos.forEach(video => {
            const card = createVideoCard(video);
            customSection.appendChild(card);
        });

        // 插入到推荐区域顶部
        if (container.firstChild) {
            container.insertBefore(customSection, container.firstChild);
        } else {
            container.appendChild(customSection);
        }

        // 限制原始推荐视频数量
        limitOriginalRecommendations();

        console.log(`✅ 已添加 ${selectedVideos.length} 个自定义推荐视频`);
        return true;
    }

    // 替换播放器上方的推荐视频
    function replacePlayerEndRecommendations() {
        // 尝试多个可能的选择器
        const selectors = [
            '.bpx-player-ending-related',
            '.bpx-player-ending-content',
            '.bpx-player-ending-panel',
            '.bpx-player-ending-related-item',
            '.bpx-player-ending',
            '[class*="ending-related"]',
            '[class*="ending-content"]'
        ];

        let endRecommendContainer = null;
        for (const selector of selectors) {
            endRecommendContainer = document.querySelector(selector);
            if (endRecommendContainer) {
                console.log('找到播放器结束推荐区域，使用选择器:', selector);
                break;
            }
        }

        if (!endRecommendContainer) {
            console.log('未找到播放器结束推荐区域，尝试的选择器:', selectors);
            return false;
        }

        // 检查是否已经替换过
        if (endRecommendContainer.querySelector('.custom-end-recommend')) {
            console.log('已经替换过推荐视频');
            return true;
        }

        // 立即隐藏所有原始推荐视频项
        const allOriginalItems = document.querySelectorAll('.bpx-player-ending-related-item');
        allOriginalItems.forEach(item => {
            item.style.display = 'none';
        });

        // 隐藏UP主信息、充电、关注、好评投币等元素（但不隐藏推荐视频容器）
        const elementsToHide = [
            '.bpx-player-ending-functions',
            '.bpx-player-ending-interaction-swiper'
        ];

        elementsToHide.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.style.display = 'none';
                console.log('隐藏元素:', selector);
            });
        });

        // 清空原有内容
        endRecommendContainer.innerHTML = '';
        endRecommendContainer.className += ' custom-end-recommend';
        // 保持原始样式，不修改容器的CSS
        endRecommendContainer.style.cssText = '';

        // 随机选择6个视频
        const selectedVideos = shuffleArray(allVideos).slice(0, 6);
        selectedVideos.forEach(video => {
            // 创建一个模仿B站原始样式的视频卡片
            const videoCard = document.createElement('a');
            videoCard.className = 'bpx-player-ending-related-item custom-end-recommend';
            videoCard.href = `https://www.bilibili.com/video/${video.bvid}`;
            videoCard.setAttribute('data-bvid', video.bvid);

            const videoUrl = `https://www.bilibili.com/video/${video.bvid}`;

            // 截断标题，限制为10个字符
            const truncatedTitle = video.title.length > 10 ? video.title.substring(0, 10) + '...' : video.title;

            videoCard.innerHTML = `
                <div class="bpx-player-ending-related-item-img">
                    <img src="${video.pic}@320w_200h_1c.webp" style="width: 100%; height: 100%; object-fit: cover;" />
                </div>
                <div class="bpx-player-ending-related-item-title">${truncatedTitle}</div>
            `;

            // 使用多种方式确保点击事件能够触发
            const clickHandler = function(e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                console.log('🎯 点击了推荐视频:', video.title, videoUrl);
                // 直接跳转到新视频
                window.location.href = videoUrl;
                return false;
            };

            // 在捕获和冒泡阶段都添加监听器
            videoCard.addEventListener('click', clickHandler, true);
            videoCard.addEventListener('click', clickHandler, false);

            // 添加测试用的鼠标移入事件，确认元素可以接收事件
            videoCard.addEventListener('mouseenter', function() {
                console.log('🖱️ 鼠标移入视频卡片:', video.title);
            });

            endRecommendContainer.appendChild(videoCard);
        });

        console.log('✅ 已替换播放器结束推荐视频');
        return true;
    }

    // 监听视频播放结束事件
    function setupVideoEndListener() {
        // 尝试获取视频播放器
        const video = document.querySelector('video');

        if (!video) {
            console.log('未找到视频元素，稍后重试...');
            return false;
        }

        // 检查是否已经添加过监听器
        if (video.dataset.endListenerAdded) {
            return true;
        }

        // 提前隐藏原始推荐视频，避免闪现
        video.addEventListener('timeupdate', function() {
            // 当视频播放到最后2秒时，提前隐藏原始推荐视频
            if (video.duration - video.currentTime <= 2 && video.duration > 0) {
                const originalItems = document.querySelectorAll('.bpx-player-ending-related-item:not(.custom-end-recommend)');
                originalItems.forEach(item => {
                    if (!item.classList.contains('custom-end-recommend')) {
                        item.style.opacity = '0';
                        item.style.pointerEvents = 'none';
                    }
                });
            }
        });

        video.addEventListener('ended', function() {
            console.log('🎬 视频播放完成，准备替换推荐视频...');
            console.log('当前页面所有class包含ending的元素:', document.querySelectorAll('[class*="ending"]'));

            // 等待播放器结束界面出现
            setTimeout(() => {
                let retryCount = 0;
                const maxRetries = 10;

                const tryReplace = setInterval(() => {
                    retryCount++;
                    console.log(`尝试替换推荐视频，第 ${retryCount} 次...`);

                    if (replacePlayerEndRecommendations()) {
                        clearInterval(tryReplace);
                    } else if (retryCount >= maxRetries) {
                        console.warn('⚠️ 未能找到播放器结束推荐区域');
                        console.log('页面所有元素:', document.body.innerHTML.substring(0, 1000));
                        clearInterval(tryReplace);
                    }
                }, 300);
            }, 100); // 减少延迟时间，更快替换
        });

        video.dataset.endListenerAdded = 'true';
        console.log('✅ 已添加视频结束监听器');
        return true;
    }

    // 主函数
    async function main() {
        console.log('🚀 B站自定义推荐脚本启动...');

        try {
            // 先获取WBI密钥
            console.log('🔑 正在获取WBI密钥...');
            const wbiKeys = await getWbiKeys();
            console.log('✅ WBI密钥获取成功');

            // 获取所有UP主的视频
            console.log(`📥 开始获取 ${TARGET_UP_MIDS.length} 个UP主的视频...`);

            const videoPromises = TARGET_UP_MIDS.map(mid => fetchUploaderVideos(mid, wbiKeys));
            const results = await Promise.all(videoPromises);

            // 合并所有视频
            results.forEach((videos, index) => {
                console.log(`UP主 ${TARGET_UP_MIDS[index]}: 获取到 ${videos.length} 个视频`);
                allVideos = allVideos.concat(videos);
            });

            console.log(`📊 总共获取到 ${allVideos.length} 个视频`);

            if (allVideos.length === 0) {
                console.warn('⚠️ 未获取到任何视频，请检查UP主ID是否正确');
                return;
            }

            // 等待页面加载完成后注入
            let retryCount = 0;
            const maxRetries = 20;

            const tryInject = setInterval(() => {
                retryCount++;

                if (injectCustomRecommendations()) {
                    clearInterval(tryInject);
                } else if (retryCount >= maxRetries) {
                    console.warn('⚠️ 达到最大重试次数，停止尝试');
                    clearInterval(tryInject);
                }
            }, 500);

            // 设置视频结束监听器
            let videoRetryCount = 0;
            const videoMaxRetries = 20;

            const trySetupListener = setInterval(() => {
                videoRetryCount++;

                if (setupVideoEndListener()) {
                    clearInterval(trySetupListener);
                } else if (videoRetryCount >= videoMaxRetries) {
                    console.warn('⚠️ 未能设置视频结束监听器');
                    clearInterval(trySetupListener);
                }
            }, 500);
        } catch (error) {
            console.error('❌ 脚本执行失败:', error);
        }
    }

    // 等待DOM加载完成后执行主函数
    function startScript() {
        // 监听页面变化（SPA路由切换）
        let lastUrl = location.href;
        new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl && currentUrl.includes('/video/')) {
                lastUrl = currentUrl;
                console.log('🔄 检测到页面切换，重新加载推荐...');
                setTimeout(main, 1000);
            }
        }).observe(document.body, { childList: true, subtree: true });

        // 启动主函数
        main();
    }

    // 根据DOM状态决定何时启动
    if (document.readyState === 'loading') {
        // DOM还在加载中，等待DOMContentLoaded事件
        document.addEventListener('DOMContentLoaded', startScript);
    } else {
        // DOM已经加载完成，直接启动
        startScript();
    }
})();
