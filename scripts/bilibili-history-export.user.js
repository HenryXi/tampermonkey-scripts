// ==UserScript==
// @name         B站历史记录BV导出
// @namespace    https://github.com/HenryXi/tampermonkey-scripts
// @version      1.0.1
// @description  一键导出B站账号历史记录中的全部BV号，自动分页并去重
// @author       HenryXi
// @match        https://www.bilibili.com/history*
// @match        https://www.bilibili.com/account/history*
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const Config = {
        apiUrl: 'https://api.bilibili.com/x/web-interface/history/cursor',
        pageSize: 30,
        requestInterval: 500,
        requestTimeout: 15000
    };

    const State = {
        exporting: false
    };

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function formatDatePart(value) {
        return String(value).padStart(2, '0');
    }

    function createFilename() {
        const now = new Date();
        const date = [now.getFullYear(), formatDatePart(now.getMonth() + 1), formatDatePart(now.getDate())].join('');
        const time = [formatDatePart(now.getHours()), formatDatePart(now.getMinutes()), formatDatePart(now.getSeconds())].join('');
        return `bilibili-history-bvid-${date}-${time}.txt`;
    }

    function normalizeCursor(cursor) {
        return {
            max: Number(cursor?.max || 0),
            viewAt: Number(cursor?.view_at || 0),
            business: String(cursor?.business || '')
        };
    }

    function cursorSignature(cursor) {
        return `${cursor.max}:${cursor.viewAt}:${cursor.business}`;
    }

    function requestHistory(cursor) {
        const params = new URLSearchParams({
            ps: String(Config.pageSize),
            type: 'archive',
            max: String(cursor.max),
            view_at: String(cursor.viewAt),
            business: cursor.business
        });

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${Config.apiUrl}?${params}`,
                timeout: Config.requestTimeout,
                anonymous: false,
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    Referer: 'https://www.bilibili.com/history'
                },
                onload(response) {
                    if (response.status < 200 || response.status >= 300) {
                        reject(new Error(`请求失败，HTTP ${response.status}`));
                        return;
                    }

                    let result;
                    try {
                        result = JSON.parse(String(response.responseText || ''));
                    } catch (error) {
                        reject(new Error('接口返回的内容不是有效 JSON'));
                        return;
                    }

                    if (result.code === -101) {
                        reject(new Error('尚未登录 B 站，请登录后重试'));
                        return;
                    }
                    if (result.code !== 0) {
                        reject(new Error(`B站接口错误：${result.message || result.code}`));
                        return;
                    }
                    if (!Array.isArray(result.data?.list)) {
                        reject(new Error('B站接口返回的数据格式异常'));
                        return;
                    }

                    resolve({
                        items: result.data.list,
                        cursor: result.data.cursor ? normalizeCursor(result.data.cursor) : null
                    });
                },
                ontimeout() {
                    reject(new Error('请求超时，请检查网络后重试'));
                },
                onerror() {
                    reject(new Error('网络请求失败，请检查网络后重试'));
                }
            });
        });
    }

    async function loadAllBvids(onProgress) {
        const bvids = new Set();
        let cursor = normalizeCursor(null);
        let pageCount = 0;
        let recordCount = 0;

        while (true) {
            const page = await requestHistory(cursor);
            pageCount++;
            recordCount += page.items.length;

            page.items.forEach(item => {
                const bvid = String(item?.history?.bvid || item?.bvid || '').trim();
                if (/^BV[0-9A-Za-z]+$/.test(bvid)) bvids.add(bvid);
            });

            onProgress({ pageCount, recordCount, bvidCount: bvids.size });

            if (!page.items.length || !page.cursor) break;
            if (cursorSignature(page.cursor) === cursorSignature(cursor)) break;

            cursor = page.cursor;
            await delay(Config.requestInterval);
        }

        return Array.from(bvids);
    }

    function downloadText(bvids) {
        const content = `${bvids.join('\n')}\n`;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = createFilename();
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function createExporter() {
        if (document.getElementById('bilibili-history-export-root')) return;

        const style = document.createElement('style');
        style.textContent = `
            #bilibili-history-export-root {
                position: fixed;
                right: 28px;
                bottom: 28px;
                z-index: 2147483646;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 8px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            #bilibili-history-export-status {
                display: none;
                max-width: 320px;
                padding: 9px 12px;
                border-radius: 8px;
                color: #61666d;
                background: rgba(255, 255, 255, .96);
                box-shadow: 0 4px 18px rgba(0, 0, 0, .14);
                font-size: 13px;
                line-height: 1.5;
            }
            #bilibili-history-export-status[data-visible="true"] {
                display: block;
            }
            #bilibili-history-export-status[data-type="error"] {
                color: #f53f3f;
            }
            #bilibili-history-export-button {
                border: 0;
                border-radius: 8px;
                padding: 11px 18px;
                color: #fff;
                background: #00aeec;
                box-shadow: 0 4px 18px rgba(0, 174, 236, .3);
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            }
            #bilibili-history-export-button:hover:not(:disabled) {
                background: #00a1d6;
            }
            #bilibili-history-export-button:disabled {
                cursor: wait;
                opacity: .7;
            }
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'bilibili-history-export-root';

        const status = document.createElement('div');
        status.id = 'bilibili-history-export-status';

        const button = document.createElement('button');
        button.id = 'bilibili-history-export-button';
        button.type = 'button';
        button.textContent = '导出全部 BV';

        function setStatus(message, type = 'info') {
            status.textContent = message;
            status.dataset.type = type;
            status.dataset.visible = message ? 'true' : 'false';
        }

        button.addEventListener('click', async () => {
            if (State.exporting) return;
            State.exporting = true;
            button.disabled = true;
            button.textContent = '正在导出…';
            setStatus('正在读取历史记录…');

            try {
                const bvids = await loadAllBvids(progress => {
                    setStatus(`已读取 ${progress.recordCount} 条记录，发现 ${progress.bvidCount} 个 BV`);
                });

                if (!bvids.length) {
                    setStatus('没有找到可导出的 BV 记录', 'error');
                    alert('没有找到可导出的 BV 记录');
                    return;
                }

                downloadText(bvids);
                setStatus(`导出完成：${bvids.length} 个 BV`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                setStatus(`导出失败：${message}`, 'error');
                alert(`B站历史记录导出失败：${message}`);
            } finally {
                State.exporting = false;
                button.disabled = false;
                button.textContent = '导出全部 BV';
            }
        });

        root.appendChild(status);
        root.appendChild(button);
        document.body.appendChild(root);
    }

    createExporter();
})();
