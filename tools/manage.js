/* 文章与专栏管理工具（零依赖）
 *
 * 用法：
 *   node tools/manage.js list                          列出文章与专栏
 *   node tools/manage.js delete <id> [--yes]           删除文章（编号保持不变，其余文章不重排）
 *   node tools/manage.js update <id> <md 文件> [选项]   用 Markdown 更新文章正文与元信息
 *   node tools/manage.js join <id> <专栏 key>          把文章加入专栏
 *   node tools/manage.js leave <id>                   把文章移出专栏（变回随笔）
 *   node tools/manage.js column list                   列出专栏
 *   node tools/manage.js column add <key> --title "标题" [--desc "简介"]
 *   node tools/manage.js column rm <key> [--move-to=key] 删除专栏（默认把文章放回随笔）
 *   node tools/manage.js column rename <key> <新 key>  改专栏 key，文章归属同步跟进
 *   node tools/manage.js column set <key> --title "标题" [--desc "简介"]
 *   node tools/manage.js md list <id>                   列出该篇的 Markdown 源文
 *   node tools/manage.js md read <id> <文件名>           打印该篇的 Markdown 源文
 *   node tools/manage.js md from-html <id> [--out=<文件名.md>] [--force]
 *                                                      由页面 HTML 反向生成 Markdown 源文
 *
 * 通用选项：
 *   --dry-run    只打印将要发生的改动，不写文件
 *   --no-feeds   不重建 rss.xml / sitemap.xml（默认会自动重建）
 *   --yes        删除等破坏性操作无需交互确认
 *
 * update 专用选项：
 *   --title= --date= --tags= --excerpt= --source= --column= --leave-column --pin --unpin
 *
 * md from-html 专用选项：
 *   --out=<文件名.md>   指定文件名，默认用文章标题
 *   --force             覆盖已存在的同名源文
 *   --stdout            只打印 Markdown，不写文件
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { toTemplateBody } = require('./md2html.js');
const { toMarkdown } = require('./html2md.js');
const { syncFeeds, readArticles, buildColumnMap, bodyRange } = require('./feeds.js');

const ROOT = path.resolve(__dirname, '..');
const ARTICLES = path.join(ROOT, 'blogs', 'articles.html');
const ARTICLES_JS = path.join(ROOT, 'js', 'articles.js');
const CLOSE = '</template>';

/* ---------- 基础工具 ---------- */

function readText(file) {
	return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function writeText(file, text) {
	fs.writeFileSync(file, text.replace(/\r\n/g, '\n'), 'utf8');
}

function attr(text) {
	return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function info(message) {
	console.log(message);
}

function warn(message) {
	console.error('! ' + message);
}

/* ---------- 参数 ---------- */

/* 这些值由 run() 每次调用时重建：命令行与管理台（tools/admin-server.js）共用同一套解析 */
let argv = [];
let flags = [];
let positional = [];
let values = {};

const settings = {
	dryRun: false,
	skipFeeds: false,
	assumeYes: false
};

/* 选项值两种写法都认：--title="标题" 与 --title "标题" */
const VALUE_OPTIONS = ['title', 'desc', 'date', 'tags', 'excerpt', 'source', 'column', 'move-to', 'out'];

const option = name => values[name] || '';
const has = name => flags.some(a => a === '--' + name || a.indexOf('--' + name + '=') === 0);

function parseArgs(list) {
	argv = list;
	flags = argv.filter(a => a.indexOf('--') === 0);
	positional = argv.filter(a => a.indexOf('--') !== 0);
	values = {};

	VALUE_OPTIONS.forEach(name => {
		const eq = flags.find(a => a.indexOf('--' + name + '=') === 0);
		if (eq) {
			values[name] = eq.slice(name.length + 3);
			return;
		}
		const at = argv.indexOf('--' + name);
		if (at !== -1 && argv[at + 1] && argv[at + 1].indexOf('--') !== 0) {
			values[name] = argv[at + 1];
		}
	});

	settings.dryRun = flags.includes('--dry-run');
	settings.skipFeeds = flags.includes('--no-feeds');
	settings.assumeYes = flags.includes('--yes');
}

function confirm(question) {
	if (settings.assumeYes) {
		return true;
	}
	if (!process.stdin.isTTY) {
		warn('非交互环境下请加 --yes 确认');
		return false;
	}

	process.stdout.write(question + ' [y/N] ');
	try {
		const buffer = Buffer.alloc(64);
		const read = fs.readSync(0, buffer, 0, 64, null);
		return /^\s*(y|yes)/i.test(buffer.slice(0, read).toString('utf8'));
	} catch (error) {
		return false;
	}
}

/* ---------- 模板读写 ---------- */

function findTemplate(html, id) {
	const marker = 'data-article-id="' + id + '"';
	const at = html.indexOf(marker);

	if (at === -1) {
		return null;
	}

	const start = html.lastIndexOf('<template', at);
	const tagEnd = html.indexOf('>', start);
	const end = html.indexOf(CLOSE, tagEnd);

	if (start === -1 || tagEnd === -1 || end === -1) {
		return null;
	}

	return {
		start,
		tagEnd,
		end,
		/* openTag 含结尾的 >，splice 时原样写回 */
		openTag: html.slice(start, tagEnd + 1),
		inner: html.slice(tagEnd + 1, end),
		attrs: readAttrs(html.slice(start, tagEnd))
	};
}

function readAttrs(openTag) {
	const attrs = {};
	for (const hit of openTag.matchAll(/data-([\w-]+)="([^"]*)"/g)) {
		attrs[hit[1]] = hit[2];
	}
	return attrs;
}

function applyAttrs(openTag, changes) {
	let out = openTag;

	Object.keys(changes).forEach(name => {
		const value = changes[name];
		const re = new RegExp('\\sdata-' + name + '="[^"]*"');

		if (value === null) {
			out = out.replace(re, '');
		} else if (re.test(out)) {
			out = out.replace(re, ' data-' + name + '="' + value + '"');
		} else {
			/* 用前瞻，避免把标签结尾的 > 一起吃掉 */
			out = out.replace(/\s*(?=>$)/, ' data-' + name + '="' + value + '"');
		}
	});

	return out;
}

/** 用新的 openTag / inner 替换整段模板，返回完整文件内容 */
function splice(html, block, openTag, inner) {
	return html.slice(0, block.start) + openTag + inner + CLOSE + html.slice(block.end + CLOSE.length);
}

function updateArticleAttributes(id, changes) {
	const html = readText(ARTICLES);
	const block = findTemplate(html, id);

	if (!block) {
		throw new Error('找不到文章模板：data-article-id="' + id + '"');
	}

	return { html: splice(html, block, applyAttrs(block.openTag, changes), block.inner), block };
}

function commitArticles(next, label) {
	if (settings.dryRun) {
		info('  [dry-run] ' + label);
		return;
	}
	writeText(ARTICLES, next);
}

function syncFeedsNow() {
	if (settings.skipFeeds) {
		info('订阅文件    : 已按 --no-feeds 跳过');
		return;
	}
	if (settings.dryRun) {
		info('  [dry-run] 将重建 rss.xml 与 sitemap.xml');
		return;
	}
	syncFeeds(ROOT);
	info('订阅文件    : rss.xml、sitemap.xml 已按模板区重建');
}

/* ---------- 专栏定义（js/articles.js 里的 COLUMNS） ---------- */

function readColumns() {
	const source = readText(ARTICLES_JS);
	const start = source.indexOf('\tvar COLUMNS = {');

	if (start === -1) {
		throw new Error('未在 js/articles.js 中找到 COLUMNS 定义');
	}

	const end = source.indexOf('\n\t};', start);
	if (end === -1) {
		throw new Error('COLUMNS 定义没有正常结束（缺少 };）');
	}

	const entries = [];
	let current = null;

	source.slice(start, end).split('\n').forEach(line => {
		if (!line.trim() || /^\tvar COLUMNS = \{$/.test(line)) {
			return;
		}

		const head = /^\t\t'?([\w-]+)'?:\s*\{\s*$/.exec(line);
		if (head) {
			current = { key: head[1], fields: {} };
			entries.push(current);
			return;
		}

		const field = /^\t\t\t(\w+):\s*'((?:[^'\\]|\\.|'')*)',?\s*$/.exec(line);
		if (field && current) {
			current.fields[field[1]] = field[2].replace(/\\'/g, "'").replace(/''/g, "'");
			return;
		}

		if (/^\t\t\},?\s*$/.test(line)) {
			current = null;
			return;
		}

		throw new Error('无法解析 COLUMNS 中的这一行：' + line);
	});

	return { source, start, end, entries };
}

function renderColumns(entries) {
	const body = entries.map((entry, index) => {
		const fields = Object.keys(entry.fields).map(name =>
			'\t\t\t' + name + ": '" + String(entry.fields[name]).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
		);
		return '\t\t' + entry.key + ': {\n' + fields.join(',\n') + '\n\t\t}' + (index === entries.length - 1 ? '' : ',');
	}).join('\n');

	return '\tvar COLUMNS = {\n' + body + '\n\t};';
}

/** 写回 COLUMNS，并用 node --check 校验，失败自动回滚 */
function writeColumns(state, label) {
	/* state.end 指向结尾的 \n\t}; 里的 \n，需要跳过 4 个字符 */
	const next = state.source.slice(0, state.start) + renderColumns(state.entries) + state.source.slice(state.end + 4);

	if (settings.dryRun) {
		info('  [dry-run] ' + label);
		return;
	}

	writeText(ARTICLES_JS, next);
	const check = spawnSync(process.execPath, ['--check', ARTICLES_JS], { encoding: 'utf8' });

	if (check.status !== 0) {
		writeText(ARTICLES_JS, state.source);
		throw new Error('改写后的 js/articles.js 语法校验失败，已回滚：\n' + (check.stderr || '').trim());
	}

	info('专栏定义    : js/articles.js 已更新并通过语法校验（' + label + '）');
}

/* 批量改写模板里的 data-column */
function setColumnOfTemplates(fromKey, toKey) {
	const html = readText(ARTICLES);
	const re = /data-column="([^"]*)"/g;
	const hits = [];
	let match;
	let next = html;

	while ((match = re.exec(html)) !== null) {
		if (match[1] === fromKey) {
			hits.push(match[1]);
		}
	}

	next = html.replace(/data-column="([^"]*)"/g, (whole, key) => (key === fromKey ? 'data-column="' + attr(toKey) + '"' : whole));
	commitArticles(next, '更新 ' + hits.length + ' 篇模板的 data-column');

	return hits.length;
}

/* ---------- 展示 ---------- */

/** 中日韩字符按两列宽计算，列表才对得齐 */
function displayWidth(text) {
	return String(text).replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g, 'xx').length;
}

function padEnd(text, size) {
	const value = String(text);
	return value + ' '.repeat(Math.max(1, size - displayWidth(value)));
}

function articleRows() {
	return readArticles(ROOT).slice().sort((a, b) => (a.date === b.date ? Number(a.id) - Number(b.id) : (a.date < b.date ? 1 : -1)));
}

function cmdList() {
	const columns = buildColumnMap(ROOT);
	const articles = articleRows();

	info('文章（共 ' + articles.length + ' 篇）');
	info('  ' + padEnd('编号', 6) + padEnd('日期', 12) + padEnd('专栏', 18) + padEnd('置顶', 6) + '标题');
	articles.forEach(article => {
		const column = columns.get(article.column);
		info('  ' + padEnd(article.id, 6) + padEnd(article.date, 12) +
			padEnd(column || '（随笔）', 18) + padEnd(article.pinned ? '是' : '-', 6) + article.title);
	});

	/* 编号只增不减：删除后留下的空号不再复用 */
	const used = new Set(articles.map(article => Number(article.id)));
	let next = 1;
	while (used.has(next)) {
		next += 1;
	}

	info('');
	info('专栏（共 ' + columns.size + ' 个）');
	Array.from(columns, ([key, title]) => {
		const count = articles.filter(article => article.column === key).length;
		return '  ' + padEnd(key, 12) + title + '（' + count + ' 篇）';
	}).forEach(line => info(line));
	info('');
	info('下一个可用文章编号: ' + next + '（删除留下的空号不再复用）');
}

/* ---------- 重建订阅文件 ---------- */

function cmdSync() {
	if (settings.dryRun) {
		info('--dry-run：已跳过 rss.xml / sitemap.xml 重建');
		return;
	}

	syncFeedsNow();
	info('已按 blogs/articles.html 重建 rss.xml 与 sitemap.xml');
}

/* ---------- 删除文章 ---------- */

function cmdDelete(id) {
	const html = readText(ARTICLES);
	const block = findTemplate(html, id);

	if (!block) {
		throw new Error('找不到文章：data-article-id="' + id + '"');
	}

	const dir = path.join(ROOT, 'blogs', id);
	const files = fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String) : [];

	info('将删除文章 ' + id + '：' + block.attrs.title);
	info('  - blogs/articles.html 中的模板');
	if (!has('keep-files')) {
		files.forEach(name => info('  - blogs/' + id + '/' + name.replace(/\\/g, '/')));
	} else {
		info('  - （--keep-files：保留 blogs/' + id + '/ 下的文件）');
	}
	info('  注意：编号 ' + id + ' 将空缺，其余文章编号保持不变（不做重排）');

	if (!confirm('确认删除？')) {
		info('已取消');
		return;
	}

	commitArticles(html.slice(0, block.start) + html.slice(block.end + CLOSE.length), '移除模板');

	if (!has('keep-files') && fs.existsSync(dir)) {
		if (!settings.dryRun) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		info('已删除目录 blogs/' + id + '/');
	}

	syncFeedsNow();
	info('文章 ' + id + ' 已删除');
}

/* ---------- 用 Markdown 更新文章 ---------- */

function cmdUpdate(id, mdFile) {
	const mdPath = mdFile ? path.resolve(ROOT, mdFile) : null;

	if (mdPath && !fs.existsSync(mdPath)) {
		throw new Error('找不到 Markdown 文件：' + mdFile);
	}

	const html = readText(ARTICLES);
	const block = findTemplate(html, id);

	if (!block) {
		throw new Error('找不到文章：data-article-id="' + id + '"');
	}

	const columns = buildColumnMap(ROOT);
	const changes = {};
	let inner = block.inner;
	const title = option('title');
	const date = option('date');
	const tags = option('tags');
	const excerpt = option('excerpt');
	const sourceUrl = option('source');

	if (title) {
		changes.title = attr(title);
	}
	if (date) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			throw new Error('--date 必须是 YYYY-MM-DD');
		}
		changes.date = date;
	}
	if (tags) {
		changes.tags = attr(tags);
	}
	if (excerpt) {
		changes.excerpt = attr(excerpt);
	}
	if (has('pin')) {
		changes.pinned = '1';
	}
	if (has('unpin')) {
		changes.pinned = null;
	}
	if (sourceUrl) {
		if (!/^https?:\/\//.test(sourceUrl)) {
			throw new Error('--source 必须是 http(s) 开头的完整链接');
		}
		changes.source = attr(sourceUrl);
	}
	if (has('no-source')) {
		changes.source = null;
	}
	if (has('leave-column')) {
		changes.column = null;
	} else if (option('column')) {
		const key = option('column');
		if (!columns.has(key)) {
			throw new Error('没有这个专栏：' + key + '（可用：' + Array.from(columns.keys()).join(' / ') + '）');
		}
		changes.column = attr(key);
	}

	/* 标题与日期在模板头部有对应的字面量，一并改掉 */
	if (title) {
		inner = inner.replace(/<h1>[\s\S]*?<\/h1>/, '<h1>' + attr(title) + '</h1>');
	}
	if (date) {
		const parts = date.split('-');
		const text = parts[0] + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日';
		inner = inner.replace(/<time datetime="[^"]*">[\s\S]*?<\/time>/, '<time datetime="' + date + '">' + text + '</time>');
	}

	/* 正文：整段替换 <div class="article-body"> 的内容；不给 Markdown 文件时只改元信息 */
	let body = null;
	let oldLength = 0;

	if (mdPath) {
		body = toTemplateBody(readText(mdPath), '\t\t\t\t');
		const range = bodyRange(inner);

		if (!range) {
			throw new Error('模板里找不到 <div class="article-body">，无法更新正文');
		}

		oldLength = inner.slice(range.from, range.close).trim().length;
		inner = inner.slice(0, range.from) + '\n' + body + '\n' + inner.slice(range.close);
	}

	if (!mdPath && !Object.keys(changes).length) {
		throw new Error('没有要改的内容：请给出 Markdown 文件或 --title / --date / --tags / --excerpt 等选项');
	}

	info('文章 ' + id + '：' + (block.attrs.title || '(无标题)'));
	if (body) {
		info('  正文      : ' + mdFile + '（' + oldLength + ' → ' + body.length + ' 字符）');
	}
	Object.keys(changes).forEach(name => {
		info('  data-' + name + ' : ' + (changes[name] === null ? '（移除）' : changes[name]));
	});

	commitArticles(splice(html, block, applyAttrs(block.openTag, changes), inner), '更新模板');
	updateArticlePage(id, title, excerpt);

	syncFeedsNow();
	info('文章 ' + id + ' 已更新');
}

/** 标题或摘要变化时，同步文章页的 <title> 与 meta description */
function updateArticlePage(id, title, excerpt) {
	if ((!title && !excerpt) || settings.dryRun) {
		return;
	}

	const pagePath = path.join(ROOT, 'blogs', id, 'index.html');
	if (!fs.existsSync(pagePath)) {
		warn('未找到 blogs/' + id + '/index.html，<title> 未同步');
		return;
	}

	let page = readText(pagePath);

	if (title) {
		page = page.replace(/<title>[\s\S]*?<\/title>/, '<title>' + attr(title) + ' - 山地奥斯卡537的博客</title>');
	}
	if (excerpt) {
		page = page.replace(/<meta name="description" content="[^"]*" \/>/, '<meta name="description" content="' + attr(excerpt) + '" />');
	}

	writeText(pagePath, page);
	info('文章页      : blogs/' + id + '/index.html 的标题与描述已同步');
}

/* ---------- 加入 / 移出专栏 ---------- */

function cmdJoin(id, key) {
	if (!key) {
		throw new Error('请给出专栏 key');
	}

	const columns = buildColumnMap(ROOT);
	if (!columns.has(key)) {
		throw new Error('没有这个专栏：' + key + '（可用：' + Array.from(columns.keys()).join(' / ') + '）');
	}

	const html = readText(ARTICLES);
	const block = findTemplate(html, id);
	if (!block) {
		throw new Error('找不到文章：data-article-id="' + id + '"');
	}

	const before = block.attrs.column || '';
	if (before === key) {
		info('文章 ' + id + ' 已经在专栏「' + columns.get(key) + '」中');
		return;
	}
	if (before) {
		info('文章 ' + id + ' 原属专栏 ' + before + '，改为 ' + key);
	}

	commitArticles(splice(html, block, applyAttrs(block.openTag, { column: attr(key) }), block.inner), '加入专栏');
	syncFeedsNow();
	info('文章 ' + id + ' 已加入专栏「' + columns.get(key) + '」，文章页会出现专栏导航与专栏内翻页');
}

function cmdLeave(id) {
	const html = readText(ARTICLES);
	const block = findTemplate(html, id);

	if (!block) {
		throw new Error('找不到文章：data-article-id="' + id + '"');
	}
	if (!block.attrs.column) {
		info('文章 ' + id + ' 本来就是随笔，没有专栏可退');
		return;
	}

	const columns = buildColumnMap(ROOT);
	const from = block.attrs.column;
	commitArticles(splice(html, block, applyAttrs(block.openTag, { column: null }), block.inner), '移出专栏');
	syncFeedsNow();
	info('文章 ' + id + ' 已移出专栏' + (columns.has(from) ? '「' + columns.get(from) + '」' : ' ' + from) + '，恢复为随笔（不再显示翻页区）');
}

/* ---------- 专栏增删改 ---------- */

const KEY_RE = /^[a-z][a-z0-9-]*$/;

function cmdColumn(args) {
	const action = args[0];
	const state = readColumns();
	const columns = buildColumnMap(ROOT);

	if (action === 'list' || !action) {
		info('专栏（共 ' + state.entries.length + ' 个）');
		state.entries.forEach(entry => {
			const count = readArticles(ROOT).filter(article => article.column === entry.key).length;
			info('  ' + padEnd(entry.key, 12) + (entry.fields.title || '') + '（' + count + ' 篇）');
			if (entry.fields.desc) {
				info('  ' + ' '.repeat(12) + entry.fields.desc);
			}
		});
		return;
	}

	if (action === 'add') {
		const key = args[1];
		const title = option('title');
		const desc = option('desc');

		if (!key || !KEY_RE.test(key)) {
			throw new Error('专栏 key 只能是小写字母开头的字母数字或连字符，例如 cpp');
		}
		if (!title) {
			throw new Error('请用 --title="专栏标题" 指定标题');
		}
		if (state.entries.some(entry => entry.key === key)) {
			throw new Error('专栏已存在：' + key);
		}

		state.entries.push({ key, fields: { title, desc: desc || '' } });
		writeColumns(state, '新建专栏 ' + key);
		if (!desc) {
			info('提示        : 可用 node tools/manage.js column set ' + key + ' --desc="简介" 补充');
		}
		info('专栏 ' + key + ' 已创建；用 join <文章 id> ' + key + ' 把文章放进去');
		return;
	}

	if (action === 'rm' || action === 'remove' || action === 'delete') {
		const key = args[1];
		const entry = state.entries.find(item => item.key === key);

		if (!entry) {
			throw new Error('没有这个专栏：' + key);
		}

		const affected = readArticles(ROOT).filter(article => article.column === key);
		const moveTo = option('move-to');

		if (moveTo && !state.entries.some(item => item.key === moveTo)) {
			throw new Error('没有这个专栏：' + moveTo);
		}
		if (!confirm('删除专栏「' + (entry.fields.title || key) + '」？' +
			(affected.length ? '，其中 ' + affected.length + ' 篇文章将' + (moveTo ? '转入「' + moveTo + '」' : '变回随笔') : ''))) {
			info('已取消');
			return;
		}

		state.entries = state.entries.filter(item => item.key !== key);
		writeColumns(state, '删除专栏 ' + key);

		if (affected.length) {
			if (moveTo) {
				const html = readText(ARTICLES);
				let next = html;
				affected.forEach(article => {
					const block = findTemplate(html, article.id);
					if (block) {
						next = splice(next, block, applyAttrs(block.openTag, { column: attr(moveTo) }), block.inner);
					}
				});
				commitArticles(next, '把 ' + affected.length + ' 篇文章转入 ' + moveTo);
			} else {
				const html = readText(ARTICLES);
				let next = html;
				affected.forEach(article => {
					const block = findTemplate(html, article.id);
					if (block) {
						next = splice(next, block, applyAttrs(block.openTag, { column: null }), block.inner);
					}
				});
				commitArticles(next, affected.length + ' 篇文章移出专栏');
			}
		}

		syncFeedsNow();
		info('专栏 ' + key + ' 已删除');
		return;
	}

	if (action === 'rename') {
		const key = args[1];
		const nextKey = args[2];
		const entry = state.entries.find(item => item.key === key);

		if (!entry) {
			throw new Error('没有这个专栏：' + key);
		}
		if (!nextKey || !KEY_RE.test(nextKey)) {
			throw new Error('新 key 只能是小写字母开头的字母数字或连字符，例如 cpp');
		}
		if (nextKey === key) {
			info('key 没有变化');
			return;
		}
		if (state.entries.some(item => item.key === nextKey)) {
			throw new Error('专栏已存在：' + nextKey);
		}

		entry.key = nextKey;
		writeColumns(state, '改 key 为 ' + nextKey);

		const count = setColumnOfTemplates(key, nextKey);
		syncFeedsNow();
		info('专栏 ' + key + ' 已改名为 ' + nextKey + '（标题不变，' + count + ' 篇文章归属同步更新）');
		return;
	}

	if (action === 'set') {
		const key = args[1];
		const entry = state.entries.find(item => item.key === key);

		if (!entry) {
			throw new Error('没有这个专栏：' + key);
		}
		if (!option('title') && !has('desc')) {
			throw new Error('请用 --title= 或 --desc= 指定要改的内容');
		}
		if (option('title')) {
			entry.fields.title = option('title');
		}
		if (has('desc')) {
			entry.fields.desc = option('desc');
		}

		writeColumns(state, '更新 ' + key);
		syncFeedsNow();
		info('专栏 ' + key + ' 已更新');
		return;
	}

	throw new Error('未知的专栏操作：' + action + '（可用：list / add / rm / rename / set）');
}

/* ---------- Markdown 源文（只允许操作 blogs/<id>/ 下的 .md） ---------- */

const MD_NAME = /^[^\\/:*?"<>|]+$/;

function mdDir(id) {
	if (!/^\d+$/.test(String(id))) {
		throw new Error('文章编号必须是纯数字');
	}
	const dir = path.join(ROOT, 'blogs', String(id));
	const resolved = path.resolve(dir);
	if (resolved.indexOf(path.resolve(ROOT, 'blogs')) !== 0) {
		throw new Error('非法路径');
	}
	return resolved;
}

function listMdFiles(id) {
	const dir = mdDir(id);
	if (!fs.existsSync(dir)) {
		return [];
	}
	return fs.readdirSync(dir).filter(name => /\.md$/i.test(name)).sort();
}

function readMdFile(id, name) {
	if (!MD_NAME.test(String(name || '')) || !/\.md$/i.test(String(name || ''))) {
		throw new Error('文件名不合法（只允许 blogs/' + id + '/ 下的 .md 文件）');
	}
	const file = path.join(mdDir(id), name);
	if (!fs.existsSync(file)) {
		throw new Error('找不到文件：blogs/' + id + '/' + name);
	}
	return readText(file);
}

function writeMdFile(id, name, content) {
	if (!MD_NAME.test(String(name || '')) || !/\.md$/i.test(String(name || ''))) {
		throw new Error('文件名不合法（只允许 blogs/' + id + '/ 下的 .md 文件）');
	}
	const dir = mdDir(id);
	fs.mkdirSync(dir, { recursive: true });
	writeText(path.join(dir, name), String(content));
	return path.join('blogs', String(id), name);
}

function cmdMd(args) {
	const action = args[0];
	const id = args[1];

	if (action === 'list') {
		const files = listMdFiles(id);
		info(files.length ? files.join('\n') : '（该篇还没有 .md 源文）');
		return;
	}
	if (action === 'read') {
		info(readMdFile(id, args[2]));
		return;
	}

	/* 由页面 HTML 反向生成 Markdown：早期手写 HTML 的文章也能进入编辑流程 */
	if (action === 'from-html') {
		const article = readArticles(ROOT).find(item => item.id === String(id || '').trim());

		if (!article) {
			throw new Error('找不到文章：data-article-id="' + id + '"');
		}

		const markdown = toMarkdown(article.body);

		if (has('stdout')) {
			info(markdown);
			return;
		}

		const name = option('out') || article.title + '.md';
		const file = path.join('blogs', String(article.id), name);

		if (fs.existsSync(path.join(ROOT, file)) && !has('force')) {
			throw new Error('已存在同名源文：' + file.replace(/\\/g, '/') + '（要覆盖请加 --force）');
		}

		writeMdFile(article.id, name, markdown);
		info('文章 ' + article.id + '：' + article.title);
		info('  正文      : ' + article.body.length + ' 字符 HTML → ' + markdown.split('\n').filter(line => line.trim()).length + ' 行 Markdown');
		info('  已写出    : ' + file.replace(/\\/g, '/'));
		info('  下一步    : node tools/manage.js update ' + article.id + ' ' + file.replace(/\\/g, '/') + '（把 Markdown 写回模板区）');
		return;
	}

	throw new Error('用法: node tools/manage.js md list <id> | md read <id> <文件名> | md from-html <id> [--out=<文件名.md>] [--force] [--stdout]');
}

/* ---------- 入口 ---------- */

const HELP = [
	'文章与专栏管理工具（node tools/manage.js）',
	'',
	'  list                          列出文章与专栏',
	'  delete <id> [--yes]           删除文章（编号空缺，不重排）',
	'  update <id> [md 文件] [选项]   用 Markdown 更新正文与元信息（省略文件则只改元信息）',
	'  sync                          重建 rss.xml 与 sitemap.xml',
	'  join <id> <专栏 key>          加入专栏',
	'  leave <id>                   移出专栏',
	'  column list                   列出专栏',
	'  column add <key> --title "标题" [--desc "简介"]',
	'  column rm <key> [--move-to=key]',
	'  column rename <key> <新 key>',
	'  column set <key> [--title=] [--desc=]',
	'  md list <id>                  列出该篇的 Markdown 源文',
	'  md read <id> <文件名>          打印该篇的 Markdown 源文',
	'  md from-html <id> [--out=<文件名.md>] [--force]',
	'                                由页面 HTML 反向生成 Markdown 源文',
	'',
	'通用选项：--dry-run / --no-feeds / --yes（delete 还有 --keep-files）',
	'update 选项：--title= --date= --tags= --excerpt= --source= --no-source --column= --leave-column --pin --unpin',
	'md from-html 另有：--stdout（只打印不写文件）'
].join('\n');

function dispatch() {
	const command = positional[0];

	switch (command) {
		case 'list':
			cmdList();
			break;
		case 'delete':
		case 'rm':
			cmdDelete(positional[1]);
			break;
		case 'update':
			cmdUpdate(positional[1], positional[2]);
			break;
		case 'join':
			cmdJoin(positional[1], positional[2]);
			break;
		case 'leave':
			cmdLeave(positional[1]);
			break;
		case 'column':
			cmdColumn(positional.slice(1));
			break;
		case 'sync':
			cmdSync();
			break;
		case 'md':
			cmdMd(positional.slice(1));
			break;
		case 'help':
		case undefined:
			info(HELP);
			break;
		default:
			throw new Error('未知命令：' + command + '\n\n' + HELP);
	}
}

/* 命令行与管理台共用的执行入口：
   capture 为 true 时把 console 输出收集起来返回，而不是打印到终端 */
function run(args, capture) {
	parseArgs(args);
	const lines = [];
	const log = console.log;
	const error = console.error;

	if (capture) {
		const push = (...parts) => lines.push(parts.join(' '));
		console.log = push;
		console.error = push;
	}

	try {
		dispatch();
		return { ok: true, output: lines.join('\n') };
	} catch (err) {
		return { ok: false, output: lines.join('\n'), error: err.message };
	} finally {
		console.log = log;
		console.error = error;
	}
}

module.exports = {
	run,
	HELP,
	ROOT,
	readText,
	writeText,
	findTemplate,
	readColumns,
	readArticles,
	buildColumnMap,
	bodyRange,
	toTemplateBody,
	syncFeeds,
	listMdFiles,
	readMdFile,
	writeMdFile
};

if (require.main === module) {
	const result = run(process.argv.slice(2), false);
	if (result.output) {
		console.log(result.output);
	}
	if (!result.ok) {
		console.error('错误: ' + result.error);
		process.exit(1);
	}
}