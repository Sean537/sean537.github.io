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
- **三态主题**：跟随系统 / 浅色 / 深色，默认跟随系统偏好，手动选择保存在本地，切换无闪烁
- **博客专栏**：文章可归入专栏，专栏内自动生成上一篇 / 下一篇，并在文章顶部显示专栏导航
- **阅读体验**：文章页目录（宽屏左侧浮动、自动跟随滚动高亮 + 阅读进度；窄屏自动排到「专栏」下方、正文上方）、代码块一键复制、复制本文链接
- **博客概览**：博客首页先给出文章数、专栏数、正文总字数、专栏入口与置顶文章，再列出全部文章
- **友情链接**：首页底部「串门」区块，新增友链只需复制一个卡片
- **全站响应式**：桌面、平板、手机自适应
- **手机菜单**：仿 Apple 官网的实色面板，从顶栏下方滑出（不用半透明毛玻璃，避免内容透出）
- **丝滑动画**：滚动进场、数字滚动、卡片浮起、像素方块漂浮与视差，并遵循系统的“减少动态效果”设置
- **无障碍**：语义化标签、键盘可达、焦点样式、图片均有替代文本
- **性能**：字体子集化（Minecraft 字体 15.7MB → 3KB）、图片压缩，首页资源体积大幅缩减

## 本地预览

文章数据是运行时 `fetch('blogs/articles.html')` 拉取的，**直接双击打开 `index.html`（`file://` 协议）会读不到文章**。用任意静态服务器起一个本地预览即可：

```bash
# 任选一种（端口可换）
python -m http.server 8000
npx serve -l 8000
php -S localhost:8000
```

然后访问 <http://localhost:8000/>。预览时的文章分享链接仍然是线上地址（`https://www.ithink537.top/...`），不会把 `localhost` 分享出去。

## 目录结构

```
.
├── index.html            # 首页（单页：关于 / 经历 / 爱好 / 项目 / 博客 / 联系）
├── css/
│   └── main.css          # 全站唯一样式表（设计系统：令牌、组件、深浅色主题）
├── js/
│   ├── theme.js          # 浅色/深色/跟随系统 三态主题切换
│   ├── main.js           # 导航、移动端菜单、进场动画、项目筛选
│   ├── articles.js       # 博客渲染总入口（列表 / 文章 / 专栏 / 目录 / 翻页 / 复制链接挂载）
│   ├── comments-config.js # 评论系统配置（Utterances / Giscus 切换）
│   ├── comments.js       # 评论系统加载、主题同步与失败降级
│   ├── code-highlight.js # 文章代码高亮（c/cpp/bash/python）+ 右上角复制按钮
│   ├── share.js          # 「复制本文链接」文字链接（文首 + 文末各一个）
│   └── image-preview.js  # 图片灯箱预览
├── tools/
│   ├── md2html.js        # Markdown → 文章正文 HTML 转换器（零依赖）
│   └── add-article.js    # 新增文章一键工具（生成文章页 + 插入模板）
├── blogs/
│   ├── index.html        # 博客列表页（含博客概览、专栏与文章索引）
│   ├── articles.html     # 文章数据源（唯一入口，含新增文章说明）
│   ├── 1/index.html      # 第 1 篇文章（data-article-view="1"）
│   ├── 2/index.html      # 第 2 篇文章（data-article-view="2"）
│   ├── 3/                # 第 3 篇文章（Markdown 源文 + index.html）
│   ├── 4/
│   └── 5/
├── images/               # 头像、项目图、服务器截图
├── fonts/Minecraft.woff  # Minecraft 像素字体（已子集化，仅含 ASCII）
├── software/             # 历史版本安装包
├── rss.xml / sitemap.xml
└── CNAME                 # 自定义域名
```

## 如何写一篇新博客

文章数据统一维护在 `blogs/articles.html` 的 `<template>` 中，首页预览、博客索引和文章正文都会自动读取。文章编号沿用 `blogs/<id>/` 目录编号（`1` 为最早），列表始终按日期自新至旧排列，而**专栏内部是正序**（从最早的一篇开始读）。

### 一行命令：Markdown → 文章页面

先把文章写成 `blogs/<id>/文章名.md`，然后在项目根目录执行（需要 [Node.js](https://nodejs.org)，无任何第三方依赖）：

```bash
node tools/add-article.js <id> "<标题>" <YYYY-MM-DD> "<标签,逗号分隔>" "<摘要>" "blogs/<id>/文章名.md"
```

真实例子（就是博客 003 的写法，最后的 `cpp` 是专栏 key）：

```bash
node tools/add-article.js 3 "C++入门——你的第一个Windows控制台应用程序" 2025-06-21 "C++,入门,Windows" "从头文件、主函数到输入输出，用 Dev-C++ 写出第一个 Windows 控制台程序。" "blogs/3/C++入门——你的第一个Windows控制台应用程序.md" cpp
```

六个位置参数的含义：

| 位置 | 含义 | 规则 |
| --- | --- | --- |
| `<id>` | 文章编号 | 纯数字，与 `blogs/<id>/` 目录一致，1 为最早 |
| `<标题>` | 文章标题 | 需用引号包住，含空格或标点时必须加引号 |
| `<YYYY-MM-DD>` | 发布日期 | 决定列表排序（自新至旧） |
| `<标签>` | 标签 | 英文逗号分隔，显示为 `A / B / C` |
| `<摘要>` | 摘要 | 显示在首页预览、博客索引与 meta description |
| `<md 文件>` | Markdown 源文 | 建议就放在 `blogs/<id>/` 里一起留档 |
| `<专栏 key>` | 所属专栏（可选） | 留空即作为随笔发布；可写位置参数或 `--column=`，写错会报错 |

命令会做三件事：

1. 复制 `blogs/2/index.html` 生成 `blogs/<id>/index.html`（改写 `data-article-view`、`title`、`description`）；
2. 调用 `tools/md2html.js` 把 Markdown 转成正文 HTML，插入 `blogs/articles.html` 的模板区；
3. 提示你手动同步 `rss.xml` 与 `sitemap.xml`。

其它用法：

```bash
# 列出所有可用专栏的 key 与标题
node tools/add-article.js --list-columns

# 只转换 Markdown → 正文 HTML，输出到控制台或文件（便于预览）
node tools/md2html.js "blogs/3/C++入门——你的第一个Windows控制台应用程序.md"
node tools/md2html.js "blogs/5/xxx.md" > preview.html

# 转换规则改动后，只重建模板、不动已生成的文章页（会替换同编号旧模板）
node tools/add-article.js 3 "标题" 2025-06-21 "标签" "摘要" "blogs/3/xxx.md" cpp --only-templates
```

可选参数：

| 参数 | 说明 |
| --- | --- |
| `--column=<key>` | 归入 js/articles.js 的 `COLUMNS` 中已定义的专栏，生成专栏导航与专栏内翻页 |
| 第 7 个位置参数 | 与 `--column=` 等价，写法更短：`… "blogs/3/x.md" cpp` |
| `--pinned` | 在模板上写 `data-pinned="1"`，该文会进入博客首页的「置顶文章」 |
| `--source=<url>` | 原始出处链接（例如首发在博客园），文章页作者卡片下方显示「本文首发于 …」；必须是 `http(s)` 完整链接 |
| `--only-templates` | 只重建 blogs/articles.html 里的模板，不生成文章页 |
| `--list-columns` | 列出当前所有可用专栏的 key 与标题 |

> 专栏 key 写错时工具会直接报错并列出可用值 —— 因为写错的文章不会进入任何专栏，
> 页面也不会报错，很容易被忽略。

> 命令行里的 `--column` / `--source` 与模板里的 `data-column` / `data-source` 是同一个意思，
> 前者只是写模板时更省事。

### 转换规则

| Markdown | 生成的 HTML | 说明 |
| --- | --- | --- |
| `# 标题` ~ `##### 标题` | `<h2>` ~ `<h6>` | 页面标题已占用 `h1`，故整体下移一级 |
| ` ```cpp ` 围栏代码 | `<pre data-lang="cpp"><code class="language-cpp">` | **代码块的续行紧贴最左列，不加任何缩进** |
| `> 引用` | `<blockquote>` | 引用内同样支持代码块、列表、标题 |
| 表格 | `<div class="table-wrap"><table>` | 宽表在窄屏内横向滚动，不会撑破布局 |
| `- 列表` / `1. 列表` | `<ul>` / `<ol>` | 支持缩进嵌套；跨代码块续编号用 `<ol start="n">` |
| 独占一行的 `![alt](url)` | `<figure class="article-figure">` | 点击可放大（`js/image-preview.js`） |
| `**粗体**`、`*斜体*`、`~~删除~~` | `<strong>`、`<em>`、`<del>` | |
| `[文字](链接)`、`<https://…>` | `<a target="_blank" rel="noopener noreferrer">` | 外链自动补安全属性 |
| `<!-- 注释 -->` | 丢弃 | |

代码高亮由 `js/code-highlight.js` 在浏览器端完成，支持 `c` / `cpp` / `bash` / `python`，配色为 `css/main.css` 中的 `--code-*` 变量（深浅色各一套，均满足 WCAG AA 对比度）。因此 **模板里的 `class="language-xxx"` 必须保留**，它既是高亮依据，也标识代码语言；`data-lang` 则决定左上角显示的语言标签。

### 手动写法

不想用工具时：

1. 复制 `blogs/articles.html` 中任意一段 `<template>`（文件内有详细注释与现成模板）；
2. 设置唯一的 `data-article-id`（例如 `3`）、`data-title`、`data-date`（`YYYY-MM-DD`）、`data-excerpt`、`data-tags`；
3. 需要归入专栏时再加 `data-column="<专栏 key>"`（可选，key 见文件顶部的专栏定义）；
4. 新建 `blogs/3/index.html`（复制 `blogs/1/index.html` 即可），把 `data-article-view` 改为 `3`，并引入 `js/code-highlight.js`、`js/share.js`；
5. 图片放入 `blogs/3/images/`，正文中以 `/blogs/3/images/…` 引用；
6. 顺手在 `rss.xml` 与 `sitemap.xml` 中各加一条记录。

模板属性一览：

| 属性 | 必填 | 说明 |
| --- | --- | --- |
| `data-article-id` | 是 | 纯数字，与 `blogs/<id>/` 目录一致，1 为最早 |
| `data-title` | 是 | 文章标题，同时用于 eyebrow 编号与面包屑 |
| `data-date` | 是 | 发布日期，决定列表排序（自新至旧） |
| `data-excerpt` | 是 | 摘要，显示在首页预览、博客索引与 meta description |
| `data-tags` | 是 | 标签，英文逗号分隔 |
| `data-column` | 否 | 所属专栏 key；填了才会生成专栏导航与专栏内翻页 |
| `data-pinned` | 否 | 填 `data-pinned="1"` 即在博客首页「置顶文章」中收录，最多取 3 篇 |
| `data-source` | 否 | 原始出处链接（如 cnblogs 地址），保留来源出处 |

> 写多行代码块时务必注意：`<pre>` 后的**每一行都要顶到最左列**，
> 否则模板里的制表符会被浏览器当成代码内容显示出来。
>
> ```html
> <pre data-lang="cpp"><code class="language-cpp">#include &lt;iostream&gt;
> int main() {
>     return 0;
> }</code></pre>
> ```

## 博客功能说明

| 功能 | 实现位置 | 说明 |
| --- | --- | --- |
| 专栏 | `js/articles.js` 的 `COLUMNS` | 顶部定义 key / 标题 / 简介；文章用 `data-column` 关联 |
| 专栏内翻页 | `js/articles.js` | 只在同专栏内按日期取相邻文章，随笔文章不显示翻页区 |
| 专栏排序 | `js/articles.js` | 专栏内文章按时间**正序**（自前到后，最早的在前，编号 01、02…）；专栏卡片本身按最早一篇的时间排列。首页 / 博客页的文章列表仍是新→旧 |
| 左侧目录 | `js/articles.js` | 收集正文 h2–h6 生成锚点，滚动时高亮当前小节并显示阅读进度；桌面端 sticky，窄屏时自动挪到「专栏」下方、正文上方 |
| 无目录布局 | `js/articles.js` + `css/main.css` | 没有小标题的短文隐藏目录，布局同时收成单列并居中，正文不会挤进目录栏 |
| 代码复制 | `js/code-highlight.js` | 为每个 `pre` 注入左上语言标签与右上角复制按钮，文本从 `code` 元素读取，不含按钮本身 |
| 复制本文链接 | `js/share.js` | 文首（日期/作者同一行右侧）一个文字链接，文末一个带分享图标的按钮（位于作者信息之前、相对正文左右居中），点击均复制线上地址并就地提示「链接已复制」 |
| 博客概览 | `blogs/articles.html` 的 `data-article-intro` 模板 | 渲染文章数 / 专栏数 / 正文总字数（中日韩按字、其余按单词计）、专栏卡片与置顶文章 |
| 置顶文章 | `blogs/articles.html` + `js/articles.js` | 模板上 `data-pinned="1"` 的文章，最多 3 篇，按日期从新到旧；一篇未置顶时整段隐藏 |

文章数据源只写在 `blogs/articles.html` 一处：新增文章时正文用 `tools/add-article.js` 生成模板，专栏归属用 `data-column` 补一个属性即可，其余页面（首页预览、博客列表、文章页目录与翻页）都会自动跟上。

### 为什么没有浏览量

站内曾做过浏览量统计，但纯静态站点拿不到全网真实 PV（`localStorage` 只统计本机，第三方统计又依赖外部服务），因此**已整体移除**，不做数字展示，避免误导读者。

### 为什么没有「一键分享到微博 / X」

试过一版多平台分享按钮，实际使用中很吵：手机上要点两三次才能用上，分享出去的还是链接，而微信内置浏览器又常常打不开这些平台。最终收敛为**一个复制链接的文字链接**——文首与文末各一个，覆盖「读完即转」和「想收藏」两种场景。

## GitHub Pages 与评论

本站是纯静态 HTML、CSS 和 JavaScript 网站，可直接部署到 GitHub Pages。联系按钮通过 `mailto:` 打开访客的邮件应用，不依赖服务器端程序。

博文评论使用 Utterances，并以当前文章路径关联到本仓库的 GitHub Issue。首次启用时，请在公开仓库 `Sean537/sean537.github.io` 安装并授权 [Utterances GitHub App](https://github.com/apps/utterances)，并确认仓库允许创建 Issues。访客需要 GitHub 账号才能发表评论；评论公开保存在对应 Issue 中。

若你的网络无法访问 `utteranc.es` → `api.github.com`（评论区会一片空白），有两种解决方式：

- **修网络**：在代理规则中放行 `api.github.com` 与 `utteranc.es`；
- **改用 Giscus**：在 <https://giscus.app> 登录后取得 `repo` / `repoId` / `category` / `categoryId`，填入 `js/comments-config.js` 的 `giscus` 字段并把 `provider` 改为 `'giscus'`（需要仓库开启 Discussions）。

两种评论系统的配置都集中在 `js/comments-config.js`，页面加载失败时评论区会自动显示“前往 GitHub 留言”的备用入口。

## 许可

代码与内容遵循 [LICENSE](LICENSE)。
