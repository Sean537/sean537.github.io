/* HTML → Markdown 转换器：md2html.js 的逆向
 *
 * 用途：
 *   把 blogs/articles.html 里 <div class="article-body"> 的正文 HTML 还原成
 *   可编辑的 Markdown 源文，早期手写 HTML 的文章（1、2 号）也能进入
 *   「管理台改 Markdown」的流程。
 *
 * 用法：
 *   node tools/html2md.js <id> [--out=<文件名.md>] [--force] [--stdout]
 *   node tools/html2md.js <id> --stdout > blogs/1/正文.md
 *
 * 说明：
 *   - 只转换 <div class="article-body"> 里的内容，模板头部的标题、日期、
 *     作者卡片、评论区等固定结构不写进 Markdown（那些由工具维护）。
 *   - <h2> → 一级标题，依此类推，与 md2html.js 的映射一致（# → <h2>）。
 *   - 小图（article-figure-small）写成 ![alt](src "small")，md2html.js
 *     认得这个 title 标记，往返不会丢样式。
 *   - 引用块里的 <cite> 出处写成最后一段「> —— 出处」，md2html.js
 *     认得这个「——」标记，往返不会丢样式。
 *   - 无法无损表达的结构（原始 HTML 标签等）降级为纯文本，
 *     内容不会丢，但个别标签会在往返后变成普通段落。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { readArticles } = require('./feeds.js');

const ROOT = path.resolve(__dirname, '..');

/* ---------- 实体与空白 ---------- */

function decodeEntities(text) {
	return String(text)
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
		.replace(/&amp;/g, '&');
}

/** 换行与连续空白压成一个空格；只含换行的空白（模板缩进）直接丢掉 */
function collapse(text) {
	const value = decodeEntities(text).replace(/\s+/g, ' ');
	return /^\s*$/.test(value) && /[\r\n]/.test(text) ? '' : value;
}

/** 正文里的 Markdown 元字符：先转义反斜杠、强调与链接符号，再处理行首块标记 */
function escapeText(text) {
	return escapeInline(text)
		.replace(/^(\s*)([#>+-])/gm, '$1\\$2')
		.replace(/^(\s*)(\d+)\./gm, '$1$2\\.')
		.replace(/^(\s*)(=+)/gm, '$1\\$2');
}

/** 行内上下文里只需转义反斜杠、强调与链接符号（行首块标记由 escapeText 负责） */
function escapeInline(text) {
	return String(text).replace(/([\\`*_[\]])/g, '\\$1');
}

function attr(node, name) {
	return decodeEntities((node.attrs && node.attrs[name]) || '');
}

function hasClass(node, name) {
	return new RegExp('(^|\\s)' + name + '(\\s|$)').test(attr(node, 'class'));
}

/* ---------- 极简 HTML 解析（够用即可，不追求完整性） ---------- */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/* 这些标签的内容不是正文，直接丢弃 */
const DROP = new Set(['script', 'style', 'svg', 'noscript', 'iframe']);
/* 行内元素：它们之间的换行没有意义 */
const INLINE = new Set(['a', 'abbr', 'b', 'br', 'cite', 'code', 'del', 'em', 'i', 'img', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var']);

function parseAttrs(text) {
	const attrs = {};
	const re = /([\w:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
	let hit;

	while ((hit = re.exec(text)) !== null) {
		attrs[hit[1].toLowerCase()] = hit[3] !== undefined ? hit[3] : (hit[4] !== undefined ? hit[4] : (hit[5] !== undefined ? hit[5] : ''));
	}

	return attrs;
}

/** 找到标签结束的 >，属性里的引号内容不算 */
function tagEnd(html, from) {
	let quote = '';

	for (let i = from; i < html.length; i += 1) {
		const ch = html[i];
		if (quote) {
			if (ch === quote) quote = '';
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === '>') {
			return i;
		}
	}

	return -1;
}

function parse(html) {
	const root = { tag: '#root', attrs: {}, children: [] };
	const stack = [root];
	let i = 0;

	const push = node => stack[stack.length - 1].children.push(node);

	while (i < html.length) {
		const lt = html.indexOf('<', i);

		if (lt === -1) {
			const rest = html.slice(i);
			if (rest) push({ text: rest });
			break;
		}

		if (lt > i) {
			push({ text: html.slice(i, lt) });
		}

		/* 注释与声明：丢弃 */
		if (html.startsWith('<!--', lt)) {
			const end = html.indexOf('-->', lt);
			i = end === -1 ? html.length : end + 3;
			continue;
		}
		if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
			const end = html.indexOf('>', lt);
			i = end === -1 ? html.length : end + 1;
			continue;
		}

		/* 闭合标签：回退到同名的最近一层 */
		if (html.startsWith('</', lt)) {
			const end = html.indexOf('>', lt);
			const name = html.slice(lt + 2, end === -1 ? html.length : end).trim().toLowerCase();

			for (let depth = stack.length - 1; depth > 0; depth -= 1) {
				if (stack[depth].tag === name) {
					stack.length = depth;
					break;
				}
			}

			i = end === -1 ? html.length : end + 1;
			continue;
		}

		const end = tagEnd(html, lt);
		if (end === -1) {
			const rest = html.slice(lt);
			if (rest) push({ text: rest });
			break;
		}

		let name = html.slice(lt + 1, end).trim();
		const selfClose = /\/\s*$/.test(name);
		name = name.replace(/\/\s*$/, '').trim();
		const space = name.search(/\s/);
		const tag = (space === -1 ? name : name.slice(0, space)).toLowerCase();
		const attrs = space === -1 ? {} : parseAttrs(name.slice(space));

		i = end + 1;

		if (DROP.has(tag)) {
			const close = html.toLowerCase().indexOf('</' + tag, i);
			i = close === -1 ? html.length : (html.indexOf('>', close) + 1 || html.length);
			continue;
		}

		const node = { tag, attrs, children: [] };
		push(node);

		if (!VOID.has(tag) && !selfClose) {
			stack.push(node);
		}
	}

	return root;
}

/* ---------- 行内 ---------- */

function imageMd(img, small) {
	const alt = attr(img, 'alt').replace(/\]/g, '\\]');
	const src = attr(img, 'src');
	return '![' + alt + '](' + src + (small ? ' "small"' : '') + ')';
}

function inline(node) {
	let out = '';

	for (const child of node.children) {
		out += inlineOf(child);
	}

	/* 行内标记前后不该留空格，行中间的单个空格要保留 */
	return out.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '').replace(/[ \t]*\n[ \t]*/g, '\n');
}

/** 单个行内节点 → Markdown 片段 */
function inlineOf(child) {
	if (child.text !== undefined) {
		return escapeInline(collapse(child.text));
	}

	let out = '';

	switch (child.tag) {
		case 'code':
		case 'kbd':
		case 'samp': {
			const code = rawText(child).replace(/\n+/g, ' ').trim();
			out += code ? '`' + code + '`' : '';
			break;
		}
		case 'strong':
		case 'b': {
			const text = inline(child).trim();
			out += text ? '**' + text + '**' : '';
			break;
		}
		case 'em':
		case 'i': {
			const text = inline(child).trim();
			out += text ? '*' + text + '*' : '';
			break;
		}
		case 'del':
		case 's':
		case 'strike': {
			const text = inline(child).trim();
			out += text ? '~~' + text + '~~' : '';
			break;
		}
		case 'a': {
			const href = attr(child, 'href');
			const text = inline(child).trim();
			out += href ? '[' + (text || href) + '](' + href + ')' : text;
			break;
		}
		case 'img':
			out += imageMd(child, hasClass(child, 'article-figure-small'));
			break;
		case 'br':
			out += '\n';
			break;
		default:
			out += inline(child);
	}

	return out;
}

/** 元素的纯文本（代码块用，保留换行） */
function rawText(node) {
	let out = '';
	for (const child of node.children) {
		out += child.text !== undefined ? decodeEntities(child.text) : rawText(child);
	}
	return out;
}

/* ---------- 块级 ---------- */

/** 去掉整段共同的缩进（模板里代码块是顶格的，手写 HTML 可能缩进） */
function dedent(code) {
	const lines = code.replace(/\r\n/g, '\n').split('\n');
	while (lines.length && !lines[0].trim()) lines.shift();
	while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

	const indent = lines
		.filter(line => line.trim())
		.map(line => (/^[\t ]*/.exec(line)[0].replace(/\t/g, '    ').length))
		.reduce((min, n) => Math.min(min, n), Infinity);

	return (indent === Infinity ? lines : lines.map(line => line.replace(/^[\t ]{0,' + indent + '}/, '').replace(/\t/g, '    '))).join('\n');
}

function pre(node) {
	const code = node.children.find(child => child.tag === 'code') || node;
	const lang = /language-([\w+#-]+)/.exec(attr(code, 'class'));
	const body = dedent(rawText(code).replace(/\t/g, '    '));

	return '```' + (lang ? lang[1] : '') + '\n' + body + '\n```';
}

/* 引用块里的出处：写成最后一段「> —— 出处」，md2html.js 会还原成 <cite> */

function quote(node) {
	const cite = (node.children || []).find(child => child.tag === 'cite');
	let body = blocks(cite ? { children: node.children.filter(child => child !== cite) } : node).join('\n\n');

	if (!cite) {
		return body.split('\n').map(line => (line ? '> ' + line : '>')).join('\n');
	}

	const from = rawText(cite).trim();
	const lines = (body ? body.split('\n').map(line => (line ? '> ' + line : '>')) : ['>']);

	if (from) {
		lines.push('>', '> —— ' + from);
	}

	return lines.join('\n');
}

/* 这些标签会另起一块，其余（a、code、strong…）只是行内内容 */
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'pre', 'blockquote', 'table', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'figure']);

function listItem(li, marker, depth) {
	const pad = '  '.repeat(depth);
	const head = [];
	const tail = [];
	const nested = [];
	let buffer = '';

	const flush = () => {
		if (buffer.trim()) {
			head.push(buffer.trim());
		}
		buffer = '';
	};

	const pushBlock = block => {
		if (!block) {
			return;
		}
		if (head.length || tail.length) {
			tail.push(block);
		} else {
			head.push(block);
		}
	};

	for (const child of li.children) {
		if (child.text !== undefined) {
			buffer += escapeInline(collapse(child.text));
			continue;
		}

		if (child.tag === 'ul' || child.tag === 'ol') {
			flush();
			const sub = list(child, depth + 1);
			if (sub) {
				nested.push(sub);
			}
			continue;
		}

		if (BLOCK_TAGS.has(child.tag)) {
			flush();
			pushBlock(blockOf(child));
			continue;
		}

		buffer += inlineOf(child);
	}

	flush();

	const lines = [];
	const gap = ' '.repeat(marker.length);

	head.forEach((block, index) => {
		block.split('\n').forEach((line, at) => {
			lines.push(index === 0 && at === 0 ? pad + marker + line : pad + gap + line);
		});
	});

	tail.concat(nested).forEach(block => {
		lines.push(pad + gap + block);
	});

	return lines;
}

function list(node, depth) {
	const ordered = node.tag === 'ol';
	let number = Number(attr(node, 'start')) || 1;
	const lines = [];

	node.children.filter(child => child.tag === 'li').forEach(li => {
		const marker = ordered ? number++ + '. ' : '- ';
		listItem(li, marker, depth).forEach(line => lines.push(line));
	});

	return lines.join('\n');
}

function table(node) {
	const rows = [];

	const collect = parent => {
		parent.children.forEach(child => {
			if (child.tag === 'thead' || child.tag === 'tbody' || child.tag === 'tfoot') {
				collect(child);
				return;
			}
			if (child.tag !== 'tr') {
				return;
			}

			const cells = child.children
				.filter(cell => cell.tag === 'th' || cell.tag === 'td')
				.map(cell => ({
					text: inline(cell).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim(),
					align: hasClass(cell, 'align-center') ? 'center' : (hasClass(cell, 'align-right') ? 'right' : '')
				}));

			if (cells.length) rows.push(cells);
		});
	};

	collect(node);

	if (!rows.length) {
		return '';
	}

	const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
	const line = cells => '| ' + Array.from({ length: width }, (_, i) => (cells[i] ? cells[i].text : '')).join(' | ') + ' |';
	const divider = cells => '| ' + Array.from({ length: width }, (_, i) => {
		const align = cells[i] && cells[i].align;
		return align === 'center' ? ':---:' : (align === 'right' ? '---:' : '---');
	}).join(' | ') + ' |';

	return [line(rows[0]), divider(rows[0])].concat(rows.slice(1).map(line)).join('\n');
}

function figure(node) {
	const img = node.children.find(child => child.tag === 'img');
	return img ? imageMd(img, hasClass(node, 'article-figure-small')) : blocks(node).join('\n\n');
}

/* 标题层级：md2html.js 把 # 渲染成 <h2>，这里是它的逆映射 */
const HEADING = { h1: 1, h2: 1, h3: 2, h4: 3, h5: 4, h6: 5 };

function blockOf(node) {
	switch (node.tag) {
		case 'p': {
			const text = inline(node);
			return text ? text : '';
		}
		case 'h1':
		case 'h2':
		case 'h3':
		case 'h4':
		case 'h5':
		case 'h6': {
			const text = inline(node);
			return text ? '#'.repeat(HEADING[node.tag]) + ' ' + text : '';
		}
		case 'hr':
			return '---';
		case 'pre':
			return pre(node);
		case 'blockquote':
			return quote(node);
		case 'ul':
		case 'ol':
			return list(node, 0);
		case 'table':
			return table(node);
		case 'figure':
			return figure(node);
		case 'img':
			return imageMd(node, hasClass(node, 'article-figure-small'));
		default:
			return blocks(node).join('\n\n');
	}
}

function blocks(node) {
	const out = [];

	for (const child of node.children) {
		if (child.text !== undefined) {
			/* 行内元素之间的换行只是排版，整段空白直接丢掉 */
			const text = INLINE.has(node.tag) ? collapse(child.text) : collapse(child.text).trim();
			if (text) out.push(escapeText(text));
			continue;
		}

		const block = blockOf(child);
		if (block && block.trim()) out.push(block);
	}

	return out;
}

/* ---------- 入口 ---------- */

/** HTML 片段 → Markdown */
function toMarkdown(html) {
	if (!String(html || '').trim()) {
		return '';
	}
	return blocks(parse(String(html))).filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** 取出某篇文章的正文 HTML 与元信息 */
function articleSource(root, id) {
	const target = String(id).trim();
	if (!/^\d+$/.test(target)) {
		throw new Error('文章编号必须是纯数字');
	}

	const article = readArticles(root).find(item => item.id === target);
	if (!article) {
		throw new Error('找不到文章：data-article-id="' + target + '"');
	}

	return article;
}

/** 某篇文章的正文 HTML → Markdown */
function articleToMarkdown(root, id) {
	const article = articleSource(root, id);
	return { article, markdown: toMarkdown(article.body) };
}

/** 默认源文文件名：与标题同名，方便和现有 3、4、5 号文章保持一致 */
function defaultFileName(article) {
	return (article.title || ('文章' + article.id)) + '.md';
}

/** 写盘：只允许写到 blogs/<id>/ 下的 .md 文件 */
function writeMarkdown(root, id, name, markdown, force) {
	const dir = path.join(root, 'blogs', String(id));
	const file = path.join(dir, name);

	if (fs.existsSync(file) && !force) {
		throw new Error('已存在同名源文：blogs/' + id + '/' + name + '（要覆盖请加 --force）');
	}

	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(file, String(markdown).replace(/\r\n/g, '\n'), 'utf8');

	return path.relative(root, file).replace(/\\/g, '/');
}

module.exports = {
	ROOT,
	toMarkdown,
	articleSource,
	articleToMarkdown,
	defaultFileName,
	writeMarkdown
};

/* ---------- 命令行 ---------- */

const HELP = [
	'HTML → Markdown（node tools/html2md.js）',
	'',
	'  node tools/html2md.js <id>                    把 <id> 号文章的正文 HTML 转成 blogs/<id>/<标题>.md',
	'  node tools/html2md.js <id> --out=正文.md      指定文件名',
	'  node tools/html2md.js <id> --force            覆盖已存在的同名文件',
	'  node tools/html2md.js <id> --stdout           只打印，不写文件',
	'',
	'文章正文来自 blogs/articles.html 的 <div class="article-body">；',
	'改完 Markdown 后用 node tools/manage.js update <id> <md 文件> 写回模板。'
].join('\n');

if (require.main === module) {
	const args = process.argv.slice(2);
	const flags = args.filter(arg => arg.indexOf('--') === 0);
	const positional = args.filter(arg => arg.indexOf('--') !== 0);
	const outFlag = flags.find(arg => arg.indexOf('--out=') === 0);
	const id = positional[0];

	if (!id || flags.includes('--help')) {
		console.log(HELP);
		process.exit(id ? 0 : 1);
	}

	try {
		const { article, markdown } = articleToMarkdown(ROOT, id);

		if (flags.includes('--stdout')) {
			process.stdout.write(markdown);
			process.exit(0);
		}

		const name = outFlag ? outFlag.slice(6) : defaultFileName(article);
		const file = writeMarkdown(ROOT, id, name, markdown, flags.includes('--force'));

		console.log('文章 ' + id + '：' + article.title);
		console.log('  正文 HTML : ' + article.body.length + ' 字符');
		console.log('  Markdown  : ' + markdown.length + ' 字符 / ' + markdown.split('\n').filter(line => line.trim()).length + ' 行');
		console.log('  已写出    : ' + file);
		console.log('  下一步    : node tools/manage.js update ' + id + ' ' + file + '   （把改动写回模板区）');
	} catch (error) {
		console.error('错误: ' + error.message);
		process.exit(1);
	}
}
