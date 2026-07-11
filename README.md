# Tampermonkey Scripts

个人油猴（Tampermonkey）脚本收藏仓库，用于存储和管理各类用户脚本。

## 脚本列表

| 脚本名称 | 适用网站 | 功能描述 |
|----------|----------|----------|
| [B站显示UP主粉丝数](scripts/bilibili-show-fans-count.user.js) | bilibili.com 首页、搜索页 | 在首页和搜索页每个视频卡片下方显示UP主的粉丝数 |
| [B站自定义推荐视频](scripts/bilibili-custom-recommendations.user.js) | bilibili.com 视频播放页 | 在播放页右侧推荐区域添加指定UP主的视频；支持屏蔽特定UP主和通过 Gitee 文本云端控制播放 |
| [B站课程隐藏购买提醒](scripts/bilibili-cheese-remove-toast.user.js) | bilibili.com 课程播放页 | 隐藏课程播放页的购买提醒弹窗 |
| [B站自定义首页](scripts/bilibili-custom-homepage.user.js) | api.bilibili.com 推荐接口 | 拦截推荐API，用自定义页面展示视频列表，过滤短视频并按时长排序 |
| [Mify Token 用量可视化](scripts/mify-token-quota-progress.user.js) | service.mify.mioffice.cn quota 接口 | 访问 quota 接口时，将 JSON 渲染为 token 用量进度和当月时间进度对比页面 |

## 使用方法

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击脚本文件，选择"Raw"查看原始内容
3. Tampermonkey 会自动识别并提示安装

## B站播放云端控制

`scripts/bilibili-custom-recommendations.user.js` 支持读取 Gitee 原始 JSON 控制播放开关、推荐 UP 主和屏蔽 UP 主：

1. 在 Gitee 新建一个 JSON 文件，例如 `bilibili.json`
2. 点击文件的「原始数据」，复制形如 `https://gitee.com/用户名/仓库/raw/master/bilibili.json` 的地址
3. 填入脚本顶部配置 `CLOUD_CONTROL_URL`

推荐配置格式：

```json
{
  "allowPlay": true,
  "message": "休息一下，稍后再看",
  "targetUpMids": ["326427334", "254463269"],
  "blockedUpMids": ["39977118", "1391326193"],
  "fetchUploaderInterval": 1500
}
```

字段说明：

- `allowPlay`：整体播放开关，`true` 允许，`false` 禁止并显示整页提示
- `message`：`allowPlay` 为 `false` 时展示的提示文案
- `targetUpMids`：右侧自定义推荐视频使用的 UP 主 UID 列表
- `blockedUpMids`：访问这些 UP 主的视频时，播放器内显示“视频已下架”
- `fetchUploaderInterval`：获取多个 UP 主视频时的请求间隔，单位毫秒；遇到 `request was banned` 可调大

整体开关也兼容纯文本：

- `allow`、`true`、`1`、`on`、`enable`：允许播放
- `block`、`deny`、`false`、`0`、`off`、`disable`：禁止播放

## 目录结构

```
tampermonkey-scripts/
├── README.md       # 本说明文件
└── scripts/
    ├── bilibili-show-fans-count.user.js          # B站首页/搜索页显示UP主粉丝数
    ├── bilibili-custom-recommendations.user.js   # B站播放页自定义推荐视频
    ├── bilibili-cheese-remove-toast.user.js      # B站课程播放页隐藏购买提醒
    ├── bilibili-custom-homepage.user.js          # B站自定义首页（拦截推荐API）
    └── mify-token-quota-progress.user.js         # Mify token 用量与当月时间进度可视化
```
