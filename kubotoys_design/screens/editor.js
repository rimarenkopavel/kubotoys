/* KuboToys — визуальный редактор макета.
   Открыть: добавьте ?edit к адресу страницы. Без ?edit страница показывается как обычно. */
(function () {
  'use strict';
  var CFG = { owner: 'rimarenkopavel', repo: 'kubotoys', branch: 'main', dir: 'kubotoys_design/screens/' };
  var PAGE = decodeURIComponent(location.pathname.split('/').pop() || 'home.html');
  var DRAFT_KEY = 'kubo-draft:' + PAGE;
  var TOKEN_KEY = 'kubo-gh-token';
  var BRAND = ['#2B5BAA', '#E63329', '#F7C52D', '#4CAF50', '#1C1C1C', '#F8F9FA'];
  var BRAND_NAMES = ['Синий', 'Красный', 'Жёлтый', 'Зелёный', 'Текст', 'Фон'];
  var EDIT = /(^|[?&#])edit\b/.test(location.search + location.hash);

  function ready(fn) { document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn(); }
  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) el.setAttribute(k, attrs[k]);
    if (html != null) el.innerHTML = html;
    return el;
  }
  function isUI(n) { return n && n.closest && n.closest('[data-kubo-ui]'); }

  ready(function () {
    if (!EDIT) {
      var b = h('a', { 'data-kubo-ui': '', href: location.pathname + '?edit', title: 'Открыть визуальный редактор' }, '✏️ Редактировать');
      b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#1C1C1C;color:#fff;font:600 13px Inter,system-ui,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.25);text-decoration:none;opacity:.85';
      document.body.appendChild(b);
      return;
    }
    init();
  });

  function init() {
    injectStyles();
    document.documentElement.classList.add('kubo-editing');

    var state = { sel: null, hover: null, undo: [], redo: [], editingText: null, dirty: false };

    /* ---------- UI ---------- */
    var bar = h('div', { 'data-kubo-ui': '', id: 'kubo-bar' },
      '<span class="kb-title">✏️ Редактор KuboToys · <b>' + PAGE + '</b></span>' +
      '<span class="kb-sp"></span>' +
      '<button data-a="undo" title="Ctrl+Z">↶ Отменить</button>' +
      '<button data-a="redo" title="Ctrl+Y">↷ Повторить</button>' +
      '<button data-a="preview">👁 Просмотр</button>' +
      '<button data-a="download">⬇ Скачать HTML</button>' +
      '<button data-a="reset" title="Удалить черновик и загрузить версию с GitHub">⟲ Сбросить</button>' +
      '<button data-a="github" class="kb-primary">☁ Сохранить на GitHub</button>' +
      '<a data-a="exit" href="' + location.pathname + '">✕ Выйти</a>');
    var panel = h('aside', { 'data-kubo-ui': '', id: 'kubo-panel' });
    var hoverBox = h('div', { 'data-kubo-ui': '', id: 'kubo-hover' });
    var selBox = h('div', { 'data-kubo-ui': '', id: 'kubo-sel' }, '<span></span>');
    var toast = h('div', { 'data-kubo-ui': '', id: 'kubo-toast' });
    var fileInput = h('input', { 'data-kubo-ui': '', type: 'file', accept: 'image/*', style: 'display:none' });
    [bar, panel, hoverBox, selBox, toast, fileInput].forEach(function (n) { document.body.appendChild(n); });

    function say(msg, ms) {
      toast.textContent = msg; toast.classList.add('on');
      clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove('on'); }, ms || 3000);
    }

    /* ---------- Snapshot / draft / undo ---------- */
    function contentNodes() { return Array.prototype.filter.call(document.body.childNodes, function (n) { return !(n.nodeType === 1 && n.hasAttribute('data-kubo-ui')); }); }
    function snapshot() {
      var div = document.createElement('div');
      contentNodes().forEach(function (n) { div.appendChild(n.cloneNode(true)); });
      div.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
      return { body: div.innerHTML, bodyClass: document.body.className, palette: document.body.getAttribute('data-palette') || '' };
    }
    function restore(s) {
      deselect();
      contentNodes().forEach(function (n) { n.remove(); });
      var tpl = document.createElement('template'); tpl.innerHTML = s.body;
      document.body.insertBefore(tpl.content, document.body.firstChild);
      document.body.className = s.bodyClass;
      if (s.palette) document.body.setAttribute('data-palette', s.palette); else document.body.removeAttribute('data-palette');
      renderPanel();
    }
    function checkpoint() {
      state.undo.push(snapshot()); if (state.undo.length > 60) state.undo.shift();
      state.redo = [];
    }
    function changed() {
      state.dirty = true;
      clearTimeout(changed.t);
      changed.t = setTimeout(function () {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot())); } catch (e) { say('Черновик слишком большой для автосохранения — сохраните на GitHub или скачайте HTML', 5000); }
      }, 400);
      updateBoxes();
    }
    function undo() { if (!state.undo.length) return say('Нечего отменять'); state.redo.push(snapshot()); restore(state.undo.pop()); changed(); }
    function redo() { if (!state.redo.length) return say('Нечего повторять'); state.undo.push(snapshot()); restore(state.redo.pop()); changed(); }

    var draft = localStorage.getItem(DRAFT_KEY);
    if (draft && confirm('Найден несохранённый черновик этой страницы. Восстановить его?\n\n«Отмена» — открыть версию с GitHub (черновик будет удалён).')) {
      try { restore(JSON.parse(draft)); say('Черновик восстановлен'); } catch (e) { localStorage.removeItem(DRAFT_KEY); }
    } else if (draft) { localStorage.removeItem(DRAFT_KEY); }

    /* ---------- Selection ---------- */
    function place(box, el) {
      if (!el || !document.body.contains(el)) { box.style.display = 'none'; return; }
      var r = el.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
      box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    }
    function label(el) {
      var names = { H1: 'Заголовок H1', H2: 'Заголовок H2', H3: 'Заголовок H3', H4: 'Заголовок H4', P: 'Абзац', A: 'Ссылка', BUTTON: 'Кнопка', IMG: 'Изображение', SECTION: 'Секция', HEADER: 'Шапка', FOOTER: 'Подвал', NAV: 'Меню', SPAN: 'Текст', I: 'Иконка', LI: 'Пункт списка', UL: 'Список', MAIN: 'Основная часть', ARTICLE: 'Карточка' };
      return names[el.tagName] || ('Блок ' + el.tagName.toLowerCase());
    }
    function updateBoxes() {
      place(hoverBox, state.hover !== state.sel ? state.hover : null);
      place(selBox, state.sel);
      if (state.sel) selBox.firstChild.textContent = label(state.sel);
    }
    function select(el) {
      if (state.editingText && state.editingText !== el) stopText();
      state.sel = el; updateBoxes(); renderPanel();
    }
    function deselect() { stopText(); state.sel = null; updateBoxes(); }

    window.addEventListener('scroll', updateBoxes, true);
    window.addEventListener('resize', updateBoxes);

    document.addEventListener('mouseover', function (e) {
      if (document.documentElement.classList.contains('kubo-preview')) return;
      if (isUI(e.target) || e.target === document.body || e.target === document.documentElement) { state.hover = null; } else state.hover = e.target;
      updateBoxes();
    }, true);

    document.addEventListener('click', function (e) {
      if (document.documentElement.classList.contains('kubo-preview')) return;
      if (isUI(e.target)) return;
      if (state.editingText && state.editingText.contains(e.target)) return; // клики внутри редактируемого текста
      e.preventDefault(); e.stopPropagation();
      var t = e.target;
      if (t.tagName === 'I' && t.parentElement && !isUI(t.parentElement) && e.altKey !== true) t = t.parentElement.closest('a,button') || t;
      if (t === document.body || t === document.documentElement) return deselect();
      select(t);
    }, true);

    document.addEventListener('dblclick', function (e) {
      if (isUI(e.target) || document.documentElement.classList.contains('kubo-preview')) return;
      e.preventDefault();
      var t = state.sel && state.sel.contains(e.target) ? state.sel : e.target;
      if (t.tagName === 'IMG') { pickImage(); return; }
      startText(t);
    }, true);

    document.addEventListener('submit', function (e) { if (!isUI(e.target)) e.preventDefault(); }, true);

    /* ---------- Text editing ---------- */
    function startText(el) {
      if (!el || el.tagName === 'IMG' || isUI(el)) return;
      stopText();
      checkpoint();
      state.editingText = el;
      el.setAttribute('contenteditable', 'true');
      el.focus();
      say('Редактирование текста. Нажмите Esc или кликните вне блока, чтобы закончить', 2500);
    }
    function stopText() {
      var el = state.editingText; if (!el) return;
      el.removeAttribute('contenteditable');
      state.editingText = null;
      changed();
    }
    document.addEventListener('input', function (e) { if (!isUI(e.target)) changed(); }, true);
    document.addEventListener('focusout', function (e) { if (state.editingText && e.target === state.editingText) stopText(); }, true);
    document.addEventListener('paste', function (e) {
      if (!state.editingText || !state.editingText.contains(e.target)) return;
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    }, true);

    document.addEventListener('keydown', function (e) {
      var inUI = isUI(e.target) && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.key === 'Escape') { if (state.editingText) { stopText(); e.preventDefault(); } else if (document.documentElement.classList.contains('kubo-preview')) togglePreview(); else deselect(); renderPanel(); return; }
      if (inUI || state.editingText) return;
      var k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveGitHub(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'd' && state.sel) { e.preventDefault(); act('dup'); }
      else if ((k === 'delete' || k === 'backspace') && state.sel) { e.preventDefault(); act('del'); }
      else if (k === 'enter' && state.sel) { e.preventDefault(); state.sel.tagName === 'IMG' ? pickImage() : startText(state.sel); }
    }, true);

    /* ---------- Helpers ---------- */
    function hex(c) {
      var m = (c || '').match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/);
      if (!m) return c && c[0] === '#' ? c : '#000000';
      if (m[4] !== undefined && +m[4] === 0) return '';
      return '#' + [m[1], m[2], m[3]].map(function (x) { return ('0' + (+x | 0).toString(16)).slice(-2); }).join('').toUpperCase();
    }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
    function px(v) { return Math.round(parseFloat(v) || 0); }

    /* ---------- Panel ---------- */
    function renderPanel() {
      var el = state.sel;
      if (!el || !document.body.contains(el)) { state.sel = null; panel.innerHTML = paletteHTML(); bindPalette(); return; }
      var cs = getComputedStyle(el);
      var isImg = el.tagName === 'IMG', isLink = el.tagName === 'A';
      var bg = hex(cs.backgroundColor);
      var html = '<div class="kb-head"><b>' + label(el) + '</b><button data-p="parent" title="Выбрать внешний блок">⬆ Родитель</button><button data-p="close" title="Esc">✕</button></div>';
      if (isImg) {
        html += '<div class="kb-sec"><h4>Изображение</h4><img class="kb-thumb" src="' + esc(el.getAttribute('src')) + '">' +
          '<button data-p="img" class="kb-wide kb-primary">🖼 Заменить с компьютера…</button>' +
          '<label>или ссылка на картинку<input data-f="src" value="' + esc(el.getAttribute('src')) + '"></label>' +
          '<label>Описание (alt, для SEO)<input data-f="alt" value="' + esc(el.getAttribute('alt')) + '"></label>' +
          '<label>Заполнение<select data-f="objectFit"><option value="">как в макете</option><option value="cover">обрезать (cover)</option><option value="contain">вписать (contain)</option></select></label></div>';
      } else {
        html += '<div class="kb-sec"><h4>Текст</h4><button data-p="text" class="kb-wide kb-primary">✎ Изменить текст (двойной клик)</button>' +
          '<div class="kb-row"><label>Цвет<input type="color" data-f="color" value="' + hex(cs.color) + '"></label>' +
          '<label>Размер, px<input type="number" data-f="fontSize" value="' + px(cs.fontSize) + '" min="6" max="200"></label></div>' +
          '<div class="kb-row"><label>Насыщенность<select data-f="fontWeight">' + [400, 500, 600, 700, 800, 900].map(function (w) { return '<option' + (String(w) === cs.fontWeight ? ' selected' : '') + '>' + w + '</option>'; }).join('') + '</select></label>' +
          '<label>Выравнивание<select data-f="textAlign">' + [['left', 'слева'], ['center', 'по центру'], ['right', 'справа']].map(function (a) { return '<option value="' + a[0] + '"' + (cs.textAlign === a[0] || (a[0] === 'left' && cs.textAlign === 'start') ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select></label></div>' +
          '<div class="kb-fmt"><button data-cmd="bold"><b>Ж</b></button><button data-cmd="italic"><i>К</i></button><button data-cmd="underline"><u>Ч</u></button><span>— для выделенного фрагмента</span></div></div>';
      }
      if (isLink || el.closest('a')) {
        var a = isLink ? el : el.closest('a');
        html += '<div class="kb-sec"><h4>Ссылка</h4><label>Адрес<input data-f="href" value="' + esc(a.getAttribute('href')) + '"></label></div>';
      }
      html += '<div class="kb-sec"><h4>Оформление</h4>' +
        '<div class="kb-row"><label>Фон<input type="color" data-f="backgroundColor" value="' + (bg || '#FFFFFF') + '"></label>' +
        '<label>&nbsp;<button data-p="nobg" class="kb-wide">Без фона</button></label></div>' +
        '<div class="kb-row"><label>Скругление, px<input type="number" data-f="borderRadius" value="' + px(cs.borderTopLeftRadius) + '" min="0"></label>' +
        '<label>Прозрачность<input type="range" data-f="opacity" min="0" max="1" step="0.05" value="' + cs.opacity + '"></label></div>' +
        '<div class="kb-row"><label>Отступ внутри ↕<input type="number" data-f="padY" value="' + px(cs.paddingTop) + '" min="0"></label>' +
        '<label>Отступ внутри ↔<input type="number" data-f="padX" value="' + px(cs.paddingLeft) + '" min="0"></label></div>' +
        '<div class="kb-row"><label>Отступ сверху<input type="number" data-f="marginTop" value="' + px(cs.marginTop) + '"></label>' +
        '<label>Отступ снизу<input type="number" data-f="marginBottom" value="' + px(cs.marginBottom) + '"></label></div>' +
        '<div class="kb-row"><label>Ширина, px<input type="number" data-f="width" value="' + px(cs.width) + '" min="0"></label>' +
        '<label>Высота, px<input type="number" data-f="height" value="' + px(cs.height) + '" min="0"></label></div>' +
        '<button data-p="clearstyle" class="kb-wide">Сбросить ручное оформление</button></div>';
      html += '<div class="kb-sec"><h4>Блок</h4><div class="kb-grid">' +
        '<button data-p="up">↑ Выше</button><button data-p="down">↓ Ниже</button>' +
        '<button data-p="dup">⧉ Дублировать</button><button data-p="hide">' + (el.hasAttribute('hidden') ? '👁 Показать' : '🙈 Скрыть') + '</button>' +
        '<button data-p="del" class="kb-danger">🗑 Удалить</button><button data-p="addText">＋ Текст после</button>' +
        '<button data-p="addBtn">＋ Кнопка после</button><button data-p="addImg">＋ Картинка после</button></div></div>';
      html += '<details class="kb-sec"><summary>Для продвинутых: классы Tailwind</summary><textarea data-f="className" rows="5">' + esc(el.getAttribute('class')) + '</textarea></details>';
      panel.innerHTML = html;
      var of = panel.querySelector('[data-f="objectFit"]'); if (of) of.value = el.style.objectFit || '';
      bindPanel(el);
    }

    function bindPanel(el) {
      panel.querySelectorAll('[data-f]').forEach(function (inp) {
        var first = true;
        var ev = (inp.type === 'color' || inp.type === 'range' || inp.type === 'number') ? 'input' : 'change';
        inp.addEventListener(ev, function () {
          if (first) { checkpoint(); first = false; }
          var f = inp.dataset.f, v = inp.value;
          var link = el.tagName === 'A' ? el : el.closest('a');
          switch (f) {
            case 'src': el.setAttribute('src', v); el.removeAttribute('srcset'); break;
            case 'alt': el.setAttribute('alt', v); break;
            case 'href': link && link.setAttribute('href', v); break;
            case 'className': el.setAttribute('class', v); break;
            case 'padY': el.style.paddingTop = el.style.paddingBottom = v + 'px'; break;
            case 'padX': el.style.paddingLeft = el.style.paddingRight = v + 'px'; break;
            case 'fontSize': case 'borderRadius': case 'marginTop': case 'marginBottom': case 'width': case 'height':
              el.style[f] = v + 'px'; if (f === 'width') el.style.maxWidth = 'none'; break;
            default: el.style[f] = v;
          }
          changed();
          if (f === 'src') { var th = panel.querySelector('.kb-thumb'); if (th) th.src = v; }
        });
      });
      panel.querySelectorAll('[data-cmd]').forEach(function (b) {
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () {
          if (!state.editingText) startText(el);
          document.execCommand(b.dataset.cmd); changed();
        });
      });
      panel.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () { act(b.dataset.p); }); });
    }

    function act(p) {
      var el = state.sel; if (!el) return;
      switch (p) {
        case 'close': deselect(); renderPanel(); return;
        case 'parent': if (el.parentElement && el.parentElement !== document.body) select(el.parentElement); return;
        case 'text': startText(el); return;
        case 'img': pickImage(); return;
      }
      checkpoint();
      var n;
      switch (p) {
        case 'nobg': el.style.backgroundColor = 'transparent'; break;
        case 'clearstyle': el.removeAttribute('style'); break;
        case 'up': if (el.previousElementSibling) el.parentNode.insertBefore(el, el.previousElementSibling); break;
        case 'down': if (el.nextElementSibling) el.parentNode.insertBefore(el.nextElementSibling, el); break;
        case 'dup': n = el.cloneNode(true); n.removeAttribute('data-design-id'); n.querySelectorAll('[data-design-id]').forEach(function (x) { x.removeAttribute('data-design-id'); }); el.after(n); select(n); break;
        case 'hide': el.hasAttribute('hidden') ? el.removeAttribute('hidden') : el.setAttribute('hidden', ''); break;
        case 'del': n = el.parentElement; el.remove(); state.sel = null; if (n && n !== document.body) state.sel = n; say('Удалено. Ctrl+Z — отменить'); break;
        case 'addText': n = h('p', { class: 'text-base leading-relaxed text-[#5F6670] mt-4' }, 'Новый текст — дважды кликните, чтобы изменить'); el.after(n); select(n); break;
        case 'addBtn': n = h('a', { href: '#', class: 'inline-flex mt-4 h-12 px-6 rounded-full bg-[#2B5BAA] text-white font-semibold items-center' }, 'Новая кнопка'); el.after(n); select(n); break;
        case 'addImg': n = h('img', { src: 'assets/maxi.jpg', alt: '', class: 'mt-4 w-full rounded-2xl object-cover' }); el.after(n); select(n); setTimeout(pickImage, 50); break;
      }
      changed(); renderPanel();
    }

    function pickImage() {
      var el = state.sel; if (!el || el.tagName !== 'IMG') return;
      fileInput.value = '';
      fileInput.onchange = function () {
        var f = fileInput.files[0]; if (!f) return;
        if (f.size > 4 * 1024 * 1024) return say('Файл больше 4 МБ — уменьшите изображение перед загрузкой', 5000);
        var r = new FileReader();
        r.onload = function () { checkpoint(); el.setAttribute('src', r.result); el.removeAttribute('srcset'); el.setAttribute('data-kubo-name', f.name); changed(); renderPanel(); say('Изображение заменено. Оно загрузится на GitHub при сохранении'); };
        r.readAsDataURL(f);
      };
      fileInput.click();
    }

    /* ---------- Brand palette ---------- */
    function getPalette() {
      try { var p = JSON.parse(document.body.getAttribute('data-palette') || 'null'); if (p && p.length === BRAND.length) return p; } catch (e) {}
      return BRAND.slice();
    }
    function paletteHTML() {
      var p = getPalette();
      return '<div class="kb-head"><b>Как редактировать</b></div>' +
        '<div class="kb-sec kb-help"><p>• <b>Клик</b> — выбрать элемент<br>• <b>Двойной клик</b> — изменить текст или заменить фото<br>• <b>Esc</b> — закончить / снять выделение<br>• <b>Ctrl+Z / Ctrl+Y</b> — отменить / повторить<br>• <b>Ctrl+D</b> — дублировать, <b>Delete</b> — удалить<br>• <b>Ctrl+S</b> — сохранить на GitHub</p>' +
        '<p>Все правки автоматически сохраняются как черновик в этом браузере. Чтобы их увидели другие, нажмите «Сохранить на GitHub».</p></div>' +
        '<div class="kb-sec"><h4>Цвета бренда — меняются на всей странице</h4>' +
        p.map(function (c, i) { return '<label class="kb-pal"><input type="color" data-i="' + i + '" value="' + c + '"> ' + BRAND_NAMES[i] + ' <code>' + c + '</code></label>'; }).join('') +
        '<button data-p="palreset" class="kb-wide">Вернуть исходные цвета</button></div>';
    }
    function replaceColor(from, to) {
      var re = new RegExp(from.replace('#', '#'), 'gi');
      contentNodes().forEach(function (root) {
        if (root.nodeType !== 1) return;
        [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).forEach(function (n) {
          var c = n.getAttribute('class'); if (c && re.test(c)) n.setAttribute('class', c.replace(re, to));
          var s = n.getAttribute('style'); if (s && re.test(s)) n.setAttribute('style', s.replace(re, to));
          re.lastIndex = 0;
        });
      });
      var bc = document.body.getAttribute('class'); if (bc) document.body.setAttribute('class', bc.replace(re, to));
    }
    function bindPalette() {
      panel.querySelectorAll('.kb-pal input').forEach(function (inp) {
        var first = true;
        inp.addEventListener('input', function () {
          if (first) { checkpoint(); first = false; }
          var p = getPalette(), i = +inp.dataset.i, to = inp.value.toUpperCase();
          if (p.some(function (c, j) { return j !== i && c.toUpperCase() === to; })) return;
          replaceColor(p[i], to); p[i] = to;
          document.body.setAttribute('data-palette', JSON.stringify(p));
          inp.nextElementSibling.textContent = to;
          changed();
        });
      });
      var r = panel.querySelector('[data-p="palreset"]');
      r && r.addEventListener('click', function () {
        checkpoint();
        var p = getPalette(); p.forEach(function (c, i) { if (c.toUpperCase() !== BRAND[i]) replaceColor(c, BRAND[i]); });
        document.body.removeAttribute('data-palette'); changed(); renderPanel();
      });
    }

    /* ---------- Toolbar ---------- */
    function togglePreview() {
      var on = document.documentElement.classList.toggle('kubo-preview');
      if (on) { deselect(); say('Режим просмотра. Esc — вернуться к редактированию'); }
      updateBoxes();
    }
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a;
      if (a === 'exit') { if (state.dirty && !confirm('Выйти из редактора? Черновик останется в этом браузере.')) e.preventDefault(); return; }
      e.preventDefault();
      if (a === 'undo') undo();
      else if (a === 'redo') redo();
      else if (a === 'preview') togglePreview();
      else if (a === 'download') download();
      else if (a === 'reset') { if (confirm('Удалить все несохранённые правки и загрузить последнюю версию с GitHub?')) { localStorage.removeItem(DRAFT_KEY); state.dirty = false; location.reload(); } }
      else if (a === 'github') saveGitHub();
    });
    window.addEventListener('beforeunload', function () { stopText(); });

    /* ---------- Export ---------- */
    function cleanDoc() {
      stopText();
      var doc = document.documentElement.cloneNode(true);
      doc.querySelectorAll('[data-kubo-ui]').forEach(function (n) { n.remove(); });
      doc.querySelectorAll('style').forEach(function (s) { if (/tailwindcss v\d/.test(s.textContent) || s.id === 'kubo-editor-css') s.remove(); });
      doc.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
      doc.classList.remove('kubo-editing', 'kubo-preview');
      if (!doc.getAttribute('class')) doc.removeAttribute('class');
      return doc;
    }
    function serialize(doc) { return '<!doctype html>\n' + doc.outerHTML + '\n'; }
    function download() {
      var blob = new Blob([serialize(cleanDoc())], { type: 'text/html;charset=utf-8' });
      var a = h('a', { href: URL.createObjectURL(blob), download: PAGE });
      document.body.appendChild(a); a.click(); a.remove();
      say('HTML скачан. Картинки, загруженные с компьютера, встроены в файл');
    }

    /* ---------- GitHub ---------- */
    function b64utf8(str) {
      var bytes = new TextEncoder().encode(str), bin = '';
      for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }
    function api(path, opts) {
      opts = opts || {};
      var url = 'https://api.github.com/repos/' + CFG.owner + '/' + CFG.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
      return fetch(url + (opts.method ? '' : '?ref=' + CFG.branch + '&t=' + Date.now()), {
        method: opts.method || 'GET',
        headers: { Authorization: 'Bearer ' + localStorage.getItem(TOKEN_KEY), Accept: 'application/vnd.github+json' },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    }
    async function putFile(path, b64, message) {
      var sha;
      var g = await api(path);
      if (g.status === 200) sha = (await g.json()).sha;
      else if (g.status === 401) throw new Error('auth');
      var r = await api(path, { method: 'PUT', body: { message: message, content: b64, branch: CFG.branch, sha: sha } });
      if (r.status === 401 || r.status === 403) throw new Error('auth');
      if (!r.ok) throw new Error('GitHub ответил ' + r.status + ': ' + ((await r.json().catch(function () { return {}; })).message || ''));
    }
    function askToken() {
      return new Promise(function (resolve) {
        var m = h('div', { 'data-kubo-ui': '', id: 'kubo-modal' },
          '<div class="kb-card"><h3>Подключение к GitHub</h3>' +
          '<p>Чтобы сохранять правки прямо в репозиторий, нужен личный ключ доступа (токен). Он хранится <b>только в этом браузере</b>.</p>' +
          '<ol><li>Откройте <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → Fine-grained token</a></li>' +
          '<li>Token name: <code>kubotoys-editor</code>, Expiration — на ваш выбор</li>' +
          '<li>Repository access → <b>Only select repositories</b> → <code>kubotoys</code></li>' +
          '<li>Permissions → Repository permissions → <b>Contents: Read and write</b></li>' +
          '<li>Нажмите <b>Generate token</b>, скопируйте и вставьте сюда:</li></ol>' +
          '<input type="password" placeholder="github_pat_…" autocomplete="off">' +
          '<div class="kb-actions"><button data-x="0">Отмена</button><button data-x="1" class="kb-primary">Сохранить ключ</button></div></div>');
        document.body.appendChild(m);
        var inp = m.querySelector('input'); inp.focus();
        m.addEventListener('click', function (e) {
          var x = e.target.dataset && e.target.dataset.x; if (x == null) return;
          var v = inp.value.trim(); m.remove();
          if (x === '1' && v) { localStorage.setItem(TOKEN_KEY, v); resolve(true); } else resolve(false);
        });
      });
    }
    var saving = false;
    async function saveGitHub() {
      if (saving) return;
      if (!localStorage.getItem(TOKEN_KEY) && !(await askToken())) return;
      saving = true;
      var btn = bar.querySelector('[data-a="github"]'); btn.textContent = '⏳ Сохраняю…'; btn.disabled = true;
      try {
        // 1) загрузить новые картинки отдельными файлами
        var imgs = Array.prototype.filter.call(document.querySelectorAll('img'), function (i) { return !isUI(i) && /^data:image\//.test(i.getAttribute('src') || ''); });
        for (var i = 0; i < imgs.length; i++) {
          var src = imgs[i].getAttribute('src');
          var ext = (src.match(/^data:image\/(\w+)/) || [, 'png'])[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
          var base = (imgs[i].getAttribute('data-kubo-name') || 'image').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
          var rel = 'assets/uploads/' + base + '-' + Date.now().toString(36) + '.' + ext;
          await putFile(CFG.dir + rel, src.split(',')[1], 'Редактор: загружено изображение ' + rel);
          imgs[i].setAttribute('src', rel); imgs[i].removeAttribute('data-kubo-name');
        }
        // 2) сохранить HTML страницы
        await putFile(CFG.dir + PAGE, b64utf8(serialize(cleanDoc())), 'Редактор: правки страницы ' + PAGE);
        localStorage.removeItem(DRAFT_KEY); state.dirty = false;
        say('✅ Сохранено на GitHub. Публичная ссылка обновится в течение нескольких минут', 6000);
      } catch (err) {
        if (err.message === 'auth') {
          localStorage.removeItem(TOKEN_KEY);
          say('Ключ не подошёл или у него нет права записи (Contents: Read and write). Попробуйте ещё раз', 7000);
        } else say('Ошибка сохранения: ' + err.message + '. Правки остались в черновике', 8000);
      } finally {
        saving = false; btn.textContent = '☁ Сохранить на GitHub'; btn.disabled = false;
      }
    }

    renderPanel();
    say('Визуальный редактор включён. Кликните по любому элементу страницы', 3500);
  }

  function injectStyles() {
    var css = [
      'html.kubo-editing{padding-top:48px!important;padding-right:320px!important;box-sizing:border-box}',
      'html.kubo-editing.kubo-preview{padding-right:0!important}',
      'html.kubo-preview #kubo-panel,html.kubo-preview #kubo-hover,html.kubo-preview #kubo-sel{display:none!important}',
      'html.kubo-editing body{margin:0;cursor:default}',
      'html.kubo-editing header.sticky,html.kubo-editing .sticky{top:48px!important}',
      '[contenteditable="true"]{outline:2px dashed #E63329!important;outline-offset:3px;cursor:text!important;min-width:20px}',
      '[hidden]{display:none!important}',
      '#kubo-bar,#kubo-panel,#kubo-toast,#kubo-modal,#kubo-sel span{font:13px/1.4 Inter,system-ui,sans-serif;color:#1C1C1C;letter-spacing:0;text-align:left}',
      '#kubo-bar{position:fixed;top:0;left:0;right:0;height:48px;z-index:2147483646;background:#1C1C1C;color:#fff;display:flex;align-items:center;gap:6px;padding:0 12px;box-shadow:0 2px 12px rgba(0,0,0,.2)}',
      '#kubo-bar .kb-title{color:#fff;white-space:nowrap}#kubo-bar .kb-sp{flex:1}',
      '#kubo-bar button,#kubo-bar a{background:#2E2E2E;color:#fff;border:0;border-radius:8px;padding:7px 11px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none;white-space:nowrap}',
      '#kubo-bar button:hover,#kubo-bar a:hover{background:#444}',
      '#kubo-bar .kb-primary{background:#2B5BAA}#kubo-bar .kb-primary:hover{background:#214A8F}',
      '#kubo-panel{position:fixed;top:48px;right:0;bottom:0;width:320px;z-index:2147483645;background:#fff;border-left:1px solid #E3E6EA;overflow-y:auto;box-shadow:-4px 0 16px rgba(0,0,0,.06)}',
      '#kubo-panel .kb-head{display:flex;align-items:center;gap:6px;padding:12px 14px;border-bottom:1px solid #EEF0F2;position:sticky;top:0;background:#fff;z-index:1}',
      '#kubo-panel .kb-head b{flex:1;font-size:14px}',
      '#kubo-panel .kb-sec{padding:12px 14px;border-bottom:1px solid #EEF0F2}',
      '#kubo-panel h4{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#7A818A;font-weight:700}',
      '#kubo-panel summary{cursor:pointer;font-weight:600;color:#5F6670}',
      '#kubo-panel label{display:block;font-size:12px;color:#5F6670;margin-top:8px}',
      '#kubo-panel input:not([type=color]):not([type=range]),#kubo-panel select,#kubo-panel textarea{display:block;width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #D7DBE0;border-radius:8px;padding:6px 8px;font:13px Inter,system-ui,sans-serif;color:#1C1C1C;background:#fff}',
      '#kubo-panel textarea{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;margin-top:8px}',
      '#kubo-panel input[type=color]{display:block;width:100%;height:32px;margin-top:3px;border:1px solid #D7DBE0;border-radius:8px;padding:2px;background:#fff;cursor:pointer}',
      '#kubo-panel input[type=range]{display:block;width:100%;margin-top:10px}',
      '#kubo-panel .kb-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '#kubo-panel button{background:#F1F3F5;color:#1C1C1C;border:0;border-radius:8px;padding:7px 10px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}',
      '#kubo-panel button:hover{background:#E4E7EB}',
      '#kubo-panel .kb-wide{display:block;width:100%;margin-top:8px}',
      '#kubo-panel .kb-primary{background:#2B5BAA;color:#fff}#kubo-panel .kb-primary:hover{background:#214A8F}',
      '#kubo-panel .kb-danger{background:#FDECEB;color:#C62A21}',
      '#kubo-panel .kb-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '#kubo-panel .kb-fmt{display:flex;align-items:center;gap:4px;margin-top:10px}#kubo-panel .kb-fmt span{font-size:11px;color:#9AA0A8}',
      '#kubo-panel .kb-thumb{display:block;width:100%;max-height:160px;object-fit:contain;background:#F8F9FA;border-radius:8px;margin-bottom:4px}',
      '#kubo-panel .kb-pal{display:flex;align-items:center;gap:8px}#kubo-panel .kb-pal input{width:44px!important;height:28px!important;margin:0!important}',
      '#kubo-panel .kb-pal code{margin-left:auto;font-size:11px;color:#9AA0A8}',
      '#kubo-panel .kb-help p{margin:0 0 8px;color:#3F454D;font-size:12.5px}',
      '#kubo-hover,#kubo-sel{position:fixed;pointer-events:none;z-index:2147483640;display:none;box-sizing:border-box}',
      '#kubo-hover{outline:1px dashed #2B5BAA;background:rgba(43,91,170,.05)}',
      '#kubo-sel{outline:2px solid #2B5BAA}',
      '#kubo-sel span{position:absolute;left:-2px;top:-22px;background:#2B5BAA;color:#fff!important;font-size:11px!important;font-weight:600;padding:2px 7px;border-radius:4px 4px 0 0;white-space:nowrap}',
      '#kubo-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;transition:.25s;z-index:2147483647;background:#1C1C1C;color:#fff;padding:10px 16px;border-radius:10px;max-width:520px;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:none}',
      '#kubo-toast.on{opacity:1;transform:translate(-50%,0)}',
      '#kubo-modal{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}',
      '#kubo-modal .kb-card{background:#fff;border-radius:14px;padding:22px 24px;width:480px;max-width:92vw;box-shadow:0 20px 50px rgba(0,0,0,.3)}',
      '#kubo-modal h3{margin:0 0 8px;font-size:18px}#kubo-modal p,#kubo-modal li{font-size:13px;color:#3F454D}#kubo-modal ol{padding-left:18px;margin:8px 0}#kubo-modal li{list-style:decimal;margin:3px 0}',
      '#kubo-modal a{color:#2B5BAA;text-decoration:underline}#kubo-modal code{background:#F1F3F5;padding:1px 5px;border-radius:4px}',
      '#kubo-modal input{width:100%;box-sizing:border-box;border:1px solid #D7DBE0;border-radius:8px;padding:9px 10px;margin-top:6px;font:13px ui-monospace,monospace}',
      '#kubo-modal .kb-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}',
      '#kubo-modal button{border:0;border-radius:8px;padding:8px 14px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;background:#F1F3F5}',
      '#kubo-modal .kb-primary{background:#2B5BAA;color:#fff}'
    ].join('\n');
    var s = document.createElement('style'); s.id = 'kubo-editor-css'; s.setAttribute('data-kubo-ui', ''); s.textContent = css;
    document.head.appendChild(s);
  }
})();
