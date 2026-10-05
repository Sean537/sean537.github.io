/* 订阅与站点页：看状态、手动重建订阅文件 */
(function () {
	'use strict';

	const A = window.AdminCore;
	const { el, notice, report, run, api } = A;

	function kb(bytes) {
		if (bytes == null) {
			return '–';
		}
		return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB';
	}

	async function refresh() {
		const data = await api('info');
		const info = data.info;

		el('rssItems').textContent = info.rss.items + ' 条';
		el('rssSize').textContent = kb(info.rss.file && info.rss.file.bytes);
		el('rssTime').textContent = info.rss.file ? info.rss.file.updated : '未生成';
		el('mapUrls').textContent = info.sitemap.urls + ' 条';
		el('mapSize').textContent = kb(info.sitemap.file && info.sitemap.file.bytes);
		el('mapTime').textContent = info.sitemap.file ? info.sitemap.file.updated : '未生成';

		el('siteRoot').textContent = info.root;
		el('siteUrl').href = info.site;
		el('siteUrl').textContent = info.site;
		el('rssUrl').textContent = info.site + '/rss.xml';
		el('counts').textContent = info.articles + ' 篇文章 · ' + info.columns + ' 个专栏';
		el('nextId').textContent = String(info.nextId).padStart(2, '0');
	}

	async function sync() {
		try {
			const result = await run(['sync']);
			notice('已按 blogs/articles.html 重建 rss.xml 与 sitemap.xml。', 'success');
			await refresh();
			return result;
		} catch (error) {
			report(error);
		}
	}

	async function init() {
		await refresh().catch(report);

		el('syncFeeds').addEventListener('click', sync);

		['rss', 'map'].forEach(prefix => {
			const link = el(prefix + 'Link');
			const button = el('open' + (prefix === 'rss' ? 'Rss' : 'Map'));

			const open = async () => {
				await refresh();
				window.open(link.href, '_blank', 'noopener');
			};

			link.href = 'about:blank';
			link.addEventListener('click', event => {
				event.preventDefault();
				open();
			});
			button.addEventListener('click', open);
		});
	}

	A.boot('tools');
	init();
})();