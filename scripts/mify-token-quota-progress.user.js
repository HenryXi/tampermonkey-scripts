// ==UserScript==
// @name         Mify Token 用量可视化
// @namespace    https://github.com/HenryXi/tampermonkey-scripts
// @version      1.0.0
// @description  访问 quota 接口时，将原始 JSON 渲染成 token 用量与当月时间进度对比页面
// @author       HenryXi
// @match        https://service.mify.mioffice.cn/console/api/model-access-tokens/quota*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const FAVICON_DATA_URI = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%231d4ed8%22/%3E%3Cpath d=%22M14 23l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z%22 fill=%22%23facc15%22/%3E%3Cpath d=%22M32 23l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z%22 fill=%22%239ca3af%22/%3E%3Cpath d=%22M50 23l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

    function setHead(title) {
        document.head.innerHTML = `<meta charset="utf-8"><title>${title}</title>`;
        const icon = document.createElement('link');
        icon.rel = 'icon';
        icon.href = FAVICON_DATA_URI;
        document.head.appendChild(icon);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function formatPercent(ratio) {
        return (ratio * 100).toFixed(2) + '%';
    }

    function formatNumber(value, digits) {
        return value.toFixed(digits);
    }

    function getMonthProgress(now) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const elapsed = now.getTime() - monthStart.getTime();
        const total = nextMonthStart.getTime() - monthStart.getTime();
        if (total <= 0) {
            return 0;
        }
        return clamp(elapsed / total, 0, 1);
    }

    function createProgressRow(title, subtitle, ratio, percentText, barColor) {
        const row = document.createElement('section');
        row.className = 'row-block';

        const header = document.createElement('div');
        header.className = 'row-header';

        const titleEl = document.createElement('div');
        titleEl.className = 'row-title';
        titleEl.textContent = title;

        const percentEl = document.createElement('div');
        percentEl.className = 'row-percent';
        percentEl.textContent = percentText;

        header.appendChild(titleEl);
        header.appendChild(percentEl);

        const subEl = document.createElement('div');
        subEl.className = 'row-subtitle';
        subEl.textContent = subtitle;

        const track = document.createElement('div');
        track.className = 'bar-track';

        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = (clamp(ratio, 0, 1) * 100).toFixed(2) + '%';
        fill.style.background = barColor;
        track.appendChild(fill);

        row.appendChild(header);
        row.appendChild(subEl);
        row.appendChild(track);
        return row;
    }

    function renderError(rawText, errorMessage) {
        setHead('Mify Token 配额可视化');
        document.body.innerHTML = '';

        const style = document.createElement('style');
        style.textContent = `
            * { box-sizing: border-box; }
            body {
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                background: #f6f8fb;
                color: #1f2937;
                padding: 24px;
            }
            .card {
                max-width: 980px;
                margin: 0 auto;
                background: #fff;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 20px;
            }
            h1 { margin: 0 0 12px; font-size: 22px; }
            p { margin: 0 0 12px; color: #4b5563; }
            pre {
                margin: 0;
                max-height: 420px;
                overflow: auto;
                background: #111827;
                color: #e5e7eb;
                border-radius: 8px;
                padding: 12px;
                white-space: pre-wrap;
                word-break: break-all;
            }
        `;
        document.head.appendChild(style);

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = '<h1>解析失败</h1><p></p><pre></pre>';
        card.querySelector('p').textContent = errorMessage;
        card.querySelector('pre').textContent = rawText.slice(0, 8000);
        document.body.appendChild(card);
    }

    function render(data) {
        const defaultQuota = toNumber(data.default_quota);
        const totalQuota = defaultQuota !== null ? defaultQuota : toNumber(data.quota);
        const currentCost = toNumber(data.current_cost);
        const now = new Date();
        const monthProgress = getMonthProgress(now);

        let usageRatio = null;
        if (totalQuota !== null && totalQuota > 0 && currentCost !== null) {
            usageRatio = currentCost / totalQuota;
        }

        setHead('Mify Token 配额可视化');
        document.body.innerHTML = '';

        const style = document.createElement('style');
        style.textContent = `
            * { box-sizing: border-box; }
            body {
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                background:
                    radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.08), transparent 40%),
                    radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.08), transparent 42%),
                    #f6f8fb;
                color: #111827;
                padding: 24px;
            }
            .card {
                max-width: 980px;
                margin: 0 auto;
                background: rgba(255, 255, 255, 0.98);
                border: 1px solid #e5e7eb;
                border-radius: 14px;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
                padding: 24px;
            }
            .header {
                display: flex;
                justify-content: space-between;
                gap: 16px;
                flex-wrap: wrap;
                margin-bottom: 20px;
            }
            .title {
                font-size: 24px;
                font-weight: 700;
                margin: 0;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .title-icon {
                width: 54px;
                height: 28px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                background: #dbeafe;
                font-size: 13px;
                line-height: 1;
                gap: 2px;
                padding: 0 4px;
            }
            .star-on {
                color: #facc15;
            }
            .star-off {
                color: #9ca3af;
            }
            .subtitle {
                margin: 8px 0 0;
                color: #4b5563;
                font-size: 14px;
            }
            .hint {
                color: #374151;
                font-size: 13px;
                background: #f3f4f6;
                border-radius: 10px;
                padding: 10px 12px;
                min-width: 220px;
                align-self: flex-start;
            }
            .row-block {
                margin-top: 18px;
            }
            .row-header {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 12px;
            }
            .row-title {
                font-size: 17px;
                font-weight: 600;
            }
            .row-percent {
                font-size: 16px;
                font-weight: 700;
            }
            .row-subtitle {
                margin-top: 6px;
                margin-bottom: 10px;
                font-size: 13px;
                color: #4b5563;
            }
            .bar-track {
                width: 100%;
                height: 16px;
                border-radius: 999px;
                background: #e5e7eb;
                overflow: hidden;
            }
            .bar-fill {
                height: 100%;
                border-radius: 999px;
                transition: width 0.35s ease;
            }
            .compare-box {
                margin-top: 18px;
                border-radius: 10px;
                padding: 12px 14px;
                font-size: 14px;
                background: #eff6ff;
                color: #1e3a8a;
            }
            .raw-box {
                margin-top: 20px;
                border-top: 1px solid #e5e7eb;
                padding-top: 14px;
                color: #4b5563;
                font-size: 13px;
            }
            .raw-box code {
                background: #f3f4f6;
                border-radius: 6px;
                padding: 2px 6px;
                color: #1f2937;
                font-size: 12px;
            }
        `;
        document.head.appendChild(style);

        const root = document.createElement('main');
        root.className = 'card';

        const header = document.createElement('header');
        header.className = 'header';
        header.innerHTML = `
            <div>
                <h1 class="title"><span class="title-icon"><span class="star-on">★</span><span class="star-off">★</span><span class="star-off">★</span></span><span>Mify Token 用量仪表盘</span></h1>
                <p class="subtitle">每次访问此接口时基于最新返回值实时渲染</p>
            </div>
            <div class="hint">当前时间：${now.toLocaleString()}</div>
        `;
        root.appendChild(header);

        if (usageRatio === null) {
            root.appendChild(
                createProgressRow(
                    'Token 用量进度',
                    `无法计算（default_quota=${String(data.default_quota)}, current_cost=${String(data.current_cost)})`,
                    0,
                    'N/A',
                    '#9ca3af'
                )
            );
        } else {
            root.appendChild(
                createProgressRow(
                    'Token 用量进度',
                    `已用 ${formatNumber(currentCost, 3)} / 总量 ${formatNumber(totalQuota, 3)}`,
                    usageRatio,
                    formatPercent(usageRatio),
                    '#2563eb'
                )
            );
        }

        root.appendChild(
            createProgressRow(
                '当月时间进度',
                '本月已过去时间占比',
                monthProgress,
                formatPercent(monthProgress),
                '#10b981'
            )
        );

        if (usageRatio !== null) {
            const delta = usageRatio - monthProgress;
            const compare = document.createElement('div');
            compare.className = 'compare-box';
            if (Math.abs(delta) < 0.0001) {
                compare.textContent = '消耗进度与时间进度基本一致。';
            } else if (delta > 0) {
                compare.textContent = `消耗进度快于时间进度 ${formatPercent(delta)}。`;
            } else {
                compare.textContent = `消耗进度慢于时间进度 ${formatPercent(Math.abs(delta))}。`;
            }
            root.appendChild(compare);
        }

        const raw = document.createElement('div');
        raw.className = 'raw-box';
        raw.innerHTML = `
            <div>原始字段：<code>quota=${String(data.quota)}</code> <code>default_quota=${String(data.default_quota)}</code> <code>current_cost=${String(data.current_cost)}</code></div>
        `;
        root.appendChild(raw);

        document.body.appendChild(root);
    }

    const rawText = (document.body && document.body.textContent) ? document.body.textContent.trim() : '';
    if (!rawText) {
        renderError('', '页面内容为空，无法读取 quota JSON。');
        return;
    }

    try {
        const payload = JSON.parse(rawText);
        render(payload);
    } catch (error) {
        renderError(rawText, 'JSON 解析失败：' + (error && error.message ? error.message : String(error)));
    }
})();
