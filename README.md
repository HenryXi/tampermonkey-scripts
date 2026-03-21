# Tampermonkey Scripts

个人油猴（Tampermonkey）脚本收藏仓库，用于存储和管理各类用户脚本。

## 脚本列表

| 脚本名称 | 适用网站 | 功能描述 |
|----------|----------|----------|
| [B站显示UP主粉丝数](scripts/bilibili-show-fans-count.user.js) | bilibili.com 首页 | 在首页每个视频卡片下方显示UP主的粉丝数 |
| [B站自定义推荐视频](scripts/bilibili-custom-recommendations.user.js) | bilibili.com 视频播放页 | 在播放页右侧推荐区域添加指定UP主的视频 |
| [B站课程隐藏购买提醒](scripts/bilibili-cheese-remove-toast.user.js) | bilibili.com 课程播放页 | 隐藏课程播放页的购买提醒弹窗 |
| [B站自定义首页](scripts/bilibili-custom-homepage.user.js) | api.bilibili.com 推荐接口 | 拦截推荐API，用自定义页面展示视频列表，过滤短视频并按时长排序 |

## 使用方法

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击脚本文件，选择"Raw"查看原始内容
3. Tampermonkey 会自动识别并提示安装

## 目录结构

```
tampermonkey-scripts/
├── README.md       # 本说明文件
└── scripts/
    ├── bilibili-show-fans-count.user.js          # B站首页显示UP主粉丝数
    ├── bilibili-custom-recommendations.user.js   # B站播放页自定义推荐视频
    ├── bilibili-cheese-remove-toast.user.js      # B站课程播放页隐藏购买提醒
    └── bilibili-custom-homepage.user.js          # B站自定义首页（拦截推荐API）
```
