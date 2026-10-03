/* 文章分享：只保留一个「复制本文链接」文字链接。
   文首跟在日期 / 作者同一行的右侧，文末放在作者卡片下方，
   点击后复制线上地址并就地反馈，不再堆叠各平台按钮。 */
(function () {
	'use strict';

	var BASE = 'https://www.ithink537.top';

	var COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<rect x="9" y="9" width="11" height="11" rx="2.6"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14"/></svg>';

	/* 文末用系统同款「分享」图标（方框 + 向上箭头），文首仍是复制图标 */
	var SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<path d="M12 3.6v11"/><path d="M8.2 7.4 12 3.6l3.8 3.8"/><path d="M6.5 11.4H5.4A2.4 2.4 0 0 0 3 13.8v5.3A2.4 2.4 0 0 0 5.4 21.5h13.2a2.4 2.4 0 0 0 2.4-2.4v-5.3a2.4 2.4 0 0 0-2.4-2.4h-1.1"/></svg>';

	var current = { url: '' };

	/* ---------- 复制 ---------- */

	function copyWithTextarea(value) {
		/* 非安全上下文或 Clipboard API 不可用时的兜底 */
		return new Promise(function (resolve, reject) {
			var field = document.createElement('textarea');
			field.value = value;
			field.setAttribute('readonly', '');
			field.style.position = 'fixed';
			field.style.top = '0';
			field.style.opacity = '0';
			document.body.appendChild(field);
			field.select();
			field.setSelectionRange(0, value.length);
			var ok = false;
			try {
				ok = document.execCommand('copy');
			} catch (error) {
				ok = false;
			}
			field.remove();
			ok ? resolve() : reject(new Error('copy failed'));
		});
	}

	function copyText(value) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			/* 权限被拒或文档失焦时也会 reject，这时退回旧方案 */
			return navigator.clipboard.writeText(value).catch(function () {
				return copyWithTextarea(value);
			});
		}
		return copyWithTextarea(value);
	}

	/* ---------- 生成链接 ---------- */

	function makeLink(placement) {
		var button = document.createElement('button');
		button.type = 'button';
		button.className = 'share-link share-link--' + placement;
		button.dataset.share = 'copy';
		/* 不用 span 包裹，避免被 .article-meta span 的样式波及 */
		button.dataset.label = placement === 'header' ? '复制本文链接' : '复制链接';
		button.innerHTML = placement === 'header' ? COPY_ICON : SHARE_ICON;
		button.appendChild(document.createTextNode(button.dataset.label));
		return button;
	}

	function flash(button, ok) {
		button.lastChild.nodeValue = ok ? '链接已复制' : '复制失败，请手动复制';
		button.classList.toggle('is-done', ok);
		button.classList.toggle('is-failed', !ok);

		window.setTimeout(function () {
			button.lastChild.nodeValue = button.dataset.label;
			button.classList.remove('is-done', 'is-failed');
		}, ok ? 1800 : 2600);
	}

	document.addEventListener('click', function (event) {
		var button = event.target.closest('[data-share="copy"]');
		if (!button) {
			return;
		}
		copyText(current.url).then(function () {
			flash(button, true);
		}, function () {
			flash(button, false);
		});
	});

	/* ---------- 挂载 ---------- */

	window.SiteShare = {
		mount: function (view) {
			var scope = view || document.querySelector('[data-article-view]');
			if (!scope) {
				return;
			}

			/* 幂等：静态回退与异步渲染可能都会调用，只挂载一次 */
			if (scope.dataset.shareMounted === 'true') {
				return;
			}
			scope.dataset.shareMounted = 'true';

			var articleId = scope.dataset.articleView || '';
			current.url = /^\d+$/.test(articleId) ? BASE + '/blogs/' + articleId + '/' : location.href;

			/* 文首：与日期 / 作者同行，靠右 */
			var meta = scope.querySelector('.article-meta');
			if (meta) {
				meta.appendChild(makeLink('header'));
			}

			/* 文末：作者信息之前，并在文章宽度内左右居中 */
			var author = scope.querySelector('.article-author');
			var source = scope.querySelector('[data-article-source]');
			var anchor = author || (source && !source.hidden ? source : null);

			if (anchor && anchor.parentNode) {
				var footer = document.createElement('div');
				footer.className = 'article-share-footer';
				footer.appendChild(makeLink('footer'));
				anchor.parentNode.insertBefore(footer, anchor);
			}
		}
	};

	/* 静态正文（调试或未来改成服务端直出）时自行挂载 */
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function () {
			var scope = document.querySelector('[data-article-view]');
			if (scope && scope.querySelector('.article-header h1')) {
				window.SiteShare.mount(scope);
			}
		});
	}
}());