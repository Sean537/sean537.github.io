/* 评论系统加载器：按 js/comments-config.js 的配置挂载 Utterances 或 Giscus，
   并处理深浅色主题同步与加载失败提示。 */
(function () {
	'use strict';

	var config = window.SITE_COMMENTS || {};
	var root = document.documentElement;

	function currentTheme() {
		return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
	}

	/* ---------- Utterances ---------- */
	function mountUtterances(container, options) {
		var script = document.createElement('script');
		script.src = 'https://utteranc.es/client.js';
		script.async = true;
		script.crossOrigin = 'anonymous';
		script.setAttribute('repo', options.repo);
		script.setAttribute('issue-term', options.issueTerm || 'pathname');
		script.setAttribute('theme', 'github-' + currentTheme());
		container.appendChild(script);
	}

	/* ---------- Giscus ---------- */
	function mountGiscus(container, options) {
		if (!options.repoId || !options.categoryId) {
			showFallback(container, 'Giscus 配置未完成：请在 js/comments-config.js 中填入 repoId 与 categoryId 后刷新。');
			return;
		}
		container.classList.add('giscus');

		var script = document.createElement('script');
		script.src = 'https://giscus.app/client.js';
		script.async = true;
		script.crossOrigin = 'anonymous';
		script.setAttribute('data-repo', options.repo);
		script.setAttribute('data-repo-id', options.repoId);
		script.setAttribute('data-category', options.category);
		script.setAttribute('data-category-id', options.categoryId);
		script.setAttribute('data-mapping', options.mapping || 'pathname');
		script.setAttribute('data-strict', options.strict || '1');
		script.setAttribute('data-reactions-enabled', options.reactionsEnabled || '1');
		script.setAttribute('data-emit-metadata', options.emitMetadata || '0');
		script.setAttribute('data-input-position', options.inputPosition || 'top');
		script.setAttribute('data-theme', currentTheme());
		script.setAttribute('data-lang', options.lang || 'zh-CN');
		script.setAttribute('data-loading', 'lazy');
		script.setAttribute('data-limit', options.limit || '50');
		container.appendChild(script);
	}

	/* ---------- 失败提示 ---------- */
	function fallbackNode(container) {
		var section = container.closest('.article-comments') || document;
		return section.querySelector('[data-comments-fallback]');
	}

	function showFallback(container, message) {
		var node = fallbackNode(container);
		if (!node) {
			return;
		}
		var span = node.querySelector('span');
		if (span && message) {
			span.textContent = message;
		}
		node.hidden = false;
		node.classList.add('is-active');
	}

	function clearLoading() {
		var loading = document.querySelector('.comments-loading');
		if (loading) {
			loading.remove();
		}
	}

	/* 评论区守卫：10 秒后开始检查，最多两次（间隔 6 秒）。
   正常渲染的评论框（GitHub 登录按钮 + 输入框）至少 140px 高；
   请求被拦截时只剩 CSS 占位的 120px，此时给出降级提示。 */
	function watchForFailure(container) {
		var attempts = 0;

		function check() {
			attempts += 1;
			var frame = container.querySelector('iframe');
			var rect = frame ? frame.getBoundingClientRect() : null;
			var interactive = !!rect && rect.width > 0 && rect.height >= 140;

			if (interactive) {
				return;
			}
			if (attempts >= 2) {
				showFallback(container);
				return;
			}
			window.setTimeout(check, 6000);
		}

		window.setTimeout(check, 10000);
	}

	/* ---------- 对外接口 ---------- */
	window.SiteComments = {
		mount: function (container) {
			if (!container) {
				return;
			}
			container.classList.add('utterances');
			clearLoading();

			if (config.provider === 'giscus') {
				mountGiscus(container, config.giscus || {});
			} else {
				mountUtterances(container, config.utterances || {});
			}
			watchForFailure(container);
		},

		/* 主题切换时同步评论区（Giscus 走 postMessage，Utterances 亦支持） */
		syncTheme: function () {
			var container = document.querySelector('.utterances');
			if (!container) {
				return;
			}
			document.querySelectorAll('iframe[src*="utteranc.es"], iframe[src*="giscus.app"]').forEach(function (frame) {
				if (!frame.contentWindow) {
					return;
				}
				try {
					frame.contentWindow.postMessage({ giscus: { setConfig: { theme: currentTheme() } } }, '*');
					frame.contentWindow.postMessage({ type: 'set-theme', theme: 'github-' + currentTheme() }, '*');
				} catch (error) {
					/* 跨域受限则忽略 */
				}
			});
		}
	};

	/* 主题切换时同步 */
	window.addEventListener('sean537:themechange', function () {
		window.SiteComments.syncTheme();
	});
}());
