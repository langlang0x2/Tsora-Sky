---
title:       'Blog使用手册'
publishDate: 2026-01-29
updatedDate: 2026-03-14
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
github登录

| # | table_name |
| : | :--------- |
| 1 | wl_comment |
| 2 | wl_counter |
| 3 | wl_users   |
| 4 | page_views | //我建立的统计次数表

PS：用mongodb资源请求超时，怎么改环境变量都不行，换节点也不行，直接放弃mongodb用vercel的neno了



## 三、工具

**docx**转**md**工具：**pandoc **
--extract-media=assets 为指定**图片**保存在**./assets/media**里面

```bash
pandoc input.docx -o index.md --extract-media=assets
```

