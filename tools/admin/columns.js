/* 专栏页：右栏表单负责新建 / 编辑 / 删除，左栏表格只负责查看与进入筛选 */
(function () {
	'use strict';

	const A = window.AdminCore;
	const { el, query, queryAll, escapeHtml, notice, report, run, load } = A;

	let mode = 'add';
	let current = '';

	function render() {
		const columns = A.state.columns;
		const body = el('columnBody');
		body.textContent = '';

		el('columnCount').textContent = columns.length + ' 个';
		el('navColumns').textContent = columns.length;
		el('navCount').textContent = A.state.articles.length;
		el('columnSummary').textContent = columns.length
			? columns.length + ' 个专栏，' + A.state.articles.filter(article => article.column).length + ' 篇文章在专栏里，' +
				A.state.articles.filter(article => !article.column).length + ' 篇是随笔'
			: '还没有专栏';

		if (!columns.length) {
			const tr = document.createElement('tr');
			const td = document.createElement('td');
			td.colSpan = 4;
			td.className = 'empty-row';
			td.textContent = '还没有专栏，用右边的表单新建一个。';
			tr.appendChild(td);
			body.appendChild(tr);
		}

		columns.forEach(column => {
			const tr = document.createElement('tr');

			const name = document.createElement('td');
			const cell = document.createElement('div');
			cell.className = 'cell-title';
			const link = document.createElement('a');
			link.className = 'name';
			link.href = 'index.html?column=' + encodeURIComponent(column.key);
			link.textContent = column.title;
			cell.appendChild(link);
			if (column.desc) {
				const desc = document.createElement('div');
				desc.className = 'cell-sub';
				desc.textContent = column.desc;
				cell.appendChild(desc);
			}
			name.appendChild(cell);
			tr.appendChild(name);

			const key = document.createElement('td');
			key.className = 'narrow';
			key.innerHTML = '<code>' + escapeHtml(column.key) + '</code>';
			tr.appendChild(key);

			const count = document.createElement('td');
			count.className = 'narrow';
			count.textContent = column.count + ' 篇';
			tr.appendChild(count);

			const actions = document.createElement('td');
			const actionBox = document.createElement('div');
			actionBox.className = 'row-actions';
			actionBox.appendChild(action('查看文章', 'index.html?column=' + encodeURIComponent(column.key)));
			actionBox.appendChild(action('编辑', () => fillForm('edit', column)));
			actionBox.appendChild(action('删除', () => fillForm('delete', column), true));
			actions.appendChild(actionBox);
			tr.appendChild(actions);

			body.appendChild(tr);
		});
	}

	function action(label, hrefOrFn, danger) {
		const node = document.createElement('button');
		node.type = 'button';
		node.textContent = label;
		if (danger) {
			node.className = 'danger';
		}
		node.addEventListener('click', () => {
			if (typeof hrefOrFn === 'function') {
				hrefOrFn();
			} else {
				location.href = hrefOrFn;
			}
		});
		return node;
	}

	function fillMoveTo(selectedKey) {
		const select = el('columnMoveTo');
		select.textContent = '';

		const blank = document.createElement('option');
		blank.value = '';
		blank.textContent = '放回随笔';
		select.appendChild(blank);

		A.state.columns.filter(column => column.key !== selectedKey).forEach(column => {
			const option = document.createElement('option');
			option.value = column.key;
			option.textContent = column.key + '（' + column.title + '）';
			select.appendChild(option);
		});
	}

	/* 表单三种状态：新建 / 编辑（改名称简介）/ 删除（只选转入目标） */
	function fillForm(next, column) {
		mode = next;
		current = column ? column.key : '';

		el('keyField').hidden = next !== 'add';
		el('titleField').hidden = next === 'delete';
		el('descField').hidden = next === 'delete';
		el('moveField').hidden = next !== 'delete';
		el('cancelColumn').hidden = next === 'add';

		if (next === 'add') {
			el('columnFormTitle').textContent = '新建专栏';
			el('submitColumn').textContent = '创建专栏';
			el('columnKey').value = '';
			el('columnTitle').value = '';
			el('columnDesc').value = '';
			el('columnKey').focus();
			return;
		}

		if (next === 'edit') {
			el('columnFormTitle').textContent = '编辑专栏：' + column.key;
			el('submitColumn').textContent = '保存修改';
			el('columnTitle').value = column.title;
			el('columnDesc').value = column.desc || '';
			return;
		}

		el('columnFormTitle').textContent = '删除专栏：' + column.key;
		el('submitColumn').textContent = '删除';
		fillMoveTo(column.key);
		el('columnMoveTo').value = '';
	}

	async function submit() {
		try {
			if (mode === 'add') {
				const key = el('columnKey').value.trim();
				const title = el('columnTitle').value.trim();
				const desc = el('columnDesc').value.trim();

				if (!key || !title) {
					notice('新建专栏需要填写 key 与名称。', 'error');
					return;
				}

				await run(['column', 'add', key, '--title=' + title].concat(desc ? ['--desc=' + desc] : []));
				notice('专栏 ' + key + ' 已创建。', 'success');
			} else if (mode === 'edit') {
				const title = el('columnTitle').value.trim();
				const desc = el('columnDesc').value.trim();

				if (!title) {
					notice('专栏名称不能为空。', 'error');
					return;
				}

				const args = ['column', 'set', current, '--title=' + title];
				if (desc) {
					args.push('--desc=' + desc);
				}
				await run(args);
				notice('专栏 ' + current + ' 已更新。', 'success');
			} else {
				const moveTo = el('columnMoveTo').value;
				const args = ['column', 'rm', current].concat(moveTo ? ['--move-to=' + moveTo] : []);
				const count = A.state.columns.find(column => column.key === current).count;
				const result = await run(args, '确认删除专栏 ' + current + '？\n\n里面的 ' + count + ' 篇文章会' +
					(moveTo ? '转入「' + moveTo + '」' : '放回随笔') + '，文章页面文件保留。');
				if (result) {
					notice('专栏 ' + current + ' 已删除。', 'success');
				}
			}

			fillForm('add');
			render();
		} catch (error) {
			report(error);
		}
	}

	async function init() {
		await load();
		render();
		fillForm('add');

		el('newColumn').addEventListener('click', () => {
			fillForm('add');
			el('columnKey').focus();
		});

		el('submitColumn').addEventListener('click', submit);

		el('cancelColumn').addEventListener('click', () => {
			fillForm('add');
			render();
		});

		el('columnFormTitle').addEventListener('click', () => {
			if (mode !== 'add') {
				fillForm('add');
			}
		});
	}

	A.boot('columns');
	init().catch(report);
})();