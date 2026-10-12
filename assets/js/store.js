/*
 * Слой данных odejda — один интерфейс для витрины и админки.
 *
 * Режим 'api'   — сайт лежит на хостинге с PHP (api/index.php отвечает JSON):
 *                 товары, заказы и доступы общие для всех посетителей.
 * Режим 'local' — статический хостинг (GitHub Pages, локальный сервер):
 *                 каталог берётся из assets/data/*.json, а правки админа
 *                 сохраняются в localStorage этого браузера (демо-режим).
 */
(function () {
  'use strict';

  const CATEGORIES = [
    { id: 'women', name: 'Женщинам' },
    { id: 'men', name: 'Мужчинам' },
    { id: 'shoes', name: 'Обувь' },
    { id: 'accessories', name: 'Аксессуары' },
  ];

  const ORDER_STATUSES = { new: 'Новый', work: 'В работе', done: 'Выполнен', cancel: 'Отменён' };
  const ROLES = { owner: 'Владелец', manager: 'Менеджер' };

  // Учётка по умолчанию для демо-режима. Пароль лежит в ADMIN-ACCESS.txt (файл не в git).
  const DEFAULT_ACCOUNT = {
    login: 'admin',
    name: 'Администратор',
    role: 'owner',
    hash: '88b492d31d7696821b97c23f2fb6ffc647757ea35499953aaafa252f18cefa2e',
  };

  const LS = 'odejda.v1.';
  const SESSION_HOURS = 12;

  let base = '';
  let mode = 'local';

  /* ---------- утилиты ---------- */

  const ls = {
    get(key, def) {
      try {
        const v = localStorage.getItem(LS + key);
        return v ? JSON.parse(v) : def;
      } catch (e) {
        return def;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(LS + key, JSON.stringify(value));
      } catch (e) {
        throw new Error('Память браузера переполнена. Удалите часть загруженных фото или вставляйте их ссылками.');
      }
    },
    del(key) {
      try { localStorage.removeItem(LS + key); } catch (e) { /* приватный режим */ }
    },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // «Носи своё *настроение*» → курсивное выделение слова; остальное экранируется
  function rich(s) {
    return esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  function plain(s) {
    return String(s == null ? '' : s).replace(/\*/g, '');
  }

  function money(n) {
    return Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ /g, ' ') + ' сум';
  }

  // Ссылка на картинку: относительные пути считаем от корня сайта, опасные схемы отбрасываем
  function img(src) {
    src = String(src || '').trim();
    if (!src) return '';
    if (/^(https?:|data:image\/|blob:)/i.test(src)) return src;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return '';
    if (src.startsWith('/')) return src;
    return base + src;
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function sha256(text) {
    if (!window.crypto || !crypto.subtle) {
      throw new Error('Вход в демо-режиме работает только по HTTPS или на localhost');
    }
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function api(action, payload) {
    const init = { credentials: 'same-origin', headers: { 'X-Requested-With': 'odejda' } };
    if (payload instanceof FormData) {
      init.method = 'POST';
      init.body = payload;
    } else if (payload !== undefined) {
      init.method = 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(payload);
    }
    const res = await fetch(base + 'api/index.php?action=' + encodeURIComponent(action), init);
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('Сервер вернул некорректный ответ (' + res.status + ')');
    }
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || 'Ошибка сервера ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function seed(name) {
    const res = await fetch(base + 'assets/data/' + name + '.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Не удалось загрузить ' + name + '.json');
    return res.json();
  }

  function normalize(p) {
    const num = (v) => (v === '' || v == null || isNaN(v) ? null : Number(v));
    return {
      id: p.id || '',
      title: String(p.title || '').trim(),
      category: p.category || 'women',
      price: num(p.price) || 0,
      oldPrice: num(p.oldPrice),
      images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
      sizes: Array.isArray(p.sizes) ? p.sizes.filter(Boolean) : [],
      colors: Array.isArray(p.colors) ? p.colors.filter((c) => c && c.name) : [],
      description: String(p.description || ''),
      stock: num(p.stock),
      isNew: !!p.isNew,
      isHit: !!p.isHit,
      visible: p.visible !== false,
      createdAt: p.createdAt || new Date().toISOString().slice(0, 10),
    };
  }

  /* ---------- сжатие фото перед загрузкой ---------- */

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Файл не похож на изображение')); };
      im.src = url;
    });
  }

  async function compressImage(file, maxSide, quality) {
    const im = await loadImage(file);
    const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(im.naturalWidth * k);
    canvas.height = Math.round(im.naturalHeight * k);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // прозрачный PNG → белый фон в JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Не удалось прочитать файл'));
      r.readAsDataURL(blob);
    });
  }

  /* ---------- локальные учётки ---------- */

  function localAccounts() {
    return ls.get('accounts', null) || [DEFAULT_ACCOUNT];
  }

  function publicUser(acc) {
    return { login: acc.login, name: acc.name || acc.login, role: acc.role || 'manager' };
  }

  function localUser() {
    const s = ls.get('session', null);
    if (!s || s.exp < Date.now()) return null;
    const acc = localAccounts().find((a) => a.login === s.login);
    return acc ? publicUser(acc) : null;
  }

  function requireLocalUser(role) {
    const u = localUser();
    if (!u) throw new Error('Сессия истекла — войдите заново');
    if (role && u.role !== role) throw new Error('Недостаточно прав');
    return u;
  }

  /* ---------- публичный интерфейс ---------- */

  const Store = {
    CATEGORIES,
    ORDER_STATUSES,
    ROLES,
    util: { esc, rich, plain, money, img, uid },

    get mode() { return mode; },

    async init(opts) {
      base = (opts && opts.base) || '';
      try {
        const res = await fetch(base + 'api/index.php?action=ping', { cache: 'no-store' });
        const data = await res.json();
        mode = data && data.ok && data.mode === 'api' ? 'api' : 'local';
      } catch (e) {
        mode = 'local'; // PHP нет — файл отдаётся как текст или 404
      }
      return mode;
    },

    categoryName(id) {
      const c = CATEGORIES.find((x) => x.id === id);
      return c ? c.name : id;
    },

    /* товары */

    async products(opts) {
      let list;
      if (mode === 'api') list = (await api('products.list')).products;
      else list = ls.get('products', null) || (await seed('products'));
      list = list.map(normalize);
      return opts && opts.all ? list : list.filter((p) => p.visible);
    },

    async saveProduct(p) {
      p = normalize(p);
      if (!p.id) p.id = uid('p-');
      if (mode === 'api') return normalize((await api('products.save', { product: p })).product);
      requireLocalUser();
      const list = await this.products({ all: true });
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = p;
      else list.unshift(p);
      ls.set('products', list);
      return p;
    },

    async deleteProduct(id) {
      if (mode === 'api') return api('products.delete', { id });
      requireLocalUser();
      const list = (await this.products({ all: true })).filter((p) => p.id !== id);
      ls.set('products', list);
    },

    async uploadImage(file) {
      if (mode === 'api') {
        const blob = await compressImage(file, 1600, 0.85);
        const fd = new FormData();
        fd.append('file', blob, 'photo.jpg');
        return (await api('upload', fd)).url;
      }
      // в localStorage мало места — фото поменьше
      return blobToDataURL(await compressImage(file, 900, 0.78));
    },

    /* настройки магазина */

    async settings() {
      if (mode === 'api') return (await api('settings.get')).settings;
      const defaults = await seed('settings');
      return Object.assign(defaults, ls.get('settings', {}));
    },

    async saveSettings(s) {
      if (mode === 'api') return (await api('settings.save', { settings: s })).settings;
      requireLocalUser();
      const merged = Object.assign(await this.settings(), s);
      ls.set('settings', merged);
      return merged;
    },

    /* заказы */

    async createOrder(order) {
      if (mode === 'api') return (await api('orders.create', { order })).order;
      const orders = ls.get('orders', []);
      const saved = Object.assign({}, order, {
        id: uid('o-'),
        number: 1001 + orders.length,
        status: 'new',
        createdAt: new Date().toISOString(),
      });
      orders.unshift(saved);
      ls.set('orders', orders);
      return saved;
    },

    async orders() {
      if (mode === 'api') return (await api('orders.list')).orders;
      requireLocalUser();
      return ls.get('orders', []);
    },

    async setOrderStatus(id, status) {
      if (mode === 'api') return api('orders.status', { id, status });
      requireLocalUser();
      const orders = ls.get('orders', []);
      const o = orders.find((x) => x.id === id);
      if (o) o.status = status;
      ls.set('orders', orders);
    },

    /* вход и доступы */

    async login(login, password) {
      if (mode === 'api') return (await api('auth.login', { login, password })).user;
      const name = String(login || '').trim().toLowerCase();
      const acc = localAccounts().find((a) => a.login.toLowerCase() === name);
      if (!acc || acc.hash !== (await sha256(password))) throw new Error('Неверный логин или пароль');
      ls.set('session', { login: acc.login, exp: Date.now() + SESSION_HOURS * 3600e3 });
      return publicUser(acc);
    },

    async me() {
      if (mode === 'api') return (await api('auth.me')).user || null;
      return localUser();
    },

    async logout() {
      if (mode === 'api') return api('auth.logout', {});
      ls.del('session');
    },

    async changePassword(oldPassword, newPassword) {
      if (String(newPassword).length < 8) throw new Error('Новый пароль — минимум 8 символов');
      if (mode === 'api') return api('auth.password', { oldPassword, newPassword });
      const u = requireLocalUser();
      const list = localAccounts();
      const acc = list.find((a) => a.login === u.login);
      if (acc.hash !== (await sha256(oldPassword))) throw new Error('Текущий пароль указан неверно');
      acc.hash = await sha256(newPassword);
      ls.set('accounts', list);
    },

    async accounts() {
      if (mode === 'api') return (await api('accounts.list')).accounts;
      requireLocalUser('owner');
      return localAccounts().map(publicUser);
    },

    // создать или обновить; пароль обязателен только для новой учётки
    async saveAccount(acc) {
      const login = String(acc.login || '').trim();
      if (!/^[a-zA-Z0-9._-]{3,32}$/.test(login)) throw new Error('Логин: 3–32 символа, латиница, цифры, . _ -');
      if (acc.password && String(acc.password).length < 8) throw new Error('Пароль — минимум 8 символов');
      if (mode === 'api') return api('accounts.save', { account: Object.assign({}, acc, { login }) });
      requireLocalUser('owner');
      const list = localAccounts();
      let rec = list.find((a) => a.login.toLowerCase() === login.toLowerCase());
      if (!rec) {
        if (!acc.password) throw new Error('Для новой учётки нужен пароль');
        rec = { login };
        list.push(rec);
      }
      rec.name = String(acc.name || login).trim();
      rec.role = acc.role === 'owner' ? 'owner' : 'manager';
      if (acc.password) rec.hash = await sha256(acc.password);
      if (!list.some((a) => a.role === 'owner')) throw new Error('Должен остаться хотя бы один владелец');
      ls.set('accounts', list);
    },

    async deleteAccount(login) {
      if (mode === 'api') return api('accounts.delete', { login });
      const u = requireLocalUser('owner');
      if (u.login === login) throw new Error('Нельзя удалить самого себя');
      const list = localAccounts().filter((a) => a.login !== login);
      if (!list.some((a) => a.role === 'owner')) throw new Error('Должен остаться хотя бы один владелец');
      ls.set('accounts', list);
    },

    /* резервная копия */

    async exportData() {
      return {
        app: 'odejda',
        version: 1,
        exportedAt: new Date().toISOString(),
        products: await this.products({ all: true }),
        settings: await this.settings(),
      };
    },

    async importData(data) {
      if (!data || !Array.isArray(data.products)) throw new Error('В файле нет списка товаров');
      const products = data.products.map(normalize);
      if (mode === 'api') return api('data.import', { products, settings: data.settings || null });
      requireLocalUser('owner');
      ls.set('products', products);
      if (data.settings) ls.set('settings', data.settings);
    },

    // только демо-режим: вернуть каталог и настройки из репозитория
    resetLocal() {
      ['products', 'settings', 'orders'].forEach(ls.del);
    },
  };

  window.Store = Store;
})();
