/* 编辑页：新建（post.html）与编辑（post.html?id=N）是同一个编辑器、两个入口。
   新建走 add-article，编辑走 manage update，两条路径互不干扰。 */
(function () {
	'use strict';

	const A = window.AdminCore;
	const { el, query, queryAll, notice, report, logLine, api, run, load, columnTitle } = A;

	const params = new URLSearchParams(location.search);
	const editId = params.get('id');
	const isEdit = !!editId;
	let article = null;
	let mdFiles = [];
	let previewTimer = null;

	/* ---------- 界面切换 ---------- */

	function showPane(name) {
		queryAll('.tabs button').forEach(button => {
			button.classList.toggle('is-on', button.dataset.pane === name);
		});
		queryAll('.pane').forEach(pane => {
			pane.classList.toggle('is-on', pane.dataset.pane === name);
		});

		if (name === 'preview') {
			renderPreview();
		}
	}

	function renderPreview() {
		const markdown = el('mdBody').value;
		const box = el('previewBox');

		if (!markdown.trim()) {
			box.innerHTML = '<span class="preview-empty">还没有内容。</span>';
			return;
		}

		api('preview', { markdown }).then(data => {
			box.innerHTML = data.html || '<span class="preview-empty">还没有内容。</span>';
		}).catch(report);
	}

	function schedulePreview() {
		clearTimeout(previewTimer);
		previewTimer = setTimeout(renderPreview, 700);
	}

	/* ---------- 表单 ↔ 数据 ---------- */

	function fill() {
		const today = new Date().toISOString().slice(0, 10);

		if (isEdit) {
			article = A.state.articles.find(item => item.id === editId) || null;
			if (!article) {
				notice('找不到编号 ' + editId + ' 的文章，可能已被删除。返回列表确认一下。', 'error');
				el('postForm').hidden = true;
				return;
			}

			document.title = '编辑文章 · 文章管理台';
			el('pageTitle').textContent = '编辑文章';
			el('publishTitle').textContent = '更新';
			el('pageSub').innerHTML = '编号 ' + article.id + ' · 发布于 ' + article.date +
				' · 正文 ' + article.chars + ' 字、' + article.headings + ' 个标题。' +
				'<a href="' + article.url + '" target="_blank" rel="noopener noreferrer">查看线上页面</a>';
			el('saveTop').textContent = '保存更改';
			el('saveSide').textContent = '保存更改';
			el('saveContinue').textContent = '保存并继续';
			el('headDelete').hidden = false;
			el('idField').hidden = true;
			el('mdNameField').hidden = false;
			el('mdName').value = article.mdFiles[0] || '正文.md';
			renderMdFiles(article);

			el('title').value = article.title;
			el('date').value = article.date;
			el('tags').value = article.tags || '';
			el('excerpt').value = article.excerpt || '';
			el('source').value = article.source || '';
			el('pinned').checked = !!article.pinned;
			el('sourceKeep').checked = !!article.source;

			loadMarkdown(article.mdFiles[0] || '');
			return;
		}

		document.title = '新建文章 · 文章管理台';
		el('pageTitle').textContent = '新建文章';
		el('date').value = today;
		el('postId').value = A.state.nextId;
		el('idHint').textContent = '默认下一个可用编号 ' + A.state.nextId + '（删除留下的空号不再复用）';
		el('mdStats').textContent = '';
		el('previewBox').innerHTML = '<span class="preview-empty">左侧写点内容，这里会实时显示渲染结果（与线上完全一致）。</span>';
	}

	/* 源文清单：编辑既有文章时一直显示，没有源文时给出生成入口 */
	function renderMdFiles(item) {
		const files = (item && item.mdFiles) || [];

		el('mdFilesCard').hidden = false;
		el('mdFileList').innerHTML = files
			.map(name => '<li><label><input type="radio" name="mdPick" value="' + A.escapeHtml(name) + '" /> ' + A.escapeHtml(name) + '</label></li>')
			.join('');
		el('mdFileNote').textContent = files.length
			? '点一下载入该源文；换文件不会立刻改页面，需要点「保存」。'
			: '这篇还没有 Markdown 源文，正文只存在于页面 HTML 里。';
		el('mdGen').textContent = files.length ? '按当前 HTML 重新生成一份' : '从页面 HTML 生成 Markdown';
	}

	/* 由页面 HTML 反向生成 Markdown 源文，早期手写 HTML 的文章靠它进入编辑流程 */
	async function generateMarkdown() {
		const name = (article.title || ('文章' + editId)) + '.md';
		const exists = (article.mdFiles || []).indexOf(name) !== -1;
		const args = ['md', 'from-html', editId, '--out=' + name].concat(exists ? ['--force'] : []);

		if (exists && !window.confirm('blogs/' + editId + '/' + name + ' 已存在，要用当前页面 HTML 重新生成并覆盖吗？')) {
			return;
		}

		el('mdGen').disabled = true;

		try {
			await run(args);
			article = A.state.articles.find(one => one.id === editId) || article;
			renderMdFiles(article);
			await loadMarkdown(name);
			notice('已生成 blogs/' + editId + '/' + name + '，内容取自当前页面 HTML；确认后点「保存」写回页面。', 'success');
		} finally {
			el('mdGen').disabled = false;
		}
	}

	function loadMarkdown(name) {
		if (!name) {
			el('mdBody').value = '';
			return Promise.resolve();
		}

		return api('md', { action: 'read', id: editId, name }).then(data => {
			el('mdBody').value = data.content;
			el('mdName').value = name;
			updateStats();
			logLine('载入源文 blogs/' + editId + '/' + name + '（' + data.content.length + ' 字符）');
		});
	}

	function updateStats() {
		const text = el('mdBody').value;
		el('mdStats').textContent = text.length + ' 字符 · 标题 ' + (text.match(/^#{1,6}\s/gm) || []).length + ' 个 · 代码块 ' + (text.match(/```/g) || []).length / 2;
	}

	function fillColumnRadios(current) {
		const list = el('columnRadios');
		list.textContent = '';

		const none = document.createElement('label');
		const noneInput = document.createElement('input');
		noneInput.type = 'radio';
		noneInput.name = 'column';
		noneInput.value = '';
		noneInput.checked = !current;
		none.appendChild(noneInput);
		none.appendChild(document.createTextNode('无（作为随笔）'));
		list.appendChild(none);

		A.state.columns.forEach(column => {
			const label = document.createElement('label');
			const input = document.createElement('input');
			input.type = 'radio';
			input.name = 'column';
			input.value = column.key;
			input.checked = current === column.key;
			label.appendChild(input);
			label.appendChild(document.createTextNode(column.key + ' —— ' + column.title + '（' + column.count + ' 篇）'));
			list.appendChild(label);
		});
	}

	function pickedColumn() {
		const hit = query('input[name="column"]:checked');
		return hit ? hit.value : '';
	}

	function collect() {
		return {
			title: el('title').value.trim(),
			date: el('date').value,
			tags: el('tags').value.trim(),
			excerpt: el('excerpt').value.trim(),
			source: el('sourceKeep').checked ? el('source').value.trim() : '',
			column: pickedColumn(),
			pinned: el('pinned').checked,
			markdown: el('mdBody').value
		};
	}

	/* ---------- 保存 ---------- */

	async function save(then) {
		const data = collect();

		if (!data.title) {
			notice('标题不能为空。', 'error');
			return;
		}
		if (!data.excerpt) {
			notice('摘要不能为空，首页预览与 meta description 都用它。', 'error');
			return;
		}
		if (!data.date) {
			notice('请选择发布日期。', 'error');
			return;
		}
		if (!data.markdown.trim()) {
			notice('正文不能为空。', 'error');
			return;
		}

		const buttons = queryAll('#saveTop, #saveSide, #saveContinue');
		buttons.forEach(button => { button.disabled = true; });

		try {
			if (isEdit) {
				const payload = Object.assign({ id: editId, mdName: el('mdName').value.trim() || '正文.md' }, data);
				const result = await api('article/save', payload);
				logLine('$ ' + result.command);
				(result.output || '').split('\n').filter(Boolean).forEach(logLine);
				A.state = result.state;
				article = A.state.articles.find(item => item.id === editId) || null;
				fillColumnRadios(data.column);
				renderMdFiles(article);
				el('pageSub').innerHTML = '编号 ' + article.id + ' · 发布于 ' + article.date +
					' · 正文 ' + article.chars + ' 字、' + article.headings + ' 个标题。' +
					'<a href="' + article.url + '" target="_blank" rel="noopener noreferrer">查看线上页面</a>';
				notice('已保存文章 ' + editId + ' 的改动。', 'success');
			} else {
				const payload = Object.assign({ id: el('postId').value.trim() }, data);
				const result = await api('article/create', payload);
				(result.output || '').split('\n').filter(Boolean).forEach(logLine);
				A.state = result.state;
				/* 跳到新文章的编辑页，并把「已创建」这件事带过去 */
				params.set('id', payload.id);
				params.set('created', payload.title);
				location.search = params.toString().replace(/^\?/, '');
				return;
			}

			if (then === 'list') {
				location.href = 'index.html';
			}
		} catch (error) {
			report(error);
		} finally {
			buttons.forEach(button => { button.disabled = false; });
		}
	}

	async function remove() {
		if (!article) {
			return;
		}

		const result = await run(['delete', article.id], '确认删除文章 ' + article.id + '《' + article.title + '》？\n\n编号不会重排，blogs/' + article.id + '/ 目录也会删除。');
		if (result) {
			notice('文章 ' + article.id + ' 已删除。', 'success');
			location.href = 'index.html';
		}
	}

	/* ---------- 事件 ---------- */

	function bind() {
		queryAll('.tabs button').forEach(button => {
			button.addEventListener('click', () => showPane(button.dataset.pane));
		});

		el('mdBody').addEventListener('input', () => {
			updateStats();
			schedulePreview();
		});

		el('saveTop').addEventListener('click', () => save());
		el('saveSide').addEventListener('click', () => save('list'));
		el('saveContinue').addEventListener('click', () => save());
		el('headDelete').addEventListener('click', event => {
			event.preventDefault();
			remove().catch(report);
		});

		el('mdFileList').addEventListener('change', event => {
			if (event.target.name === 'mdPick') {
				loadMarkdown(event.target.value).catch(report);
			}
		});

		el('mdGen').addEventListener('click', () => {
			generateMarkdown().catch(report);
		});

		el('sourceKeep').addEventListener('change', () => {
			el('source').disabled = !el('sourceKeep').checked;
			if (!el('sourceKeep').checked) {
				el('source').value = '';
			}
		});

		el('postForm').addEventListener('submit', event => event.preventDefault());
	}

	async function init() {
		await load();
		bind();
		fill();
		fillColumnRadios(isEdit && article ? article.column : '');
		el('source').disabled = isEdit ? !el('sourceKeep').checked : true;
		updateStats();

		/* 刚发布完跳过来时给一条确认提示，随后把 created 参数清掉 */
		const created = params.get('created');
		if (created) {
			notice('已发布文章 ' + editId + '《' + created + '》，现在可以继续修改或回到列表。', 'success');
			params.delete('created');
			history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : ''));
		}
	}

	A.boot(isEdit ? 'post-edit' : 'new');
	init().catch(report);
})();