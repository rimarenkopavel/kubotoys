/* KuboToys — интерактив карточки товара (макет). Общий для product.html и product-mobile.html.
   Всё состояние задаётся заново при загрузке, поэтому сохранение страницы из редактора не «замораживает» выбранный цвет/вкладку. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fmt = function (n) { return (Math.round(n * 100) / 100).toString().replace('.', ',') + ' Br'; };
  var editing = /[?&]edit\b/.test(location.search);

  /* ---------- Цвет / цена ---------- */
  var swatches = $$('[data-color]');
  var current = null;
  function selectColor(sw, keepImage) {
    current = sw;
    swatches.forEach(function (s) {
      var on = s === sw;
      s.setAttribute('aria-checked', on ? 'true' : 'false');
      s.classList.toggle('ring-2', on); s.classList.toggle('ring-[#2B5BAA]', on); s.classList.toggle('ring-offset-2', on);
    });
    $$('[data-color-name]').forEach(function (e) { e.textContent = sw.dataset.name; });
    if (!keepImage && sw.dataset.img) setMain(sw.dataset.img, sw.dataset.color === swatches[0].dataset.color ? 0 : -1);
    recalc();
  }
  swatches.forEach(function (s) { s.addEventListener('click', function () { selectColor(s); }); });

  /* ---------- Доп. опции ---------- */
  var addons = $$('[data-addon-price]');
  addons.forEach(function (c) { c.addEventListener('change', function () { syncPlate(); recalc(); }); });
  function syncPlate() {
    var plate = $('[data-addon="plate"]');
    $$('[data-plate-field]').forEach(function (f) { f.classList.toggle('hidden', !(plate && plate.checked)); });
  }

  /* ---------- Количество ---------- */
  var qtyInput = $('[data-qty-input]');
  $$('[data-qty]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = Math.max(1, (parseInt(qtyInput.value, 10) || 1) + parseInt(b.dataset.qty, 10));
      qtyInput.value = v; recalc();
    });
  });
  qtyInput && qtyInput.addEventListener('input', recalc);

  function recalc() {
    if (!current) return;
    var base = parseFloat(current.dataset.price);
    var extra = addons.reduce(function (s, c) { return s + (c.checked ? parseFloat(c.dataset.addonPrice) : 0); }, 0);
    var qty = Math.max(1, parseInt(qtyInput && qtyInput.value, 10) || 1);
    var total = (base + extra) * qty;
    $$('[data-price-main]').forEach(function (e) { e.textContent = fmt(base); });
    $$('[data-total]').forEach(function (e) { e.textContent = fmt(total); });
    $$('[data-installment]').forEach(function (e) { e.textContent = fmt(total / 4); });
  }

  /* ---------- Галерея ---------- */
  var thumbs = $$('[data-thumb]');
  var mainImg = $('[data-main-img]');
  var idx = 0;
  function setMain(src, i) {
    if (!mainImg) return;
    mainImg.src = src; idx = i;
    thumbs.forEach(function (t, k) {
      var on = k === i;
      t.classList.toggle('border-[#2B5BAA]', on); t.classList.toggle('border-transparent', !on);
      t.setAttribute('aria-current', on ? 'true' : 'false');
    });
    var counter = $('[data-gal-counter]');
    if (counter) counter.textContent = (i < 0 ? '—' : (i + 1)) + ' / ' + thumbs.length;
  }
  thumbs.forEach(function (t, k) { t.addEventListener('click', function () { setMain(t.dataset.src, k); }); });
  $$('[data-gal]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var n = thumbs.length; if (!n) return;
      var i = b.dataset.gal === 'next' ? (idx + 1) % n : (idx - 1 + n) % n;
      setMain(thumbs[i].dataset.src, i);
      thumbs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  });

  /* ---------- Вкладки ---------- */
  function openTab(name, scroll) {
    $$('[data-tab-btn]').forEach(function (b) {
      var on = b.dataset.tabBtn === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.classList.toggle('text-[#2B5BAA]', on); b.classList.toggle('border-[#2B5BAA]', on);
      b.classList.toggle('text-[#5F6670]', !on); b.classList.toggle('border-transparent', !on);
    });
    $$('[data-tab-panel]').forEach(function (p) { p.classList.toggle('hidden', p.dataset.tabPanel !== name); });
    if (scroll) { var t = $('[data-tabs]'); t && window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' }); }
  }
  $$('[data-tab-btn]').forEach(function (b) { b.addEventListener('click', function () { openTab(b.dataset.tabBtn); }); });
  $$('[data-goto-tab]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); openTab(a.dataset.gotoTab, true); }); });

  /* ---------- Отзывы: показать ещё ---------- */
  var moreBtn = $('[data-more-reviews]');
  moreBtn && moreBtn.addEventListener('click', function () {
    $$('[data-review-extra]').forEach(function (r) { r.classList.remove('hidden'); });
    moreBtn.classList.add('hidden');
  });

  /* ---------- Лайтбокс (фото, сертификаты, видео) ---------- */
  function lightbox(inner) {
    if (editing) return;
    var box = document.createElement('div');
    box.setAttribute('data-kubo-ui', '');
    box.className = 'fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4';
    box.innerHTML = '<button type="button" aria-label="Закрыть" class="absolute top-4 right-4 h-12 w-12 rounded-full bg-white/15 hover:bg-white/25 text-white text-xl flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>' + inner;
    function close() { box.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('button[aria-label="Закрыть"]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
  }
  document.addEventListener('click', function (e) {
    var z = e.target.closest('[data-zoom]');
    if (z) {
      e.preventDefault();
      var src = z.dataset.zoom || (z.querySelector('img') || {}).src || (mainImg && mainImg.src);
      lightbox('<img src="' + src + '" alt="" class="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain">');
      return;
    }
    var v = e.target.closest('[data-yt]');
    if (v) {
      e.preventDefault();
      var vertical = v.dataset.vertical === '1';
      lightbox('<div class="' + (vertical ? 'h-[86vh] aspect-[9/16]' : 'w-[min(92vw,1100px)] aspect-video') + ' rounded-2xl overflow-hidden bg-black">' +
        '<iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/' + v.dataset.yt + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Видео"></iframe></div>');
    }
  });

  /* ---------- Корзина / покупка в 1 клик (заглушки макета) ---------- */
  function toast(html) {
    var t = document.createElement('div');
    t.setAttribute('data-kubo-ui', '');
    t.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[90] bg-[#1C1C1C] text-white rounded-2xl px-5 py-4 text-sm shadow-2xl max-w-[90vw]';
    t.innerHTML = html; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }
  function summary() {
    var opts = addons.filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.addonName; });
    return 'Бизидом Макси · ' + current.dataset.name + (opts.length ? ' · ' + opts.join(', ') : '') + ' · ' + $('[data-total]').textContent;
  }
  $$('[data-add-to-cart]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (editing) return;
      var q = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      $$('[data-cart-count]').forEach(function (c) { c.textContent = (parseInt(c.textContent, 10) || 0) + q; });
      toast('<i class="fa-solid fa-circle-check text-[#4CAF50] mr-2"></i>Добавлено в корзину: ' + summary());
    });
  });
  $$('[data-buy-now]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (editing) return;
      toast('<i class="fa-solid fa-bolt text-[#F7C52D] mr-2"></i>Переход к оформлению заказа: ' + summary());
    });
  });

  /* ---------- Форма «Остались вопросы?» ---------- */
  $$('[data-question-form]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (editing) return;
      f.classList.add('hidden');
      var ok = f.parentNode.querySelector('[data-question-ok]'); ok && ok.classList.remove('hidden');
    });
  });

  /* ---------- Начальное состояние ---------- */
  function init() {
    addons.forEach(function (c) { c.checked = false; });
    if (qtyInput) qtyInput.value = 1;
    syncPlate();
    if (thumbs[0]) setMain(thumbs[0].dataset.src, 0);
    if (swatches[0]) selectColor(swatches[0], true);
    openTab('desc');
    $$('[data-review-extra]').forEach(function (r) { r.classList.add('hidden'); });
    moreBtn && moreBtn.classList.remove('hidden');
    $$('[data-question-form]').forEach(function (f) { f.classList.remove('hidden'); });
    $$('[data-question-ok]').forEach(function (f) { f.classList.add('hidden'); });
    // В редакторе показываем все вкладки и все отзывы, чтобы их можно было править.
    // При обычном открытии страницы init() снова скрывает лишнее, так что сохранённый HTML на вид не влияет.
    if (editing) {
      $$('[data-tab-panel], [data-review-extra], [data-plate-field]').forEach(function (p) { p.classList.remove('hidden'); });
      moreBtn && moreBtn.classList.add('hidden');
    }
  }
  init();
})();
