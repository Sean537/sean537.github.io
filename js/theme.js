/* 主题切换：浅色 / 深色。记忆选择，默认跟随系统，同步 utterances 评论主题。 */
(function () {
	'use strict';

	var storageKey = 'sean537-theme';
	var root = document.documentElement;
	var media = window.matchMedia('(prefers-color-scheme: dark)');
	var savedTheme = null;

	try {
		savedTheme = window.localStorage.getItem(storageKey);
	} catch (error) {
		savedTheme = null;
	}

	function applyTheme(theme, persist) {
		root.setAttribute('data-theme', theme);
		document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
			button.setAttribute('aria-pressed', String(theme === 'dark'));
			button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
			button.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
		});
		window.dispatchEvent(new CustomEvent('sean537:themechange', { detail: { theme: theme } }));

		if (persist) {
			try {
				window.localStorage.setItem(storageKey, theme);
			} catch (error) {
				/* 隐私模式下忽略 */
			}
		}
	}

	/* 同步 utterances 评论 iframe 的主题 */
	window.addEventListener('sean537:themechange', function (event) {
		var theme = 'github-' + event.detail.theme;
		document.querySelectorAll('iframe[src*="utteranc.es"]').forEach(function (frame) {
			frame.contentWindow.postMessage({ type: 'set-theme', theme: theme }, 'https://utteranc.es');
		});
	});

	var initial = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : (media.matches ? 'dark' : 'light');
	applyTheme(initial, false);

	document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
		button.addEventListener('click', function () {
			applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
		});
	});

	if (!savedTheme && media.addEventListener) {
		media.addEventListener('change', function (event) {
			applyTheme(event.matches ? 'dark' : 'light', false);
		});
	}
}());
