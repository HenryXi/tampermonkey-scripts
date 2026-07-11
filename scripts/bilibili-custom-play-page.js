// ==UserScript==
// @name         B站自定义播放页
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  B站播放页定制：云端时间窗口、右侧推荐、结束页推荐、UP屏蔽与播放保护
// @author       You
// @match        https://www.bilibili.com/video/*
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @connect      gitee.com
// @connect      raw.giteeusercontent.com
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const Config = {
        cloudUrl: 'https://raw.giteeusercontent.com/beijiguangyong/config/raw/master/bilibili.json',
        cloudTimeout: 5000,
        defaultTargetUpMids: [
            '326427334', '254463269', '192063031', '26108626', '1537646108',
            '3546856531429665', '1423802684', '2000819931', '563396855'
        ],
        defaultBlockedUpMids: ['39977118', '1391326193', '3546954380348053', '6057259'],
        rightRecommendCount: 15,
        endRecommendCount: 6,
        minFollowerCount: 100000,
        uploaderPageSize: 30,
        uploaderRequestInterval: 1500,
        uploaderMaxRetries: 2,
        recommendationCacheKey: 'bilibili_custom_play_page_recommendation_cache',
        recommendationCacheTtl: 12 * 60 * 60 * 1000,
        cloudCacheKey: 'bilibili_custom_play_page_cloud_cache'
    };

    const State = {
        cloudPromise: null,
        recommendations: [],
        currentUrl: location.href,
        routeRunId: 0,
        endListenerVideo: null,
        miniObserver: null
    };

    function injectBaseStyles() {
        if (document.getElementById('custom-play-page-base-style')) return;
        const style = document.createElement('style');
        style.id = 'custom-play-page-base-style';
        style.textContent = `
            #bilibili-player .bpx-player-container[data-screen="mini"],
            #player_module .bpx-player-container[data-screen="mini"] {
                display: none !important;
            }
            #reco_list .rcmd-tab,
            #reco_list [class*="rcmd-tab"],
            #danmukuBox .rcmd-tab,
            #danmukuBox [class*="rcmd-tab"],
            #mirror-vdcon + .right-container .rcmd-tab,
            #mirror-vdcon + .right-container [class*="rcmd-tab"],
            .video-container-v1 .right-container .rcmd-tab,
            .video-container-v1 .right-container [class*="rcmd-tab"],
            .video-container .right-container .rcmd-tab,
            .video-container .right-container [class*="rcmd-tab"] {
                display: none !important;
            }
            .custom-play-page-right-root .video-page-card-small:not(.custom-play-page-card),
            .custom-play-page-right-root .rec-list,
            .custom-play-page-right-root .next-play,
            .custom-play-page-right-root [data-report*="related_rec"],
            .custom-play-page-right-root .rcmd-tab,
            .custom-play-page-right-root [class*="rcmd-tab"] {
                display: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    const Log = {
        info: (...args) => console.log('[B站自定义播放页]', ...args),
        warn: (...args) => console.warn('[B站自定义播放页]', ...args),
        error: (...args) => console.error('[B站自定义播放页]', ...args)
    };

    const Http = {
        request(options) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: options.method || 'GET',
                    url: options.url,
                    timeout: options.timeout || 10000,
                    headers: options.headers || {},
                    anonymous: options.anonymous ?? false,
                    onload: response => resolve(response),
                    ontimeout: () => reject(new Error('request timeout')),
                    onerror: error => reject(error)
                });
            });
        },

        async json(url, options = {}) {
            const response = await this.request({ ...options, url });
            const text = String(response.responseText || '').trim();
            if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
                throw new Error('response is html, not json');
            }
            return JSON.parse(text);
        },

        async text(url, options = {}) {
            const response = await this.request({ ...options, url });
            return String(response.responseText || '');
        }
    };

    const Util = {
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        normalizeMidList(value) {
            if (!Array.isArray(value)) return null;
            const mids = value.map(item => String(item).trim()).filter(Boolean);
            return mids.length ? mids : null;
        },

        shuffle(array) {
            const result = [...array];
            for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [result[i], result[j]] = [result[j], result[i]];
            }
            return result;
        },

        formatCount(count) {
            if (count >= 10000) return (count / 10000).toFixed(1) + '万';
            return String(count || 0);
        },

        formatDuration(seconds) {
            const value = Number(seconds || 0);
            const minutes = Math.floor(value / 60);
            const rest = value % 60;
            return `${minutes}:${String(rest).padStart(2, '0')}`;
        },

        getBvid() {
            return location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1] || null;
        }
    };

    const TimeWindow = {
        parse(value) {
            if (typeof value !== 'string') return null;
            const match = value.match(/^(\d{2}):(\d{2}):(\d{2})$/);
            if (!match) return null;
            const hours = Number(match[1]);
            const minutes = Number(match[2]);
            const seconds = Number(match[3]);
            if (hours > 23 || minutes > 59 || seconds > 59) return null;
            return hours * 3600 + minutes * 60 + seconds;
        },

        currentSeconds() {
            const now = new Date();
            return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        },

        state(cloudConfig) {
            const start = this.parse(cloudConfig?.playStartTime);
            const end = this.parse(cloudConfig?.playEndTime);
            if (start === null || end === null || start > end) {
                return { allow: true, reason: 'invalid_or_missing_time' };
            }
            const current = this.currentSeconds();
            const allow = current >= start && current <= end;
            return {
                allow,
                reason: allow ? 'in_window' : 'out_of_window',
                message: allow ? '' : (cloudConfig.message || '暂时无法访问')
            };
        }
    };

    const CloudConfig = {
        fallback() {
            return {
                targetUpMids: Config.defaultTargetUpMids,
                blockedUpMids: Config.defaultBlockedUpMids,
                message: ''
            };
        },

        parse(text) {
            try {
                const json = JSON.parse(String(text || '').trim());
                return {
                    playStartTime: json.playStartTime,
                    playEndTime: json.playEndTime,
                    message: json.message || json.reason || '',
                    targetUpMids: Util.normalizeMidList(json.targetUpMids ?? json.recommendUpMids ?? json.recommendedUpMids) || Config.defaultTargetUpMids,
                    blockedUpMids: Util.normalizeMidList(json.blockedUpMids ?? json.blockedMids) || Config.defaultBlockedUpMids
                };
            } catch (error) {
                Log.warn('云端配置不是有效 JSON，使用默认配置并允许播放', error);
                return this.fallback();
            }
        },

        readCache() {
            try {
                const cached = localStorage.getItem(Config.cloudCacheKey);
                return cached ? JSON.parse(cached) : null;
            } catch (error) {
                return null;
            }
        },

        writeCache(config) {
            try {
                localStorage.setItem(Config.cloudCacheKey, JSON.stringify({ ...config, cachedAt: Date.now() }));
            } catch (error) {
                Log.warn('写入云端配置缓存失败', error);
            }
        },

        async load() {
            if (State.cloudPromise) return State.cloudPromise;
            State.cloudPromise = (async () => {
                if (!Config.cloudUrl) return this.fallback();
                try {
                    const url = `${Config.cloudUrl}${Config.cloudUrl.includes('?') ? '&' : '?'}_=${Date.now()}`;
                    const text = await Http.text(url, {
                        timeout: Config.cloudTimeout,
                        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
                    });
                    const config = this.parse(text);
                    this.writeCache(config);
                    return config;
                } catch (error) {
                    Log.warn('读取云端配置失败，使用默认配置并允许播放', error);
                    return this.fallback();
                }
            })();
            return State.cloudPromise;
        }
    };

    const RecommendationCache = {
        signature(mids) {
            return mids.join(',');
        },

        read(mids) {
            try {
                const cached = localStorage.getItem(Config.recommendationCacheKey);
                if (!cached) return null;
                const data = JSON.parse(cached);
                const fresh = Date.now() - Number(data.updatedAt || 0) < Config.recommendationCacheTtl;
                const sameTargets = data.signature === this.signature(mids);
                if (fresh && sameTargets && Array.isArray(data.videos) && data.videos.length) {
                    Log.info(`命中推荐视频缓存：${data.videos.length} 个`);
                    return data.videos;
                }
            } catch (error) {
                Log.warn('读取推荐缓存失败', error);
            }
            return null;
        },

        write(mids, videos) {
            if (!Array.isArray(videos) || !videos.length) return;
            try {
                localStorage.setItem(Config.recommendationCacheKey, JSON.stringify({
                    signature: this.signature(mids),
                    targetUpMids: mids,
                    videos,
                    updatedAt: Date.now()
                }));
                Log.info(`已缓存推荐视频：${videos.length} 个`);
            } catch (error) {
                Log.warn('写入推荐缓存失败', error);
            }
        }
    };

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

    const BiliApi = {
        commonHeaders: {
            'Referer': 'https://www.bilibili.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },

        async getWbiKeys() {
            const data = await Http.json('https://api.bilibili.com/x/web-interface/nav', {
                headers: this.commonHeaders,
                anonymous: false
            });
            if (data.code !== 0 || !data.data?.wbi_img) {
                throw new Error('获取 WBI 密钥失败: ' + (data.message || data.code));
            }
            const imgUrl = data.data.wbi_img.img_url;
            const subUrl = data.data.wbi_img.sub_url;
            return {
                img_key: imgUrl.substring(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.')),
                sub_key: subUrl.substring(subUrl.lastIndexOf('/') + 1, subUrl.lastIndexOf('.'))
            };
        },

        async fetchUploaderVideos(mid, wbiKeys, retryCount = 0) {
            const params = {
                mid,
                ps: Config.uploaderPageSize,
                tid: 0,
                pn: 1,
                keyword: '',
                order: 'pubdate',
                platform: 'web',
                web_location: 1550101,
                order_avoided: true
            };
            const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
            const url = `https://api.bilibili.com/x/space/wbi/arc/search?${query}`;
            const data = await Http.json(url, {
                headers: { ...this.commonHeaders, 'Origin': 'https://www.bilibili.com' },
                anonymous: false
            });

            if (data.code === 0 && data.data?.list?.vlist) return data.data.list.vlist;
            if (String(data.message || '').includes('banned') && retryCount < Config.uploaderMaxRetries) {
                const retryDelay = 3000 * (retryCount + 1);
                Log.warn(`UP主 ${mid} 请求被拦截，${retryDelay}ms 后重试`);
                await Util.delay(retryDelay);
                return this.fetchUploaderVideos(mid, wbiKeys, retryCount + 1);
            }
            Log.warn(`获取 UP主 ${mid} 视频失败`, data.message || data.code);
            return [];
        },

        async fetchCurrentVideoOwnerMid(bvid) {
            try {
                const data = await Http.json(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
                    headers: this.commonHeaders,
                    anonymous: false
                });
                return data.code === 0 && data.data?.owner ? String(data.data.owner.mid) : null;
            } catch (error) {
                Log.warn('获取当前视频 UP 主失败', error);
                return null;
            }
        },

        async fetchUploaderFollower(mid) {
            try {
                const data = await Http.json(`https://api.bilibili.com/x/relation/stat?vmid=${mid}`, {
                    headers: this.commonHeaders,
                    anonymous: false
                });
                return data.code === 0 && data.data ? Number(data.data.follower) : null;
            } catch (error) {
                Log.warn('获取 UP 主粉丝数失败', error);
                return null;
            }
        }
    };

    const Dom = {
        isHeaderElement(element) {
            return Boolean(element?.closest?.('.bili-header, .bili-header__bar, .right-entry, [class*="right-entry"], [class*="rightEntry"]'));
        },

        playerRoot() {
            return document.querySelector('#bilibili-player, #player_module, .bpx-player-container');
        },

        safeRightContainer() {
            const selectors = [
                '#reco_list',
                '#danmukuBox',
                '#mirror-vdcon + .right-container',
                '.video-container-v1 .right-container',
                '.video-container .right-container',
                '.right-container-inner'
            ];
            for (const selector of selectors) {
                for (const element of document.querySelectorAll(selector)) {
                    if (this.isHeaderElement(element)) continue;
                    const rect = element.getBoundingClientRect();
                    const looksRightSide = rect.width > 220 && rect.left > window.innerWidth * 0.45;
                    const isKnownRightRoot = ['reco_list', 'danmukuBox'].includes(element.id) || element.classList.contains('right-container') || element.classList.contains('right-container-inner');
                    const hasRecommendContent = element.id === 'reco_list' || element.querySelector('.video-page-card-small, .rec-list, .next-play, [data-report*="related_rec"]');
                    if (looksRightSide && (hasRecommendContent || isKnownRightRoot)) {
                        return element.querySelector('#reco_list') || element;
                    }
                }
            }
            return null;
        },

        waitFor(check, { timeout = 10000, interval = 300 } = {}) {
            return new Promise(resolve => {
                const start = Date.now();
                const timer = setInterval(() => {
                    const value = check();
                    if (value) {
                        clearInterval(timer);
                        resolve(value);
                    } else if (Date.now() - start >= timeout) {
                        clearInterval(timer);
                        resolve(null);
                    }
                }, interval);
            });
        }
    };

    const PlaybackGuard = {
        showCloudBlock(message) {
            let mask = document.getElementById('custom-play-page-cloud-block');
            if (!mask) {
                mask = document.createElement('div');
                mask.id = 'custom-play-page-cloud-block';
                mask.style.cssText = [
                    'position:fixed', 'inset:0', 'width:100vw', 'height:100vh',
                    'z-index:2147483647', 'background:linear-gradient(135deg,#111827 0%,#030712 100%)',
                    'color:#e5e7eb', 'display:flex', 'align-items:center', 'justify-content:center',
                    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
                ].join(';');
                document.documentElement.appendChild(mask);
            }
            mask.innerHTML = `
                <div style="box-sizing:border-box;width:min(520px,calc(100vw - 48px));padding:42px 36px;border-radius:24px;background:rgba(17,24,39,.92);border:1px solid rgba(148,163,184,.25);box-shadow:0 24px 80px rgba(0,0,0,.45);text-align:center;">
                    <div style="font-size:64px;line-height:1;margin-bottom:22px;">⏸️</div>
                    <div style="font-size:26px;font-weight:700;margin-bottom:12px;color:#f9fafb;">暂时无法访问</div>
                    <div style="font-size:15px;line-height:1.8;color:#cbd5e1;">${Util.escapeHtml(message || '暂时无法访问')}</div>
                </div>
            `;
            document.documentElement.style.overflow = 'hidden';
            if (document.body) document.body.style.overflow = 'hidden';
            this.pauseVideo();
        },

        removeCloudBlock() {
            document.getElementById('custom-play-page-cloud-block')?.remove();
            document.documentElement.style.overflow = '';
            if (document.body) document.body.style.overflow = '';
        },

        pauseVideo() {
            const video = document.querySelector('video');
            if (video) {
                video.pause();
                video.volume = 0;
            }
        },

        showPlayerBlock(message) {
            const playerRoot = Dom.playerRoot();
            if (!playerRoot) return;
            let overlay = document.getElementById('custom-play-page-player-block');
            if (!overlay) {
                const currentPosition = getComputedStyle(playerRoot).position;
                if (currentPosition === 'static') playerRoot.style.position = 'relative';
                overlay = document.createElement('div');
                overlay.id = 'custom-play-page-player-block';
                overlay.style.cssText = 'position:absolute;inset:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;z-index:999999;';
                playerRoot.appendChild(overlay);
            }
            overlay.innerHTML = `
                <div style="text-align:center;color:#999;user-select:none;">
                    <div style="font-size:64px;margin-bottom:16px;opacity:.4;">📭</div>
                    <div style="font-size:20px;font-weight:bold;color:#ccc;margin-bottom:8px;">视频已下架</div>
                    <div style="font-size:14px;color:#666;">${Util.escapeHtml(message || '根据相关规定，该视频无法播放')}</div>
                </div>
            `;
            this.pauseVideo();
        },

        removePlayerBlock() {
            document.getElementById('custom-play-page-player-block')?.remove();
        },

        restoreVideoVolume() {
            const video = document.querySelector('video');
            if (video && video.volume === 0) video.volume = 1;
        },

        async run(cloudConfig) {
            const bvid = Util.getBvid();
            if (!bvid) return;

            const playbackState = TimeWindow.state(cloudConfig);
            if (!playbackState.allow) {
                this.showCloudBlock(playbackState.message);
                return;
            }
            this.removeCloudBlock();

            const ownerMid = await BiliApi.fetchCurrentVideoOwnerMid(bvid);
            if (!ownerMid || Util.getBvid() !== bvid) return;

            if ((cloudConfig.blockedUpMids || Config.defaultBlockedUpMids).includes(ownerMid)) {
                this.showPlayerBlock();
                return;
            }

            const follower = await BiliApi.fetchUploaderFollower(ownerMid);
            if (follower !== null && follower < Config.minFollowerCount) {
                this.showPlayerBlock();
                return;
            }

            this.removePlayerBlock();
            this.restoreVideoVolume();
        }
    };

    const RightRecommendations = {
        inject(videos) {
            const container = Dom.safeRightContainer();
            if (!container) {
                Log.warn('未找到安全的右侧推荐容器，跳过右侧推荐渲染');
                return false;
            }
            if (Dom.isHeaderElement(container)) return false;

            container.classList.add('custom-play-page-right-root');
            container.querySelector('.custom-play-page-right-section')?.remove();
            container.querySelectorAll('.video-page-card-small:not(.custom-play-page-card), .rec-list, .next-play, [data-report*="related_rec"], .rcmd-tab, [class*="rcmd-tab"]').forEach(element => {
                if (!Dom.isHeaderElement(element)) element.style.display = 'none';
            });

            const section = document.createElement('div');
            section.className = 'custom-play-page-right-section';
            section.style.cssText = 'margin-bottom:20px;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;font-weight:bold;margin-bottom:12px;color:#212121;display:flex;align-items:center;gap:8px;';
            title.innerHTML = '<span style="color:#00a1d6;">★</span> 为你精选';
            section.appendChild(title);

            Util.shuffle(videos).slice(0, Config.rightRecommendCount).forEach(video => section.appendChild(this.createCard(video)));
            container.insertBefore(section, container.firstChild);
            Log.info('右侧自定义推荐已渲染');
            return true;
        },

        createCard(video) {
            const href = `https://www.bilibili.com/video/${video.bvid}`;
            const card = document.createElement('a');
            card.className = 'video-page-card-small custom-play-page-card';
            card.href = href;
            card.style.cssText = 'display:block;margin-bottom:12px;cursor:pointer;border:2px solid #00a1d6;border-radius:4px;padding:4px;background:#f0f9ff;text-decoration:none;color:inherit;';
            card.innerHTML = `
                <div style="display:flex;">
                    <div style="position:relative;width:160px;height:90px;flex-shrink:0;border-radius:4px;overflow:hidden;background:#eee;">
                        <img src="${video.pic}@160w_90h_1c.webp" style="width:100%;height:100%;object-fit:cover;" />
                        <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.7);color:white;padding:2px 4px;border-radius:2px;font-size:12px;">${Util.formatDuration(video.length || 0)}</div>
                    </div>
                    <div style="flex:1;margin-left:8px;min-width:0;display:flex;flex-direction:column;justify-content:space-between;">
                        <div style="font-size:13px;line-height:18px;max-height:36px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-all;color:#212121;font-weight:500;">${Util.escapeHtml(video.title)}</div>
                        <div style="font-size:12px;color:#999;">
                            <div style="margin-bottom:2px;">${Util.escapeHtml(video.author)}</div>
                            <div><span>▶ ${Util.formatCount(video.play)}</span><span style="margin-left:8px;">💬 ${Util.formatCount(video.comment)}</span></div>
                        </div>
                    </div>
                </div>
            `;
            return card;
        }
    };

    const EndScreenRecommendations = {
        bind(videos) {
            const video = document.querySelector('video');
            if (!video || State.endListenerVideo === video) return;
            State.endListenerVideo = video;
            video.addEventListener('ended', () => this.renderWhenReady(videos));
        },

        async renderWhenReady(videos) {
            const container = await Dom.waitFor(() => this.findContainer(), { timeout: 5000, interval: 300 });
            if (!container) {
                Log.warn('未找到播放器结束页推荐容器');
                return;
            }
            container.innerHTML = '';
            container.classList.add('custom-play-page-end-section');
            Util.shuffle(videos).slice(0, Config.endRecommendCount).forEach(video => {
                const card = document.createElement('a');
                card.className = 'bpx-player-ending-related-item custom-play-page-end-card';
                card.href = `https://www.bilibili.com/video/${video.bvid}`;
                card.innerHTML = `
                    <div class="bpx-player-ending-related-item-img"><img src="${video.pic}@320w_200h_1c.webp" style="width:100%;height:100%;object-fit:cover;" /></div>
                    <div class="bpx-player-ending-related-item-title">${Util.escapeHtml(String(video.title || '').slice(0, 14))}</div>
                `;
                container.appendChild(card);
            });
            Log.info('播放器结束页推荐已替换');
        },

        findContainer() {
            const root = Dom.playerRoot();
            if (!root) return null;
            const selectors = ['.bpx-player-ending-related', '.bpx-player-ending-content', '.bpx-player-ending-panel', '.bpx-player-ending'];
            for (const selector of selectors) {
                const element = root.querySelector(selector);
                if (element) return element;
            }
            return null;
        }
    };

    const MiniPlayerGuard = {
        start() {
            const root = Dom.playerRoot();
            if (!root || State.miniObserver) return;
            const normalize = () => {
                root.querySelectorAll('.bpx-player-container[data-screen="mini"]').forEach(player => {
                    player.dataset.screen = 'normal';
                    player.style.removeProperty('right');
                    player.style.removeProperty('bottom');
                    player.style.removeProperty('position');
                });
            };
            State.miniObserver = new MutationObserver(normalize);
            State.miniObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-screen'] });
            normalize();
        }
    };

    const App = {
        async loadRecommendations(cloudConfig) {
            const targetMids = cloudConfig.targetUpMids || Config.defaultTargetUpMids;
            const cached = RecommendationCache.read(targetMids);
            if (cached) return cached;

            const wbiKeys = await BiliApi.getWbiKeys();
            const allVideos = [];
            for (let index = 0; index < targetMids.length; index++) {
                const mid = targetMids[index];
                Log.info(`获取 UP主 ${mid} 视频 (${index + 1}/${targetMids.length})`);
                const videos = await BiliApi.fetchUploaderVideos(mid, wbiKeys);
                allVideos.push(...videos);
                if (index < targetMids.length - 1) await Util.delay(Config.uploaderRequestInterval);
            }
            if (allVideos.length) RecommendationCache.write(targetMids, allVideos);
            return allVideos;
        },

        async run() {
            const runId = ++State.routeRunId;
            Log.info('启动播放页定制逻辑');
            const cloudConfig = await CloudConfig.load();
            if (runId !== State.routeRunId) return;

            const playbackState = TimeWindow.state(cloudConfig);
            if (!playbackState.allow) {
                PlaybackGuard.showCloudBlock(playbackState.message);
                return;
            }
            PlaybackGuard.removeCloudBlock();
            await Dom.waitFor(() => Dom.playerRoot(), { timeout: 10000, interval: 200 });
            PlaybackGuard.run(cloudConfig);
            MiniPlayerGuard.start();

            const videos = await this.loadRecommendations(cloudConfig);
            if (runId !== State.routeRunId || !videos.length) return;
            State.recommendations = videos;
            await Dom.waitFor(() => RightRecommendations.inject(videos), { timeout: 10000, interval: 500 });
            EndScreenRecommendations.bind(videos);
        },

        watchRoute() {
            let lastBvid = Util.getBvid();
            let routeTimer = null;
            new MutationObserver(() => {
                const currentBvid = Util.getBvid();
                if (currentBvid && currentBvid !== lastBvid) {
                    lastBvid = currentBvid;
                    State.cloudPromise = null;
                    State.endListenerVideo = null;
                    document.querySelectorAll('.custom-play-page-right-section, #custom-play-page-player-block').forEach(el => el.remove());
                    clearTimeout(routeTimer);
                    routeTimer = setTimeout(() => this.run(), 800);
                }
            }).observe(document.body, { childList: true, subtree: true });
        },

        start() {
            injectBaseStyles();
            const cachedConfig = CloudConfig.readCache();
            const cachedState = TimeWindow.state(cachedConfig);
            if (cachedConfig && !cachedState.allow) PlaybackGuard.showCloudBlock(cachedState.message);

            const startMain = () => {
                this.watchRoute();
                this.run();
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', startMain, { once: true });
            } else {
                startMain();
            }
        }
    };

    App.start();
})();
