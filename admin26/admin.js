/* odejda — панель управления (/admin26) */
(function () {
  'use strict';

  const { esc, money, img } = Store.util;
  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));

  const VIEWS = {
    products: 'Товары',
    orders: 'Заказы',
    home: 'Главная страница',
    contacts: 'Контакты',
    access: 'Доступы',
  };

  const LINKS = [
    ['all', 'Каталог — все товары'],
    ['women', 'Раздел «Женщинам»'],
    ['men', 'Раздел «Мужчинам»'],
    ['shoes', 'Раздел «Обувь»'],
    ['accessories', 'Раздел «Аксессуары»'],
    ['new', 'Новинки'],
    ['sale', 'Скидки'],
    ['look', 'Образ недели'],
  ];

  const SIZE_GROUPS = [
    { name: 'Одежда', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { name: 'Обувь', sizes: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] },
    { name: 'Без размера', sizes: ['ONE SIZE'] },
  ];
  const PRESET_SIZES = SIZE_GROUPS.flatMap((g) => g.sizes);

  const ICON = {
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  const A = {
    user: null,
    view: 'products',
    products: [],
    settings: {},
    orders: [],
    q: '',
    cat: '',
    orderFilter: 'all',
    draft: null, // товар в редакторе
    isNew: false,
    dirty: false,
    uploading: 0,
    form: null, // настройки, которые редактируются на текущей странице
    activeSpot: 0,
    editLogin: null,
  };

  /* ---------- общее ---------- */

  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('is-error', !!isError);
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), isError ? 4200 : 2600);
  }

  // Все обращения к данным — через guard: истёкшая сессия возвращает на экран входа
  async function guard(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e.status === 401 || /Сессия истекла/.test(e.message)) {
        showLogin('Сессия истекла — войдите снова');
      } else {
        toast(e.message || 'Что-то пошло не так', true);
      }
      return undefined;
    }
  }

  function digits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function options(list, value) {
    return list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('');
  }

  function productOptions(value) {
    return '<option value="">— без товара —</option>' + options(A.products.map((p) => [p.id, p.title]), value);
  }

  function setActions(html) {
    $('#viewActions').innerHTML = html;
  }

  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function pickFile(accept, multiple) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = !!multiple;
      input.onchange = () => resolve(Array.from(input.files || []));
      input.click();
    });
  }

  function genPassword() {
    const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789#%+=';
    const bytes = crypto.getRandomValues(new Uint8Array(14));
    return Array.from(bytes, (b) => abc[b % abc.length]).join('');
  }

  // путь вида "hero.0.title" → запись в объект формы
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    keys.slice(0, -1).forEach((k, i) => {
      if (cur[k] == null) cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      cur = cur[k];
    });
    cur[keys[keys.length - 1]] = value;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
  }

  /* ---------- вход ---------- */

  function showLogin(message) {
    A.user = null;
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    const err = $('#loginError');
    err.hidden = !message;
    err.textContent = message || '';
    closeEditor(true);
    setTimeout(() => $('#loginForm [name="login"]').focus(), 50);
  }

  async function enter(user) {
    A.user = user;
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    $('#meAvatar').textContent = initials(user.name);
    $('#meName').textContent = user.name;
    $('#meRole').textContent = (Store.ROLES[user.role] || user.role) + ' · ' + user.login;
    await loadAll();
    route();
  }

  async function loadAll() {
    await guard(async () => {
      const [products, settings] = await Promise.all([Store.products({ all: true }), Store.settings()]);
      A.products = products;
      A.settings = settings || {};
      A.orders = (await Store.orders()) || [];
    });
    updateOrderBadge();
  }

  function updateOrderBadge() {
    const n = A.orders.filter((o) => o.status === 'new').length;
    const b = $('#newOrders');
    b.textContent = n;
    b.hidden = !n;
  }

  /* ---------- маршрутизация ---------- */

  function route() {
    if (!A.user) return;
    const v = location.hash.slice(1);
    A.view = VIEWS[v] ? v : 'products';
    $$('#sideNav a').forEach((a) => a.classList.toggle('is-active', a.dataset.view === A.view));
    $('#viewTitle').textContent = VIEWS[A.view];
    $('#side').classList.remove('is-open');
    A.form = null;
    ({ products: viewProducts, orders: viewOrders, home: viewHome, contacts: viewContacts, access: viewAccess })[A.view]();
    window.scrollTo(0, 0);
  }

  /* ==========================================================================
     Товары
     ========================================================================== */

  function viewProducts() {
    const owner = A.user.role === 'owner';
    setActions(`
      ${owner ? '<button class="btn btn--line" data-act="export">Экспорт</button><button class="btn btn--line" data-act="import">Импорт</button>' : ''}
      <button class="btn btn--dark" data-act="add">${ICON.plus}Добавить товар</button>`);

    const total = A.products.length;
    const hidden = A.products.filter((p) => !p.visible).length;
    const out = A.products.filter((p) => p.stock !== null && p.stock <= 0).length;
    const low = A.products.filter((p) => p.stock !== null && p.stock > 0 && p.stock <= 3).length;

    $('#content').innerHTML = `
      <div class="stats">
        <span class="stat"><b>${total}</b>всего</span>
        <span class="stat"><b>${total - hidden}</b>на сайте</span>
        ${hidden ? `<span class="stat"><b>${hidden}</b>скрыто</span>` : ''}
        ${low ? `<span class="stat"><b>${low}</b>заканчиваются</span>` : ''}
        ${out ? `<span class="stat"><b>${out}</b>нет в наличии</span>` : ''}
      </div>
      <div class="filters">
        <input class="input" type="search" id="pq" placeholder="Поиск по названию…" value="${esc(A.q)}">
        <select class="input" id="pcat">${options([['', 'Все разделы']].concat(Store.CATEGORIES.map((c) => [c.id, c.name])), A.cat)}</select>
      </div>
      <div id="ptable"></div>`;
    renderProductTable();
  }

  function renderProductTable() {
    const q = A.q.trim().toLowerCase();
    const list = A.products.filter((p) => (!A.cat || p.category === A.cat) && (!q || p.title.toLowerCase().includes(q)));
    const box = $('#ptable');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = `<div class="empty"><b>${A.products.length ? 'Ничего не найдено' : 'Товаров пока нет'}</b>${A.products.length ? 'Измените поиск или раздел.' : 'Нажмите «Добавить товар», чтобы создать первый.'}</div>`;
      return;
    }
    box.innerHTML = `<table class="table">
      <thead><tr><th>Фото</th><th>Товар</th><th>Раздел</th><th>Цена</th><th>Остаток</th><th>На сайте</th><th></th></tr></thead>
      <tbody>${list.map(rowHTML).join('')}</tbody>
    </table>`;
  }

  function rowHTML(p) {
    const id = esc(p.id);
    const labels = [];
    if (p.isNew) labels.push('<span class="label label--new">Новинка</span>');
    if (p.isHit) labels.push('<span class="label label--hit">Хит</span>');
    if (p.oldPrice && p.oldPrice > p.price) labels.push(`<span class="label label--sale">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>`);
    if (p.stock !== null && p.stock <= 0) labels.push('<span class="label label--out">Нет в наличии</span>');
    const stock = p.stock === null ? '<span class="muted">—</span>' : (p.stock <= 3 ? `<span class="stock-low">${p.stock} шт</span>` : `${p.stock} шт`);
    return `<tr class="${p.visible ? '' : 'is-hidden'}">
      <td>${p.images[0] ? `<img class="t-thumb" src="${esc(img(p.images[0]))}" alt="" loading="lazy">` : '<div class="t-thumb"></div>'}</td>
      <td><div class="t-title" data-edit="${id}">${esc(p.title)}</div><div class="t-sub">${labels.join('')}</div></td>
      <td>${esc(Store.categoryName(p.category))}</td>
      <td class="t-price">${money(p.price)}${p.oldPrice && p.oldPrice > p.price ? `<s>${money(p.oldPrice)}</s>` : ''}</td>
      <td>${stock}</td>
      <td><label class="switch" title="${p.visible ? 'Скрыть с сайта' : 'Показать на сайте'}"><input type="checkbox" data-visible="${id}"${p.visible ? ' checked' : ''}><i></i></label></td>
      <td><div class="t-actions">
        <button class="icon-btn" data-edit="${id}" title="Редактировать" aria-label="Редактировать">${ICON.edit}</button>
        <button class="icon-btn" data-dup="${id}" title="Сделать копию" aria-label="Сделать копию">${ICON.copy}</button>
        <button class="icon-btn danger" data-del="${id}" title="Удалить" aria-label="Удалить">${ICON.trash}</button>
      </div></td>
    </tr>`;
  }

  function findProduct(id) {
    return A.products.find((p) => p.id === id);
  }

  function upsertLocal(p) {
    const i = A.products.findIndex((x) => x.id === p.id);
    if (i >= 0) A.products[i] = p;
    else A.products.unshift(p);
  }

  async function toggleVisible(id, visible) {
    const p = findProduct(id);
    if (!p) return;
    const saved = await guard(() => Store.saveProduct(Object.assign({}, p, { visible })));
    if (saved) {
      upsertLocal(saved);
      toast(visible ? 'Товар снова на сайте' : 'Товар скрыт с сайта');
    }
    viewProducts();
  }

  async function deleteProduct(id) {
    const p = findProduct(id);
    if (!p || !confirm(`Удалить «${p.title}»? Это действие нельзя отменить.\n\nЕсли товар просто закончился — лучше выключить «На сайте».`)) return;
    const ok = await guard(async () => { await Store.deleteProduct(id); return true; });
    if (ok) {
      A.products = A.products.filter((x) => x.id !== id);
      closeEditor(true);
      toast('Товар удалён');
      viewProducts();
    }
  }

  /* ---------- редактор товара ---------- */

  function openEditor(p, asCopy) {
    if (p) {
      A.draft = JSON.parse(JSON.stringify(p));
      if (asCopy) Object.assign(A.draft, { id: '', title: p.title + ' (копия)', visible: false, createdAt: '' });
    } else {
      A.draft = {
        id: '', title: '', category: A.cat || 'women', price: '', oldPrice: '', images: [],
        sizes: ['S', 'M', 'L'], colors: [{ name: 'Чёрный', hex: '#1a1a1a' }],
        description: '', stock: '', isNew: true, isHit: false, visible: true,
      };
    }
    ['price', 'oldPrice', 'stock'].forEach((k) => { if (A.draft[k] == null) A.draft[k] = ''; });
    A.isNew = !A.draft.id;
    A.dirty = false;
    renderEditor();
    const el = $('#editor');
    el.hidden = false;
    document.body.classList.add('lock');
    $('.drawer__body', el).scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  }

  function closeEditor(force) {
    const el = $('#editor');
    if (el.hidden) return;
    if (!force && A.dirty && !confirm('Закрыть без сохранения изменений?')) return;
    el.classList.remove('is-open');
    setTimeout(() => { el.hidden = true; document.body.classList.remove('lock'); }, 380);
    A.draft = null;
  }

  function renderEditor() {
    const d = A.draft;
    $('#editorTitle').textContent = A.isNew ? 'Новый товар' : 'Редактирование товара';
    const custom = d.sizes.filter((s) => !PRESET_SIZES.includes(s));
    $('#editorBody').innerHTML = `
      <div class="section-title">Фото</div>
      <div class="photos" id="photos"></div>
      <div class="url-row">
        <input class="input" id="imgUrl" placeholder="…или вставьте ссылку на фото: https://…">
        <button type="button" class="btn btn--line" data-img-url>Добавить</button>
      </div>
      <p class="hint" style="margin:-6px 0 0">Первое фото — главное, второе показывается при наведении на карточку. Лучше всего вертикальные снимки 4:5. Фото можно перетащить сюда мышкой.</p>

      <div class="section-title">Основное</div>
      <label class="field" data-f="title">Название
        <input name="title" maxlength="120" value="${esc(d.title)}" placeholder="Например: Пальто из шерсти оверсайз">
      </label>
      <div class="row" style="--cols:3">
        <label class="field">Раздел
          <select name="category">${options(Store.CATEGORIES.map((c) => [c.id, c.name]), d.category)}</select>
        </label>
        <label class="field" data-f="price">Цена, сум
          <input name="price" type="number" min="0" step="1000" inputmode="numeric" value="${esc(d.price)}">
        </label>
        <label class="field" data-f="oldPrice">Старая цена
          <input name="oldPrice" type="number" min="0" step="1000" inputmode="numeric" value="${esc(d.oldPrice)}">
          <small>заполните, если товар со скидкой</small>
        </label>
      </div>
      <div class="row" style="--cols:3">
        <label class="field">Остаток, шт
          <input name="stock" type="number" min="0" step="1" inputmode="numeric" value="${esc(d.stock)}">
          <small>пусто — без ограничений</small>
        </label>
      </div>

      <div class="section-title">Размеры</div>
      <div class="size-groups">
        ${SIZE_GROUPS.map((g) => `<div><small class="hint">${g.name}</small><div class="toggles">${g.sizes.map((s) => sizeToggle(s)).join('')}</div></div>`).join('')}
        <div><small class="hint">Свои размеры</small>
          <div class="toggles">${custom.map((s) => sizeToggle(s)).join('')}
            <input class="input" id="customSize" placeholder="Напр. 42-44" style="width:140px;height:38px">
            <button type="button" class="btn btn--line btn--sm" data-size-add>Добавить</button>
          </div>
        </div>
      </div>

      <div class="section-title">Цвета</div>
      <div class="colors" id="colors"></div>
      <div><button type="button" class="btn btn--line btn--sm" data-color-add>${ICON.plus}Добавить цвет</button></div>

      <div class="section-title">Описание</div>
      <label class="field">
        <textarea name="description" rows="4" maxlength="2000" placeholder="Ткань, посадка, состав, уход…">${esc(d.description)}</textarea>
      </label>

      <div class="flags">
        <label class="switch"><input type="checkbox" name="isNew"${d.isNew ? ' checked' : ''}><i></i>Новинка</label>
        <label class="switch"><input type="checkbox" name="isHit"${d.isHit ? ' checked' : ''}><i></i>Хит продаж</label>
        <label class="switch"><input type="checkbox" name="visible"${d.visible ? ' checked' : ''}><i></i>Показывать на сайте</label>
      </div>`;
    renderPhotos();
    renderColors();
    $('#editorFoot').innerHTML = `
      ${A.isNew ? '' : `<button type="button" class="btn btn--danger" data-del="${esc(d.id)}">${ICON.trash}Удалить</button>`}
      ${A.isNew ? '' : `<a class="btn btn--line" href="../#${esc(d.id)}" target="_blank" rel="noopener">На сайте ↗</a>`}
      <span class="spacer"></span>
      <button type="button" class="btn btn--line" data-close>Отмена</button>
      <button type="submit" class="btn btn--dark">Сохранить</button>`;
  }

  function sizeToggle(s) {
    const on = A.draft.sizes.includes(s);
    return `<button type="button" class="toggle${on ? ' is-on' : ''}" data-size="${esc(s)}" aria-pressed="${on}">${esc(s)}</button>`;
  }

  function renderPhotos() {
    const d = A.draft;
    const box = $('#photos');
    if (!box) return;
    box.innerHTML = d.images.map((src, i) => `<div class="photo">
        <img src="${esc(img(src))}" alt="">
        ${i === 0 ? '<span class="photo__main">Главное</span>' : ''}
        <div class="photo__tools">
          <button type="button" data-img-move="${i}" data-d="-1" aria-label="Левее"${i === 0 ? ' disabled' : ''}>‹</button>
          <button type="button" data-img-del="${i}" aria-label="Удалить фото">×</button>
          <button type="button" data-img-move="${i}" data-d="1" aria-label="Правее"${i === d.images.length - 1 ? ' disabled' : ''}>›</button>
        </div>
      </div>`).join('')
      + Array.from({ length: A.uploading }, () => '<div class="photo photo--loading">Загрузка…</div>').join('')
      + `<button type="button" class="drop" data-img-upload>${ICON.upload}<span>Загрузить фото</span></button>`;
  }

  function renderColors() {
    $('#colors').innerHTML = A.draft.colors.map((c, i) => `<div class="color-row">
        <input type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#cccccc')}" data-color-hex="${i}" aria-label="Цвет">
        <input class="input" value="${esc(c.name)}" data-color-name="${i}" placeholder="Название цвета">
        <button type="button" class="icon-btn danger" data-color-del="${i}" aria-label="Удалить цвет">${ICON.x}</button>
      </div>`).join('') || '<p class="hint" style="margin:0">Цвета не указаны — на сайте их выбор не появится.</p>';
  }

  async function addFiles(files) {
    const images = files.filter((f) => /^image\//.test(f.type));
    if (!images.length) return;
    for (const f of images) {
      A.uploading++;
      renderPhotos();
      try {
        const url = await Store.uploadImage(f);
        if (A.draft) { A.draft.images.push(url); A.dirty = true; }
      } catch (e) {
        if (e.status === 401) { showLogin('Сессия истекла — войдите снова'); return; }
        toast(e.message, true);
      } finally {
        A.uploading = Math.max(0, A.uploading - 1);
        if (A.draft) renderPhotos();
      }
    }
  }

  function fieldError(name, msg) {
    const f = $(`#editorBody [data-f="${name}"]`);
    if (!f) return;
    f.classList.toggle('is-error', !!msg);
    const old = $('.err', f);
    if (old) old.remove();
    if (msg) f.insertAdjacentHTML('beforeend', `<small class="err">${esc(msg)}</small>`);
  }

  async function saveEditor() {
    const d = A.draft;
    if (A.uploading) { toast('Дождитесь окончания загрузки фото'); return; }
    const price = Number(d.price);
    const oldPrice = d.oldPrice === '' ? null : Number(d.oldPrice);
    const errors = {
      title: d.title.trim().length < 2 ? 'Введите название' : '',
      price: !(price > 0) ? 'Укажите цену' : '',
      oldPrice: oldPrice !== null && oldPrice <= price ? 'Старая цена должна быть больше текущей' : '',
    };
    Object.keys(errors).forEach((k) => fieldError(k, errors[k]));
    if (Object.values(errors).some(Boolean)) { toast('Проверьте выделенные поля', true); return; }
    if (!d.images.length) { toast('Добавьте хотя бы одно фото', true); return; }

    const product = Object.assign({}, d, {
      title: d.title.trim(),
      price,
      oldPrice,
      stock: d.stock === '' ? null : Math.max(0, Math.round(Number(d.stock))),
      colors: d.colors.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), hex: c.hex })),
    });
    const btn = $('#editorFoot [type="submit"]');
    btn.disabled = true;
    const saved = await guard(() => Store.saveProduct(product));
    btn.disabled = false;
    if (!saved) return;
    upsertLocal(saved);
    closeEditor(true);
    toast(A.isNew ? 'Товар добавлен' : 'Изменения сохранены');
    if (A.view === 'products') viewProducts();
  }

  /* ==========================================================================
     Заказы
     ========================================================================== */

  function viewOrders() {
    setActions('<button class="btn btn--line" data-act="reload-orders">Обновить</button>');
    const statuses = [['all', 'Все']].concat(Object.entries(Store.ORDER_STATUSES));
    const count = (s) => (s === 'all' ? A.orders.length : A.orders.filter((o) => o.status === s).length);
    const list = A.orders.filter((o) => A.orderFilter === 'all' || o.status === A.orderFilter);
    $('#content').innerHTML = `
      <div class="chips">${statuses.map(([s, label]) => `<button class="chip${A.orderFilter === s ? ' is-on' : ''}" data-order-filter="${s}">${label}<small>${count(s)}</small></button>`).join('')}</div>
      ${list.length ? `<div class="orders">${list.map(orderHTML).join('')}</div>`
        : `<div class="empty"><b>${A.orders.length ? 'В этом статусе заказов нет' : 'Заказов пока нет'}</b>${A.orders.length ? '' : 'Они появятся здесь, когда покупатели оформят корзину на сайте.'}</div>`}`;
  }

  function orderHTML(o) {
    const c = o.customer || {};
    const items = o.items || [];
    return `<article class="order${o.status === 'new' ? ' is-new' : ''}">
      <div>
        <div class="order__head">
          <b>№ ${esc(o.number)}</b>
          <time>${esc(fmtDate(o.createdAt))}</time>
          <span class="status status--${esc(o.status)}">${esc(Store.ORDER_STATUSES[o.status] || o.status)}</span>
        </div>
        <div class="order__who">${esc(c.name)} · <a href="tel:+${digits(c.phone)}">${esc(c.phone)}</a></div>
        <div class="order__who muted">${c.delivery === 'pickup' ? 'Самовывоз из магазина' : 'Курьер: ' + esc(c.address)}</div>
        ${c.comment ? `<div class="order__who">Комментарий: ${esc(c.comment)}</div>` : ''}
      </div>
      <div>
        <select data-order-status="${esc(o.id)}" aria-label="Статус заказа">${options(Object.entries(Store.ORDER_STATUSES), o.status)}</select>
      </div>
      <div class="order__items">
        ${items.map((i) => `<div><span>${esc(i.title)}${i.size ? ' · ' + esc(i.size) : ''}${i.color ? ' · ' + esc(i.color) : ''} × ${esc(i.qty)}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}
        <div class="order__total"><span>Итого${o.shipping ? ` (доставка ${money(o.shipping)})` : ''}</span><span>${money(o.total)}</span></div>
      </div>
    </article>`;
  }

  async function setOrderStatus(id, status) {
    const ok = await guard(async () => { await Store.setOrderStatus(id, status); return true; });
    if (ok) {
      const o = A.orders.find((x) => x.id === id);
      if (o) o.status = status;
      updateOrderBadge();
      toast('Статус заказа обновлён');
    }
    viewOrders();
  }

  /* ==========================================================================
     Главная: баннер, акция, образ недели
     ========================================================================== */

  function imgField(path, value, wide) {
    return `<div class="img-field${wide ? ' img-field--wide' : ''}">
      <div class="img-field__preview" data-preview="${path}">${value ? `<img src="${esc(img(value))}" alt="">` : 'нет фото'}</div>
      <button type="button" class="btn btn--line btn--sm" data-upload-path="${path}">${ICON.upload}Загрузить</button>
      <input class="input" data-path="${path}" value="${esc(value || '')}" placeholder="или ссылка на фото" style="height:36px;font-size:13px">
    </div>`;
  }

  function viewHome() {
    const s = A.settings;
    A.form = JSON.parse(JSON.stringify({ hero: s.hero || [], promo: s.promo || {}, look: s.look || { spots: [] } }));
    if (!A.form.look.spots) A.form.look.spots = [];
    A.activeSpot = 0;
    setActions('<a class="btn btn--line" href="../" target="_blank" rel="noopener">Посмотреть сайт ↗</a>');
    renderHome();
  }

  function renderHome() {
    const f = A.form;
    $('#content').innerHTML = `
      <div class="card">
        <h2>Баннер на первом экране</h2>
        <p class="muted">Слайды сменяются автоматически каждые 7 секунд. Слово в звёздочках — <code>*так*</code> — выделится курсивом и цветом.</p>
        <div class="slides">${f.hero.map(slideHTML).join('')}</div>
        ${f.hero.length < 5 ? `<button type="button" class="btn btn--line btn--sm" data-slide-add style="margin-top:12px">${ICON.plus}Добавить слайд</button>` : ''}
      </div>

      <div class="card">
        <h2>Акция с таймером</h2>
        <p class="muted">Блок скрывается сам, когда дата окончания прошла. Чтобы убрать акцию сразу — очистите заголовок.</p>
        <div class="slide" style="grid-template-columns:220px 1fr">
          ${imgField('promo.image', f.promo.image, true)}
          <div class="stack">
            <label class="field">Надзаголовок<input data-path="promo.eyebrow" value="${esc(f.promo.eyebrow || '')}"></label>
            <label class="field">Заголовок<input data-path="promo.title" value="${esc(f.promo.title || '')}" placeholder="−30% на *трикотаж*"></label>
            <label class="field">Текст<textarea data-path="promo.text" rows="2">${esc(f.promo.text || '')}</textarea></label>
            <div class="row">
              <label class="field">Акция до<input type="datetime-local" data-path="promo.endsAt" value="${esc(f.promo.endsAt || '')}"></label>
              <label class="field">Кнопка ведёт в<select data-path="promo.link">${options(LINKS, f.promo.link || 'sale')}</select></label>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Образ недели</h2>
        <p class="muted">Фото с точками-товарами. Выберите точку в списке и кликните по фото — она переместится туда.</p>
        <div class="look-edit">
          <div class="stack">
            <div class="look-canvas" id="lookCanvas">
              ${f.look.image ? `<img src="${esc(img(f.look.image))}" alt="">` : '<div class="img-field__preview">нет фото</div>'}
              <div id="lookDots"></div>
            </div>
            <button type="button" class="btn btn--line btn--sm" data-upload-path="look.image">${ICON.upload}Заменить фото</button>
          </div>
          <div class="stack">
            <label class="field">Заголовок<input data-path="look.title" value="${esc(f.look.title || '')}"></label>
            <label class="field">Текст<textarea data-path="look.text" rows="3">${esc(f.look.text || '')}</textarea></label>
            <div class="field">Точки на фото<div class="stack" id="spotRows" style="gap:8px"></div></div>
            <div><button type="button" class="btn btn--line btn--sm" data-spot-add>${ICON.plus}Добавить точку</button></div>
          </div>
        </div>
      </div>

      <div class="save-bar"><button class="btn btn--dark" data-act="save-settings">Сохранить главную</button></div>`;
    renderSpots();
  }

  function slideHTML(s, i) {
    const n = A.form.hero.length;
    return `<div class="slide">
      <div class="slide__head">
        <span>Слайд ${i + 1}</span>
        <span>
          <button type="button" class="icon-btn" data-slide-move="${i}" data-d="-1" aria-label="Выше"${i === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" class="icon-btn" data-slide-move="${i}" data-d="1" aria-label="Ниже"${i === n - 1 ? ' disabled' : ''}>↓</button>
          <button type="button" class="icon-btn danger" data-slide-del="${i}" aria-label="Удалить слайд"${n < 2 ? ' disabled' : ''}>${ICON.trash}</button>
        </span>
      </div>
      ${imgField(`hero.${i}.image`, s.image)}
      <div class="stack">
        <label class="field">Надзаголовок<input data-path="hero.${i}.eyebrow" value="${esc(s.eyebrow || '')}"></label>
        <label class="field">Заголовок<input data-path="hero.${i}.title" value="${esc(s.title || '')}" placeholder="Носи своё *настроение*"></label>
        <label class="field">Текст<textarea data-path="hero.${i}.text" rows="2">${esc(s.text || '')}</textarea></label>
        <div class="row" style="--cols:3">
          <label class="field">Текст кнопки<input data-path="hero.${i}.button" value="${esc(s.button || '')}"></label>
          <label class="field">Кнопка ведёт в<select data-path="hero.${i}.link">${options(LINKS, s.link || 'all')}</select></label>
          <label class="field">Товар в плашке<select data-path="hero.${i}.productId">${productOptions(s.productId)}</select></label>
        </div>
      </div>
    </div>`;
  }

  function renderDots() {
    const dots = $('#lookDots');
    if (!dots) return;
    dots.innerHTML = A.form.look.spots.map((s, i) => `<span class="dot${i === A.activeSpot ? ' is-active' : ''}" style="left:${Number(s.x) || 50}%;top:${Number(s.y) || 50}%">${i + 1}</span>`).join('');
  }

  function renderSpots() {
    const spots = A.form.look.spots;
    renderDots();
    $('#spotRows').innerHTML = spots.map((s, i) => `<div class="spot-row${i === A.activeSpot ? ' is-active' : ''}">
        <button type="button" class="num" data-spot-pick="${i}" aria-label="Выбрать точку ${i + 1}">${i + 1}</button>
        <select class="input" data-path="look.spots.${i}.productId">${productOptions(s.productId)}</select>
        <input class="input xy" type="number" min="0" max="100" data-type="number" data-path="look.spots.${i}.x" value="${esc(s.x)}" title="X, %">
        <input class="input xy" type="number" min="0" max="100" data-type="number" data-path="look.spots.${i}.y" value="${esc(s.y)}" title="Y, %">
        <button type="button" class="icon-btn danger" data-spot-del="${i}" aria-label="Удалить точку">${ICON.x}</button>
      </div>`).join('') || '<p class="hint" style="margin:0">Точек пока нет.</p>';
  }

  /* ==========================================================================
     Контакты и общие настройки
     ========================================================================== */

  function viewContacts() {
    const s = A.settings;
    const keys = ['storeName', 'announcement', 'phone', 'email', 'address', 'hours', 'telegram', 'instagram', 'whatsapp', 'mapLat', 'mapLon', 'freeShippingFrom', 'deliveryPrice'];
    A.form = {};
    keys.forEach((k) => { A.form[k] = s[k] == null ? '' : s[k]; });
    setActions('');
    const input = (path, label, opts) => {
      const o = opts || {};
      return `<label class="field">${label}
        <input data-path="${path}"${o.number ? ' type="number" data-type="number" step="any"' : ''} value="${esc(A.form[path])}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>
        ${o.hint ? `<small>${o.hint}</small>` : ''}
      </label>`;
    };
    $('#content').innerHTML = `
      <div class="card">
        <h2>Магазин</h2>
        <p class="muted">Название и строка над шапкой сайта.</p>
        <div class="stack">
          ${input('storeName', 'Название магазина', { ph: 'odejda' })}
          ${input('announcement', 'Строка объявления', { hint: 'Оставьте пустой, чтобы скрыть полосу над шапкой' })}
        </div>
      </div>
      <div class="card">
        <h2>Контакты</h2>
        <p class="muted">Показываются в блоке «Контакты» и в подвале сайта.</p>
        <div class="stack">
          <div class="row">${input('phone', 'Телефон', { ph: '+998 90 000-00-00' })}${input('email', 'Почта')}</div>
          <div class="row">${input('address', 'Адрес')}${input('hours', 'Режим работы')}</div>
          <div class="row" style="--cols:3">
            ${input('telegram', 'Telegram', { ph: 'username', hint: 'без @ и ссылки' })}
            ${input('instagram', 'Instagram', { ph: 'username' })}
            ${input('whatsapp', 'WhatsApp', { ph: '998900000000', hint: 'номер цифрами' })}
          </div>
          <div class="row">
            ${input('mapLat', 'Широта на карте', { number: true, hint: 'из Яндекс.Карт: правый клик по точке → «Что здесь?»' })}
            ${input('mapLon', 'Долгота на карте', { number: true })}
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Доставка</h2>
        <p class="muted">Используется в корзине при расчёте итоговой суммы.</p>
        <div class="row">
          ${input('freeShippingFrom', 'Бесплатная доставка от, сум', { number: true, hint: '0 — всегда платная' })}
          ${input('deliveryPrice', 'Стоимость доставки, сум', { number: true })}
        </div>
      </div>
      <div class="save-bar"><button class="btn btn--dark" data-act="save-settings">Сохранить</button></div>`;
  }

  async function saveSettings() {
    const btn = $('[data-act="save-settings"]');
    if (btn) btn.disabled = true;
    const saved = await guard(() => Store.saveSettings(A.form));
    if (btn) btn.disabled = false;
    if (saved) {
      A.settings = saved;
      toast('Сохранено — обновите сайт, чтобы увидеть изменения');
    }
  }

  /* ==========================================================================
     Доступы
     ========================================================================== */

  async function viewAccess() {
    setActions('');
    const u = A.user;
    const owner = u.role === 'owner';
    $('#content').innerHTML = `
      <div class="card">
        <h2>Мой профиль</h2>
        <p class="muted">${esc(u.name)} · логин <b>${esc(u.login)}</b> · ${esc(Store.ROLES[u.role] || u.role)}</p>
        <form class="stack" id="passForm" style="max-width:420px">
          <label class="field">Текущий пароль<input name="old" type="password" autocomplete="current-password" required></label>
          <label class="field">Новый пароль<input name="new" type="password" autocomplete="new-password" minlength="8" required><small>минимум 8 символов</small></label>
          <label class="field">Повторите новый пароль<input name="repeat" type="password" autocomplete="new-password" required></label>
          <div><button class="btn btn--dark" type="submit">Сменить пароль</button></div>
        </form>
      </div>
      ${owner ? `
      <div class="card">
        <h2>Пользователи панели</h2>
        <p class="muted">Владелец управляет всем, менеджер — товарами, заказами и контентом. Вход: <b>${esc(location.origin + location.pathname.replace(/index\.html$/, ''))}</b> — не публикуйте этот адрес на сайте.</p>
        <div class="users" id="users"><p class="hint">Загрузка…</p></div>
      </div>
      <div class="card">
        <h2 id="userFormTitle">Добавить пользователя</h2>
        <p class="muted">Передайте логин и пароль сотруднику лично — в мессенджер, а не в общий чат.</p>
        <form class="stack" id="userForm" style="max-width:560px">
          <div class="row">
            <label class="field">Логин<input name="login" autocomplete="off" pattern="[a-zA-Z0-9._\\-]{3,32}" placeholder="manager1" required><small>латиница, цифры, точка, дефис</small></label>
            <label class="field">Имя<input name="name" placeholder="Азиз" required></label>
          </div>
          <div class="row">
            <label class="field">Роль<select name="role">${options(Object.entries(Store.ROLES), 'manager')}</select></label>
            <label class="field">Пароль
              <span class="url-row"><input class="input" name="password" autocomplete="new-password" placeholder="минимум 8 символов"><button type="button" class="btn btn--line" data-gen>Создать</button></span>
              <small id="passHint">для нового пользователя обязателен</small>
            </label>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn--dark" type="submit">Сохранить пользователя</button>
            <button class="btn btn--line" type="button" data-user-cancel hidden>Отмена</button>
          </div>
        </form>
      </div>` : ''}`;
    if (owner) await renderUsers();
  }

  async function renderUsers() {
    const list = await guard(() => Store.accounts());
    const box = $('#users');
    if (!box || !list) return;
    box.innerHTML = list.map((a) => `<div class="user">
        <div class="me__avatar">${esc(initials(a.name))}</div>
        <div class="user__text"><b>${esc(a.name)}${a.login === A.user.login ? ' (вы)' : ''}</b><small>${esc(a.login)} · ${esc(Store.ROLES[a.role] || a.role)}</small></div>
        <button class="btn btn--line btn--sm" data-user-edit="${esc(a.login)}" data-name="${esc(a.name)}" data-role="${esc(a.role)}">Изменить</button>
        ${a.login === A.user.login ? '' : `<button class="icon-btn danger" data-user-del="${esc(a.login)}" aria-label="Удалить">${ICON.trash}</button>`}
      </div>`).join('');
  }

  function resetUserForm() {
    const f = $('#userForm');
    if (!f) return;
    f.reset();
    A.editLogin = null;
    f.login.readOnly = false;
    $('#userFormTitle').textContent = 'Добавить пользователя';
    $('#passHint').textContent = 'для нового пользователя обязателен';
    $('[data-user-cancel]').hidden = true;
  }

  /* ==========================================================================
     События
     ========================================================================== */

  function bind() {
    window.addEventListener('hashchange', route);

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = $('[type="submit"]', f);
      btn.disabled = true;
      $('#loginError').hidden = true;
      try {
        const user = await Store.login(f.login.value, f.password.value);
        f.password.value = '';
        await enter(user);
      } catch (err) {
        $('#loginError').textContent = err.message || 'Не удалось войти';
        $('#loginError').hidden = false;
      }
      btn.disabled = false;
    });

    $('#logoutBtn').addEventListener('click', async () => {
      await guard(() => Store.logout());
      showLogin();
    });

    $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#side').classList.toggle('is-open'); });

    document.addEventListener('click', async (e) => {
      const side = $('#side');
      if (side.classList.contains('is-open') && !e.target.closest('#side')) side.classList.remove('is-open');

      const t = e.target.closest('button, [data-close], [data-edit]');
      if (!t) {
        // клик по фото образа — переносим активную точку
        const canvas = e.target.closest('#lookCanvas');
        if (canvas && A.form && A.form.look.spots[A.activeSpot]) {
          const r = canvas.getBoundingClientRect();
          const spot = A.form.look.spots[A.activeSpot];
          spot.x = Math.round(((e.clientX - r.left) / r.width) * 100);
          spot.y = Math.round(((e.clientY - r.top) / r.height) * 100);
          renderSpots();
        }
        return;
      }
      const ds = t.dataset;

      if (ds.eye !== undefined) {
        const input = t.parentElement.querySelector('input');
        input.type = input.type === 'password' ? 'text' : 'password';
        return;
      }
      if (ds.close !== undefined) { closeEditor(); return; }

      // товары
      if (ds.act === 'add') { openEditor(null); return; }
      if (ds.edit) { openEditor(findProduct(ds.edit)); return; }
      if (ds.dup) { openEditor(findProduct(ds.dup), true); return; }
      if (ds.del) { deleteProduct(ds.del); return; }
      if (ds.act === 'export') {
        const data = await guard(() => Store.exportData());
        if (data) download(`odejda-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
        return;
      }
      if (ds.act === 'import') {
        const [file] = await pickFile('application/json,.json');
        if (!file) return;
        let data;
        try { data = JSON.parse(await file.text()); } catch (err) { toast('Файл не похож на JSON', true); return; }
        const n = Array.isArray(data.products) ? data.products.length : 0;
        if (!confirm(`Заменить весь каталог на ${n} товаров из файла?${data.settings ? ' Настройки сайта тоже будут заменены.' : ''}`)) return;
        const ok = await guard(async () => { await Store.importData(data); return true; });
        if (ok) { toast('Каталог загружен'); await loadAll(); route(); }
        return;
      }

      // редактор: фото, размеры, цвета
      if (A.draft) {
        if (ds.imgUpload !== undefined) { addFiles(await pickFile('image/*', true)); return; }
        if (ds.imgUrl !== undefined) {
          const input = $('#imgUrl');
          const url = input.value.trim();
          if (!/^https?:\/\/\S+$/i.test(url)) { toast('Нужна ссылка, начинающаяся с http:// или https://', true); return; }
          A.draft.images.push(url);
          input.value = '';
          A.dirty = true;
          renderPhotos();
          return;
        }
        if (ds.imgDel !== undefined) { A.draft.images.splice(Number(ds.imgDel), 1); A.dirty = true; renderPhotos(); return; }
        if (ds.imgMove !== undefined) {
          const i = Number(ds.imgMove);
          const j = i + Number(ds.d);
          const arr = A.draft.images;
          if (j >= 0 && j < arr.length) { [arr[i], arr[j]] = [arr[j], arr[i]]; A.dirty = true; renderPhotos(); }
          return;
        }
        if (ds.size !== undefined) {
          const s = ds.size;
          const sizes = A.draft.sizes;
          A.draft.sizes = sizes.includes(s) ? sizes.filter((x) => x !== s) : sizes.concat(s);
          // порядок: как в размерной сетке, свои размеры — в конце
          A.draft.sizes.sort((a, b) => {
            const ia = PRESET_SIZES.indexOf(a);
            const ib = PRESET_SIZES.indexOf(b);
            return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
          });
          A.dirty = true;
          $$('#editorBody [data-size]').forEach((b) => {
            const on = A.draft.sizes.includes(b.dataset.size);
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', String(on));
          });
          return;
        }
        if (ds.sizeAdd !== undefined) {
          const v = $('#customSize').value.trim().slice(0, 20);
          if (v && !A.draft.sizes.includes(v)) { A.draft.sizes.push(v); A.dirty = true; }
          const top = $('#editorBody').scrollTop;
          renderEditor();
          $('#editorBody').scrollTop = top;
          return;
        }
        if (ds.colorAdd !== undefined) { A.draft.colors.push({ name: '', hex: '#cccccc' }); A.dirty = true; renderColors(); return; }
        if (ds.colorDel !== undefined) { A.draft.colors.splice(Number(ds.colorDel), 1); A.dirty = true; renderColors(); return; }
      }

      // заказы
      if (ds.orderFilter) { A.orderFilter = ds.orderFilter; viewOrders(); return; }
      if (ds.act === 'reload-orders') {
        const orders = await guard(() => Store.orders());
        if (orders) { A.orders = orders; updateOrderBadge(); viewOrders(); toast('Список обновлён'); }
        return;
      }

      // главная и контакты
      if (ds.act === 'save-settings') { saveSettings(); return; }
      if (ds.uploadPath) {
        const [file] = await pickFile('image/*');
        if (!file) return;
        t.disabled = true;
        const url = await guard(() => Store.uploadImage(file));
        t.disabled = false;
        if (url) {
          setPath(A.form, ds.uploadPath, url);
          if (ds.uploadPath === 'look.image') { renderHome(); return; }
          const prev = $(`[data-preview="${ds.uploadPath}"]`);
          if (prev) prev.innerHTML = `<img src="${esc(img(url))}" alt="">`;
          const input = $(`[data-path="${ds.uploadPath}"]`);
          if (input) input.value = url.startsWith('data:') ? '(загружено в браузер)' : url;
        }
        return;
      }
      if (ds.slideAdd !== undefined) { A.form.hero.push({ eyebrow: '', title: '', text: '', image: '', button: 'Смотреть каталог', link: 'all', productId: '' }); renderHome(); return; }
      if (ds.slideDel !== undefined) {
        if (confirm('Удалить слайд?')) { A.form.hero.splice(Number(ds.slideDel), 1); renderHome(); }
        return;
      }
      if (ds.slideMove !== undefined) {
        const i = Number(ds.slideMove);
        const j = i + Number(ds.d);
        const arr = A.form.hero;
        if (j >= 0 && j < arr.length) { [arr[i], arr[j]] = [arr[j], arr[i]]; renderHome(); }
        return;
      }
      if (ds.spotAdd !== undefined) { A.form.look.spots.push({ x: 50, y: 50, productId: '' }); A.activeSpot = A.form.look.spots.length - 1; renderSpots(); return; }
      if (ds.spotDel !== undefined) { A.form.look.spots.splice(Number(ds.spotDel), 1); A.activeSpot = 0; renderSpots(); return; }
      if (ds.spotPick !== undefined) { A.activeSpot = Number(ds.spotPick); renderSpots(); return; }

      // доступы
      if (ds.gen !== undefined) {
        const input = $('#userForm [name="password"]');
        input.value = genPassword();
        input.type = 'text';
        return;
      }
      if (ds.userEdit) {
        const f = $('#userForm');
        A.editLogin = ds.userEdit;
        f.login.value = ds.userEdit;
        f.login.readOnly = true;
        f.name.value = ds.name;
        f.role.value = ds.role;
        f.password.value = '';
        $('#userFormTitle').textContent = 'Изменить: ' + ds.userEdit;
        $('#passHint').textContent = 'оставьте пустым, чтобы не менять';
        $('[data-user-cancel]').hidden = false;
        f.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (ds.userCancel !== undefined) { resetUserForm(); return; }
      if (ds.userDel) {
        if (!confirm(`Удалить пользователя ${ds.userDel}? Он больше не сможет войти.`)) return;
        const ok = await guard(async () => { await Store.deleteAccount(ds.userDel); return true; });
        if (ok) { toast('Пользователь удалён'); renderUsers(); }
      }
    });

    // поля: фильтры товаров, редактор, формы настроек
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'pq') { A.q = t.value; renderProductTable(); return; }

      if (A.draft && t.closest('#editorForm')) {
        if (t.name && t.name in A.draft) {
          A.draft[t.name] = t.type === 'checkbox' ? t.checked : t.value;
          A.dirty = true;
          if (t.closest('.is-error')) fieldError(t.name, '');
        }
        if (t.dataset.colorName !== undefined) { A.draft.colors[Number(t.dataset.colorName)].name = t.value; A.dirty = true; }
        if (t.dataset.colorHex !== undefined) { A.draft.colors[Number(t.dataset.colorHex)].hex = t.value; A.dirty = true; }
        return;
      }

      if (A.form && t.dataset.path) {
        let v = t.value;
        if (t.dataset.type === 'number') v = v === '' ? '' : Number(v);
        if (v === '(загружено в браузер)') return;
        setPath(A.form, t.dataset.path, v);
        if (/\.image$/.test(t.dataset.path) && t.tagName === 'INPUT') {
          const prev = $(`[data-preview="${t.dataset.path}"]`);
          if (prev) prev.innerHTML = v ? `<img src="${esc(img(v))}" alt="">` : 'нет фото';
        }
        if (/^look\.spots\.\d+\.[xy]$/.test(t.dataset.path)) renderDots();
      }
    });

    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'pcat') { A.cat = t.value; renderProductTable(); return; }
      if (t.dataset.visible) { toggleVisible(t.dataset.visible, t.checked); return; }
      if (t.dataset.orderStatus) { setOrderStatus(t.dataset.orderStatus, t.value); return; }
      if (A.draft && t.closest('#editorForm') && t.name in A.draft) {
        A.draft[t.name] = t.type === 'checkbox' ? t.checked : t.value;
        A.dirty = true;
        return;
      }
      if (A.form && t.dataset.path && t.tagName === 'SELECT') setPath(A.form, t.dataset.path, t.value);
    });

    $('#editorForm').addEventListener('submit', (e) => { e.preventDefault(); saveEditor(); });

    // перетаскивание фото в редактор
    const body = $('#editorBody');
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      const drop = $('.drop', body);
      if (drop) drop.classList.add('is-over');
    });
    body.addEventListener('dragleave', (e) => {
      if (e.target === body) { const drop = $('.drop', body); if (drop) drop.classList.remove('is-over'); }
    });
    body.addEventListener('drop', (e) => {
      e.preventDefault();
      const drop = $('.drop', body);
      if (drop) drop.classList.remove('is-over');
      addFiles(Array.from(e.dataTransfer.files || []));
    });

    document.addEventListener('submit', async (e) => {
      const f = e.target;
      if (f.id === 'passForm') {
        e.preventDefault();
        if (f.new.value !== f.repeat.value) { toast('Новые пароли не совпадают', true); return; }
        const ok = await guard(async () => { await Store.changePassword(f.old.value, f.new.value); return true; });
        if (ok) { f.reset(); toast('Пароль изменён'); }
      }
      if (f.id === 'userForm') {
        e.preventDefault();
        const isEdit = !!A.editLogin;
        if (!isEdit && !f.password.value) { toast('Задайте пароль новому пользователю', true); return; }
        const ok = await guard(async () => {
          await Store.saveAccount({ login: f.login.value, name: f.name.value, role: f.role.value, password: f.password.value });
          return true;
        });
        if (ok) {
          toast(isEdit ? 'Пользователь обновлён' : 'Пользователь добавлен — передайте ему логин и пароль');
          if (A.editLogin === A.user.login) {
            A.user = Object.assign({}, A.user, { name: f.name.value, role: f.role.value });
            $('#meName').textContent = A.user.name;
          }
          resetUserForm();
          renderUsers();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#editor').hidden) closeEditor();
    });

    window.addEventListener('beforeunload', (e) => {
      if (A.draft && A.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ---------- запуск ---------- */

  async function init() {
    const mode = await Store.init({ base: '../' });
    $('#loginMode').textContent = mode === 'api' ? 'Сервер подключён' : 'Демо-режим: данные хранятся в этом браузере';
    $('#demoBar').hidden = mode === 'api';
    bind();
    let user = null;
    try { user = await Store.me(); } catch (e) { user = null; }
    if (user) await enter(user);
    else showLogin();
  }

  init();
})();
