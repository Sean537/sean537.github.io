/* 管理台公共脚本：接口调用、命令执行、提示条、导航高亮
   页面只负责自己的渲染，所有写操作都走 /api/*，实际改文件由 tools 下的脚本完成 */
(function (global) {
	'use strict';

	const TOKEN = global.ADMIN_TOKEN || '';

	/* 直接双击打开时没有服务端注入的 token，页面降级为只读 */
	const READ_ONLY = location.protocol === 'file:' || TOKEN.indexOf('__ADMIN_TOKEN__') !== -1;

	/* 接口基址：
	   1. 优先使用 window.ADMIN_API（Live Server 等跨服务场景下手动指定）；
	   2. 否则取当前页面目录（由 admin-server.js 托管时自动对上）；
	   3. 最后回退到根目录 / */
	const BASE = global.ADMIN_API || (function () {
		const dir = location.pathname.replace(/[^/]*$/, '');
		return dir && dir !== '/' ? dir : '/';
	})();

	const state = { data: null };

	const el = id => document.getElementById(id);

	function query(selector, scope) {
		return (scope || document).querySelector(selector);
	}

	function queryAll(selector, scope) {
		return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
	}

	function escapeHtml(text) {
		return String(text == null ? '' : text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
	}

	function currentArticle() {
		return (state.data && state.data.articles || []).find(article => article.id === state.current) || null;
	}

	/* ---------- 提示条 ---------- */

	function notice(text, kind) {
		const box = el('notices');
		if (!box) {
			return;
		}

		const item = document.createElement('div');
		item.className = 'notice notice-' + (kind || 'info');
		item.innerHTML = '<p></p>';
		item.querySelector('p').textContent = text;

		const close = document.createElement('button');
		close.type = 'button';
		close.className = 'close';
		close.textContent = '×';
		close.addEventListener('click', () => item.remove());
		item.appendChild(close);

		box.insertBefore(item, box.firstChild);

		if (kind === 'success') {
			setTimeout(() => item.remove(), 9000);
		}

		return item;
	}

	function report(error) {
		const message = error && error.message ? error.message : String(error);

		/* 只读模式下接口本来就连不上，不再叠加一条无意义的网络错误 */
		if (READ_ONLY && /failed to fetch|networkerror|load failed/i.test(message)) {
			return;
		}

		notice(message, 'error');
		if (el('commandLog')) {
			logLine('[出错] ' + message);
		}
		if (error && error.stack && global.console) {
			global.console.error(error.stack);
		}
	}

	/* ---------- 命令记录 ---------- */

	function logLine(text) {
		const box = el('commandLog');
		if (!box) {
			return;
		}
		box.textContent += (box.textContent ? '\n' : '') + text;
		box.scrollTop = box.scrollHeight;
	}

	/* ---------- 接口 ---------- */

	async function api(route, body) {
		const res = await fetch(BASE + 'api/' + route, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Admin-Token': TOKEN
			},
			body: JSON.stringify(body || {})
		});

		const data = await res.json().catch(() => ({ ok: false, error: '服务端没有返回 JSON（HTTP ' + res.status + '）' }));

		if (!res.ok || data.ok === false) {
			throw new Error(data.error || '请求失败（HTTP ' + res.status + '）');
		}

		return data;
	}

	/* 执行一条 manage.js 命令；confirmText 不为空时先在浏览器里确认 */
	async function run(args, confirmText) {
		if (confirmText && !global.confirm(confirmText)) {
			return null;
		}

		const command = 'node tools/manage.js ' + args.join(' ');
		logLine('$ ' + command);

		const data = await api('run', { args, confirm: !!confirmText });
		(data.output || '').split('\n').filter(Boolean).forEach(logLine);

		if (data.state) {
			state.data = data.state;
		}

		return data;
	}

	async function load() {
		const data = await api('state');
		state.data = data.state;
		return state.data;
	}

	function columnTitle(key) {
		if (!key || !state.data) {
			return '';
		}
		const hit = state.data.columns.find(column => column.key === key);
		return hit ? hit.title : key;
	}

	/* ---------- 弹窗（确认 / 单选） ---------- */

	function ask(title, options) {
		const dialog = el('prompt');
		el('promptTitle').textContent = title;
		el('promptText').textContent = (options && options.text) || '';
		el('promptText').hidden = !(options && options.text);

		const field = el('promptField');
		field.textContent = '';

		const select = document.createElement('select');
		(options.items || []).forEach(item => {
			const option = document.createElement('option');
			option.value = item.value;
			option.textContent = item.label;
			select.appendChild(option);
		});
		field.appendChild(select);
		dialog.returnValue = '';

		return new Promise(resolve => {
			dialog.addEventListener('close', () => {
				resolve(dialog.returnValue === 'ok' ? select.value : null);
			}, { once: true });

			dialog.showModal();
			select.focus();
		});
	}

	/* ---------- 启动 ---------- */

	function boot(current) {
		/* 未由 tools/admin-server.js 提供时给出提示，页面保持只读 */
		if (READ_ONLY) {
			notice('这个页面需要先启动本地服务：在项目目录执行 node tools/admin-server.js，然后访问 http://127.0.0.1:4173/admin/，当前只能查看。', 'error');
			queryAll('.main button, .main input, .main select, .main textarea')
				.forEach(node => { node.disabled = true; });
		}

		document.querySelectorAll('.side a[data-page]').forEach(link => {
			link.classList.toggle('is-on', link.dataset.page === current);
		});

		const port = global.ADMIN_PORT;
		if (port && el('adminPort')) {
			el('adminPort').textContent = '127.0.0.1:' + port;
		}
	}

	global.AdminCore = {
		el,
		query,
		queryAll,
		escapeHtml,
		get state() {
			return state.data;
		},
		set state(value) {
			state.data = value;
		},
		currentArticle,
		notice,
		report,
		logLine,
		api,
		run,
		load,
		columnTitle,
		ask,
		boot
	};
})(window);