(function () {
	'use strict';

	var selector = '.article-body img, .hero-frame img, .work-media img';
	var dialog;
	var previewImage;
	var caption;
	var previous;
	var next;
	var currentImages = [];
	var currentIndex = 0;
	var trigger;

	function createDialog() {
		if (dialog) {
			return;
		}

		dialog = document.createElement('dialog');
		dialog.className = 'image-preview-dialog';
		dialog.setAttribute('aria-label', '图片预览');

		var close = document.createElement('button');
		close.className = 'image-preview-close';
		close.type = 'button';
		close.setAttribute('aria-label', '关闭图片预览');
		close.textContent = '×';

		previous = document.createElement('button');
		previous.className = 'image-preview-nav image-preview-previous';
		previous.type = 'button';
		previous.setAttribute('aria-label', '上一张图片');
		previous.textContent = '‹';

		next = document.createElement('button');
		next.className = 'image-preview-nav image-preview-next';
		next.type = 'button';
		next.setAttribute('aria-label', '下一张图片');
		next.textContent = '›';

		previewImage = document.createElement('img');
		caption = document.createElement('p');
		caption.className = 'image-preview-caption';
		dialog.append(close, previous, previewImage, next, caption);
		document.body.appendChild(dialog);

		close.addEventListener('click', function () { dialog.close(); });
		previous.addEventListener('click', function () { showImage(currentIndex - 1); });
		next.addEventListener('click', function () { showImage(currentIndex + 1); });
		dialog.addEventListener('click', function (event) {
			if (event.target === dialog) {
				dialog.close();
			}
		});
		dialog.addEventListener('keydown', function (event) {
			if (event.key === 'Escape') {
				event.preventDefault();
				dialog.close();
			} else if (event.key === 'ArrowLeft') {
				showImage(currentIndex - 1);
			} else if (event.key === 'ArrowRight') {
				showImage(currentIndex + 1);
			}
		});
		dialog.addEventListener('close', function () {
			if (trigger) {
				trigger.focus();
			}
		});
	}

	function showImage(index) {
		currentIndex = (index + currentImages.length) % currentImages.length;
		var item = currentImages[currentIndex];
		previewImage.src = item.currentSrc || item.src;
		previewImage.alt = item.alt || '图片预览';
		caption.textContent = (item.alt || '图片') + '　' + (currentIndex + 1) + ' / ' + currentImages.length;
		previous.hidden = currentImages.length < 2;
		next.hidden = currentImages.length < 2;
	}

	document.addEventListener('click', function (event) {
		var item = event.target.closest(selector);
		if (!item) {
			return;
		}
		if (!window.HTMLDialogElement || !HTMLDialogElement.prototype.showModal) {
			window.open(item.currentSrc || item.src, '_blank', 'noopener');
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		trigger = item;
		item.tabIndex = 0;
		item.focus({ preventScroll: true });
		var group = item.closest('.article-body') || item.closest('.work-card') || item.closest('.hero-visual') || document.body;
		var seen = Object.create(null);
		currentImages = Array.from(group.querySelectorAll(selector)).filter(function (image) {
			var source = image.currentSrc || image.src;
			if (seen[source]) {
				return false;
			}
			seen[source] = true;
			return true;
		});
		currentIndex = currentImages.indexOf(item);
		createDialog();
		showImage(currentIndex);
		if (!dialog.open) {
			dialog.showModal();
		}
		dialog.querySelector('.image-preview-close').focus();
	}, true);

	document.addEventListener('keydown', function (event) {
		var item = event.target.closest && event.target.closest(selector);
		if (item && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			item.click();
		}
	});

	var observer = new MutationObserver(function (records) {
		records.forEach(function (record) {
			record.addedNodes.forEach(function (node) {
				if (node.nodeType !== 1) {
					return;
				}
				var items = node.matches && node.matches(selector) ? [node] : Array.from(node.querySelectorAll ? node.querySelectorAll(selector) : []);
				items.forEach(function (item) {
					item.tabIndex = 0;
					item.setAttribute('role', 'button');
					item.setAttribute('aria-label', '放大预览：' + (item.alt || '图片'));
				});
			});
		});
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });
}());
