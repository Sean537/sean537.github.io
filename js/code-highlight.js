/* 代码高亮：为 .article-body 内的 <pre><code class="language-xxx"> 着色。
 *
 * 零依赖、无网络请求：先取 code 元素的 textContent（已被 HTML 转义的源码会
 * 在这里还原成原文），分词后重新转义输出，因此对模板里的写法完全安全。
 * 配色集中在 css/main.css 的 --code-* 变量，深浅色各一套。
 */
(function () {
	'use strict';

	var KEYWORDS = {
		cl: 'alignas alignof and asm auto bool break case catch char class compl concept const consteval constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not nullptr operator or private protected public register reinterpret_cast require return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while WINAPI HINSTANCE',
		bash: 'if then else elif fi for while until do done case esac function return export local readonly declare source alias set unset trap eval exec',
		python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case None True False self cls'
	};

	/* ['类型', 正则]，均带 y（sticky）标志逐位尝试 */
	var RULES = {
		cl: [
			['comment', /\/\*[\s\S]*?(?:\*\/|$)/y],
			['comment', /\/\/[^\n]*/y],
			['meta', /#[ \t]*(?:include|import|define|ifndef|ifdef|endif|undef|pragma|error|line)\b/y],
			['string', /"(?:\\[\s\S]|[^"\\\n])*"?/y],
			['string', /'(?:\\[\s\S]|[^'\\\n])*'?/y],
			['number', /\b0[xX][\da-fA-F]+[uUlL]*\b/y],
			['number', /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*\b/y],
			['type', /\b[A-Z][A-Za-z0-9_]*\b/y],
			['ident', /[A-Za-z_]\w*/y]
		],
		bash: [
			['comment', /#[^\n]*/y],
			['string', /"(?:\\[\s\S]|[^"\\])*"?/y],
			['string', /'[^']*'?/y],
			['var', /\$\{[^}\n]*\}|\$\w+/y],
			['ident', /--?[A-Za-z][\w-]*/y],
			['number', /\b\d+(?:\.\d+)?\b/y],
			['word', /[^\s$'"#]+/y]
		],
		python: [
			['comment', /#[^\n]*/y],
			['string', /"""[\s\S]*?(?:"""|$)/y],
			['string', /'''[\s\S]*?(?:'''|$)/y],
			['string', /"(?:\\[\s\S]|[^"\\\n])*"?/y],
			['string', /'(?:\\[\s\S]|[^'\\\n])*'?/y],
			['ident', /[A-Za-z_]\w*(?=\s*\()/y],
			['number', /\b\d+(?:\.\d+)?\b/y],
			['ident', /[A-Za-z_]\w*/y]
		]
	};

	var FAMILY = {
		c: 'cl', cpp: 'cl', cc: 'cl', h: 'cl', hpp: 'cl', hxx: 'cl', cl: 'cl',
		bash: 'bash', sh: 'bash', shell: 'bash', console: 'bash', zsh: 'bash', fish: 'bash',
		python: 'python', py: 'python'
	};

	function escapeHtml(text) {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function wordSet(text) {
		var map = Object.create(null);
		text.split(' ').forEach(function (word) {
			if (word) map[word] = true;
		});
		return map;
	}

	/** 位置 i 之前是否只有空白（用于判断命令行首词与选项） */
	function onlyBlankBefore(code, index) {
		var from = code.lastIndexOf('\n', index - 1) + 1;
		for (var i = from; i < index; i += 1) {
			if (code[i] !== ' ' && code[i] !== '\t' && code[i] !== '\r') return false;
		}
		return true;
	}

	function highlight(code, lang) {
		var family = FAMILY[String(lang || '').toLowerCase()];
		if (!family) return escapeHtml(code);

		var keywords = wordSet(KEYWORDS[family]);
		var rules = RULES[family];
		var out = '';
		var buffer = '';
		var index = 0;

		function flush() {
			if (buffer) {
				out += escapeHtml(buffer);
				buffer = '';
			}
		}

		function emit(type, text) {
			flush();
			out += '<span class="tok tok-' + type + '">' + escapeHtml(text) + '</span>';
		}

		while (index < code.length) {
			var handled = false;

			for (var r = 0; r < rules.length; r += 1) {
				var type = rules[r][0];
				var re = rules[r][1];
				re.lastIndex = index;
				var found = re.exec(code);
				if (!found || !found[0]) continue;

				var text = found[0];
				index += text.length;
				handled = true;

				if (type === 'ident') {
					if (keywords[text]) emit('keyword', text);
					else if (family === 'cl') buffer += text;
					else if (onlyBlankBefore(code, index - text.length)) emit('cmd', text);
					else emit('func', text);
				} else if (type === 'word') {
					if (onlyBlankBefore(code, index - text.length)) emit('cmd', text);
					else buffer += text;
				} else {
					emit(type, text);
				}
				break;
			}

			if (!handled) {
				buffer += code[index];
				index += 1;
			}
		}

		flush();
		return out;
	}

	function apply(root) {
		var scope = root || document;
		var blocks = scope.querySelectorAll('pre > code[class*="language-"]');

		Array.prototype.forEach.call(blocks, function (code) {
			if (code.dataset.tokens === 'on') return;

			var lang = (code.className.match(/language-([\w+#-]+)/) || [])[1] || 'text';
			var source = code.textContent;
			var html = highlight(source, lang);

			/* 没有着色就保持原样，避免无谓的 span */
			if (html.indexOf('class="tok') === -1) return;

			code.innerHTML = html;
			code.dataset.tokens = 'on';
		});

		addCopyButtons(scope);
	}

	/* ---------- 复制按钮 ---------- */

	var COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14"/></svg>';
	var DONE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

	function addCopyButtons(scope) {
		var pres = scope.querySelectorAll('.article-body pre, pre[data-lang]');

		Array.prototype.forEach.call(pres, function (pre) {
			if (pre.dataset.copy === 'on') return;
			pre.dataset.copy = 'on';

			var button = document.createElement('button');
			button.type = 'button';
			button.className = 'code-copy';
			button.setAttribute('aria-label', '复制代码');
			button.title = '复制代码';
			button.innerHTML = COPY_ICON;

			button.addEventListener('click', function () {
				var code = pre.querySelector('code');
				var text = code ? code.textContent : pre.textContent;

				function done() {
					button.classList.add('is-done');
					button.innerHTML = DONE_ICON;
					button.title = '已复制';
					window.setTimeout(function () {
						button.classList.remove('is-done');
						button.innerHTML = COPY_ICON;
						button.title = '复制代码';
					}, 1800);
				}

				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
				} else {
					fallbackCopy(text, done);
				}
			});

			pre.appendChild(button);

			var lang = pre.dataset.lang;
			if (lang && lang !== 'text') {
				var tag = document.createElement('span');
				tag.className = 'code-lang';
				tag.textContent = lang;
				pre.appendChild(tag);
			}
		});
	}

	/* 非安全上下文（http 域名）下 Clipboard API 不可用时的兜底 */
	function fallbackCopy(text, done) {
		var area = document.createElement('textarea');
		area.value = text;
		area.setAttribute('readonly', '');
		area.style.position = 'fixed';
		area.style.top = '-1000px';
		area.style.opacity = '0';
		document.body.appendChild(area);
		area.select();

		try {
			document.execCommand('copy');
			done();
		} catch (error) {
			/* 复制失败时保持按钮原状 */
		}
		document.body.removeChild(area);
	}

	window.SiteCodeHighlight = { apply: apply, highlight: highlight };

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function () { apply(); });
	} else {
		apply();
	}
}());