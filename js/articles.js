/* 博客系统：从 blogs/articles.html 读取 <template> 文章数据，
   渲染文章列表（首页 / 博客页）、博客概述文章与文章正文（文章页）。
   新增文章只需在 blogs/articles.html 中复制一段 <template>。 */
(function () {
	'use strict';

	var articleList = document.querySelector('[data-article-list]');
	var articleView = document.querySelector('[data-article-view]');
	var introView = document.querySelector('[data-article-intro]');

	if (!articleList && !articleView && !introView) {
		return;
	}

	/* ---------- 专栏定义 ----------
	   文章模板里用 data-column="<key>" 归入某个专栏；
	   留空表示「随笔」，不参与专栏，也不会显示上一篇 / 下一篇。 */
	var COLUMNS = {
		cpp: {
			title: 'C++ 编程实践',
			desc: '从第一个控制台程序，到自己写的终端控制库。边写边记，踩过的坑都留在文章里。'
		},
		tools: {
			title: '工具与协作',
			desc: '把开发流程交给工具：版本控制、写作与自动化。'
		}
	};

	var columnKeys = Object.keys(COLUMNS);

	/* 正文长度：中日韩文字按字算，其余按单词算（避免代码与标点撑大数字） */
	function countWords(template) {
		var body = template.content.querySelector('.article-body') || template.content;
		var text = (body.textContent || '').replace(/\s+/g, ' ');

		var cjk = text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g);
		var words = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
		return (cjk ? cjk.length : 0) + (words ? words.length : 0);
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

	function columnOf(template) {
		var key = template.dataset.column;
		return key && COLUMNS[key] ? key : '';
	}

	/* 专栏内文章：按时间正序（自前到后，最早的在前） */
	function articlesOfColumn(templates, key) {
		return sortByDate(templates.filter(function (item) {
			return columnOf(item) === key;
		})).reverse();
	}

	/* ---------- 列表（首页 / 博客页） ---------- */

	function renderArticleList(templates) {
		var articleBase = articleList.dataset.articleBase || './';
		var limit = parseInt(articleList.dataset.articleLimit, 10);
		var sorted = sortByDate(templates);
		var fragment = document.createDocumentFragment();
		var shown = 0;

		sorted.forEach(function (template) {
			var articleId = template.dataset.articleId;
			if (!/^\d+$/.test(articleId)) {
				return;
			}
			if (!isNaN(limit) && shown >= limit) {
				return;
			}

			var article = makeElement('article', 'article-preview card');
			/* 编号沿用 blogs 文件夹编号（1 为最早），列表顺序仍按日期自新至旧 */
			var number = makeElement('span', 'article-preview-number', String(articleId).padStart(2, '0'));
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

			var column = columnOf(template);
			if (column) {
				var badge = makeElement('span', 'article-preview-column', COLUMNS[column].title);
				header.appendChild(badge);
			}

			title.appendChild(titleLink);
			content.append(header, title, excerpt, readLink);
			article.append(number, content);
			fragment.appendChild(article);
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

	/* ---------- 博客概述文章 ---------- */

	function renderIntro(template, templates) {
		if (!introView) {
			return;
		}

		if (!template) {
			introView.hidden = true;
			return;
		}

		introView.replaceChildren(template.content.cloneNode(true));
		introView.hidden = false;
		introView.setAttribute('aria-busy', 'false');

		var sorted = sortByDate(templates.filter(function (item) {
			return /^\d+$/.test(item.dataset.articleId);
		}));
		var base = introView.dataset.articleBase || './';

		/* 专栏索引 */
		var columnBox = introView.querySelector('[data-column-index]');
		if (columnBox) {
			var fragment = document.createDocumentFragment();

			orderedColumnKeys(templates).forEach(function (key) {
				var list = articlesOfColumn(templates, key);
				if (!list.length) {
					return;
				}

				var card = makeElement('section', 'column-card');
				var head = makeElement('div', 'column-card-head');
				var title = makeElement('h3', 'column-card-title');
				var count = makeElement('span', 'column-card-count', list.length + ' 篇');
				var desc = makeElement('p', 'column-card-desc', COLUMNS[key].desc);
				var ol = makeElement('ol', 'column-card-list');

				list.forEach(function (item) {
					var li = makeElement('li');
					var link = makeElement('a', '', item.dataset.title);
					link.href = base + item.dataset.articleId + '/';
					/* appendChild 只接受一个节点，多个子节点要用 append */
				li.append(link, makeElement('span', 'date', formatDate(item.dataset.date)));
					ol.appendChild(li);
				});

				title.appendChild(document.createTextNode(COLUMNS[key].title));
				head.append(title, count);
				card.append(head, desc, ol);
				fragment.appendChild(card);
			});

			columnBox.replaceChildren(fragment);
		}

		/* 置顶文章：模板上带 data-pinned="1" 的，按日期从新到旧，最多 3 篇 */
		var pinnedBox = introView.querySelector('[data-pinned-list]');
		if (pinnedBox) {
			var pinned = sorted.filter(function (item) {
				return (item.dataset.pinned || '') === '1';
			}).slice(0, 3);

			if (pinned.length) {
				var pinFragment = document.createDocumentFragment();

				pinned.forEach(function (item) {
					var card = makeElement('a', 'pinned-card');
					card.href = base + item.dataset.articleId + '/';

					var top = makeElement('div', 'pinned-card-top');
					top.append(
						makeElement('span', 'pixel', String(item.dataset.articleId).padStart(2, '0')),
						makeElement('span', 'date', formatDate(item.dataset.date))
					);

					card.append(
						top,
						makeElement('h3', 'pinned-card-title', item.dataset.title),
						makeElement('p', 'pinned-card-desc', item.dataset.excerpt)
					);

					var column = columnOf(item);
					if (column) {
						card.appendChild(makeElement('span', 'pinned-card-column', COLUMNS[column].title));
					}

					pinFragment.appendChild(card);
				});

				pinnedBox.replaceChildren(pinFragment);
				pinnedBox.hidden = false;
			} else {
				/* 一篇都没置顶时整段隐藏，避免留下空标题 */
				var section = pinnedBox.closest('.blog-intro-section');
				if (section) {
					section.hidden = true;
				}
				pinnedBox.replaceChildren();
				pinnedBox.hidden = true;
			}
		}

		/* 概述里的统计数字：正文总字数按「中文字 + 英文单词」计 */
		var format = {
			articles: function (value) { return String(value).padStart(2, '0'); },
			columns: function (value) { return String(value).padStart(2, '0'); },
			words: function (value) { return value.toLocaleString('zh-CN'); }
		};

		introView.querySelectorAll('[data-stat]').forEach(function (node) {
			var kind = node.dataset.stat;
			var value = kind === 'articles' ? sorted.length
				: kind === 'columns' ? orderedColumnKeys(templates).length
					: kind === 'words' ? sorted.reduce(function (sum, item) {
						return sum + countWords(item);
					}, 0)
						: 0;
			node.textContent = (format[kind] || String)(value);
		});

		introView.querySelectorAll('.reveal').forEach(function (node) {
			node.classList.add('is-visible');
		});
	}

	/* 有文章的专栏，按最早一篇的时间正序排列 */
	function orderedColumnKeys(templates) {
		return columnKeys.filter(function (key) {
			return articlesOfColumn(templates, key).length > 0;
		}).sort(function (a, b) {
			return articlesOfColumn(templates, a)[0].dataset.date
				.localeCompare(articlesOfColumn(templates, b)[0].dataset.date);
		});
	}

	/* ---------- 专栏内文章列表（类似 B 站分 P） ---------- */

	function renderColumnNav(templates, template) {
		var key = columnOf(template);
		var box = articleView.querySelector('[data-column-nav]');
		if (!box) {
			return;
		}

		if (!key) {
			box.remove();
			return;
		}

		var list = articlesOfColumn(templates, key);
		var currentId = template.dataset.articleId;
		var base = box.dataset.base || '../';

		var head = makeElement('div', 'column-nav-head');
		head.append(
			makeElement('span', 'kicker', 'COLUMN / 专栏'),
			makeElement('h2', 'column-nav-title', COLUMNS[key].title)
		);

		var ol = makeElement('ol', 'column-nav-list');

		list.forEach(function (item, index) {
			var id = item.dataset.articleId;
			var li = makeElement('li');
			var link = makeElement('a', 'column-nav-item');

			link.href = base + id + '/';
			link.append(
				makeElement('span', 'part pixel', String(index + 1).padStart(2, '0')),
				makeElement('span', 'name', item.dataset.title),
				makeElement('span', 'date', formatDate(item.dataset.date))
			);

			if (id === currentId) {
				li.className = 'is-current';
				link.setAttribute('aria-current', 'page');
			}

			li.appendChild(link);
			ol.appendChild(li);
		});

		box.replaceChildren(head, ol);
		box.hidden = false;
	}

	/* ---------- 左侧目录 ---------- */

	function slugify(text, index) {
		var slug = text.trim().toLowerCase()
			.replace(/[\s　]+/g, '-')
			.replace(/[^\w\u4e00-\u9fa5-]/g, '')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
		return 'sec-' + (slug || 'x') + '-' + index;
	}

	function buildToc(body) {
		var headings = Array.from(body.querySelectorAll('h2, h3, h4, h5, h6'));
		if (!headings.length) {
			return [];
		}

		var used = Object.create(null);

		return headings.map(function (heading, index) {
			var id = slugify(heading.textContent, index);
			while (used[id]) id += '-x';
			used[id] = true;

			heading.id = id;
			heading.classList.add('has-anchor');

			var link = makeElement('a', 'toc-link toc-level-' + heading.tagName[1]);
			link.href = '#' + id;
			link.textContent = heading.textContent;
			link.dataset.target = id;
			link.appendChild(makeElement('span', 'toc-mark', ''));

			return { id: id, level: Number(heading.tagName[1]), link: link };
		});
	}

	/* 无目录时把布局收成单列，否则正文会掉进左侧目录那一列 */
	function syncLayoutForToc(hasToc) {
		var layout = document.querySelector('.article-layout');
		if (layout) {
			layout.classList.toggle('is-no-toc', !hasToc);
		}
	}

	/* 窄屏：目录挪到「专栏」下方、正文上方；宽屏再放回左侧栏 */
	var tocNarrow = window.matchMedia('(max-width: 1023px)');

	function placeToc() {
		var toc = document.querySelector('[data-article-toc]');
		var layout = document.querySelector('.article-layout');
		var view = document.querySelector('[data-article-view]');
		var body = view && view.querySelector('.article-body');

		if (!toc || !layout || !body) {
			return;
		}

		if (tocNarrow.matches) {
			/* 正文被 .article-entry 包了一层，所以要插到 body 真正的父节点里 */
			if (toc.parentNode !== body.parentNode || toc.nextElementSibling !== body) {
				toc.classList.add('is-inline');
				body.parentNode.insertBefore(toc, body);
			}
		} else if (toc.parentNode !== layout || toc !== layout.firstElementChild) {
			toc.classList.remove('is-inline');
			layout.insertBefore(toc, layout.firstChild);
		}
	}

	if (typeof tocNarrow.addEventListener === 'function') {
		tocNarrow.addEventListener('change', placeToc);
	}

	function renderToc(items) {
		var nav = document.querySelector('[data-article-toc]');
		if (!nav) {
			return;
		}

		if (!items.length) {
			nav.hidden = true;
			syncLayoutForToc(false);
			return;
		}

		var list = makeElement('ol', 'toc-list');

		items.forEach(function (item) {
			var li = makeElement('li', 'toc-item toc-level-' + item.level);
			li.appendChild(item.link);
			list.appendChild(li);
		});

		var counter = makeElement('p', 'toc-progress');
		var counterText = makeElement('span', '', '阅读进度 0%');
		counter.appendChild(makeElement('span', 'bar', ''), counterText);

		nav.replaceChildren(makeElement('p', 'toc-title', '目录'), list, counter);
		nav.hidden = false;
		syncLayoutForToc(true);

		/* 进度与高亮 */
		var body = document.querySelector('.article-body');
		var links = Array.from(nav.querySelectorAll('.toc-link'));
		var bar = counter.querySelector('.bar');
		var ticking = false;

		/* 高亮阈值要和锚点跳转的落点一致，否则点目录后标题仍不高亮 */
		var spyTop = 0;
		var firstHeading = items[0] && document.getElementById(items[0].id);

		if (firstHeading) {
			spyTop = (parseFloat(getComputedStyle(firstHeading).scrollMarginTop) || 0)
				+ (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
		}
		if (!spyTop) {
			spyTop = 140;
		}
		/* 平滑滚动停在落点上，留一点余量避免最后一帧差几个像素不高亮 */
		spyTop += 10;

		function update() {
			ticking = false;
			var total = body.scrollHeight - window.innerHeight;
			var scrolled = Math.min(Math.max(window.scrollY - body.offsetTop, 0), Math.max(total, 1));
			var percent = total > 0 ? Math.round((scrolled / total) * 100) : 100;
			counterText.textContent = '阅读进度 ' + Math.min(100, Math.max(0, percent)) + '%';
			bar.style.width = Math.min(100, Math.max(0, percent)) + '%';

			var current = items[0];
			items.forEach(function (item) {
				var heading = document.getElementById(item.id);
				if (heading && heading.getBoundingClientRect().top <= spyTop) {
					current = item;
				}
			});

			links.forEach(function (link) {
				link.classList.toggle('is-active', link.dataset.target === current.id);
			});
		}

		function onScroll() {
			if (!ticking) {
				window.requestAnimationFrame(update);
				ticking = true;
			}
		}

		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll);
		update();
	}

	/* ---------- 文章正文 ---------- */

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

		/* 文章编号沿用 blogs 文件夹编号（1 为最早） */
		var eyebrow = articleView.querySelector('.article-eyebrow');
		if (eyebrow && /^\d+$/.test(articleId)) {
			eyebrow.textContent = 'JOURNAL / ' + String(articleId).padStart(3, '0');
		}

		var description = document.querySelector('meta[name="description"]');
		if (description) {
			description.content = template.dataset.excerpt;
		}

		/* 原始出处：作者卡片下方给出原文链接 */
		var sourceUrl = (template.dataset.source || '').trim();
		var sourceHost = document.querySelector('[data-article-source]');
		if (sourceHost) {
			if (/^https?:\/\//.test(sourceUrl)) {
				var sourceLink = document.createElement('a');
				sourceLink.href = sourceUrl;
				sourceLink.target = '_blank';
				sourceLink.rel = 'noopener noreferrer';
				sourceLink.append(
					makeElement('span', 'label', '本文首发于'),
					makeElement('span', 'host', sourceUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]),
					makeElement('span', 'arrow', '↗')
				);
				sourceHost.replaceChildren(sourceLink);
				sourceHost.hidden = false;
			} else {
				sourceHost.hidden = true;
				sourceHost.replaceChildren();
			}
		}

		/* 专栏内文章列表 */
		renderColumnNav(templates, template);

		/* 代码高亮 + 复制按钮（正文为动态插入，需在渲染后触发） */
		if (window.SiteCodeHighlight) {
			window.SiteCodeHighlight.apply(articleView);
		}

		/* 分享按钮（标题右下方 + 文章底部） */
		if (window.SiteShare) {
			window.SiteShare.mount(articleView);
		}

		/* 左侧目录 */
		renderToc(buildToc(articleView.querySelector('.article-body') || articleView));
		placeToc();

		/* 上一篇 / 下一篇：仅专栏内文章显示，且只在同专栏内跳转 */
		var pager = document.querySelector('[data-article-pager]');
		var key = columnOf(template);

		if (pager) {
			if (!key) {
				pager.hidden = true;
				pager.replaceChildren();
			} else {
				var columnList = articlesOfColumn(templates, key);
				var columnPosition = columnList.findIndex(function (item) {
					return item.dataset.articleId === articleId;
				});

				var base = pager.dataset.articleBase || '../';
				/* 专栏列表为时间正序：往后的更新，往前的更早 */
				var newer = columnList[columnPosition + 1];
				var older = columnList[columnPosition - 1];
				var fragment = document.createDocumentFragment();

				function pagerLink(item, dir, extraClass) {
					var link = makeElement('a', extraClass || '');
					link.href = base + item.dataset.articleId + '/';
					link.append(makeElement('span', 'dir', dir), makeElement('span', 'name', item.dataset.title));
					return link;
				}

				fragment.appendChild(older ? pagerLink(older, '← 上一篇') : makeElement('span', 'placeholder'));
				fragment.appendChild(newer ? pagerLink(newer, '下一篇 →', 'next') : makeElement('span', 'placeholder'));
				pager.replaceChildren(fragment);
				/* 专栏内只有这一篇时不显示空翻页区 */
				pager.hidden = !newer && !older;

				/* 专栏说明：把上一页/下一页的语义写清楚 */
				var note = document.querySelector('[data-pager-note]');
				if (note) {
					note.textContent = '仅在专栏「' + COLUMNS[key].title + '」内翻页';
					note.hidden = pager.hidden;
				}
			}
		}

		var comments = articleView.querySelector('[data-utterances]');
		if (comments && window.SiteComments) {
			window.SiteComments.mount(comments);
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
			var all = Array.from(source.querySelectorAll('template[data-article-id], template[data-article-intro]'));
			var intro = all.filter(function (item) {
				return item.hasAttribute('data-article-intro');
			})[0] || null;
			var templates = all.filter(function (item) {
				return !item.hasAttribute('data-article-intro');
			});

			if (articleList) {
				renderArticleList(templates);
			}
			if (introView) {
				renderIntro(intro, templates);
			}
			if (articleView) {
				renderArticle(templates);
			}
		})
		.catch(function (err) {
			if (window.console) { console.error('[articles] 文章索引载入失败', err); }
			var target = articleList || articleView || introView;
			target.textContent = '文章暂时无法载入，请检查网络后刷新页面。';
			target.setAttribute('aria-busy', 'false');
		});
}());