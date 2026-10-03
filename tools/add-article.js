/* 新增文章一键工具：把 blogs/<id>/ 下的 Markdown 转成模板并接入站点。
 *
 * 用法：
 *   node tools/add-article.js <id> <标题> <YYYY-MM-DD> <标签,逗号分隔> <摘要> <md 文件> [选项]
 *
 * 例如：
 *   node tools/add-article.js 3 "C++入门——你的第一个Windows控制台应用程序" 2025-06-21 \
 *     "C++,入门,Windows" "从头文件到主函数，写下第一个 Windows 控制台程序。" \
 *     "blogs/3/C++入门——你的第一个Windows控制台应用程序.md" --column=cpp
 *
 /* 选项：
 *   --column=<key>   归入 js/articles.js 中定义的专栏（可选）
 *   --source=<url>   原始出处链接，例如首发在博客园（可选，文章页会显示「本文首发于 …」）
 *   --only-templates 只重建 blogs/articles.html 里的模板，不动文章页
 *   --no-feeds       跳过 rss.xml / sitemap.xml 同步
 *
 * 另有两个独立模式（不需要其它参数）：
 *   node tools/add-article.js --sync-feeds   只按 blogs/articles.html 重建 rss.xml + sitemap.xml
 *   node tools/add-article.js --list-columns  列出可用专栏
 *
 * 工具会做四件事：
 *   1. 复制 blogs/2/index.html 生成 blogs/<id>/index.html（改写 data-article-view）
 *   2. 把转换后的正文插入 blogs/articles.html 的模板区
 *   3. 按模板区重建 rss.xml（新增 <item>，含全文与分类）和 sitemap.xml（新增 <url> 与 lastmod）
 *   4. 打印生成结果与订阅地址
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { convert } = require('./md2html.js');
const { syncFeeds, buildColumnMap, SITE } = require('./feeds.js');

const ROOT = path.resolve(__dirname, '..');

/* 统一以 LF 写回，避免与仓库其它文件产生混合换行 */
function readText(file) {
	return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function writeText(file, text) {
	fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
}
const args = process.argv.slice(2);

/* 选项：--column=key 归入专栏，--source=url 标注首发出处，
   --only-templates 只重建模板，--no-feeds 跳过订阅文件，--list-columns 列出可用专栏 */
const flags = args.filter(a => a.startsWith('--'));
const onlyTemplates = args.includes('--only-templates');
const skipFeeds = args.includes('--no-feeds');
const option = name => {
	const hit = flags.find(a => a.startsWith('--' + name + '='));
	return hit ? hit.slice(name.length + 3) : '';
};

/* 专栏定义在 js/articles.js 的 COLUMNS 中，这里直接读取以校验 key */
const columnMap = buildColumnMap(ROOT);
const columns = Array.from(columnMap, ([key, title]) => ({ key, title }));

/* 独立模式：只重建 rss.xml 与 sitemap.xml */
if (args.includes('--sync-feeds')) {
	const result = syncFeeds(ROOT, { verbose: true });
	result.articles.forEach(article => {
		console.log('  ' + article.date + '  ' + article.url + '  ' + article.title);
	});
	process.exit(0);
}

if (args.includes('--list-columns')) {
	if (!columns.length) {
		console.log('未能在 js/articles.js 中解析出专栏定义');
	} else {
		console.log('可用专栏（用 --column=<key> 指定）：');
		columns.forEach(c => console.log('  ' + c.key.padEnd(10) + c.title));
	}
	process.exit(0);
}

/* 专栏 key：命令行参数 --column= 优先，其次第 7 个位置参数 */
const positional = args.filter(a => !a.startsWith('--'));
const [id, title, date, tags, excerpt, mdFile, columnArg] = positional;
const column = (option('column') || columnArg || '').trim();
const sourceUrl = option('source').trim();
const pinned = args.includes('--pinned');

if (!id || !title || !date || !tags || !excerpt || !mdFile) {
	console.error('用法: node tools/add-article.js <id> <标题> <YYYY-MM-DD> <标签> <摘要> <md 文件> [<专栏key>] [--column=key] [--source=url] [--only-templates] [--no-feeds]');
	console.error('可用专栏：' + (columns.length ? columns.map(c => c.key).join(' / ') : '（未解析到定义）') + '，用 --list-columns 查看详情');
	process.exit(1);
}

if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
	console.error('--source 必须是 http(s) 开头的完整链接');
	process.exit(1);
}

/* key 写错会导致文章不进任何专栏（页面也不会报错），因此这里直接拦下 */
if (column && columns.length && !columns.some(c => c.key === column)) {
	console.error('没有这个专栏：' + column);
	console.error('可用专栏：' + columns.map(c => c.key + '（' + c.title + '）').join(' / '));
	process.exit(1);
}

if (!/^\d+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
	console.error('id 必须是纯数字，日期必须是 YYYY-MM-DD');
	process.exit(1);
}

const mdPath = path.resolve(ROOT, mdFile);
if (!fs.existsSync(mdPath)) {
	console.error('找不到 Markdown 文件: ' + mdFile);
	process.exit(1);
}

const attr = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* 2025-06-21 → 2025年6月21日 */
const [year, month, day] = date.split('-');
const dateText = year + '年' + Number(month) + '月' + Number(day) + '日';

/* ---------- 1. 文章页 ---------- */

const pageDir = path.join(ROOT, 'blogs', id);
const pagePath = path.join(pageDir, 'index.html');

const basePage = readText(path.join(ROOT, 'blogs', '2', 'index.html'));

if (onlyTemplates) {
	console.log('仅重建模板，跳过文章页');
} else {
	if (fs.existsSync(pagePath)) {
		console.error('已存在，终止: ' + path.relative(ROOT, pagePath) + '（只想重建模板请加 --only-templates）');
		process.exit(1);
	}

	const page = basePage
		.replace('data-article-view="2"', 'data-article-view="' + id + '"')
		.replace('<meta name="description" content="山地奥斯卡537的博客文章。" />', '<meta name="description" content="' + attr(excerpt) + '" />')
		.replace('<title>文章 - 山地奥斯卡537的博客</title>', '<title>' + attr(title) + ' - 山地奥斯卡537的博客</title>');

	fs.mkdirSync(pageDir, { recursive: true });
	writeText(pagePath, page);
	console.log('已生成文章页: blogs/' + id + '/index.html');
}

/* ---------- 2. 模板 ---------- */

/* 正文缩进：<pre> 内部的后续行必须紧贴最左列，
   否则浏览器会把模板的制表符当成代码内容显示出来 */
function indentBody(html, indent) {
	let inCode = false;

	return html.split('\n').map(line => {
		if (!line.trim()) return '';
		if (inCode) {
			/* 代码内容行紧贴最左列，闭合标签所在行同样不缩进 */
			if (line.indexOf('</code></pre>') !== -1) inCode = false;
			return line;
		}
		if (line.indexOf('<pre') === 0 && line.indexOf('</code></pre>') === -1) {
			inCode = true; /* 单行代码块不会进入代码状态 */
		}
		return indent + line;
	}).join('\n');
}

const body = indentBody(convert(readText(mdPath)), '\t\t\t\t');

const template = [
	'\t<template' + (pinned ? ' data-pinned="1"' : '') + ' data-article-id="' + id + '" data-title="' + attr(title) + '"' + (column ? ' data-column="' + attr(column) + '"' : '') + ' data-date="' + date + '"',
	'\t\tdata-excerpt="' + attr(excerpt) + '" data-tags="' + attr(tags) + '"' + (sourceUrl ? ' data-source="' + attr(sourceUrl) + '"' : '') + '>',
	'\t\t<article class="article-entry">',
	'\t\t\t<header class="article-header">',
	'\t\t\t\t<p class="article-eyebrow">JOURNAL / ' + String(id).padStart(3, '0') + '</p>',
	'\t\t\t\t<h1>' + attr(title) + '</h1>',
	'\t\t\t\t<div class="article-meta">',
	'\t\t\t\t\t<time datetime="' + date + '">' + dateText + '</time>',
	'\t\t\t\t\t<span>山地奥斯卡537</span>',
	'\t\t\t\t</div>',
	'\t\t\t</header>',
	'\t\t\t<!-- 专栏内文章列表（由 js/articles.js 填充，仅专栏文章显示） -->',
	'\t\t\t<section class="column-nav" data-column-nav data-base="../" hidden aria-label="专栏文章">',
	'\t\t\t</section>',
	'\t\t\t<div class="article-body">',
	body,
	'\t\t\t</div>',
	'\t\t\t<footer class="article-author">',
	'\t\t\t\t<img src="https://cdn.imgos.cn/vip/2025/05/27/6835cc6e1b3aa.png" alt="山地奥斯卡537头像" loading="lazy" width="52" height="52" />',
	'\t\t\t\t<div><strong>山地奥斯卡537</strong><span>本文作者</span></div>',
	'\t\t\t</footer>',
	'\t\t\t<!-- 原始出处（data-source 为 http(s) 链接时才显示） -->',
	'\t\t\t<p class="article-source" data-article-source hidden></p>',
	'\t\t\t<section class="article-comments" aria-label="文章评论">',
	'\t\t\t\t<h2>讨论</h2>',
	'\t\t\t\t<p>使用 GitHub 账号发表评论，评论将公开显示。</p>',
	'\t\t\t\t<p class="comments-loading">评论区加载中……</p>',
	'\t\t\t\t<div data-utterances></div>',
	'\t\t\t\t<p class="comments-fallback" data-comments-fallback hidden>',
	'\t\t\t\t\t<span>评论区加载较慢或无法显示？</span>',
	'\t\t\t\t\t<a href="https://github.com/Sean537/sean537.github.io/issues" target="_blank" rel="noopener noreferrer">前往 GitHub 留言',
	'\t\t\t\t\t\t<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>',
	'\t\t\t\t\t</a>',
	'\t\t\t\t</p>',
	'\t\t\t</section>',
	'\t\t</article>',
	'\t</template>',
	''
].join('\n');

const articlesPath = path.join(ROOT, 'blogs', 'articles.html');
let articles = readText(articlesPath);

/* --only-templates 时先移除同编号的旧模板，避免重复 */
if (onlyTemplates) {
	const start = articles.indexOf('<template data-article-id="' + id + '"');
	if (start !== -1) {
		const end = articles.indexOf('</template>', start);
		const stop = end === -1 ? start : articles.indexOf('\n', end) + 1;
		articles = articles.slice(0, start) + articles.slice(stop);
		console.log('已移除旧模板: data-article-id="' + id + '"');
	}
}

/* 锚点：文件末尾的「新文章模板」注释块，换行风格已在上一步统一为 LF */
const marker = articles.indexOf('【新文章模板');
const anchor = marker === -1 ? -1 : articles.lastIndexOf('<!--', marker);
const insertAt = anchor === -1 ? articles.lastIndexOf('</body>') : anchor;

if (anchor === -1) {
	console.warn('未找到模板注释锚点，改为插入 </body> 之前');
}

writeText(articlesPath, articles.slice(0, insertAt) + template + '\n' + articles.slice(insertAt));

console.log('已插入模板  : blogs/articles.html (data-article-id="' + id + '")');
if (column) {
	const hit = columns.find(c => c.key === column);
	console.log('专栏归属    : ' + column + (hit ? '（' + hit.title + '）' : '') + '，文章页会自动出现专栏导航与专栏内翻页');
} else {
	console.log('专栏归属    : 无（作为随笔发布，不显示翻页区）');
}
console.log('置顶        : ' + (pinned ? '是（博客首页「置顶文章」会收录）' : '否'));

/* ---------- 4. RSS / sitemap ---------- */

if (skipFeeds) {
	console.log('订阅文件    : 已按 --no-feeds 跳过，稍后可执行 node tools/add-article.js --sync-feeds');
} else {
	syncFeeds(ROOT, { verbose: true });
	console.log('新文章已收录: rss.xml（<item> 含全文与分类）、sitemap.xml（<url> 含 lastmod）');
	console.log('订阅地址    : ' + SITE + '/rss.xml');
}
