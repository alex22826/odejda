/* odejda — витрина: баннер, каталог, карточка товара, образ недели, корзина */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  const { esc, rich, plain, money, img } = Store.util;
  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

  const ICON = {
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    telegram: '<svg viewBox="0 0 24 24"><path d="M21 4 3 11.2l5.8 2.1L11 19.5l3.3-3.9 4.9 3.7L21 4Z"/><path d="m8.8 13.3 7.7-5.6"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".5"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4.1A8 8 0 1 1 8.2 18.8L4 20Z"/><path d="M9.2 8.6c-.4 2.9 3.3 6.6 6.2 6.2l.6-1.6-1.8-.9-1 1c-1.2-.5-2.2-1.5-2.7-2.7l1-1-.9-1.8-1.4.8Z"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M6.5 3.5h3l1.5 4.5-2 1.3a11 11 0 0 0 5.7 5.7l1.3-2 4.5 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/></svg>',
  };

  const PAGE = 8;
  const state = {
    products: [],
    map: new Map(),
    settings: {},
    cat: 'all',
    q: '',
    sort: 'popular',
    shown: PAGE,
  };

  /* ---------- корзина и избранное: живут в браузере покупателя ---------- */

  const mine = {
    get(key, def) {
      try { return JSON.parse(localStorage.getItem('odejda.' + key)) || def; } catch (e) { return def; }
    },
    set(key, value) {
      try { localStorage.setItem('odejda.' + key, JSON.stringify(value)); } catch (e) { /* приватный режим */ }
    },
  };
  let cart = mine.get('cart', []);
  const favs = new Set(mine.get('favs', []));

  const byId = (id) => state.map.get(id);
  const isOut = (p) => p.stock !== null && p.stock <= 0;
  const isSale = (p) => p.oldPrice && p.oldPrice > p.price;
  const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#cfc8bd');

  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  /*
   * Какой ОДИН бейдж показать на карточке, если товару подходят сразу несколько
   * (скидка, мало осталось, новинка, хит). Порядок проверок = приоритет:
   * что важнее подсветить покупателю, то и стоит выше.
   */
  function pickBadge(p) {
    if (isOut(p)) return { text: 'Нет в наличии', kind: 'out' };
    if (isSale(p)) return { text: '−' + Math.round((1 - p.price / p.oldPrice) * 100) + '%', kind: 'sale' };
    if (p.stock !== null && p.stock <= 3) return { text: 'Осталось ' + p.stock + ' шт', kind: 'low' };
    if (p.isNew) return { text: 'Новинка', kind: 'new' };
    if (p.isHit) return { text: 'Хит', kind: 'hit' };
    return null;
  }

  const FILTERS = [
    { id: 'all', name: 'Все', test: () => true },
    ...Store.CATEGORIES.map((c) => ({ id: c.id, name: c.name, test: (p) => p.category === c.id })),
    { id: 'new', name: 'Новинки', test: (p) => p.isNew },
    { id: 'sale', name: 'Скидки', test: isSale, cls: 'chip--sale' },
    { id: 'fav', name: '♥ Избранное', test: (p) => favs.has(p.id) },
  ];

  /* ---------- общие кусочки разметки ---------- */

  function priceHTML(p, cls) {
    const sale = isSale(p);
    return `<div class="price${sale ? ' is-sale' : ''}${cls ? ' ' + cls : ''}">
      <span>${money(p.price)}</span>${sale ? `<s>${money(p.oldPrice)}</s>` : ''}
    </div>`;
  }

  function cardHTML(p, i) {
    const badge = pickBadge(p);
    const out = isOut(p);
    const [a, b] = p.images;
    const id = esc(p.id);
    const quick = !out && p.sizes.length
      ? `<div class="quick">
          <div class="quick__label">Быстро в корзину</div>
          <div class="quick__sizes">${p.sizes.map((s) => `<button data-quick="${id}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        </div>`
      : '';
    return `<article class="card${out ? ' is-out' : ''}" style="animation-delay:${(i % PAGE) * 45}ms">
      <div class="card__top">
        <button class="card__media" data-open="${id}" aria-label="${esc(p.title)}">
          ${a ? `<img class="main" src="${esc(img(a))}" alt="" loading="lazy">` : ''}
          ${b ? `<img class="alt" src="${esc(img(b))}" alt="" loading="lazy">` : ''}
        </button>
        ${badge ? `<span class="badge badge--${badge.kind}">${esc(badge.text)}</span>` : ''}
        <button class="fav${favs.has(p.id) ? ' is-on' : ''}" data-fav="${id}" aria-label="В избранное" aria-pressed="${favs.has(p.id)}">${ICON.heart}</button>
        ${quick}
      </div>
      <div class="card__body">
        <div class="card__cat">${esc(Store.categoryName(p.category))}</div>
        <button class="card__title" data-open="${id}">${esc(p.title)}</button>
        ${priceHTML(p)}
        ${p.colors.length > 1 ? `<div class="card__colors">${p.colors.map((c) => `<span class="dot" style="background:${safeColor(c.hex)}" title="${esc(c.name)}"></span>`).join('')}</div>` : ''}
      </div>
    </article>`;
  }

  /* ---------- шапка, бегущая строка, мелочи ---------- */

  function renderBasics() {
    const s = state.settings;
    $$('[data-store-name]').forEach((el) => { el.textContent = s.storeName || 'odejda'; });
    $('#announce').textContent = s.announcement || '';
    $$('[data-free-from]').forEach((el) => { el.textContent = money(s.freeShippingFrom || 0); });
    $('#year').textContent = new Date().getFullYear();
  }

  /* ---------- баннер-слайдер ---------- */

  const hero = { i: 0, slides: [], timer: null, ms: 7000, left: 7000, startedAt: 0, pause: new Set() };

  function renderHero() {
    const slides = (state.settings.hero || []).filter((s) => s && (s.title || s.image));
    hero.slides = slides;
    const section = $('#hero');
    if (!slides.length) { section.hidden = true; return; }
    section.style.setProperty('--slide-ms', hero.ms + 'ms');

    $('#heroText').innerHTML = slides.map((s, i) => {
      const tag = i === 0 ? 'h1' : 'h2';
      return `<div class="hero__slide-text" aria-hidden="true">
        <p class="eyebrow">${esc(s.eyebrow || '')}</p>
        <${tag} class="hero__title">${rich(s.title || '')}</${tag}>
        <p class="hero__lead">${esc(s.text || '')}</p>
        <div class="hero__cta">
          <a class="btn btn--dark" href="#catalog" data-go="${esc(s.link || 'all')}" tabindex="-1">${esc(s.button || 'Смотреть каталог')} ${ICON.arrow}</a>
          <a class="btn btn--ghost" href="#look" data-go="look" tabindex="-1">Образ недели</a>
        </div>
      </div>`;
    }).join('');

    const chips = slides.map((s) => {
      const p = byId(s.productId);
      if (!p) return '<span class="hero-chip" hidden></span>';
      const badge = pickBadge(p);
      return `<button class="hero-chip" data-open="${esc(p.id)}" tabindex="-1">
        ${p.images[0] ? `<img src="${esc(img(p.images[0]))}" alt="">` : ''}
        <div><small>${esc(badge ? badge.text : 'В образе')}</small><span>${esc(p.title)}</span><strong>${money(p.price)}</strong></div>
        ${ICON.arrow}
      </button>`;
    }).join('');

    $('#heroMedia').innerHTML = `
      <div class="stamp" aria-hidden="true">
        <svg class="stamp__ring" viewBox="0 0 132 132">
          <defs><path id="stampPath" d="M66,66 m-49,0 a49,49 0 1,1 98,0 a49,49 0 1,1 -98,0"/></defs>
          <text><textPath href="#stampPath">НОВАЯ КОЛЛЕКЦИЯ · ОСЕНЬ — ЗИМА ·</textPath></text>
        </svg>
        <b>26</b>
      </div>
      <div class="hero__frame">
        ${slides.map((s, i) => `<img src="${esc(img(s.image))}" alt="${esc(plain(s.title))}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join('')}
      </div>
      ${chips}`;

    $('#heroDots').innerHTML = slides.map((s, i) => `<button class="hero__dot" role="tab" data-slide="${i}" aria-label="Слайд ${i + 1}">${String(i + 1).padStart(2, '0')}<i></i></button>`).join('');
    $('#heroPrev').parentElement.hidden = slides.length < 2;
    goSlide(0);
  }

  function goSlide(n) {
    const count = hero.slides.length;
    if (!count) return;
    hero.i = (n + count) % count;
    const active = (list) => list.forEach((el, i) => el.classList.toggle('is-active', i === hero.i));

    active($$('.hero__frame img'));
    $$('.hero__slide-text').forEach((el, i) => {
      const on = i === hero.i;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-hidden', String(!on));
      $$('a', el).forEach((a) => { a.tabIndex = on ? 0 : -1; });
    });
    $$('.hero-chip').forEach((el, i) => {
      el.classList.toggle('is-active', i === hero.i);
      el.tabIndex = i === hero.i ? 0 : -1;
    });
    // полоска прогресса: снять класс, дать браузеру перерисовать, вернуть — анимация начнётся заново
    const dots = $$('.hero__dot');
    dots.forEach((d) => d.classList.remove('is-active'));
    void $('#heroDots').offsetWidth;
    active(dots);
    dots.forEach((d, i) => d.setAttribute('aria-selected', String(i === hero.i)));
    restartHeroTimer();
  }

  function restartHeroTimer() {
    clearTimeout(hero.timer);
    hero.left = hero.ms;
    if (!hero.pause.size) runHeroTimer();
  }

  function runHeroTimer() {
    if (hero.slides.length < 2) return;
    hero.startedAt = Date.now();
    hero.timer = setTimeout(() => goSlide(hero.i + 1), hero.left);
  }

  // Причины паузы складываются: наведение мыши, баннер за экраном, вкладка скрыта
  function heroPause(reason, on) {
    const was = hero.pause.size;
    if (on) hero.pause.add(reason); else hero.pause.delete(reason);
    $('#hero').classList.toggle('is-paused', hero.pause.size > 0);
    if (!was && hero.pause.size) {
      clearTimeout(hero.timer);
      hero.left = Math.max(300, hero.left - (Date.now() - hero.startedAt));
    } else if (was && !hero.pause.size) {
      runHeroTimer();
    }
  }

  /* ---------- категории ---------- */

  const CAT_IMAGES = {
    women: 'assets/img/cat-women.webp',
    men: 'assets/img/blazer-2.webp',
    shoes: 'assets/img/chelsea-1.webp',
    accessories: 'assets/img/bag-2.webp',
  };

  function renderCats() {
    $('#cats').innerHTML = Store.CATEGORIES.map((c, i) => {
      const n = state.products.filter((p) => p.category === c.id).length;
      const pic = CAT_IMAGES[c.id] || (state.products.find((p) => p.category === c.id) || { images: [] }).images[0];
      return `<button class="cat" data-go="${c.id}" data-reveal style="transition-delay:${i * 70}ms">
        ${pic ? `<img src="${esc(img(pic))}" alt="" loading="lazy">` : ''}
        <span class="cat__label">
          <span><b>${esc(c.name)}</b><small>${n} ${plural(n, ['товар', 'товара', 'товаров'])}</small></span>
          <span class="cat__arrow">${ICON.arrow}</span>
        </span>
      </button>`;
    }).join('');
  }

  /* ---------- каталог ---------- */

  const SORTERS = {
    popular: (a, b) => (b.isHit - a.isHit) || (b.isNew - a.isNew) || String(b.createdAt).localeCompare(a.createdAt),
    new: (a, b) => String(b.createdAt).localeCompare(a.createdAt),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
  };

  function filteredList() {
    const f = FILTERS.find((x) => x.id === state.cat) || FILTERS[0];
    const q = state.q.trim().toLowerCase();
    let list = state.products.filter(f.test);
    if (q) {
      list = list.filter((p) => (p.title + ' ' + p.description + ' ' + Store.categoryName(p.category) + ' ' + p.colors.map((c) => c.name).join(' '))
        .toLowerCase().includes(q));
    }
    // закончившиеся товары — в конец списка
    return list.slice().sort((a, b) => (isOut(a) - isOut(b)) || SORTERS[state.sort](a, b));
  }

  function renderChips() {
    $('#chips').innerHTML = FILTERS.map((f) => {
      const n = state.products.filter(f.test).length;
      if (f.id === 'fav' && !n && state.cat !== 'fav') return '';
      return `<button class="chip ${f.cls || ''}${state.cat === f.id ? ' is-active' : ''}" role="tab" aria-selected="${state.cat === f.id}" data-filter="${f.id}">${esc(f.name)}<small>${n}</small></button>`;
    }).join('');
  }

  function renderCatalog(append) {
    const list = filteredList();
    const grid = $('#grid');
    $('#catalogCount').textContent = list.length;
    if (!list.length) {
      grid.innerHTML = state.cat === 'fav'
        ? '<div class="empty"><b>В избранном пусто</b>Нажмите ♥ на товаре, чтобы отложить его сюда.</div>'
        : '<div class="empty"><b>Ничего не нашлось</b>Попробуйте другой запрос или <button class="link" data-filter="all" style="text-decoration:underline">покажите все товары</button>.</div>';
    } else if (append) {
      const from = grid.children.length;
      grid.insertAdjacentHTML('beforeend', list.slice(from, state.shown).map((p, i) => cardHTML(p, i)).join(''));
    } else {
      grid.innerHTML = list.slice(0, state.shown).map(cardHTML).join('');
    }
    const rest = list.length - state.shown;
    const more = $('#moreBtn');
    more.hidden = rest <= 0;
    more.textContent = 'Показать ещё ' + Math.min(rest, PAGE) + ' из ' + rest;
  }

  function setFilter(id) {
    state.cat = FILTERS.some((f) => f.id === id) ? id : 'all';
    state.shown = PAGE;
    renderChips();
    renderCatalog();
  }

  // Переход из баннера/меню/категорий: фильтр + прокрутка к каталогу
  function go(target) {
    closeNav();
    if (target === 'look') {
      $('#look').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setFilter(target);
    $('#catalog').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- образ недели ---------- */

  function lookSpots() {
    const look = state.settings.look || {};
    return (look.spots || []).map((s) => Object.assign({}, s, { p: byId(s.productId) })).filter((s) => s.p);
  }

  function renderLook() {
    const look = state.settings.look || {};
    const spots = lookSpots();
    if (!look.image || !spots.length) { $('#look').hidden = true; return; }
    const pct = (v) => Math.max(3, Math.min(97, Number(v) || 50));

    $('#lookTitle').innerHTML = rich(look.title || 'Образ *недели*');
    $('#lookText').textContent = look.text || '';
    $('#lookMedia').innerHTML = `<img src="${esc(img(look.image))}" alt="${esc(plain(look.title || 'Образ недели'))}" loading="lazy">`
      + spots.map((s, i) => `<button class="spot" style="left:${pct(s.x)}%;top:${pct(s.y)}%" data-spot="${i}" aria-label="${esc(s.p.title)}">${ICON.plus}</button>`).join('');
    $('#lookList').innerHTML = spots.map((s, i) => `<li class="look__item" data-spot-item="${i}">
        ${s.p.images[0] ? `<img src="${esc(img(s.p.images[0]))}" alt="" loading="lazy">` : '<span></span>'}
        <button class="look__open" data-open="${esc(s.p.id)}"><b>${esc(s.p.title)}</b>${priceHTML(s.p)}</button>
        <button class="look__plus" data-look-add="${esc(s.p.id)}" aria-label="Добавить «${esc(s.p.title)}» в корзину" ${isOut(s.p) ? 'disabled' : ''}>${ICON.plus}</button>
      </li>`).join('');
    const total = spots.filter((s) => !isOut(s.p)).reduce((sum, s) => sum + s.p.price, 0);
    $('#lookTotal').textContent = money(total);
  }

  function toggleSpot(i) {
    const media = $('#lookMedia');
    const old = $('.spot-pop', media);
    const wasOpen = old && old.dataset.i === String(i);
    if (old) old.remove();
    $$('.spot', media).forEach((s) => s.classList.remove('is-open'));
    if (wasOpen) return;

    const spot = lookSpots()[i];
    const btn = $(`.spot[data-spot="${i}"]`, media);
    btn.classList.add('is-open');
    const x = parseFloat(btn.style.left);
    const y = parseFloat(btn.style.top);
    const pop = document.createElement('div');
    pop.className = 'spot-pop';
    pop.dataset.i = i;
    pop.style.top = `clamp(8px, calc(${y}% - 50px), calc(100% - 110px))`;
    if (x > 52) pop.style.right = `calc(${100 - x}% + 28px)`;
    else pop.style.left = `calc(${x}% + 28px)`;
    pop.innerHTML = `${spot.p.images[0] ? `<img src="${esc(img(spot.p.images[0]))}" alt="">` : ''}
      <div><b>${esc(spot.p.title)}</b>${priceHTML(spot.p)}<button data-open="${esc(spot.p.id)}">Подробнее →</button></div>`;
    media.appendChild(pop);
  }

  function hotSpot(i, on) {
    const s = $(`.spot[data-spot="${i}"]`);
    const li = $(`[data-spot-item="${i}"]`);
    if (s) s.classList.toggle('is-hot', on);
    if (li) li.classList.toggle('is-hot', on);
  }

  // Размер «по умолчанию» для быстрого добавления — середина размерной линейки
  function defaultSize(p) {
    return p.sizes.length ? p.sizes[Math.floor((p.sizes.length - 1) / 2)] : '';
  }

  function addLook() {
    const items = lookSpots().map((s) => s.p).filter((p) => !isOut(p));
    items.forEach((p) => addToCart(p.id, defaultSize(p), null, 1, { silent: true }));
    toast(`В корзине ${items.length} ${plural(items.length, ['вещь', 'вещи', 'вещей'])} из образа — размеры можно поменять`);
    openCart();
  }

  /* ---------- хиты ---------- */

  function renderHits() {
    let list = state.products.filter((p) => p.isHit && !isOut(p));
    if (list.length < 4) list = state.products.slice().sort(SORTERS.popular).slice(0, 8);
    $('#hitsRail').innerHTML = list.map(cardHTML).join('');
    $('#hits').hidden = !list.length;
  }

  /* ---------- акция с таймером ---------- */

  let promoTick = null;

  function renderPromo() {
    const p = state.settings.promo || {};
    const section = $('#promo');
    const ends = p.endsAt ? new Date(p.endsAt) : null;
    const expired = ends && !isNaN(ends) && ends.getTime() <= Date.now();
    if (!p.title || expired) { section.hidden = true; return; }
    section.hidden = false;
    $('#promoEyebrow').textContent = p.eyebrow || 'Акция';
    $('#promoTitle').innerHTML = rich(p.title);
    $('#promoText').textContent = p.text || '';
    $('#promoBtn').dataset.go = p.link || 'sale';
    $('#promoMedia').innerHTML = p.image ? `<img src="${esc(img(p.image))}" alt="" loading="lazy">` : '';

    const timer = $('#promoTimer');
    if (!ends || isNaN(ends)) { timer.hidden = true; return; }
    const cells = [['дней', 86400], ['часов', 3600], ['минут', 60], ['секунд', 1]];
    timer.innerHTML = cells.map(([label]) => `<div class="timer__cell"><b>00</b><small>${label}</small></div>`).join('');
    const nums = $$('b', timer);
    const tick = () => {
      let left = Math.max(0, Math.floor((ends.getTime() - Date.now()) / 1000));
      if (!left) { clearInterval(promoTick); section.hidden = true; return; }
      cells.forEach(([, size], i) => {
        const v = Math.floor(left / size);
        left -= v * size;
        nums[i].textContent = String(v).padStart(2, '0');
      });
    };
    tick();
    clearInterval(promoTick);
    promoTick = setInterval(tick, 1000);
  }

  /* ---------- контакты ---------- */

  const handle = (v) => String(v || '').trim()
    .replace(/^https?:\/\/(www\.)?(t\.me|instagram\.com)\//i, '')
    .replace(/^@/, '')
    .replace(/[^\w.]/g, '');
  const digits = (v) => String(v || '').replace(/\D/g, '');

  function renderContacts() {
    const s = state.settings;
    const rows = [
      ['Адрес', esc(s.address)],
      ['Телефон', s.phone ? `<a href="tel:+${digits(s.phone)}">${esc(s.phone)}</a>` : ''],
      ['Режим работы', esc(s.hours)],
      ['Почта', s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ''],
    ].filter((r) => r[1]);
    $('#contactsList').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    const links = [];
    if (handle(s.telegram)) links.push(['Telegram', 'https://t.me/' + handle(s.telegram), ICON.telegram]);
    if (handle(s.instagram)) links.push(['Instagram', 'https://instagram.com/' + handle(s.instagram), ICON.instagram]);
    if (digits(s.whatsapp)) links.push(['WhatsApp', 'https://wa.me/' + digits(s.whatsapp), ICON.whatsapp]);
    if (s.phone) links.push(['Позвонить', 'tel:+' + digits(s.phone), ICON.phone]);
    $('#socials').innerHTML = links.map(([name, href, icon]) => `<a class="social" href="${esc(href)}" target="_blank" rel="noopener">${icon}${name}</a>`).join('');

    $('#footerContacts').innerHTML = '<b>Связаться</b>' + links
      .map(([name, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener">${name === 'Позвонить' ? esc(s.phone) : name}</a>`).join('');

    const lat = Number(s.mapLat);
    const lon = Number(s.mapLon);
    $('#map').innerHTML = lat && lon
      ? `<iframe title="Магазин на карте" loading="lazy" src="https://yandex.ru/map-widget/v1/?ll=${lon}%2C${lat}&z=16&pt=${lon}%2C${lat}%2Cpm2rdm"></iframe>`
      : '';
    $('#map').hidden = !(lat && lon);
  }

  /* ---------- модалка товара ---------- */

  const pm = { p: null, img: 0, size: null, color: null };

  function openProduct(id) {
    const p = byId(id);
    if (!p) return;
    Object.assign(pm, { p, img: 0, size: p.sizes.length === 1 ? p.sizes[0] : null, color: p.colors[0] ? p.colors[0].name : null });
    renderPM();
    $('#productModal .modal__panel').scrollTop = 0;
    openLayer($('#productModal'));
    history.replaceState(null, '', '#' + id);
  }

  function renderPM() {
    const p = pm.p;
    const out = isOut(p);
    const badge = pickBadge(p);
    const free = state.settings.freeShippingFrom || 0;
    let stock = '';
    if (p.stock !== null) {
      if (out) stock = '<p class="pm__stock">Нет в наличии — загляните позже</p>';
      else if (p.stock <= 3) stock = `<p class="pm__stock is-low">Осталось всего ${p.stock} шт</p>`;
      else stock = '<p class="pm__stock">В наличии</p>';
    }
    $('#pmBody').innerHTML = `
      <div class="pm__gallery">
        <div class="pm__main">
          ${badge ? `<span class="badge badge--${badge.kind}">${esc(badge.text)}</span>` : ''}
          ${p.images[pm.img] ? `<img src="${esc(img(p.images[pm.img]))}" alt="${esc(p.title)}">` : ''}
        </div>
        ${p.images.length > 1 ? `<div class="pm__thumbs">${p.images.map((src, i) => `<button class="${i === pm.img ? 'is-active' : ''}" data-pm-img="${i}" aria-label="Фото ${i + 1}"><img src="${esc(img(src))}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="pm__info">
        <p class="eyebrow">${esc(Store.categoryName(p.category))}</p>
        <h2 class="pm__title" id="pmTitle">${esc(p.title)}</h2>
        ${priceHTML(p, 'pm__price')}
        ${p.colors.length ? `
          <div class="pm__label">Цвет <span>${esc(pm.color)}</span></div>
          <div class="swatches">${p.colors.map((c) => `<button class="swatch${c.name === pm.color ? ' is-active' : ''}" data-pm-color="${esc(c.name)}" aria-label="${esc(c.name)}" title="${esc(c.name)}"><i style="background:${safeColor(c.hex)}"></i></button>`).join('')}</div>` : ''}
        ${p.sizes.length ? `
          <div class="pm__label">Размер <span>${pm.size ? esc(pm.size) : 'выберите'}</span></div>
          <div class="sizes" id="pmSizes">${p.sizes.map((s) => `<button class="size${s === pm.size ? ' is-active' : ''}" data-pm-size="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
        <div class="pm__buy">
          <button class="btn btn--dark" data-pm-add ${out ? 'disabled' : ''}>${out ? 'Нет в наличии' : 'Добавить в корзину'}</button>
          <button class="fav${favs.has(p.id) ? ' is-on' : ''}" data-fav="${esc(p.id)}" aria-label="В избранное" aria-pressed="${favs.has(p.id)}">${ICON.heart}</button>
        </div>
        ${stock}
        ${p.description ? `<p class="pm__desc">${esc(p.description)}</p>` : ''}
        <details><summary>Доставка и оплата</summary><p>По Ташкенту — на следующий день, бесплатно от ${money(free)}. Оплата наличными или картой при получении.</p></details>
        <details><summary>Примерка и возврат</summary><p>Курьер подождёт 15 минут, пока вы примеряете. Если вещь не подошла — вернём деньги в течение 14 дней.</p></details>
      </div>`;
  }

  function pmAdd() {
    const p = pm.p;
    if (p.sizes.length && !pm.size) {
      const sizes = $('#pmSizes');
      sizes.classList.remove('is-error');
      void sizes.offsetWidth;
      sizes.classList.add('is-error');
      toast('Выберите размер');
      return;
    }
    addToCart(p.id, pm.size, pm.color, 1, { silent: true });
    closeLayer($('#productModal'));
    openCart();
  }

  /* ---------- слои: модалка, корзина, мобильное меню ---------- */

  let lastFocus = null;

  function openLayer(el) {
    if (!el.hidden) return;
    lastFocus = document.activeElement;
    el.hidden = false;
    document.body.classList.add('lock');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
    setTimeout(() => {
      const close = $('[data-close].icon-btn', el);
      if (close) close.focus({ preventScroll: true });
    }, 60);
  }

  function closeLayer(el) {
    if (el.hidden) return;
    el.classList.remove('is-open');
    if (el.id === 'productModal' && location.hash) history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => {
      el.hidden = true;
      if (!$('.modal:not([hidden]), .drawer:not([hidden])') && !$('#nav').classList.contains('is-open')) {
        document.body.classList.remove('lock');
      }
    }, 420);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  function toggleNav(open) {
    const nav = $('#nav');
    nav.style.setProperty('--nav-top', $('#header').getBoundingClientRect().bottom + 'px');
    nav.classList.toggle('is-open', open);
    $('#burger').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('lock', open);
  }

  function closeNav() {
    if ($('#nav').classList.contains('is-open')) toggleNav(false);
  }

  /* ---------- избранное ---------- */

  function toggleFav(id, btn) {
    if (favs.has(id)) favs.delete(id); else favs.add(id);
    mine.set('favs', Array.from(favs));
    const on = favs.has(id);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
    updateCounts();
    renderChips();
    if (state.cat === 'fav') renderCatalog();
    if (on) toast('Добавлено в избранное');
  }

  /* ---------- корзина ---------- */

  const checkout = { view: 'cart', draft: { phone: '+998 ', delivery: 'courier' }, last: null };

  function saveCart() {
    mine.set('cart', cart);
    updateCounts();
  }

  function cartLines() {
    return cart.map((x) => Object.assign({}, x, { p: byId(x.id) })).filter((x) => x.p && !isOut(x.p));
  }

  function maxQty(p) {
    return Math.min(20, p.stock !== null ? Math.max(1, p.stock) : 20);
  }

  function addToCart(id, size, color, qty, opts) {
    const p = byId(id);
    if (!p || isOut(p)) return;
    if (color == null && p.colors[0]) color = p.colors[0].name;
    const key = [id, size || '', color || ''].join('|');
    const line = cart.find((x) => x.key === key);
    if (line) line.qty = Math.min(line.qty + (qty || 1), maxQty(p));
    else cart.push({ key, id, size: size || '', color: color || '', qty: qty || 1 });
    saveCart();
    bump($('#cartBtn'));
    if (!(opts && opts.silent)) toast(`«${p.title}» — в корзине`);
    if (!$('#cartDrawer').hidden) renderCart();
  }

  // Смена размера/цвета прямо в корзине; одинаковые строки склеиваются
  function changeLine(key, field, value) {
    const line = cart.find((x) => x.key === key);
    if (!line) return;
    line[field] = value;
    line.key = [line.id, line.size, line.color].join('|');
    const twin = cart.find((x) => x !== line && x.key === line.key);
    if (twin) {
      twin.qty = Math.min(twin.qty + line.qty, maxQty(byId(line.id)));
      cart = cart.filter((x) => x !== line);
    }
    saveCart();
    renderCart();
  }

  function totals(delivery) {
    const subtotal = cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);
    const free = Number(state.settings.freeShippingFrom) || 0;
    const fee = Number(state.settings.deliveryPrice) || 0;
    const shipping = delivery === 'pickup' || !subtotal || (free && subtotal >= free) ? 0 : fee;
    return { subtotal, shipping, total: subtotal + shipping, free };
  }

  function updateCounts() {
    const n = cartLines().reduce((s, l) => s + l.qty, 0);
    const c = $('#cartCount');
    c.textContent = n;
    c.hidden = !n;
    const f = $('#favCount');
    const fn = Array.from(favs).filter(byId).length;
    f.textContent = fn;
    f.hidden = !fn;
  }

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function openCart() {
    if (checkout.view === 'done') checkout.view = 'cart';
    renderCart();
    openLayer($('#cartDrawer'));
  }

  function sumHTML(t, withShipping) {
    return `<div class="sum">
      <div><span>Товары</span><span>${money(t.subtotal)}</span></div>
      ${withShipping ? `<div><span>Доставка</span><span>${t.shipping ? money(t.shipping) : 'бесплатно'}</span></div>` : ''}
      <div class="sum__total"><span>Итого</span><span>${money(withShipping ? t.total : t.subtotal)}</span></div>
    </div>`;
  }

  function renderCart() {
    const body = $('#cartBody');
    const foot = $('#cartFoot');
    const lines = cartLines();
    const title = $('#cartTitle');

    if (checkout.view === 'done') {
      const o = checkout.last || {};
      title.textContent = 'Заказ принят';
      body.innerHTML = `<div class="done">
        <div class="done__icon">${ICON.check}</div>
        <b>Спасибо!<br>Заказ №${esc(o.number || '')}</b>
        <p>Менеджер позвонит в течение 15 минут в рабочее время, чтобы подтвердить размеры и доставку.</p>
        <button class="btn btn--dark" data-close>Продолжить покупки</button>
      </div>`;
      foot.innerHTML = '';
      return;
    }

    if (!lines.length) {
      checkout.view = 'cart';
      title.textContent = 'Корзина';
      body.innerHTML = `<div class="cart-empty">
        <b>Корзина пуста</b>
        Загляните в каталог — там новая коллекция.
        <br><button class="btn btn--dark" data-close data-go="all">Перейти в каталог</button>
      </div>`;
      foot.innerHTML = '';
      return;
    }

    if (checkout.view === 'checkout') {
      renderCheckout(body, foot);
      return;
    }

    title.textContent = 'Корзина';
    body.innerHTML = lines.map((l) => {
      const p = l.p;
      const key = esc(l.key);
      const sizeSel = p.sizes.length > 1
        ? `<select data-line-size="${key}" aria-label="Размер">${p.sizes.map((s) => `<option${s === l.size ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>`
        : (l.size ? `<span class="card__cat">${esc(l.size)}</span>` : '');
      const colorSel = p.colors.length > 1
        ? `<select data-line-color="${key}" aria-label="Цвет">${p.colors.map((c) => `<option${c.name === l.color ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`
        : (l.color ? `<span class="card__cat">${esc(l.color)}</span>` : '');
      return `<div class="cart-item">
        ${p.images[0] ? `<img src="${esc(img(p.images[0]))}" alt="">` : '<span></span>'}
        <div>
          <div class="cart-item__title">${esc(p.title)}</div>
          <div class="cart-item__meta">${sizeSel}${colorSel}</div>
          <button class="remove" data-line-remove="${key}">Удалить</button>
        </div>
        <div class="cart-item__side">
          <span class="cart-item__price">${money(p.price * l.qty)}</span>
          <span class="qty">
            <button data-line-qty="${key}" data-d="-1" aria-label="Меньше">−</button>
            <span>${l.qty}</span>
            <button data-line-qty="${key}" data-d="1" aria-label="Больше">+</button>
          </span>
        </div>
      </div>`;
    }).join('');

    const t = totals('courier');
    const left = t.free - t.subtotal;
    const ship = t.free
      ? `<div class="ship${left <= 0 ? ' is-free' : ''}">
          ${left > 0 ? `До бесплатной доставки — ещё ${money(left)}` : 'Доставка по Ташкенту — бесплатно'}
          <div class="ship__bar"><i style="transform:scaleX(${Math.min(1, t.subtotal / t.free)})"></i></div>
        </div>`
      : '';
    foot.innerHTML = `${ship}${sumHTML(t, false)}<button class="btn btn--dark btn--wide" data-checkout>Оформить заказ ${ICON.arrow}</button>`;
  }

  function renderCheckout(body, foot) {
    const d = checkout.draft;
    $('#cartTitle').textContent = 'Оформление';
    body.innerHTML = `
      <button class="back" data-back>${ICON.back} Вернуться в корзину</button>
      <form class="form" id="checkoutForm" novalidate>
        <label class="field" data-field="name">Имя
          <input name="name" autocomplete="name" value="${esc(d.name || '')}" placeholder="Как к вам обращаться">
        </label>
        <label class="field" data-field="phone">Телефон
          <input name="phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(d.phone || '+998 ')}" placeholder="+998 90 123-45-67">
        </label>
        <div class="field">Получение
          <div class="radios">
            <label class="radio"><input type="radio" name="delivery" value="courier"${d.delivery !== 'pickup' ? ' checked' : ''}>Курьером<small>по Ташкенту, 1 день</small></label>
            <label class="radio"><input type="radio" name="delivery" value="pickup"${d.delivery === 'pickup' ? ' checked' : ''}>Самовывоз<small>из магазина</small></label>
          </div>
        </div>
        <label class="field" data-field="address"${d.delivery === 'pickup' ? ' hidden' : ''}>Адрес доставки
          <input name="address" autocomplete="street-address" value="${esc(d.address || '')}" placeholder="Район, улица, дом, квартира">
        </label>
        <label class="field">Комментарий
          <textarea name="comment" placeholder="Удобное время, ориентир…">${esc(d.comment || '')}</textarea>
        </label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="form__note">Оплата при получении — наличными или картой. Нажимая кнопку, вы соглашаетесь на обработку контактных данных.</p>
      </form>`;
    renderCheckoutFoot(foot);
  }

  function renderCheckoutFoot(foot) {
    const t = totals(checkout.draft.delivery);
    (foot || $('#cartFoot')).innerHTML = `${sumHTML(t, true)}<button class="btn btn--dark btn--wide" type="submit" form="checkoutForm">Подтвердить заказ</button>`;
  }

  function formatPhone(v) {
    let d = String(v).replace(/\D/g, '');
    if (d.startsWith('998')) d = d.slice(3);
    d = d.slice(0, 9);
    let out = '+998 ' + d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += '-' + d.slice(5, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    return out;
  }

  function fieldError(form, name, msg) {
    const f = $(`[data-field="${name}"]`, form);
    if (!f) return;
    f.classList.toggle('is-error', !!msg);
    const old = $('small', f);
    if (old) old.remove();
    if (msg) f.insertAdjacentHTML('beforeend', `<small>${esc(msg)}</small>`);
  }

  async function submitOrder(form) {
    const d = checkout.draft;
    const errors = {
      name: (d.name || '').trim().length < 2 ? 'Укажите имя' : '',
      phone: String(d.phone || '').replace(/\D/g, '').length !== 12 ? 'Номер в формате +998 XX XXX-XX-XX' : '',
      address: d.delivery !== 'pickup' && (d.address || '').trim().length < 5 ? 'Укажите адрес' : '',
    };
    Object.keys(errors).forEach((k) => fieldError(form, k, errors[k]));
    const firstBad = Object.keys(errors).find((k) => errors[k]);
    if (firstBad) {
      const input = $(`[name="${firstBad}"]`, form);
      if (input) input.focus();
      return;
    }

    const lines = cartLines();
    const t = totals(d.delivery);
    const order = {
      customer: {
        name: d.name.trim(),
        phone: d.phone,
        delivery: d.delivery === 'pickup' ? 'pickup' : 'courier',
        address: d.delivery === 'pickup' ? '' : (d.address || '').trim(),
        comment: (d.comment || '').trim(),
      },
      items: lines.map((l) => ({ id: l.id, title: l.p.title, size: l.size, color: l.color, qty: l.qty, price: l.p.price })),
      subtotal: t.subtotal,
      shipping: t.shipping,
      total: t.total,
      website: $('[name="website"]', form).value,
    };

    const btn = $('#cartFoot [type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Отправляем…';
    try {
      checkout.last = await Store.createOrder(order);
      cart = [];
      saveCart();
      checkout.view = 'done';
      checkout.draft = { phone: d.phone, name: d.name, delivery: d.delivery, address: d.address };
      renderCart();
    } catch (e) {
      toast(e.message || 'Не удалось отправить заказ');
      btn.disabled = false;
      btn.textContent = 'Подтвердить заказ';
    }
  }

  /* ---------- уведомления ---------- */

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
  }

  /* ---------- события ---------- */

  function bind() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, a, [data-close]');
      if (!t) {
        if (!e.target.closest('.spot-pop')) {
          const pop = $('.spot-pop');
          if (pop) toggleSpot(Number(pop.dataset.i));
        }
        return;
      }
      const ds = t.dataset;

      if (ds.go !== undefined) {
        e.preventDefault();
        const layer = t.closest('.modal, .drawer');
        if (layer) closeLayer(layer);
        go(ds.go);
        return;
      }
      if (ds.close !== undefined) { closeLayer(t.closest('.modal, .drawer')); return; }
      if (ds.open) { e.preventDefault(); openProduct(ds.open); return; }
      if (ds.fav) { toggleFav(ds.fav, t); return; }
      if (ds.quick) { addToCart(ds.quick, ds.size); return; }
      if (ds.filter) { setFilter(ds.filter); return; }
      if (ds.slide) { goSlide(Number(ds.slide)); return; }
      if (ds.spot !== undefined) { toggleSpot(Number(ds.spot)); return; }
      if (ds.lookAdd) {
        const p = byId(ds.lookAdd);
        addToCart(p.id, defaultSize(p));
        return;
      }

      if (ds.pmImg !== undefined) { pm.img = Number(ds.pmImg); renderPM(); return; }
      if (ds.pmSize !== undefined) { pm.size = ds.pmSize; renderPM(); return; }
      if (ds.pmColor !== undefined) { pm.color = ds.pmColor; renderPM(); return; }
      if (ds.pmAdd !== undefined) { pmAdd(); return; }

      if (ds.lineRemove) { cart = cart.filter((x) => x.key !== ds.lineRemove); saveCart(); renderCart(); return; }
      if (ds.lineQty) {
        const line = cart.find((x) => x.key === ds.lineQty);
        if (line) {
          line.qty = Math.max(1, Math.min(maxQty(byId(line.id)), line.qty + Number(ds.d)));
          saveCart();
          renderCart();
        }
        return;
      }
      if (ds.checkout !== undefined) { checkout.view = 'checkout'; renderCart(); $('#cartBody').scrollTop = 0; return; }
      if (ds.back !== undefined) { checkout.view = 'cart'; renderCart(); return; }
      if (t.id === 'lookAdd') addLook();
    });

    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.lineSize) changeLine(t.dataset.lineSize, 'size', t.value);
      if (t.dataset.lineColor) changeLine(t.dataset.lineColor, 'color', t.value);
      if (t.name === 'delivery') {
        checkout.draft.delivery = t.value;
        $('[data-field="address"]').hidden = t.value === 'pickup';
        renderCheckoutFoot();
      }
    });

    document.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.closest('#checkoutForm')) return;
      if (t.name === 'phone') t.value = formatPhone(t.value);
      if (t.name in { name: 1, phone: 1, address: 1, comment: 1 }) {
        checkout.draft[t.name] = t.value;
        if (t.closest('.is-error')) fieldError(t.form, t.name, '');
      }
    });

    document.addEventListener('submit', (e) => {
      if (e.target.id === 'checkoutForm') {
        e.preventDefault();
        submitOrder(e.target);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = $$('.modal:not([hidden]), .drawer:not([hidden])').pop();
      if (open) closeLayer(open);
      else closeNav();
    });

    $('#burger').addEventListener('click', () => toggleNav(!$('#nav').classList.contains('is-open')));
    $('#cartBtn').addEventListener('click', openCart);
    $('#favBtn').addEventListener('click', () => go('fav'));
    $('#searchBtn').addEventListener('click', () => {
      $('#catalog').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => $('#searchInput').focus({ preventScroll: true }), 450);
    });
    $('#moreBtn').addEventListener('click', () => { state.shown += PAGE; renderCatalog(true); });
    $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; state.shown = PAGE; renderCatalog(); });

    let searchTimer = null;
    $('#searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.q = e.target.value; state.shown = PAGE; renderCatalog(); }, 160);
    });

    // баннер: стрелки, пауза при наведении, свайп на телефоне
    $('#heroPrev').addEventListener('click', () => goSlide(hero.i - 1));
    $('#heroNext').addEventListener('click', () => goSlide(hero.i + 1));
    const heroEl = $('#hero');
    heroEl.addEventListener('mouseenter', () => heroPause('hover', true));
    heroEl.addEventListener('mouseleave', () => heroPause('hover', false));
    let touchX = null;
    heroEl.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    heroEl.addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) goSlide(hero.i + (dx < 0 ? 1 : -1));
      touchX = null;
    });
    document.addEventListener('visibilitychange', () => heroPause('tab', document.hidden));

    // хиты: прокрутка стрелками
    const rail = $('#hitsRail');
    $('#hitsPrev').addEventListener('click', () => rail.scrollBy({ left: -rail.clientWidth * 0.8, behavior: 'smooth' }));
    $('#hitsNext').addEventListener('click', () => rail.scrollBy({ left: rail.clientWidth * 0.8, behavior: 'smooth' }));

    // образ: подсветка точки при наведении на строку и наоборот
    const lookSync = (e, on) => {
      const el = e.target.closest('[data-spot], [data-spot-item]');
      if (el) hotSpot(el.dataset.spot !== undefined ? el.dataset.spot : el.dataset.spotItem, on);
    };
    $('#look').addEventListener('mouseover', (e) => lookSync(e, true));
    $('#look').addEventListener('mouseout', (e) => lookSync(e, false));

    // тень у шапки после прокрутки
    const header = $('#header');
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    window.addEventListener('hashchange', openFromHash);
  }

  /* ---------- анимации: появление и пауза вне экрана ---------- */

  function observe() {
    if (!('IntersectionObserver' in window)) {
      $$('[data-reveal]').forEach((el) => el.classList.add('is-in'));
      return;
    }
    const reveal = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        reveal.unobserve(en.target);
      }
    }), { rootMargin: '0px 0px -8% 0px' });
    $$('[data-reveal]').forEach((el) => reveal.observe(el));

    // бесконечные анимации останавливаем, когда их не видно — экономим батарею и FPS
    const offscreen = new IntersectionObserver((entries) => entries.forEach((en) => {
      en.target.classList.toggle('anim-off', !en.isIntersecting);
      if (en.target.id === 'hero') heroPause('offscreen', !en.isIntersecting);
    }));
    ['.marquee', '#hero', '#lookMedia'].forEach((s) => { const el = $(s); if (el) offscreen.observe(el); });
  }

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && byId(id)) openProduct(id);
  }

  /* ---------- запуск ---------- */

  async function init() {
    await Store.init({ base: '' });
    try {
      const [products, settings] = await Promise.all([Store.products(), Store.settings()]);
      state.products = products;
      state.settings = settings || {};
    } catch (e) {
      console.error(e);
      toast('Не удалось загрузить каталог — обновите страницу');
    }
    state.map = new Map(state.products.map((p) => [p.id, p]));

    renderBasics();
    renderHero();
    renderCats();
    renderChips();
    renderCatalog();
    renderLook();
    renderHits();
    renderPromo();
    renderContacts();
    updateCounts();
    bind();
    observe();
    openFromHash();
  }

  init();
})();
