# sean537.github.io

---

## 是啥

### 山地奥斯卡537（Sean537）的个人主页暨博客

- 纯静态站点，直接部署在 GitHub Pages，无需任何服务端程序
- 目前仍在更新，欢迎提出优化建议

> 本站曾经也是 **537工作室官方网站**
>
> 现已迁移至 <https://www.537studio.com>
>
> 联系电子邮箱：<hello@537studio.com>

线上地址：<https://www.ithink537.top>

---

## 特色

- **设计**：苹果式排版与留白 × Minecraft 像素细节，主题色为 Apple Blue
- **浅色 / 深色双主题**：首次访问跟随系统偏好，手动选择保存在本地，切换无闪烁
- **全站响应式**：桌面、平板、手机自适应，手机端使用全屏菜单
- **丝滑动画**：滚动进场、数字滚动、卡片浮起、像素方块漂浮与视差，并遵循系统的“减少动态效果”设置
- **无障碍**：语义化标签、键盘可达、焦点样式、图片均有替代文本
- **性能**：字体子集化（Minecraft 字体 15.7MB → 3KB）、图片压缩，首页资源体积大幅缩减

## 目录结构

```
.
├── index.html            # 首页（单页：关于 / 经历 / 爱好 / 项目 / 博客 / 联系）
├── css/
│   └── main.css          # 全站唯一样式表（设计系统：令牌、组件、深浅色主题）
├── js/
│   ├── theme.js          # 浅色/深色主题切换
│   ├── main.js           # 导航、移动端菜单、进场动画、项目筛选
│   ├── articles.js       # 博客数据读取与渲染
│   └── image-preview.js  # 图片灯箱预览
├── blogs/
│   ├── index.html        # 博客列表页
│   ├── articles.html     # 文章数据源（唯一入口，含新增文章说明）
│   ├── 1/index.html      # 第 1 篇文章（data-article-view="1"）
│   └── 2/index.html      # 第 2 篇文章（data-article-view="2"）
├── images/               # 头像、项目图、服务器截图
├── fonts/Minecraft.woff  # Minecraft 像素字体（已子集化，仅含 ASCII）
├── software/             # 历史版本安装包
├── rss.xml / sitemap.xml
└── CNAME                 # 自定义域名
```

## 如何写一篇新博客

文章数据统一维护在 `blogs/articles.html` 的 `<template>` 中，首页预览、博客索引和文章正文都会自动读取：

1. 复制文件中任意一段 `<template>`（文件内有详细注释与现成模板）；
2. 设置唯一的 `data-article-id`（例如 `3`）、`data-title`、`data-date`（`YYYY-MM-DD`）、`data-excerpt`、`data-tags`；
3. 新建 `blogs/3/index.html`（复制 `blogs/1/index.html` 即可），把 `data-article-view` 改为 `3`；
4. 图片放入 `blogs/3/images/`，正文中以相对路径引用；
5. 顺手在 `rss.xml` 与 `sitemap.xml` 中各加一条记录。

## GitHub Pages 与评论

本站是纯静态 HTML、CSS 和 JavaScript 网站，可直接部署到 GitHub Pages。联系按钮通过 `mailto:` 打开访客的邮件应用，不依赖服务器端程序。

博文评论使用 Utterances，并以当前文章路径关联到本仓库的 GitHub Issue。首次启用时，请在公开仓库 `Sean537/sean537.github.io` 安装并授权 [Utterances GitHub App](https://github.com/apps/utterances)，并确认仓库允许创建 Issues。访客需要 GitHub 账号才能发表评论；评论公开保存在对应 Issue 中。

## 许可

代码与内容遵循 [LICENSE](LICENSE)。
