/* 主题：浅色 / 深色 / 跟随系统（默认）。
   跟随系统时会实时响应操作系统的深浅色切换，并把结果同步给评论区。 */
(function () {
	'use strict';

	var storageKey = 'sean537-theme';
	var root = document.documentElement;
	var media = window.matchMedia('(prefers-color-scheme: dark)');
	var MODES = ['light', 'dark', 'system'];
	var LABELS = {
		light: '浅色模式',
		dark: '深色模式',
		system: '跟随系统'
	};
	var mode = 'system';

	try {
		var saved = window.localStorage.getItem(storageKey);
		if (MODES.indexOf(saved) !== -1) mode = saved;
	} catch (error) {
		mode = 'system';
	}

	function resolve(target) {
		if (target === 'light' || target === 'dark') return target;
		return media.matches ? 'dark' : 'light';
	}

	function applyTheme(target, persist) {
		mode = MODES.indexOf(target) === -1 ? 'system' : target;
		var theme = resolve(mode);

		root.setAttribute('data-theme', theme);
		root.setAttribute('data-theme-mode', mode);

		document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
			var next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
			var text = '主题：' + LABELS[mode] + '，点击切换到' + LABELS[next];
			button.setAttribute('aria-pressed', String(theme === 'dark'));
			button.setAttribute('data-theme-mode', mode);
			button.setAttribute('aria-label', text);
			button.title = text;
		});

		window.dispatchEvent(new CustomEvent('sean537:themechange', {
			detail: { theme: theme, mode: mode }
		}));

		if (persist) {
			try {
				window.localStorage.setItem(storageKey, mode);
			} catch (error) {
				/* 隐私模式下忽略 */
			}
		}
	}

	/* Utterances 评论 iframe 主题同步（Giscus 由 js/comments.js 处理） */
	window.addEventListener('sean537:themechange', function (event) {
		var theme = 'github-' + event.detail.theme;
		document.querySelectorAll('iframe[src*="utteranc.es"]').forEach(function (frame) {
			frame.contentWindow.postMessage({ type: 'set-theme', theme: theme }, 'https://utteranc.es');
		});
	});

	applyTheme(mode, false);

	document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
		button.addEventListener('click', function () {
			applyTheme(MODES[(MODES.indexOf(mode) + 1) % MODES.length], true);
		});
	});

	/* 跟随系统时，系统主题一变就跟着变 */
	var onSystemChange = function (event) {
		if (mode === 'system') applyTheme('system', false);
	};

	if (media.addEventListener) {
		media.addEventListener('change', onSystemChange);
	} else if (media.addListener) {
		media.addListener(onSystemChange);
	}
}());