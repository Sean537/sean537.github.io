/* 站点交互：导航、移动端菜单、滚动进场动画、项目筛选、区块高亮。无依赖。 */
(function () {
	'use strict';

	var nav = document.querySelector('[data-nav]');
	var burger = document.querySelector('[data-menu-toggle]');
	var menu = document.querySelector('[data-menu]');
	var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* ---- 导航滚动状态 ---- */
	function updateNavState() {
		if (nav) {
			nav.classList.toggle('is-scrolled', window.scrollY > 12);
		}
	}
	window.addEventListener('scroll', updateNavState, { passive: true });
	updateNavState();

	/* ---- 移动端菜单 ---- */
	function setMenu(open) {
		if (!burger || !menu || !nav) {
			return;
		}
		burger.setAttribute('aria-expanded', String(open));
		menu.classList.toggle('is-open', open);
		nav.classList.toggle('is-open', open);
		document.body.style.overflow = open ? 'hidden' : '';
	}
	if (burger && menu) {
		burger.addEventListener('click', function () {
			setMenu(burger.getAttribute('aria-expanded') !== 'true');
		});
		menu.addEventListener('click', function (event) {
			if (event.target.closest('a')) {
				setMenu(false);
			}
		});
		document.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
				setMenu(false);
			}
		});
	}

	/* ---- 滚动进场动画 ---- */
	var revealItems = document.querySelectorAll('.reveal');
	if (reduceMotion || !('IntersectionObserver' in window)) {
		revealItems.forEach(function (item) { item.classList.add('is-visible'); });
	} else {
		var revealObserver = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					revealObserver.unobserve(entry.target);
				}
			});
		}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
		revealItems.forEach(function (item) { revealObserver.observe(item); });
	}

	/* ---- 统计数字滚动 ---- */
	var counters = document.querySelectorAll('[data-count]');
	if (counters.length) {
		function runCounter(element) {
			var target = parseInt(element.getAttribute('data-count'), 10);
			var suffix = element.textContent.replace(/[0-9]/g, '');
			if (reduceMotion || isNaN(target)) {
				return;
			}
			var duration = 1200;
			var start = null;
			function frame(timestamp) {
				if (start === null) {
					start = timestamp;
				}
				var progress = Math.min((timestamp - start) / duration, 1);
				var eased = 1 - Math.pow(1 - progress, 3);
				element.textContent = Math.round(target * eased) + suffix;
				if (progress < 1) {
					window.requestAnimationFrame(frame);
				}
			}
			window.requestAnimationFrame(frame);
		}

		if ('IntersectionObserver' in window) {
			var countObserver = new IntersectionObserver(function (entries) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) {
						runCounter(entry.target);
						countObserver.unobserve(entry.target);
					}
				});
			}, { threshold: 0.6 });
			counters.forEach(function (item) { countObserver.observe(item); });
		}
	}

	/* ---- 当前区块高亮（主页锚点导航） ---- */
	var sectionLinks = document.querySelectorAll('.nav-links a[href^="#"]');
	if (sectionLinks.length && 'IntersectionObserver' in window) {
		var linkMap = {};
		sectionLinks.forEach(function (link) {
			linkMap[link.getAttribute('href').slice(1)] = link;
		});
		var sectionObserver = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				var link = linkMap[entry.target.id];
				if (!link) {
					return;
				}
				if (entry.isIntersecting) {
					sectionLinks.forEach(function (item) { item.classList.remove('is-active'); });
					link.classList.add('is-active');
				}
			});
		}, { rootMargin: '-38% 0px -55% 0px' });
		Object.keys(linkMap).forEach(function (id) {
			var section = document.getElementById(id);
			if (section) {
				sectionObserver.observe(section);
			}
		});
	}

	/* ---- 项目筛选 ---- */
	var filterBar = document.querySelector('[data-filter-bar]');
	if (filterBar) {
		var cards = document.querySelectorAll('[data-work-cat]');
		filterBar.addEventListener('click', function (event) {
			var button = event.target.closest('button[data-filter]');
			if (!button) {
				return;
			}
			filterBar.querySelectorAll('button').forEach(function (item) {
				item.classList.toggle('is-active', item === button);
			});
			var filter = button.getAttribute('data-filter');
			cards.forEach(function (card) {
				var show = filter === 'all' || card.getAttribute('data-work-cat') === filter;
				card.classList.toggle('is-hidden', !show);
				if (show && !reduceMotion) {
					card.style.animation = 'none';
					void card.offsetWidth; /* 重启动画 */
					card.style.animation = 'rise-in .5s var(--ease) backwards';
				}
			});
		});
	}

	/* ---- Hero 像素视差（仅桌面端、非减弱动画） ---- */
	var heroPixels = document.querySelector('.hero-pixels');
	if (heroPixels && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
		var hero = document.querySelector('.hero');
		var ticking = false;
		hero.addEventListener('mousemove', function (event) {
			if (ticking) {
				return;
			}
			ticking = true;
			window.requestAnimationFrame(function () {
				var rect = hero.getBoundingClientRect();
				var x = (event.clientX - rect.left) / rect.width - 0.5;
				var y = (event.clientY - rect.top) / rect.height - 0.5;
				heroPixels.querySelectorAll('.px').forEach(function (px, index) {
					var depth = (index % 3 + 1) * 7;
					px.style.marginLeft = (-x * depth) + 'px';
					px.style.marginTop = (-y * depth) + 'px';
				});
				ticking = false;
			});
		});
	}
}());
