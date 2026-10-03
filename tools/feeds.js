/* RSS / sitemap 生成器：唯一数据源是 blogs/articles.html 里的 <template>。
 *
 * 直接调用：
 *   node tools/feeds.js            重建 rss.xml 与 sitemap.xml
 *
 * 站内调用：
 *   const { syncFeeds } = require('./tools/feeds.js');
 *   syncFeeds(ROOT);
 *
 * 设计要点：
 *   - 一切从 blogs/articles.html 推导，因此手工改过正文后重新同步即可，不会漏更新；
 *   - 只用 Node 内置模块，无第三方依赖。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SITE = 'https://www.ithink537.top';
const SITE_NAME = '山地奥斯卡537';
const SITE_TAGLINE = '求知若饥，虚心若愚。';
const SITE_DESC = '山地奥斯卡537（Sean537）的个人主页与博客：项目记录、辞赋随笔与沿途思考。';
const AUTHOR_NAME = '山地奥斯卡537';
const AUTHOR_EMAIL = 'wushaoquan666@outlook.com';
const LOGO = SITE + '/537logo.png';

/* 兼容 Windows 换行 */
function readText(file) {
	return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function writeText(file, text) {
	fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
}

/* articles.html 的属性是用 attr() 转义后写入的，取出来要还原 */
function decodeEntities(text) {
	return String(text)
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

function escapeXml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/* CDATA 里不能出现 ]]>，拆成两段即可 */
function cdata(text) {
	return '<![CDATA[' + String(text).replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* 只知道日期不知道时间，沿用站点原有习惯：当天 23:00 +0800 */
function rfc822(date, hour) {
	const [y, m, d] = date.split('-').map(Number);
	const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
	return weekday + ', ' + String(d).padStart(2, '0') + ' ' + MONTHS[m - 1] + ' ' + y
		+ ' ' + String(hour).padStart(2, '0') + ':00:00 +0800';
}

function buildColumnMap(root) {
	try {
		const source = readText(path.join(root, 'js', 'articles.js'));
		const block = source.match(/var COLUMNS = \{([\s\S]*?)\n\t\};/);
		if (!block) {
			return new Map();
		}
		return new Map(Array.from(block[1].matchAll(/^\t\t'?([\w-]+)'?:\s*\{\s*title:\s*'([^']*)'/gm))
			.map(m => [m[1], m[2]]));
	} catch (error) {
		return new Map();
	}
}

/* 取 <div class="article-body"> … </div> 的内部 HTML，按 div 层级配对 */
function extractBody(inner) {
	const openTag = '<div class="article-body">';
	const open = inner.indexOf(openTag);

	if (open === -1) {
		return '';
	}

	const from = open + openTag.length;
	let depth = 1;
	let cursor = from;

	while (cursor < inner.length) {
		const nextOpen = inner.indexOf('<div', cursor);
		const nextClose = inner.indexOf('</div>', cursor);

		if (nextClose === -1) {
			break;
		}

		if (nextOpen !== -1 && nextOpen < nextClose) {
			depth++;
			cursor = nextOpen + 4;
			continue;
		}

		depth--;
		if (depth === 0) {
			return inner.slice(from, nextClose).trim();
		}
		cursor = nextClose + 6;
	}

	return '';
}

/* 解析 blogs/articles.html，返回按时间自新至旧排列的文章列表 */
function readArticles(root) {
	const html = readText(path.join(root, 'blogs', 'articles.html'));
	const articles = [];
	let cursor = 0;

	for (;;) {
		const start = html.indexOf('<template', cursor);
		if (start === -1) {
			break;
		}

		const tagEnd = html.indexOf('>', start);
		if (tagEnd === -1) {
			break;
		}

		const openTag = html.slice(start, tagEnd);
		const end = html.indexOf('</template>', tagEnd);
		const inner = end === -1 ? '' : html.slice(tagEnd + 1, end);

		cursor = end === -1 ? tagEnd + 1 : end + 1;

		const attrs = {};
		for (const hit of openTag.matchAll(/data-([\w-]+)="([^"]*)"/g)) {
			attrs[hit[1]] = decodeEntities(hit[2]);
		}

		if (!attrs['article-id']) {
			continue;
		}

		articles.push({
			id: attrs['article-id'],
			title: attrs.title || '',
			date: attrs.date || '',
			excerpt: attrs.excerpt || '',
			tags: (attrs.tags || '').split(',').map(t => t.trim()).filter(Boolean),
			column: attrs.column || '',
			pinned: attrs.pinned === '1',
			source: attrs.source || '',
			url: SITE + '/blogs/' + attrs['article-id'] + '/',
			body: extractBody(inner)
		});
	}

	/* 日期相同时按编号倒序，保证结果稳定 */
	return articles.sort((a, b) => (a.date === b.date ? Number(b.id) - Number(a.id) : (a.date < b.date ? 1 : -1)));
}

function buildRss(articles, columns) {
	const newest = articles[0];
	const items = articles.map(article => {
		const categories = article.tags.slice();
		const columnTitle = columns.get(article.column);

		if (columnTitle) {
			categories.push('专栏 · ' + columnTitle);
		}

		return [
			'\t\t<item>',
			'\t\t\t<title>' + escapeXml(article.title) + '</title>',
			'\t\t\t<link>' + article.url + '</link>',
			'\t\t\t<guid isPermaLink="true">' + article.url + '</guid>',
			'\t\t\t<author>' + AUTHOR_EMAIL + ' (' + AUTHOR_NAME + ')</author>',
			'\t\t\t<dc:creator>' + AUTHOR_NAME + '</dc:creator>',
			'\t\t\t<pubDate>' + rfc822(article.date, 23) + '</pubDate>',
			categories.map(c => '\t\t\t<category>' + escapeXml(c) + '</category>').join('\n'),
			'\t\t\t<description>' + cdata(article.excerpt) + '</description>',
			article.body ? '\t\t\t<content:encoded>' + cdata(article.body) + '</content:encoded>' : '',
			'\t\t</item>'
		].filter(Boolean).join('\n');
	}).join('\n');

	/* 频道级分类：出现过的专栏 + 随笔 */
	const channelCategories = [];
	articles.forEach(article => {
		const title = columns.get(article.column);
		if (title && !channelCategories.includes('专栏 · ' + title)) {
			channelCategories.push('专栏 · ' + title);
		}
	});
	if (articles.some(article => !article.column) && !channelCategories.includes('随笔')) {
		channelCategories.push('随笔');
	}

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<!-- 本文件由 tools/feeds.js 从 blogs/articles.html 自动生成，请勿手工编辑 -->',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
		'\t<channel>',
		'\t\t<title>' + SITE_NAME + ' - ' + SITE_TAGLINE + '</title>',
		'\t\t<link>' + SITE + '/</link>',
		'\t\t<atom:link href="' + SITE + '/rss.xml" rel="self" type="application/rss+xml" />',
		'\t\t<description>' + cdata(SITE_DESC) + '</description>',
		'\t\t<language>zh-CN</language>',
		'\t\t<managingEditor>' + AUTHOR_EMAIL + ' (' + AUTHOR_NAME + ')</managingEditor>',
		'\t\t<webMaster>' + AUTHOR_EMAIL + ' (' + AUTHOR_NAME + ')</webMaster>',
		'\t\t<copyright>© 2023-2026 ' + AUTHOR_NAME + '</copyright>',
		'\t\t<lastBuildDate>' + rfc822((newest ? newest.date : '2025-05-17'), 23) + '</lastBuildDate>',
		'\t\t<generator>tools/feeds.js</generator>',
		'\t\t<docs>https://www.rssboard.org/rss-specification</docs>',
		'\t\t<ttl>1440</ttl>',
		'\t\t<image>',
		'\t\t\t<url>' + LOGO + '</url>',
		'\t\t\t<title>' + SITE_NAME + '</title>',
		'\t\t\t<link>' + SITE + '/</link>',
		'\t\t</image>',
		channelCategories.map(c => '\t\t<category>' + escapeXml(c) + '</category>').join('\n'),
		items,
		'\t</channel>',
		'</rss>',
		''
	].join('\n');
}

function buildSitemap(articles) {
	const newest = articles.length ? articles[0].date : '';

	const urls = [
		{ loc: SITE + '/', lastmod: newest, changefreq: 'weekly', priority: '1.0' },
		{ loc: SITE + '/blogs/', lastmod: newest, changefreq: 'weekly', priority: '0.8' }
	].concat(articles.map(article => ({
		loc: article.url,
		lastmod: article.date,
		changefreq: 'monthly',
		priority: '0.6'
	})));

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<!-- 本文件由 tools/feeds.js 从 blogs/articles.html 自动生成，请勿手工编辑 -->',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		urls.map(url => [
			'\t<url>',
			'\t\t<loc>' + url.loc + '</loc>',
			url.lastmod ? '\t\t<lastmod>' + url.lastmod + '</lastmod>' : '',
			'\t\t<changefreq>' + url.changefreq + '</changefreq>',
			'\t\t<priority>' + url.priority + '</priority>',
			'\t</url>'
		].filter(Boolean).join('\n')).join('\n'),
		'</urlset>',
		''
	].join('\n');
}

/* 重建 rss.xml 与 sitemap.xml；verbose 时打印每个文件里的文章链接 */
function syncFeeds(root, options) {
	const opts = options || {};
	const articles = readArticles(root);
	const columns = buildColumnMap(root);
	const files = [
		{ file: 'rss.xml', text: buildRss(articles, columns) },
		{ file: 'sitemap.xml', text: buildSitemap(articles) }
	];

	files.forEach(entry => {
		const target = path.join(root, entry.file);
		const before = fs.existsSync(target) ? readText(target) : '';
		writeText(target, entry.text);

		if (opts.verbose) {
			const known = (before.match(/ithink537\.top\/blogs\/\d+\//g) || []).length;
			console.log('已写入 ' + entry.file.padEnd(11) + articles.length + ' 篇文章（原有 ' + known + ' 条）');
		}
	});

	return { articles, files };
}

module.exports = {
	SITE,
	readArticles,
	buildRss,
	buildSitemap,
	buildColumnMap,
	syncFeeds,
	rfc822,
	escapeXml,
	cdata,
	decodeEntities
};

if (require.main === module) {
	const result = syncFeeds(path.resolve(__dirname, '..'), { verbose: true });
	result.articles.forEach(article => {
		console.log('  ' + article.date + '  ' + article.url + '  ' + article.title);
	});
	console.log('订阅地址: ' + SITE + '/rss.xml');
}