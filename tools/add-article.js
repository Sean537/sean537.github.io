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
 * 选项：
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
 *
 * 管理台（tools/admin-server.js）调用的是本文件导出的 createArticle()，与命令行同一套逻辑。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { convert, indentBody } = require('./md2html.js');
const { syncFeeds, buildColumnMap, SITE } = require('./feeds.js');

const ROOT = path.resolve(__dirname, '..');

/* 统一以 LF 写回，避免与仓库其它文件产生混合换行 */
function readText(file) {
	return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function writeText(file, text) {
	fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
}

const attr = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function dateTextOf(date) {
	const [year, month, day] = date.split('-');
	return year + '年' + Number(month) + '月' + Number(day) + '日';
}

/* 生成一篇文章：文章页 + 模板 + 订阅文件。
   options: { id, title, date, tags, excerpt, mdFile, column, source, pinned,
              onlyTemplates, skipFeeds, markdown }
   markdown 可直接给正文内容，省去先写 .md 文件（管理台用这个）。
   返回 { lines } —— 过程信息，由调用方决定打印还是返回给界面。 */
function createArticle(options) {
	const lines = [];
	const log = message => lines.push(message);

	const id = String(options.id || '').trim();
	const title = String(options.title || '').trim();
	const date = String(options.date || '').trim();
	const tags = String(options.tags || '').trim();
	const excerpt = String(options.excerpt || '').trim();
	const column = String(options.column || '').trim();
	const sourceUrl = String(options.source || '').trim();
	const pinned = !!options.pinned;
	const onlyTemplates = !!options.onlyTemplates;
	const skipFeeds = !!options.skipFeeds;

	const columns = Array.from(buildColumnMap(ROOT), ([key, value]) => ({ key, title: value }));

	if (!id || !title || !date || !excerpt || (!options.mdFile && !options.markdown)) {
		throw new Error('用法: node tools/add-article.js <id> <标题> <YYYY-MM-DD> <标签> <摘要> <md 文件> [<专栏key>] [--column=key] [--source=url] [--only-templates] [--no-feeds]');
	}

	/* 站点渲染时直接 split(data-tags)，空标签会让列表页报错，所以缺省记为「随笔」 */
	const tagText = tags || '随笔';

	if (!/^\d+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		throw new Error('id 必须是纯数字，日期必须是 YYYY-MM-DD');
	}
	if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
		throw new Error('--source 必须是 http(s) 开头的完整链接');
	}
	if (column && columns.length && !columns.some(c => c.key === column)) {
		throw new Error('没有这个专栏：' + column + '（可用：' + columns.map(c => c.key).join(' / ') + '）');
	}

	/* 正文来源：直接给内容，或读 .md 文件 */
	let markdown = options.markdown;
	if (markdown === undefined) {
		const mdPath = path.resolve(ROOT, options.mdFile);
		if (!fs.existsSync(mdPath)) {
			throw new Error('找不到 Markdown 文件: ' + options.mdFile);
		}
		markdown = readText(mdPath);
	}

	/* ---------- 1. 文章页 ---------- */

	const pageDir = path.join(ROOT, 'blogs', id);
	const pagePath = path.join(pageDir, 'index.html');

	if (onlyTemplates) {
		log('仅重建模板，跳过文章页');
	} else {
		if (fs.existsSync(pagePath)) {
			throw new Error('已存在，终止: ' + path.relative(ROOT, pagePath) + '（只想重建模板请加 --only-templates）');
		}

		const page = readText(path.join(ROOT, 'blogs', '2', 'index.html'))
			.replace('data-article-view="2"', 'data-article-view="' + id + '"')
			.replace('<meta name="description" content="山地奥斯卡537的博客文章。" />', '<meta name="description" content="' + attr(excerpt) + '" />')
			.replace('<title>文章 - 山地奥斯卡537的博客</title>', '<title>' + attr(title) + ' - 山地奥斯卡537的博客</title>');

		fs.mkdirSync(pageDir, { recursive: true });
		writeText(pagePath, page);
		log('已生成文章页: blogs/' + id + '/index.html');
	}

	/* ---------- 2. 模板 ---------- */

	/* 正文缩进规则见 md2html.js 的 indentBody：<pre> 内部的后续行必须紧贴最左列，
	   否则浏览器会把模板的制表符当成代码内容显示出来 */
	const body = indentBody(convert(markdown), '\t\t\t\t');

	const template = [
		'\t<template' + (pinned ? ' data-pinned="1"' : '') + ' data-article-id="' + id + '" data-title="' + attr(title) + '"' + (column ? ' data-column="' + attr(column) + '"' : '') + ' data-date="' + date + '"',
		'\t\tdata-excerpt="' + attr(excerpt) + '" data-tags="' + attr(tagText) + '"' + (sourceUrl ? ' data-source="' + attr(sourceUrl) + '"' : '') + '>',
		'\t\t<article class="article-entry">',
		'\t\t\t<header class="article-header">',
		'\t\t\t\t<p class="article-eyebrow">JOURNAL / ' + String(id).padStart(3, '0') + '</p>',
		'\t\t\t\t<h1>' + attr(title) + '</h1>',
		'\t\t\t\t<div class="article-meta">',
		'\t\t\t\t\t<time datetime="' + date + '">' + dateTextOf(date) + '</time>',
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

	if (onlyTemplates) {
		const start = articles.indexOf('<template data-article-id="' + id + '"');
		if (start !== -1) {
			const end = articles.indexOf('</template>', start);
			const stop = end === -1 ? start : articles.indexOf('\n', end) + 1;
			articles = articles.slice(0, start) + articles.slice(stop);
			log('已移除旧模板: data-article-id="' + id + '"');
		}
	}

	/* 锚点：文件末尾的「新文章模板」注释块，换行风格已在上一步统一为 LF */
	const marker = articles.indexOf('【新文章模板');
	const anchor = marker === -1 ? -1 : articles.lastIndexOf('<!--', marker);
	const insertAt = anchor === -1 ? articles.lastIndexOf('</body>') : anchor;

	if (anchor === -1) {
		lines.push('未找到模板注释锚点，改为插入 </body> 之前');
	}

	writeText(articlesPath, articles.slice(0, insertAt) + template + '\n' + articles.slice(insertAt));

	log('已插入模板  : blogs/articles.html (data-article-id="' + id + '")');

	log('专栏归属    : ' + (column ? column + (columns.find(item => item.key === column) ? '（' + columns.find(item => item.key === column).title + '）' : '') + '，文章页会自动出现专栏导航与专栏内翻页' : '无（作为随笔发布，不显示翻页区）'));

	log('标签        : ' + tagText + (tags ? '' : '（未填写，按「随笔」记录）'));

	log('置顶        : ' + (pinned ? '是（博客首页「置顶文章」会收录）' : '否'));

	/* ---------- 3. RSS / sitemap ---------- */

	if (skipFeeds) {
		log('订阅文件    : 已按 --no-feeds 跳过，稍后可执行 node tools/add-article.js --sync-feeds');
	} else {
		syncFeeds(ROOT, { verbose: true });
		log('新文章已收录: rss.xml（<item> 含全文与分类）、sitemap.xml（<url> 含 lastmod）');
		log('订阅地址    : ' + SITE + '/rss.xml');
	}

	return { lines, id };
}

/* 下一个可用编号：删除留下的空号不再复用 */
function nextFreeId() {
	const articlesPath = path.join(ROOT, 'blogs', 'articles.html');
	const html = readText(articlesPath);
	const used = new Set(Array.from(html.matchAll(/data-article-id="(\d+)"/g), hit => Number(hit[1])));
	let next = 1;
	while (used.has(next)) {
		next += 1;
	}
	return next;
}

module.exports = { createArticle, nextFreeId, readText, writeText, attr, ROOT };

/* ---------- 命令行 ---------- */

if (require.main === module) {
	const args = process.argv.slice(2);
	const flags = args.filter(a => a.indexOf('--') === 0);
	const option = name => {
		const hit = flags.find(a => a.indexOf('--' + name + '=') === 0);
		return hit ? hit.slice(name.length + 3) : '';
	};

	/* 独立模式：只重建 rss.xml 与 sitemap.xml */
	if (args.includes('--sync-feeds')) {
		const result = syncFeeds(ROOT, { verbose: true });
		require('./feeds.js').readArticles(ROOT).forEach(article => {
			console.log('  ' + article.date + '  ' + article.url + '  ' + article.title);
		});
		console.log('订阅地址: ' + SITE + '/rss.xml');
		process.exit(result.articles.length ? 0 : 1);
	}

	const columnMap = buildColumnMap(ROOT);

	if (args.includes('--list-columns')) {
		if (!columnMap.size) {
			console.log('未能在 js/articles.js 中解析出专栏定义');
		} else {
			console.log('可用专栏（用 --column=<key> 指定）：');
			Array.from(columnMap, ([key, title]) => console.log('  ' + key.padEnd(10) + title));
		}
		process.exit(0);
	}

	const positional = args.filter(a => a.indexOf('--') !== 0);
	const [id, title, date, tags, excerpt, mdFile, columnArg] = positional;

	try {
		const result = createArticle({
			id,
			title,
			date,
			tags,
			excerpt,
			mdFile,
			column: (option('column') || columnArg || '').trim(),
			source: option('source').trim(),
			pinned: args.includes('--pinned'),
			onlyTemplates: args.includes('--only-templates'),
			skipFeeds: args.includes('--no-feeds')
		});
		result.lines.forEach(line => console.log(line));
	} catch (error) {
		console.error('错误: ' + error.message);
		process.exit(1);
	}
}