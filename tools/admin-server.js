/* 本地文章管理台的服务端（零依赖）
 *
 * 用法：
 *   node tools/admin-server.js            默认 http://127.0.0.1:4173/
 *   node tools/admin-server.js --port 5000
 *
 * 它做两件事：
 *   1. 作为开发服务器，在根路径提供完整博客站点；
 *   2. 在 /admin/ 下提供可视化文章管理台，把界面操作转成 tools/manage.js / tools/add-article.js 的调用。
 *
 * Live Server 兼容：
 *   - 管理台页面可以从任意 localhost 端口访问，API 允许跨端口同机器调用；
 *   - 若通过 Live Server 等其它服务打开管理台页面，可在 HTML <head> 里加
 *     <script>window.ADMIN_API = 'http://127.0.0.1:实际端口/admin/';</script> 指定 API 地址。
 *
 * 安全约定：
 *   - 只监听 127.0.0.1，局域网与公网都访问不到；
 *   - 启动时生成一次性 token，注入到页面里，所有写操作都要带 X-Admin-Token；
 *   - 管理台页面只接受本机来源，API 接受本机任意端口来源；
 *   - Markdown 文件的读写限定在 blogs/<id>/ 目录内，禁止路径穿越。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const manage = require('./manage.js');
const { createArticle, nextFreeId } = require('./add-article.js');
const { convert } = require('./md2html.js');

const ROOT = path.resolve(__dirname, '..');
const GUI_DIR = path.join(__dirname, 'admin');
const SITE = 'https://www.ithink537.top';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = Number(process.env.ADMIN_PORT || (portArg !== -1 ? args[portArg + 1] : 4173));

if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
	console.error('端口无效，请用 --port 指定 1024 以上的端口（当前值：' + PORT + '）');
	process.exit(1);
}
const HOST = '127.0.0.1';
const TOKEN = crypto.randomBytes(16).toString('hex');

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.json': 'application/json; charset=utf-8'
};

/* ---------- 基础 ---------- */

function send(res, status, body, type) {
	res.writeHead(status, {
		'Content-Type': type || 'text/plain; charset=utf-8',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff'
	});
	res.end(body);
}

function sendJson(res, status, data) {
	send(res, status, JSON.stringify(data), MIME['.json']);
}

function readBody(req, limit) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];

		req.on('data', chunk => {
			size += chunk.length;
			if (size > limit) {
				reject(new Error('请求体过大'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => {
			const raw = Buffer.concat(chunks).toString('utf8');
			if (!raw) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(raw));
			} catch (error) {
				reject(new Error('请求体不是合法 JSON'));
			}
		});
		req.on('error', reject);
	});
}

/* 只接受来自本机管理台页面的请求；允许任意 localhost/127.0.0.1 端口（Live Server 兼容） */
function sameOrigin(req) {
	const origin = req.headers.origin;
	if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
		return false;
	}
	const host = (req.headers.host || '').split(':')[0];
	return host === HOST || host === 'localhost';
}

function addCors(req, res) {
	const origin = req.headers.origin;
	if (origin && /^https?:\/\/(127\.0\.0\.1|localhost)/i.test(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
		res.setHeader('Vary', 'Origin');
	}
}

function authorized(req) {
	return req.headers['x-admin-token'] === TOKEN;
}

/* 读取文本文件，文件不存在时返回空串 */
function readSafe(file) {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch (error) {
		return '';
	}
}

/* 安全读取站点根目录下的文件，防止路径穿越 */
function readSiteFile(filePath) {
	const target = path.resolve(ROOT, filePath);
	if (target.indexOf(path.resolve(ROOT)) !== 0) {
		return null;
	}
	if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
		return null;
	}
	return { target, mime: MIME[path.extname(target)] || 'text/plain; charset=utf-8' };
}

/* ---------- 状态 ---------- */

function state() {
	const articles = manage.readArticles(ROOT)
		.slice()
		.sort((a, b) => (a.date === b.date ? Number(a.id) - Number(b.id) : (a.date < b.date ? 1 : -1)));

	const columns = manage.readColumns().entries.map(entry => ({
		key: entry.key,
		title: entry.fields.title || '',
		desc: entry.fields.desc || '',
		count: articles.filter(article => article.column === entry.key).length
	}));

	return {
		root: ROOT,
		site: SITE,
		local: 'http://' + HOST + ':' + PORT,
		nextId: nextFreeId(),
		columns,
		articles: articles.map(article => ({
			id: article.id,
			title: article.title,
			date: article.date,
			excerpt: article.excerpt,
			tags: article.tags,
			column: article.column,
			pinned: article.pinned,
			source: article.source,
			url: 'http://' + HOST + ':' + PORT + '/blogs/' + article.id + '/',
			chars: article.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').length,
			headings: (article.body.match(/<h[2-6][ >]/g) || []).length,
			mdFiles: manage.listMdFiles(article.id)
		}))
	};
}

/* ---------- 接口 ---------- */

const routes = {
	/* 界面需要的全部数据 */
	async '/api/state'(req, res) {
		sendJson(res, 200, { ok: true, state: state() });
	},

	/* 执行一条 manage.js 命令；界面上的每个按钮都对应这里的一次调用 */
	async '/api/run'(req, res, body) {
		if (!Array.isArray(body.args) || !body.args.length) {
			throw new Error('缺少命令参数');
		}
		if (body.args.some(arg => typeof arg !== 'string')) {
			throw new Error('命令参数必须是字符串');
		}
		if (body.confirm) {
			body.args.push('--yes');
		}
		const result = manage.run(body.args, true);
		sendJson(res, result.ok ? 200 : 400, {
			ok: result.ok,
			output: result.output,
			error: result.error || '',
			command: 'node tools/manage.js ' + body.args.join(' '),
			state: state()
		});
	},

	/* Markdown 预览：与服务端转换器同一套 md2html，所见即所得 */
	async '/api/preview'(req, res, body) {
		if (typeof body.markdown !== 'string') {
			throw new Error('缺少 markdown 内容');
		}
		if (body.markdown.length > 400000) {
			throw new Error('内容过长');
		}
		sendJson(res, 200, { ok: true, html: convert(body.markdown) });
	},

	/* 读取 / 保存 blogs/<id>/ 下的 Markdown 源文 */
	async '/api/md'(req, res, body) {
		if (body.action === 'list') {
			sendJson(res, 200, { ok: true, files: manage.listMdFiles(body.id) });
			return;
		}
		if (body.action === 'read') {
			sendJson(res, 200, { ok: true, name: body.name, content: manage.readMdFile(body.id, body.name) });
			return;
		}
		if (body.action === 'write') {
			if (typeof body.content !== 'string') {
				throw new Error('缺少 content');
			}
			const saved = manage.writeMdFile(body.id, body.name, body.content);
			sendJson(res, 200, { ok: true, saved, files: manage.listMdFiles(body.id) });
			return;
		}
		throw new Error('未知 action：' + body.action);
	},

	/* 保存既有文章：元信息 + 源文 + 正文一次提交，内部仍走 manage.js */
	async '/api/article/save'(req, res, body) {
		const id = String(body.id || '').trim();
		const current = manage.readArticles(ROOT).find(article => article.id === id);

		if (!current) {
			throw new Error('找不到文章：data-article-id="' + id + '"');
		}

		const title = String(body.title || '').trim();
		const date = String(body.date || '').trim();
		const tags = String(body.tags || '').trim();
		const excerpt = String(body.excerpt || '').trim();
		const source = String(body.source || '').trim();
		const column = String(body.column == null ? '' : body.column).trim();
		const pinned = !!body.pinned;

		if (!title) {
			throw new Error('标题不能为空');
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			throw new Error('日期必须是 YYYY-MM-DD');
		}

		const args = ['update', id];

		/* 正文：先把源文落盘，再用它替换模板里的正文 */
		if (typeof body.markdown === 'string') {
			const name = String(body.mdName || '').trim() || '正文.md';
			const saved = manage.writeMdFile(id, name, body.markdown);
			args.push(saved.replace(/\\/g, '/'));
		}

		args.push('--title=' + title, '--date=' + date, '--tags=' + tags, '--excerpt=' + excerpt);

		if (source && source !== current.source) {
			args.push('--source=' + source);
		} else if (!source && current.source) {
			args.push('--no-source');
		}

		if (column !== (current.column || '')) {
			args.push(column ? '--column=' + column : '--leave-column');
		}

		if (pinned !== !!current.pinned) {
			args.push(pinned ? '--pin' : '--unpin');
		}

		const result = manage.run(args, true);
		if (!result.ok) {
			throw new Error(result.error || '保存失败');
		}

		sendJson(res, 200, {
			ok: true,
			output: result.output,
			command: 'node tools/manage.js ' + args.join(' '),
			state: state()
		});
	},

	/* 订阅与站点信息 */
	async '/api/info'(req, res) {
		const stat = file => {
			try {
				const info = fs.statSync(file);
				return { bytes: info.size, updated: info.mtime.toISOString().slice(0, 16).replace('T', ' ') };
			} catch (error) {
				return null;
			}
		};

		const rssText = readSafe(path.join(ROOT, 'rss.xml'));
		const mapText = readSafe(path.join(ROOT, 'sitemap.xml'));
		const data = state();

		sendJson(res, 200, {
			ok: true,
			info: {
				root: ROOT,
				site: SITE,
				local: 'http://' + HOST + ':' + PORT,
				nextId: data.nextId,
				articles: data.articles.length,
				columns: data.columns.length,
				rss: { items: (rssText.match(/<item>/g) || []).length, file: stat(path.join(ROOT, 'rss.xml')) },
				sitemap: { urls: (mapText.match(/<url>/g) || []).length, file: stat(path.join(ROOT, 'sitemap.xml')) },
				columns_detail: data.columns
			}
		});
	},
	async '/api/article/create'(req, res, body) {
		const result = createArticle({
			id: body.id,
			title: body.title,
			date: body.date,
			tags: body.tags,
			excerpt: body.excerpt,
			column: body.column,
			source: body.source,
			pinned: !!body.pinned,
			markdown: typeof body.markdown === 'string' ? body.markdown : undefined,
			mdFile: body.mdFile,
			mdFileName: body.mdFileName,
			skipFeeds: !!body.skipFeeds
		});
		sendJson(res, 200, {
			ok: true,
			output: result.lines.join('\n'),
			state: state()
		});
	}
};

/* ---------- 静态界面 ---------- */

function serveGui(req, res, url) {
	/* 只认文件名，不接受任何目录片段，因此不可能读到 GUI 目录之外；
    以 / 结尾（/admin/）当作首页 */
	const parts = url.pathname.split('/').filter(Boolean);
	const name = url.pathname.endsWith('/') || !parts.length ? 'index.html' : parts[parts.length - 1];

	/* 页面里的 token、端口与本地地址占位符由服务端注入，每个 .html 都要替换 */
	if (path.extname(name) === '.html') {
		const html = fs.readFileSync(path.join(GUI_DIR, name), 'utf8')
			.replace(/__ADMIN_TOKEN__/g, TOKEN)
			.replace(/__ADMIN_PORT__/g, String(PORT))
			.replace(/__LOCAL_URL__/g, 'http://' + HOST + ':' + PORT + '/');
		send(res, 200, html, MIME['.html']);
		return;
	}

	/* 只允许 GUI 目录下的文件 */
	const target = path.resolve(GUI_DIR, name);
	if (target.indexOf(path.resolve(GUI_DIR)) !== 0 || !fs.existsSync(target)) {
		send(res, 404, 'Not Found');
		return;
	}

	send(res, 200, fs.readFileSync(target, 'utf8'), MIME[path.extname(target)] || 'text/plain; charset=utf-8');
}

/* 服务博客站点：从站点根目录提供静态文件 */
function serveSite(req, res, url) {
	let filePath = decodeURIComponent(url.pathname);
	// 去掉前导 /，否则 path.resolve(ROOT, '/index.html') 会把它当绝对路径，忽略 ROOT
	filePath = filePath.replace(/^\//, '');
	if (!filePath || filePath.endsWith('/')) {
		filePath += 'index.html';
	}

	const hit = readSiteFile(filePath);
	if (!hit) {
		send(res, 404, 'Not Found');
		return;
	}

	send(res, 200, fs.readFileSync(hit.target, 'utf8'), hit.mime);
}

/* ---------- 主流程 ----------
 *
 * 路由分三层：
 *   /api/*    → 管理台 API（仅本机来源，跨端口时带 CORS 头）
 *   /admin/*  → 管理台静态界面
 *   其余路径  → 博客站点（从项目根目录提供静态文件）
 */

const server = http.createServer(async (req, res) => {
	let url;
	try {
		url = new URL(req.url, 'http://' + HOST + ':' + PORT);
	} catch (error) {
		send(res, 400, 'Bad Request');
		return;
	}

	const apiPath = url.pathname.replace(/^.*(?=\/api\/)/, '');
	const route = routes[apiPath];
	const isApi = !!route || url.pathname.includes('/api/');

	if (isApi) {
		if (!sameOrigin(req)) {
			addCors(req, res);
			sendJson(res, 403, { ok: false, error: '仅允许来自本机管理台页面的请求' });
			return;
		}

		addCors(req, res);

		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		if (req.method !== 'POST') {
			sendJson(res, 405, { ok: false, error: '该接口只接受 POST' });
			return;
		}

		if (!authorized(req)) {
			sendJson(res, 403, { ok: false, error: '缺少或错误的 X-Admin-Token（请重新打开管理台页面）' });
			return;
		}

		if (!route) {
			sendJson(res, 404, { ok: false, error: '未知接口' });
			return;
		}

		try {
			const body = await readBody(req, 2 * 1024 * 1024);
			await route(req, res, body);
		} catch (error) {
			sendJson(res, 400, { ok: false, error: error.message });
		}
		return;
	}

	/* 管理台页面：直接提供静态文件，不限制来源 */
	if (url.pathname.indexOf('/admin') !== -1) {
		serveGui(req, res, url);
		return;
	}

	/* 博客站点：从项目根目录提供静态文件 */
	serveSite(req, res, url);
});

/* 启动前确认这里确实是站点仓库 */
if (!fs.existsSync(path.join(ROOT, 'blogs', 'articles.html'))) {
	console.error('看起来不是站点仓库（缺少 blogs/articles.html），已终止。');
	process.exit(1);
}

server.listen(PORT, HOST, () => {
	console.log('开发服务器已启动：');
	console.log('  博客站点 : http://' + HOST + ':' + PORT + '/');
	console.log('  管理台   : http://' + HOST + ':' + PORT + '/admin/');
	console.log('');
	console.log('站点目录 : ' + ROOT);
	console.log('只监听   : ' + HOST + '（本机才能访问）');
	console.log('令牌     : ' + TOKEN + '（已注入页面，无需手填）');
	console.log('');
	console.log('按 Ctrl+C 结束。');
});