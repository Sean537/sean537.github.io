/* Markdown → 文章正文 HTML 转换器（零依赖）
 *
 * 用法：
 *   node tools/md2html.js blogs/3/某篇文章.md > out.html
 *
 * 站点正文容器为 .article-body，因此转换规则与之一一对应：
 *   - 标题：# → h2、## → h3 ……（页面本身已占用 h1 作为文章标题）
 *   - 代码块：<pre data-lang><code class="language-xxx">
 *   - 表格：外层 .table-wrap 包裹，避免宽表撑破移动端布局
 *   - 引用：<blockquote>，内部同样支持代码块与列表
 *   - 独占一行的图片：<figure class="article-figure">
 *   - HTML 注释、水平线、有序列表续编号均已处理
 */
'use strict';

const fs = require('fs');

/* ---------- 工具 ---------- */

function escapeHtml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** 去掉行首缩进，返回缩进宽度（制表符按 4 计） */
function indentOf(line) {
	const match = /^[\t ]*/.exec(line)[0];
	let width = 0;
	for (const ch of match) {
		width += ch === '\t' ? 4 : 1;
	}
	return width;
}

/** 按 | 切分表格行，忽略行内代码中的竖线 */
function splitRow(line) {
	const cells = [];
	let current = '';
	let inCode = false;

	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (ch === '`') {
			inCode = !inCode;
			current += ch;
		} else if (ch === '|' && !inCode) {
			cells.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	cells.push(current);
	return cells.map(cell => cell.trim());
}

/* ---------- 行内解析 ---------- */

const PLACEHOLDER = '\u0000';

function inline(text) {
	const stash = [];
	const keep = html => {
		stash.push(html);
		return PLACEHOLDER + (stash.length - 1) + PLACEHOLDER;
	};

	let out = escapeHtml(text);

	/* 反斜杠转义：\- \. \[ 等 */
	out = out.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, (_, ch) => keep(escapeHtml(ch)));

	/* 行内代码：1~3 个反引号 */
	out = out.replace(/(`{1,3})(.+?)\1/g, (_, __, code) => keep('<code>' + code.trim() + '</code>'));

	/* 图片 */
	out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src, title) =>
		keep('<img src="' + src + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + ' loading="lazy" />'));

	/* 链接 */
	out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, href) => {
		const external = /^https?:/i.test(href);
		return keep('<a href="' + href + '"' + (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>');
	});

	/* 自动链接 <https://…> 与 <mail@example.com> */
	out = out.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, href) =>
		keep('<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + href + '</a>'));
	out = out.replace(/&lt;([^\s&@]+@[^\s&@]+\.[^\s&@]+)&gt;/g, (_, mail) =>
		keep('<a href="mailto:' + mail + '">' + mail + '</a>'));

	/* 强调 */
	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	out = out.replace(/(^|[\s(（])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

	/* 还原占位符 */
	return out.replace(new RegExp(PLACEHOLDER + '(\\d+)' + PLACEHOLDER, 'g'), (_, index) => stash[Number(index)]);
}

/* ---------- 块级解析 ---------- */

function fence(line) {
	const match = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(line);
	return match ? { marker: match[1][0].repeat(3), lang: match[2] } : null;
}

function isTableDivider(line) {
	return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.indexOf('-') !== -1 && line.indexOf('|') !== -1;
}

/** 去掉表格行首尾的竖线产生的空单元格 */
function rowCells(line) {
	const parts = splitRow(line);
	const trimmed = line.trim();
	if (trimmed.startsWith('|')) parts.shift();
	if (trimmed.endsWith('|')) parts.pop();
	return parts;
}

function renderTable(rows) {
	const align = rowCells(rows[1]).map(cell => {
		const left = cell.startsWith(':');
		const right = cell.endsWith(':');
		if (left && right) return 'align-center';
		if (right) return 'align-right';
		return '';
	});

	const head = rowCells(rows[0])
		.map((cell, i) => '<th scope="col"' + (align[i] ? ' class="' + align[i] + '"' : '') + '>' + inline(cell) + '</th>')
		.join('');
	const body = rows
		.slice(2)
		.map(row => {
			const cells = rowCells(row)
				.map((cell, i) => '<td' + (align[i] ? ' class="' + align[i] + '"' : '') + '>' + inline(cell) + '</td>')
				.join('');
			return '<tr>' + cells + '</tr>';
		})
		.join('');

	return '<div class="table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

const BULLET = /^([-*+])\s+(.*)$/;
const ORDERED = /^(\d+)[.)]\s+(.*)$/;

/** 顶层块级起始标记：出现在列表项内部（且未更深缩进）时应终止该项 */
const BLOCK_START = /^\s*(>|```|~~~|#{1,6}\s|(-{3,}|\*{3,}|_{3,})\s*$)/;

/** 解析一组同级列表项（lines 已按缩进排序），返回 HTML */
function renderList(lines) {
	const first = BULLET.exec(lines[0].trim()) ? 'ul' : 'ol';
	const start = ORDERED.exec(lines[0].trim());
	const startAttr = first === 'ol' && start && Number(start[1]) !== 1 ? ' start="' + start[1] + '"' : '';

	let html = '<' + first + startAttr + '>';
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		const trimmed = line.trim();
		const match = BULLET.exec(trimmed) || ORDERED.exec(trimmed);
		if (!match) {
			index += 1;
			continue;
		}

		const own = indentOf(line);
		const itemLines = [match[2]];
		index += 1;

		while (index < lines.length) {
			const next = lines[index];
			if (!next.trim()) {
				/* 空行后若仍是更深缩进的列表/内容则并入当前项 */
				const after = lines.slice(index + 1).find(l => l.trim());
				if (after && indentOf(after) >= own + 2) {
					itemLines.push('');
					index += 1;
					continue;
				}
				break;
			}
			if (indentOf(next) <= own && (BULLET.exec(next.trim()) || ORDERED.exec(next.trim()))) {
				break;
			}
			if (indentOf(next) <= own && BLOCK_START.test(next)) {
				break;
			}
			if (indentOf(next) > own) {
				itemLines.push(next.slice(own));
				index += 1;
				continue;
			}
			itemLines.push(next.trim());
			index += 1;
		}

		const nested = itemLines.filter((l, i) => l.trim() || itemLines.slice(i + 1).some(x => x.trim()));
		const hasBlock = nested.some(l => BULLET.test(l.trim()) || ORDERED.test(l.trim()) || fence(l) || /^\s*\|/.test(l));
		const simple = nested
			.filter(l => l.trim())
			.map(l => inline(l.trim()))
			.join('<br />');

		html += hasBlock ? '<li>' + render(nested, 1) + '</li>' : '<li>' + simple + '</li>';
	}

	return html + '</' + first + '>';
}

function isListLine(line) {
	return BULLET.test(line.trim()) || ORDERED.test(line.trim());
}

function render(lines, depth) {
	const html = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];

		if (!line.trim()) {
			index += 1;
			continue;
		}

		/* HTML 注释：丢弃 */
		if (/^\s*<!--/.test(line)) {
			while (index < lines.length && !/-->/.test(lines[index])) index += 1;
			index += 1;
			continue;
		}

		/* 围栏代码块 */
		const f = fence(line);
		if (f) {
			const body = [];
			index += 1;
			while (index < lines.length && !fence(lines[index])) {
				body.push(lines[index]);
				index += 1;
			}
			index += 1;
			const code = body.join('\n').replace(/^\n+|\n+$/g, '').replace(/\t/g, '    ');
			html.push(
				'<pre data-lang="' + (f.lang || 'text') + '"><code class="language-' + (f.lang || 'text') + '">' +
				escapeHtml(code) + '</code></pre>'
			);
			continue;
		}

		/* 水平线 */
		if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			html.push('<hr />');
			index += 1;
			continue;
		}

		/* 标题：# → h2 */
		const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim());
		if (heading) {
			const level = Math.min(heading[1].length + 1, 6);
			/* 标题内不再重复加粗，样式本身已有强调 */
			html.push('<h' + level + '>' + inline(heading[2]).replace(/<\/?strong>/g, '') + '</h' + level + '>');
			index += 1;
			continue;
		}

		/* 表格 */
		if (line.indexOf('|') !== -1 && isTableDivider(lines[index + 1] || '')) {
			const rows = [line];
			index += 2;
			while (index < lines.length && lines[index].indexOf('|') !== -1 && lines[index].trim()) {
				rows.push(lines[index]);
				index += 1;
			}
			html.push(renderTable(rows));
			continue;
		}

		/* 引用 */
		if (/^\s*>/.test(line)) {
			const body = [];
			while (index < lines.length && (/^\s*>/.test(lines[index]) || (!lines[index].trim() && /^\s*>/.test(lines[index + 1] || '')))) {
				body.push(lines[index].replace(/^\s*>\s?/, ''));
				index += 1;
			}
			html.push('<blockquote>' + render(body, depth + 1) + '</blockquote>');
			continue;
		}

		/* 列表 */
		if (isListLine(line)) {
			const own = indentOf(line);
			const body = [];

			while (index < lines.length) {
				const cur = lines[index];

				if (!cur.trim()) {
					/* 空行：紧跟的下一个非空行仍是同级或更深缩进的列表项才继续 */
					const next = lines.slice(index + 1).find(l => l.trim());
					const more = !!next && (indentOf(next) > own || isListLine(next));
					if (!more) break;
					body.push(cur);
					index += 1;
					continue;
				}
				if (indentOf(cur) <= own && BLOCK_START.test(cur)) {
					break;
				}
				if (indentOf(cur) <= own && cur.indexOf('|') !== -1 && isTableDivider(lines[index + 1] || '')) {
					break;
				}
				body.push(cur);
				index += 1;
			}

			html.push(renderList(body));
			continue;
		}

		/* 段落（独占一行的图片 → figure） */
		const para = [];
		while (index < lines.length && lines[index].trim() && !fence(lines[index]) && !/^(#{1,6})\s/.test(lines[index].trim()) && !/^\s*>/.test(lines[index]) && !isListLine(lines[index])) {
			para.push(lines[index].trim());
			index += 1;
		}
		const text = para.join(' ');
		const only = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)\s*$/.exec(text);
		if (only && para.length === 1) {
			const cls = /溢出/.test(only[1]) ? ' article-figure-small' : '';
			html.push('<figure class="article-figure' + cls + '"><img src="' + only[2] + '" alt="' + only[1] + '" loading="lazy" /></figure>');
		} else {
			html.push('<p>' + inline(text) + '</p>');
		}
	}

	/* 用换行拼接，不加任何缩进：
	   <pre> 内部的后续行必须紧贴最左列，缩进由 add-article.js 统一处理且会跳过代码块 */
	return html.join('\n');
}

/* ---------- 入口 ---------- */

function convert(markdown) {
	return render(markdown.replace(/\r\n/g, '\n').split('\n'), 0);
}

module.exports = { convert, render, inline };

if (require.main === module) {
	const file = process.argv[2];
	if (!file) {
		console.error('用法: node tools/md2html.js <markdown 文件>');
		process.exit(1);
	}
	process.stdout.write(convert(fs.readFileSync(file, 'utf8')) + '\n');
}
