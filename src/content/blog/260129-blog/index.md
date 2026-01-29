---
title:       'Blog使用手册'
publishDate: 2026-01-29
updatedDate: 2026-01-29
description: '如何使用blog'
tags:
  - blog
language: 'zh-CN'
---
# 如何使用Blog

## 一、Blog内容头


```txt
---
title:       'Blog使用手册'
description: '如何使用blog'
publishDate: 2026-01-29
updatedDate: 2026-01-29
tags:
  - blog
language: 'zh-CN'
---
Write your content here.
```

属性：

draft: true 【正常不写】



## 二、Blog资源管理


域名管理：阿里云 https://home.console.aliyun.com/

服务器：vercel https://vercel.com/

评论：waline 文档 https://waline.js.org/guide

评论数据库：neon https://console.neon.tech/

PS：用mongodb资源请求超时，怎么改环境变量都不行，换节点也不行，直接放弃mongodb用vercel的neno了
