/* 文章列表页：搜索、筛选、批量操作、行内快捷动作
   所有动作都跳到对应页面或执行一条 manage.js 命令 */
(function () {
	'use strict';

	const A = window.AdminCore;
	const { el, query, queryAll, escapeHtml, notice, report, logLine, run, load, columnTitle } = A;

	const view = { q: '', status: '', column: '' };
	const selected = new Set();

	function readQuery() {
		const params = new URLSearchParams(location.search);
		view.q = params.get('q') || '';
		view.status = params.get('status') || '';
		view.column = params.get('column') || '';
	}

	function writeQuery() {
		const params = new URLSearchParams();
		if (view.q) params.set('q', view.q);
		if (view.status) params.set('status', view.status);
		if (view.column) params.set('column', view.column);
		const query = params.toString();
		history.replaceState(null, '', query ? '?' + query : location.pathname);
	}

	function visibleArticles() {
		const list = A.state.articles;

		return list.filter(article => {
			if (view.status === 'pinned' && !article.pinned) return false;
			if (view.status === 'notes' && article.column) return false;
			if (view.status === 'columns' && !article.column) return false;
			if (view.column && article.column !== view.column) return false;
			if (view.q) {
				const haystack = [article.id, article.title, article.excerpt, (article.tags || []).join(' '), columnTitle(article.column)].join(' ').toLowerCase();
				if (haystack.indexOf(view.q.toLowerCase()) === -1) return false;
			}
			return true;
		});
	}

	function render() {
		const data = A.state;
		const items = visibleArticles();

		el('listSummary').textContent = '共 ' + data.articles.length + ' 篇' +
			(data.articles.length ? '，最新一篇 ' + data.articles[0].date + '《' + data.articles[0].title + '》' : '') +
			'；下一个可用编号 ' + String(data.nextId).padStart(2, '0');
		el('navCount').textContent = data.articles.length;
		el('navColumns').textContent = data.columns.length;
		el('filterSummary').textContent = items.length === data.articles.length ? '未筛选' : '筛选出 ' + items.length + ' 篇';
		el('searchInput').value = view.q;
		el('statusFilter').value = view.status;
		el('columnFilter').value = view.column;

		const body = el('postsBody');
		body.textContent = '';

		if (!items.length) {
			const tr = document.createElement('tr');
			const td = document.createElement('td');
			td.colSpan = 8;
			td.className = 'empty-row';
			td.textContent = data.articles.length ? '没有符合条件的文章。' : '还没有文章，点右上角「+ 新建文章」开始。';
			tr.appendChild(td);
			body.appendChild(tr);
		}

		items.forEach(article => {
			const tr = document.createElement('tr');

			const pick = document.createElement('td');
			pick.className = 'check-col';
			const box = document.createElement('input');
			box.type = 'checkbox';
			box.checked = selected.has(article.id);
			box.addEventListener('change', () => {
				if (box.checked) {
					selected.add(article.id);
				} else {
					selected.delete(article.id);
				}
				renderBulk();
			});
			pick.appendChild(box);
			tr.appendChild(pick);

			const title = document.createElement('td');
			const cell = document.createElement('div');
			cell.className = 'cell-title';
			const link = document.createElement('a');
			link.className = 'name';
			link.href = 'post.html?id=' + article.id;
			link.textContent = article.title;
			cell.appendChild(link);

			const excerpt = document.createElement('div');
			excerpt.className = 'cell-sub';
			excerpt.textContent = (article.excerpt || '（没有摘要）') + ' · ' + (article.tags.length ? article.tags.join('、') : '无标签');
			cell.appendChild(excerpt);
			title.appendChild(cell);

			if (article.pinned) {
				const pin = document.createElement('span');
				pin.className = 'pill green';
				pin.textContent = '置顶';
				pin.style.marginLeft = '8px';
				title.appendChild(pin);
			}
			tr.appendChild(title);

			tr.appendChild(cellEl(String(article.id).padStart(2, '0'), 'narrow'));

			const column = document.createElement('td');
			column.className = 'hide-sm';
			const tag = document.createElement('span');
			tag.className = article.column ? 'pill blue' : 'pill';
			tag.textContent = article.column ? columnTitle(article.column) : '随笔';
			column.appendChild(tag);
			tr.appendChild(column);

			const status = document.createElement('td');
			status.className = 'hide-sm muted';
			status.textContent = article.source ? '有出处链接' : '已发布';
			tr.appendChild(status);

			tr.appendChild(cellEl(article.chars + ' 字', 'narrow hide-sm'));
			tr.appendChild(cellEl(article.date, 'narrow hide-sm'));

			const actions = document.createElement('td');
			const actionBox = document.createElement('div');
			actionBox.className = 'row-actions';
			actionBox.appendChild(action('编辑', 'post.html?id=' + article.id));
			actionBox.appendChild(action(article.pinned ? '取消置顶' : '设为置顶', () => pin(article)));
			actionBox.appendChild(action('加入专栏', () => join(article), false, !A.state.columns.length));
			actionBox.appendChild(action('删除', () => remove(article), true));
			actions.appendChild(actionBox);
			tr.appendChild(actions);

			body.appendChild(tr);
		});

		renderBulk();
	}

	function cellEl(text, className) {
		const td = document.createElement('td');
		td.className = className;
		td.textContent = text;
		return td;
	}

	function action(label, hrefOrFn, danger, disabled) {
		const node = document.createElement('button');
		node.type = 'button';
		node.textContent = label;
		node.disabled = !!disabled;
		if (danger) {
			node.className = 'danger';
		}
		node.addEventListener('click', () => {
			if (typeof hrefOrFn === 'function') {
				hrefOrFn().catch(report);
			} else {
				location.href = hrefOrFn;
			}
		});
		return node;
	}

	/* ---------- 批量操作 ---------- */

	function renderBulk() {
		const bar = el('bulkBar');
		const count = selected.size;
		bar.hidden = count === 0;
		el('bulkCount').textContent = '已选 ' + count + ' 篇';
		const all = visibleArticles().length;
		el('checkAll').checked = count > 0 && count === all;
		el('checkAll').indeterminate = count > 0 && count < all;
	}

	async function applyBulk() {
		const action = el('bulkAction').value;
		const ids = Array.from(selected);

		if (!action || !ids.length) {
			notice('先选批量操作，再勾选文章。', 'info');
			return;
		}

		const titles = ids.map(id => {
			const article = A.state.articles.find(item => item.id === id);
			return id + '《' + (article ? article.title : '') + '》';
		}).join('、');

		if (action === 'delete') {
			const args = ['delete'].concat(ids);
			if (el('keepFiles').checked) {
				args.push('--keep-files');
			}
			const result = await run(args, '确认删除 ' + ids.length + ' 篇文章？\n' + titles + '\n\n编号不会重排。');
			if (result) {
				selected.clear();
				render();
				notice('已删除 ' + ids.length + ' 篇文章。', 'success');
			}
			return;
		}

		if (action === 'join') {
			const key = el('bulkColumn').value;
			if (!key) {
				notice('批量加入专栏需要先选一个专栏。', 'info');
				return;
			}
		}

		let done = 0;
		for (const id of ids) {
			let args;
			if (action === 'join') args = ['join', id, el('bulkColumn').value];
			else if (action === 'leave') args = ['leave', id];
			else args = ['update', id, action === 'pin' ? '--pin' : '--unpin'];

			try {
				await run(args);
				done += 1;
			} catch (error) {
				report('文章 ' + id + ' 处理失败：' + error.message);
			}
		}

		selected.clear();
		render();
		notice('批量操作完成：成功 ' + done + ' / ' + ids.length + ' 篇。', done === ids.length ? 'success' : 'info');
	}

	/* ---------- 行内快捷动作 ---------- */

	async function pin(article) {
		await run(['update', article.id, article.pinned ? '--unpin' : '--pin']);
		render();
		notice(article.id + ' 已' + (article.pinned ? '取消置顶' : '设为置顶') + '。', 'success');
	}

	async function join(article) {
		const items = A.state.columns.map(column => ({
			value: column.key,
			label: column.key + '（' + column.title + '，' + column.count + ' 篇）'
		}));

		if (!items.length) {
			notice('还没有专栏，先到「专栏」页新建一个。', 'info');
			return;
		}

		const key = await A.ask('把文章加入专栏', { text: article.id + '《' + article.title + '》', items });
		if (!key) {
			return;
		}

		await run(['join', article.id, key]);
		render();
		notice(article.id + ' 已加入专栏「' + columnTitle(key) + '」。', 'success');
	}

	async function remove(article) {
		const result = await run(['delete', article.id], '确认删除 ' + article.id + '《' + article.title + '》？\n\n编号不会重排，blogs/' + article.id + '/ 目录也会删除。');
		if (result) {
			render();
			notice('文章 ' + article.id + ' 已删除。', 'success');
		}
	}

	/* ---------- 筛选栏 ---------- */

	function fillColumnFilter() {
		[el('columnFilter'), el('bulkColumn')].forEach(select => {
			const isBulk = select.id === 'bulkColumn';
			const previous = select.value;
			select.textContent = '';

		const blank = document.createElement('option');
		blank.value = '';
		blank.textContent = isBulk ? '选择专栏…' : '全部专栏';
		select.appendChild(blank);

		A.state.columns.forEach(column => {
				const option = document.createElement('option');
				option.value = column.key;
				option.textContent = column.key + '（' + column.title + '）';
				select.appendChild(option);
			});

			select.value = columnKeys().indexOf(previous) !== -1 ? previous : '';
		});
	}

	function columnKeys() {
		return A.state.columns.map(column => column.key);
	}

	async function init() {
		readQuery();
		await load();
		fillColumnFilter();
		render();
		writeQuery();

		el('applyFilter').addEventListener('click', () => {
			view.q = el('searchInput').value.trim();
			view.status = el('statusFilter').value;
			view.column = el('columnFilter').value;
			selected.clear();
			writeQuery();
			render();
		});

		el('searchInput').addEventListener('keydown', event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				el('applyFilter').click();
			}
		});

		el('resetFilter').addEventListener('click', () => {
			view.q = '';
			view.status = '';
			view.column = '';
			selected.clear();
			writeQuery();
			render();
		});

		el('checkAll').addEventListener('change', event => {
			if (event.target.checked) {
				visibleArticles().forEach(article => selected.add(article.id));
			} else {
				selected.clear();
			}
			render();
		});

		el('bulkApply').addEventListener('click', () => applyBulk().catch(report));
		el('bulkClear').addEventListener('click', () => {
			selected.clear();
			render();
		});

		el('bulkAction').addEventListener('change', () => {
			const action = el('bulkAction').value;
			el('bulkColumn').hidden = action !== 'join';
			el('keepFilesWrap').hidden = action !== 'delete';
		});
	}

	A.boot('posts');
	init().catch(report);
})();