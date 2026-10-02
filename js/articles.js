/* 博客系统：从 blogs/articles.html 读取 <template> 文章数据，
   渲染文章列表（首页 / 博客页）与文章正文（文章页）。
   新增文章只需在 blogs/articles.html 中复制一段 <template>。 */
(function () {
	'use strict';

	var articleList = document.querySelector('[data-article-list]');
	var articleView = document.querySelector('[data-article-view]');

	if (!articleList && !articleView) {
		return;
	}

	function formatDate(value) {
		var date = new Date(value + 'T12:00:00');
		return new Intl.DateTimeFormat('zh-CN', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}).format(date);
	}

	function makeElement(tagName, className, text) {
		var element = document.createElement(tagName);
		if (className) {
			element.className = className;
		}
		if (text) {
			element.textContent = text;
		}
		return element;
	}

	function arrowIcon() {
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '2.4');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
		svg.setAttribute('aria-hidden', 'true');
		var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M5 12h14M13 6l6 6-6 6');
		svg.appendChild(path);
		return svg;
	}

	function sortByDate(templates) {
		return templates.slice().sort(function (first, second) {
			return second.dataset.date.localeCompare(first.dataset.date);
		});
	}

	function renderArticleList(templates) {
		var articleBase = articleList.dataset.articleBase || './';
		var limit = parseInt(articleList.dataset.articleLimit, 10);
		var sorted = sortByDate(templates);
		var fragment = document.createDocumentFragment();
		var shown = 0;

		sorted.forEach(function (template, index) {
			var articleId = template.dataset.articleId;
			if (!/^\d+$/.test(articleId)) {
				return;
			}
			if (!isNaN(limit) && shown >= limit) {
				return;
			}

			var article = makeElement('article', 'article-preview card');
			var number = makeElement('span', 'article-preview-number', String(index + 1).padStart(2, '0'));
			var content = makeElement('div', 'article-preview-content');
			var header = makeElement('div', 'article-preview-meta');
			var time = makeElement('time', '', formatDate(template.dataset.date));
			var tags = makeElement('span', 'article-preview-tags', template.dataset.tags.split(',').join(' / '));
			var titleLink = makeElement('a', '', template.dataset.title);
			var title = makeElement('h2', 'article-preview-title');
			var excerpt = makeElement('p', 'article-preview-excerpt', template.dataset.excerpt);
			var readLink = makeElement('a', 'article-preview-link', '阅读全文');

			titleLink.href = articleBase + articleId + '/';
			readLink.href = titleLink.href;
			time.dateTime = template.dataset.date;
			readLink.appendChild(arrowIcon());
			header.append(time, tags);
			title.append(titleLink);
			content.append(header, title, excerpt, readLink);
			article.append(number, content);
			fragment.append(article);
			shown += 1;
		});

		articleList.replaceChildren(fragment);
		articleList.setAttribute('aria-busy', 'false');

		var count = document.querySelector('[data-article-count]');
		var search = document.querySelector('[data-article-search]');
		var empty = document.querySelector('[data-article-empty]');

		if (count) {
			count.textContent = String(sorted.length).padStart(2, '0');
		}
		if (search) {
			search.addEventListener('input', function () {
				var query = search.value.trim().toLocaleLowerCase();
				var visible = 0;

				Array.from(articleList.children).forEach(function (article) {
					var matches = article.textContent.toLocaleLowerCase().indexOf(query) !== -1;
					article.hidden = !matches;
					visible += matches ? 1 : 0;
				});

				if (empty) {
					empty.hidden = visible !== 0;
				}
			});
		}
	}

	function renderArticle(templates) {
		var articleId = articleView.dataset.articleView;
		var sorted = sortByDate(templates);
		var template = null;
		var position = -1;

		sorted.forEach(function (item, index) {
			if (item.dataset.articleId === articleId) {
				template = item;
				position = index;
			}
		});

		if (!template) {
			articleView.textContent = '没有找到这篇文章。';
			articleView.setAttribute('aria-busy', 'false');
			return;
		}

		articleView.replaceChildren(template.content.cloneNode(true));
		articleView.setAttribute('aria-busy', 'false');
		document.title = template.dataset.title + ' - 山地奥斯卡537的博客';

		var description = document.querySelector('meta[name="description"]');
		if (description) {
			description.content = template.dataset.excerpt;
		}

		/* 上一篇 / 下一篇 */
		var pager = document.querySelector('[data-article-pager]');
		if (pager) {
			var base = pager.dataset.articleBase || '../';
			var newer = sorted[position - 1]; /* 更新的 */
			var older = sorted[position + 1]; /* 更早的 */
			var fragment = document.createDocumentFragment();

			function pagerLink(item, dir, extraClass) {
				var link = makeElement('a', extraClass || '');
				link.href = base + item.dataset.articleId + '/';
				link.appendChild(makeElement('span', 'dir', dir));
				link.appendChild(makeElement('span', 'name', item.dataset.title));
				return link;
			}
			fragment.appendChild(older ? pagerLink(older, '← 上一篇') : makeElement('span', 'placeholder'));
			fragment.appendChild(newer ? pagerLink(newer, '下一篇 →', 'next') : makeElement('span', 'placeholder'));
			pager.replaceChildren(fragment);
		}

		var comments = articleView.querySelector('[data-utterances]');
		if (comments) {
			comments.classList.add('utterances');
			var script = document.createElement('script');
			script.src = 'https://utteranc.es/client.js';
			script.setAttribute('repo', 'Sean537/sean537.github.io');
			script.setAttribute('issue-term', 'pathname');
			script.setAttribute('theme', 'github-' + (document.documentElement.getAttribute('data-theme') || 'light'));
			script.setAttribute('crossorigin', 'anonymous');
			script.async = true;
			comments.appendChild(script);
		}
	}

	fetch('/blogs/articles.html')
		.then(function (response) {
			if (!response.ok) {
				throw new Error('Could not load article templates');
			}
			return response.text();
		})
		.then(function (html) {
			var source = new DOMParser().parseFromString(html, 'text/html');
			var templates = Array.from(source.querySelectorAll('template[data-article-id]'));

			if (articleList) {
				renderArticleList(templates);
			}
			if (articleView) {
				renderArticle(templates);
			}
		})
		.catch(function () {
			var target = articleList || articleView;
			target.textContent = '文章暂时无法载入，请检查网络后刷新页面。';
			target.setAttribute('aria-busy', 'false');
		});
}());
