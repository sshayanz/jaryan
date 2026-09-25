(async () => {
  'use strict';

  const app = document.getElementById('app');
  const fa = value => Number(value || 0).toLocaleString('fa-IR');
  const readJSON = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  };

  const fetchJSON = async path => {
    const response = await fetch(path, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    return response.json();
  };

  // The compressed files also work on hosts that transparently decode gzip.
  const fetchCompressedJSON = async path => {
    const response = await fetch(path, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let decoded = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (!('DecompressionStream' in window)) throw new Error('Gzip is unavailable');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      decoded = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(decoded));
  };

  const catalog = await fetchJSON('data/catalog.json');
  const index = await fetchJSON('data/poem-index.json');
  const people = catalog.p;
  const chunkedBooks = new Set(['moulavi/divan-shams', 'saeb/ghazal']);
  const poemPositions = new Map();
  const peopleById = Object.fromEntries(people.map(person => [person.i, person]));
  const poems = index.q.map(row => {
    const person = people[row[0]];
    const book = person.b[row[1]];
    const bookKey = `${person.i}/${book.i}`;
    const position = poemPositions.get(bookKey) || 0;
    poemPositions.set(bookKey, position + 1);
    return {
      poetId: person.i,
      poetName: person.n,
      bookId: book.i,
      bookTitle: book.n,
      id: row[2],
      title: row[3],
      coupletCount: row[4],
      couples: [],
      loaded: false,
      search: '',
      chunk: chunkedBooks.has(bookKey) ? Math.floor(position / 256) : null
    };
  });

  const poemsByBook = Object.fromEntries(
    people.flatMap(person => person.b.map(book => [
      `${person.i}/${book.i}`,
      poems.filter(poem => poem.poetId === person.i && poem.bookId === book.i)
    ]))
  );
  const catalogue = people.flatMap(person => person.b.map(book => ({
    poet: person,
    book,
    list: poemsByBook[`${person.i}/${book.i}`] || []
  })));
  const poetCounts = Object.fromEntries(people.map(person => [
    person.i,
    poems.filter(poem => poem.poetId === person.i).length
  ]));
  const couplets = poems.reduce((total, poem) => total + poem.coupletCount, 0);

  const bios = {
    moulavi: 'جلال‌الدین محمد بلخی، مشهور به مولانا، در ۶۰۴ق در بلخ زاده شد و بیشتر عمر خود را در قونیه گذراند. مثنوی و غزل‌های او از مهم‌ترین آثار عرفان فارسی‌اند.',
    hafez: 'خواجه شمس‌الدین محمد حافظ شیرازی، شاعر سدهٔ هشتم هجری، در شیراز زیست و به‌ویژه برای غزل‌های چندلایه و موسیقایی‌اش شناخته می‌شود.',
    khayyam: 'عمر خیام نیشابوری، زادهٔ ۴۳۹ق، ریاضی‌دان، منجم، فیلسوف و رباعی‌سرای ایرانی بود و در تدوین گاه‌شماری جلالی نقش داشت.',
    saadi: 'مشرف‌الدین مصلح سعدی شیرازی، شاعر سدهٔ هفتم هجری، پس از سال‌ها سفر به شیراز بازگشت. بوستان و گلستان از آثار ماندگار او هستند.',
    saeb: 'صائب تبریزی، شاعر سدهٔ یازدهم هجری، از برجسته‌ترین غزل‌سرایان سبک هندی است و به تصویرسازی و مضمون‌پردازی مشهور است.',
    attar: 'فریدالدین عطار نیشابوری، شاعر و عارف سدهٔ ششم و هفتم هجری، در نیشابور می‌زیست و منطق‌الطیر از شناخته‌شده‌ترین آثار اوست.',
    babataher: 'باباطاهر عریان، شاعر دوبیتی‌سرای منسوب به همدان، از چهره‌های کهن شعر عامیانه و عارفانهٔ فارسی است.'
  };
  const blurbs = {
    moulavi: 'عرفان و روایت',
    hafez: 'غزل و رندی',
    khayyam: 'رباعی و اندیشه',
    saadi: 'حکایت و اخلاق',
    saeb: 'مضمون و تصویر',
    attar: 'عرفان و تمثیل',
    babataher: 'دوبیتی و دل'
  };
  const bookFacts = {
    'masnavi-daftar1': 'مثنوی معنوی در شش دفتر سروده شده است؛ این دفتر نخست با داستان نی‌نامه آغاز می‌شود و روایت‌های عرفانی و اخلاقی را پیش می‌برد.',
    'masnavi-daftar2': 'دفتر دوم مثنوی ادامهٔ روایت‌های تمثیلی مولاناست؛ داستان‌ها برای توضیح مفاهیم عرفانی و اخلاقی به کار می‌روند.',
    'masnavi-daftar3': 'دفتر سوم مثنوی بخشی از منظومهٔ شش‌دفترهٔ مولاناست و میان حکایت‌های پیوسته، گفت‌وگو و تمثیل حرکت می‌کند.',
    'masnavi-daftar4': 'دفتر چهارم مثنوی از دفترهای میانی این منظومهٔ عرفانی است و روایت و تفسیر را در هم می‌آمیزد.',
    'masnavi-daftar5': 'دفتر پنجم مثنوی مجموعه‌ای از حکایت‌ها و گفتارهای عرفانی است که با زبان داستانی به معنا می‌رسد.',
    'masnavi-daftar6': 'دفتر ششم، واپسین دفتر مثنوی معنوی، ادامهٔ همان مسیر روایی و تعلیمی مولاناست.',
    'divan-shams': 'دیوان شمس مجموعهٔ غزل‌ها و رباعی‌های مولاناست که به یاد شمس تبریزی این نام را گرفته است.',
    ghazal: 'غزل‌های فارسی با موسیقی درونی و تصویرهای فشرده، برای خواندن آهسته و دوباره‌خوانی.',
    ghete: 'قطعات شعرهایی کوتاه‌تر از غزل‌اند و وجهی روایی، حکمی یا مناسبتی دارند.',
    ghaside: 'قصیده قالبی روایی و ستایشی است که در میراث شعر فارسی جایگاه ویژه‌ای دارد.',
    robaee: 'رباعی قالبی چهارمصراعی است؛ کوتاه، فشرده و مناسب مکث روی یک معنا.',
    masnavi: 'مثنوی با روایت و مضمون عرفانی، از قالب‌های مهم داستان‌گویی در شعر فارسی است.',
    saghiname: 'ساقی‌نامه شعری خطاب به ساقی است و برای بیان شور، بی‌قراری و معنا به کار می‌رود.',
    boostan: 'سعدی بوستان را در ۶۵۵ق به نظم درآورد؛ منظومه‌ای اخلاقی و حکایتی دربارهٔ رفتار و زندگی انسانی.',
    manteghotteyr: 'منطق‌الطیر داستان سفر پرندگان برای یافتن سیمرغ است؛ در پایان، حقیقت را در خود می‌یابند.',
    '2beytiha': 'دوبیتی‌های باباطاهر با زبان ساده و عاطفی، از عشق، فراق و تجربهٔ عرفانی سخن می‌گویند.'
  };

  const normalize = value => String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('fa')
    .replace(/[ًٌٍَُِّّْـ]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[إأٱآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[\u200c\u200d\u200e\u200f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
  const idOf = poem => `${poem.poetId}/${poem.bookId}/${poem.id}`;
  const queryWords = query => normalize(query).split(' ').filter(Boolean);
  const matchesNormalized = (haystack, query) => {
    const words = queryWords(query);
    return words.length === 0 || words.every(word => haystack.includes(word));
  };
  const matches = (value, query) => matchesNormalized(normalize(value), query);

  const portraits = [
    '<path d="M21 104c4-27 19-43 43-43s39 16 43 43M39 45c0-20 10-32 25-32s25 12 25 32-10 31-25 31-25-11-25-31Z"/><path d="M40 30c12-16 34-18 49-2M44 50c6 4 12 4 18 0M68 50c6 4 12 4 18 0M51 66c9 11 19 11 28 0M50 85c8 8 21 8 29 0M58 103V79M70 103V79M31 23l-9 13M97 23l9 13"/>',
    '<path d="M19 104c6-28 21-43 45-43s39 15 45 43M39 44c1-21 10-32 26-32s25 11 25 32c-1 20-10 31-25 31S40 64 39 44Z"/><path d="M40 30c14 5 32 5 48-2M48 53h8M70 53h8M57 68c6 4 12 4 18 0M49 79c9 10 23 10 32 0M48 91c9 6 23 6 32 0"/>',
    '<path d="M20 104c5-28 20-43 44-43s39 15 44 43M40 44c0-20 9-32 24-32s24 12 24 32-9 31-24 31-24-11-24-31Z"/><path d="M42 29c14-10 31-9 44 2M49 54h7M72 54h7M56 68c5 5 11 5 17 0M50 82c9 7 21 7 30 0M90 26l12-11M99 35l13-2M31 28l-10-8"/>'
  ];

  const icons = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    brand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7c4-4 6 4 10 0s5 1 6-1M4 12c4-4 6 4 10 0s5 1 6-1M4 17c4-4 6 4 10 0s5 1 6-1"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 15.2A8 8 0 1 1 8.8 4 6.2 6.2 0 0 0 20 15.2Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3-6 7-6s6.2 2 7 6"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m4 11 8-7 8 7v8H4Z"/><path d="M9 19v-5h6v5"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5h16v14H4Z"/><path d="M8 9h8M8 13h6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 0Z"/><path d="M5 4v16M8 7h7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>',
    dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h.01M16 16h.01M16 8h.01M8 16h.01"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  };
  const icon = name => icons[name] || '';

  const translations = {
    fa: {
      home: 'خانه', poets: 'شاعران', archive: 'آرشیو', account: 'حساب من', settings: 'تنظیمات',
      search: 'جست‌وجوی شاعر، کتاب، عنوان یا یک بیت', random: 'شعر تصادفی', randomPoem: 'فال شعر',
      books: 'مجموعه‌ها', sections: 'بخش‌ها', save: 'ذخیره', saved: 'ذخیره‌شده‌ها', history: 'تاریخچهٔ خواندن',
      today: 'امروز', month: 'این ماه', total: 'مجموع خوانده‌ها', more: 'نمایش بیشتر', back: 'بازگشت',
      copy: 'کپی شعر', note: 'یادداشت', writeNote: 'یادداشتت را اینجا بنویس...', font: 'فونت',
      size: 'اندازهٔ نوشته', language: 'زبان', theme: 'تم', light: 'روشن', paper: 'کاغذی', dark: 'تیره',
      system: 'سیستم', profile: 'نام نمایشی', profilePlaceholder: 'نام خود را بنویسید', empty: 'نتیجه‌ای پیدا نشد.',
      info: 'دربارهٔ این شاعر', bookInfo: 'دربارهٔ این مجموعه', poemInfo: 'برای مکث و دوباره‌خوانی',
      all: 'همه', poetType: 'شاعر', bookType: 'کتاب', poemType: 'شعر', choosePoet: 'همهٔ شاعران',
      chooseBook: 'همهٔ کتاب‌ها', menu: 'منو', searching: 'در حال آماده‌سازی جست‌وجوی متن شعر...'
    },
    en: {
      home: 'Home', poets: 'Poets', archive: 'Archive', account: 'My space', settings: 'Settings',
      search: 'Search a poet, book, title or verse', random: 'Random poem', randomPoem: 'Poem fortune',
      books: 'Collections', sections: 'Sections', save: 'Save', saved: 'Saved', history: 'Reading history',
      today: 'Today', month: 'This month', total: 'Total reads', more: 'Show more', back: 'Back',
      copy: 'Copy poem', note: 'Note', writeNote: 'Write a note...', font: 'Font', size: 'Text size',
      language: 'Language', theme: 'Theme', light: 'Light', paper: 'Paper', dark: 'Dark', system: 'System',
      profile: 'Display name', profilePlaceholder: 'Write your name', empty: 'No result found.',
      info: 'About this poet', bookInfo: 'About this collection', poemInfo: 'A note for rereading', all: 'All',
      poetType: 'Poet', bookType: 'Book', poemType: 'Poem', choosePoet: 'All poets', chooseBook: 'All books',
      menu: 'Menu', searching: 'Preparing full-text search...'
    }
  };
  const tr = key => translations[lang][key] || key;

  let lang = localStorage.getItem('jaryan-lang') || 'fa';
  let theme = ['light', 'paper', 'dark', 'system'].includes(localStorage.getItem('jaryan-theme'))
    ? localStorage.getItem('jaryan-theme') : 'light';
  let font = localStorage.getItem('jaryan-font') || 'ravi';
  let profile = localStorage.getItem('jaryan-profile') || '';
  if (profile === 'خوانندهٔ جریان' || profile === 'خواننده جریان') {
    profile = '';
    localStorage.removeItem('jaryan-profile');
  }
  let sizeScale = Math.max(100, Math.min(400, Number(localStorage.getItem('jaryan-size-scale') || 100)));
  let favorites = new Set(readJSON('jaryan-favorites', []));
  let poetFavorites = new Set(readJSON('jaryan-poet-favorites', []));
  let coupletFavorites = new Set(readJSON('jaryan-couplet-favorites', []));
  let notes = readJSON('jaryan-notes', {});
  let readingHistory = readJSON('jaryan-history', []);
  const state = {
    page: 'home', poetId: null, bookId: null, poemId: null, query: '', poet: 'همه', book: 'همه',
    genre: 'all', archiveType: 'all', limit: 24, active: null, favoriteTab: 'poems'
  };

  const applyPreferences = () => {
    document.documentElement.className = `theme-${theme}`;
    document.documentElement.dataset.font = font;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.style.setProperty('--scale', String(sizeScale / 100));
  };
  const routeFromHash = () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    state.page = 'home';
    state.poetId = state.bookId = state.poemId = null;
    if (!hash || hash === 'home' || hash === 'poets') return;
    const [kind, ...rest] = hash.split('/');
    if (kind === 'poet') [state.page, state.poetId] = ['poet', rest[0]];
    else if (kind === 'book') [state.page, state.poetId, state.bookId] = ['book', rest[0], rest[1]];
    else if (kind === 'poem') [state.page, state.poetId, state.bookId, state.poemId] = ['poem', rest[0], rest[1], rest[2]];
    else if (kind === 'archive') state.page = 'archive';
    else if (kind === 'account' || kind === 'settings') state.page = kind;
  };
  const closeModal = () => document.getElementById('modal-backdrop')?.classList.remove('open');
  const showToast = message => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1500);
  };
  const navigate = (route, replace = false) => {
    const url = `#${route}`;
    if (replace) history.replaceState({}, '', url);
    else history.pushState({}, '', url);
    routeFromHash();
    closeModal();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goBack = () => {
    const before = location.hash;
    history.back();
    setTimeout(() => { if (location.hash === before) navigate('home', true); }, 180);
  };

  const bookCache = new Map();
  const bookPromises = new Map();
  const loadBook = (poetId, bookId, chunk = null) => {
    const key = `${poetId}/${bookId}`;
    const shardKey = chunk == null ? key : `${key}/${chunk}`;
    if (bookCache.has(shardKey)) return Promise.resolve(bookCache.get(shardKey));
    if (bookPromises.has(shardKey)) return bookPromises.get(shardKey);
    const filename = chunk == null
      ? `data/poems/${encodeURIComponent(poetId)}__${encodeURIComponent(bookId)}.bin`
      : `data/poems/chunks/${encodeURIComponent(poetId)}__${encodeURIComponent(bookId)}__${chunk}.bin`;
    const promise = fetchCompressedJSON(filename)
      .then(({ q }) => {
        const byId = new Map(q.map(row => [row[0], row]));
        const ready = poemsByBook[key] || [];
        ready.forEach(poem => {
          if (chunk != null && poem.chunk !== chunk) return;
          const row = byId.get(poem.id);
          if (!row) return;
          poem.title = row[1];
          poem.couples = row[2] || [];
          poem.loaded = true;
        });
        bookCache.set(shardKey, ready);
        return ready;
      })
      .finally(() => bookPromises.delete(shardKey));
    bookPromises.set(shardKey, promise);
    return promise;
  };
  const ensurePoemLoaded = poem => poem?.loaded
    ? Promise.resolve(poem)
    : loadBook(poem.poetId, poem.bookId, poem.chunk).then(() => poem);

  let searchReady = false;
  let searchPromise = null;
  const loadSearchIndex = () => {
    if (searchPromise) return searchPromise;
    searchPromise = fetchCompressedJSON('data/search.bin').then(({ q }) => {
      const byId = new Map(q.map(row => [`${row[0]}/${row[1]}/${row[2]}`, row[3]]));
      // Search rows are normalized during the data build, so the main thread only maps them.
      poems.forEach(poem => { poem.search = byId.get(idOf(poem)) || ''; });
      searchReady = true;
      return true;
    }).catch(() => false);
    return searchPromise;
  };
  const localPoemText = poem => normalize(`${poem.title} ${poem.poetName} ${poem.bookTitle}`);
  const poemMatches = (poem, query) => matchesNormalized(searchReady && poem.search ? poem.search : localPoemText(poem), query);
  const poetMatches = (person, query) => matches(`${person.n} ${bios[person.i] || ''} ${blurbs[person.i] || ''}`, query);
  const bookMatches = (item, query) => matches(`${item.book.n} ${item.poet.n} ${bookFacts[item.book.i] || ''}`, query);
  const genreFor = poem => {
    const id = poem.bookId;
    if (id.includes('2beyti')) return 'دوبیتی';
    if (id.includes('ghazal') || id === 'divan-shams') return 'غزل';
    if (id.includes('robaee')) return 'رباعی';
    if (id.includes('ghaside')) return 'قصیده';
    if (id.includes('ghete')) return 'قطعه';
    if (id.includes('saghiname')) return 'ساقی‌نامه';
    if (id.includes('masnavi') || id.includes('boostan') || id.includes('manteghotteyr')) return 'مثنوی';
    return 'همه';
  };
  const filteredPoems = () => {
    let list = poems;
    if (state.poet !== 'همه') list = list.filter(poem => poem.poetName === state.poet);
    if (state.book !== 'همه') list = list.filter(poem => `${poem.poetId}/${poem.bookId}` === state.book);
    if (state.genre !== 'all') list = list.filter(poem => genreFor(poem) === state.genre);
    if (state.query.trim()) list = list.filter(poem => poemMatches(poem, state.query));
    return list;
  };

  const openInfo = (title, copy) => {
    const modal = document.querySelector('#modal-backdrop .modal');
    if (!modal) return;
    modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="بستن">${icon('close')}</button><h2 id="modal-title"></h2><p id="modal-copy"></p>`;
    modal.querySelector('#modal-title').textContent = title;
    modal.querySelector('#modal-copy').textContent = copy;
    document.getElementById('modal-backdrop').classList.add('open');
  };
  const openNoteEditor = key => {
    const modal = document.querySelector('#modal-backdrop .modal');
    if (!modal) return;
    modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="بستن">${icon('close')}</button><h2>${lang === 'fa' ? 'یادداشت بیت' : 'Verse note'}</h2><p>${lang === 'fa' ? 'یادداشتت را برای این بیت نگه دار.' : 'Keep a note for this verse.'}</p><textarea id="note-editor" placeholder="${tr('writeNote')}">${escapeHTML(notes[key] || '')}</textarea><div class="modal-actions"><button class="button" data-save-couplet-note="${escapeHTML(key)}">${tr('save')}</button><button class="button secondary" data-close-modal>${tr('back')}</button></div>`;
    document.getElementById('modal-backdrop').classList.add('open');
    setTimeout(() => document.getElementById('note-editor')?.focus(), 0);
  };
  const shareText = async (title, text) => {
    try {
      if (navigator.share) await navigator.share({ title, text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
      showToast(lang === 'fa' ? 'متن برای اشتراک آماده شد' : 'Ready to share');
    } catch {
      // Sharing can be cancelled by the user.
    }
  };
  const toggleSet = (set, key, storageKey) => {
    set.has(key) ? set.delete(key) : set.add(key);
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  };
  const markRead = poem => {
    state.active = poem;
    const id = idOf(poem);
    if (readingHistory[readingHistory.length - 1]?.id === id) return;
    readingHistory = [...readingHistory.filter(item => item.id !== id), { id, at: Date.now() }].slice(-100);
    localStorage.setItem('jaryan-history', JSON.stringify(readingHistory));
  };
  const collectionSketch = index => `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M18 24c18-7 31-4 42 7v48c-11-11-24-14-42-7V24Z"/><path d="M102 24c-18-7-31-4-42 7v48c11-11 24-14 42-7V24Z"/><path d="M60 31v48M27 37c10-1 19 2 27 8M93 37c-10-1-19 2-27 8M29 51c9 0 17 3 25 8M91 51c-9 0-17 3-25 8"/><path d="M83 14c7 5 11 12 10 21"/></svg>`;

  const layout = () => {
    app.innerHTML = `<header class="topbar"><a class="brand" data-route="home" href="#home"><span class="brand-mark">${icon('brand')}</span><span class="brand-name">جریان</span></a><nav class="nav"><button data-route="home">${tr('home')}</button><button data-route="poets">${tr('poets')}</button><button data-route="archive">${tr('archive')}</button><button data-route="settings">${tr('settings')}</button></nav><div class="top-actions"><button class="top-button" id="theme-toggle" aria-label="${tr('theme')}" title="${tr('theme')}">${icon(theme === 'dark' ? 'sun' : 'moon')}</button><button class="top-button" data-route="account" aria-label="${tr('account')}" title="${tr('account')}">${icon('user')}</button></div></header><main id="main"></main><footer class="footer">${lang === 'fa' ? '© ۱۴۰۵ جریان؛ آرشیوی برای هر وقت که دلت شعر می‌خواهد' : '© 2026 Jaryan; an archive for every moment you want a poem'}</footer><nav class="mobile-nav"><button data-route="home">${icon('home')}${tr('home')}</button><button data-route="archive">${icon('archive')}${tr('archive')}</button><button data-route="account">${icon('user')}${tr('account')}</button><button data-route="settings">${icon('settings')}${tr('settings')}</button></nav><div class="modal-backdrop" id="modal-backdrop"><section class="modal glass"><button class="icon-button modal-close" data-close-modal aria-label="بستن">${icon('close')}</button><h2 id="modal-title"></h2><p id="modal-copy"></p></section></div><div id="toast" role="status" aria-live="polite"></div>`;
  };

  const poetCard = (person, index) => `<article class="poet-card glass" data-poet="${escapeHTML(person.i)}"><span class="poet-index">${String(index + 1).padStart(2, '0')}</span><div class="poet-card-actions"><button class="icon-button" data-poet-fav="${escapeHTML(person.i)}" aria-label="${tr('save')}">${poetFavorites.has(person.i) ? '♥' : '♡'}</button><button class="icon-button" data-poet-info="${escapeHTML(person.i)}" aria-label="${tr('info')}">${icon('info')}</button></div><h3>${escapeHTML(person.n)}</h3><p>${escapeHTML(blurbs[person.i] || '')}</p><span class="poet-count">${fa(poetCounts[person.i])} ${lang === 'fa' ? 'شعر' : 'poems'}</span><svg class="poet-sketch" viewBox="0 0 128 128" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round">${portraits[index % portraits.length]}</svg></article>`;
  const homeView = () => `<section class="landing"><div class="hero"><p class="eyebrow">${lang === 'fa' ? 'گنجینه‌ای یک‌جا از شعر فارسی' : 'A living archive of Persian poetry'}</p><h1>${lang === 'fa' ? 'شعر دلخواهت را پیدا کن.' : 'Find the poem you want.'}<br><span>${lang === 'fa' ? 'همین‌جا بخوان و فال بگیر.' : 'Read it and take a fortune.'}</span></h1><p class="hero-copy">${lang === 'fa' ? 'از غزل و رباعی تا مثنوی؛ هر وقت دلت شعر خواست، اینجا پیدایش کن.' : 'Ghazal, rubai and masnavi, ready whenever you need a poem.'}</p><label class="search-line">${icon('search')}<input id="home-search" value="${escapeHTML(state.query)}" placeholder="${tr('search')}" autocomplete="off" enterkeyhint="search"><span class="key">⌘ K</span></label><div class="hero-actions"><button class="button" data-random="all">${icon('dice')}${tr('randomPoem')}</button><button class="button secondary" data-route="archive">${icon('search')}${tr('archive')}</button></div><div class="metrics"><div class="metric"><strong>${fa(poems.length)}</strong><span>${lang === 'fa' ? 'شعر' : 'poems'}</span></div><div class="metric"><strong>${fa(couplets)}</strong><span>${lang === 'fa' ? 'بیت' : 'couplets'}</span></div><div class="metric"><strong>${fa(people.length)}</strong><span>${lang === 'fa' ? 'شاعر' : 'poets'}</span></div></div></div><div class="section-wrap"><div class="section-head"><div><p class="eyebrow">${lang === 'fa' ? 'از میان نام‌های ماندگار' : 'Names worth returning to'}</p><h2>${tr('poets')}</h2><p>${lang === 'fa' ? 'شاعر را انتخاب کن، مجموعه‌اش را ببین.' : 'Choose a poet, then explore their collections.'}</p></div><button class="text-link" data-route="archive">${tr('archive')} ←</button></div><div class="poet-grid">${people.map(poetCard).join('')}</div></div></section>`;
  const poetView = () => {
    const person = peopleById[state.poetId];
    if (!person) return homeView();
    const books = person.b.map((book, index) => {
      const list = poemsByBook[`${person.i}/${book.i}`] || [];
      return `<article class="collection-card glass" data-book="${escapeHTML(person.i + '/' + book.i)}"><button class="icon-button collection-info" data-book-info="${escapeHTML(person.i + '/' + book.i)}" aria-label="${tr('bookInfo')}">${icon('info')}</button><span class="book-count">${fa(list.length)} ${lang === 'fa' ? 'بخش' : 'parts'}</span><h3>${escapeHTML(book.n)}</h3><div class="collection-sketch">${collectionSketch(index)}</div></article>`;
    }).join('');
    return `<section class="page"><div class="page-hero"><button class="back-link" data-back>← ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-route="archive">${tr('archive')}</button></div><div class="info-row"><p class="eyebrow">${tr('poets')}</p><button class="icon-button" data-poet-info="${escapeHTML(person.i)}" aria-label="${tr('info')}">${icon('info')}</button></div><h1>${escapeHTML(person.n)}</h1><p>${escapeHTML(bios[person.i] || '')}</p><div class="page-actions"><button class="button secondary" data-poet-fav="${escapeHTML(person.i)}">${poetFavorites.has(person.i) ? '♥' : '♡'} ${tr('save')}</button><button class="button" data-random="poet">${icon('dice')}${tr('randomPoem')}</button></div></div><div class="section-head"><div><h2>${tr('books')}</h2><p>${fa(person.b.length)} ${lang === 'fa' ? 'مجموعه برای خواندن' : 'collections to read'}</p></div></div><div class="book-grid collection-grid">${books}</div></section>`;
  };
  const bookContext = (person, book, list) => bookFacts[book.i] || `${book.n} مجموعه‌ای از ${fa(list.length)} بخش از آثار ${person.n} است؛ برای خواندن آرام و پیوسته، از ابتدا یا هرجا که خواستی شروع کن.`;
  const bookView = () => {
    const person = peopleById[state.poetId];
    const book = person?.b.find(item => item.i === state.bookId);
    const list = poemsByBook[`${state.poetId}/${state.bookId}`] || [];
    if (!person || !book) return homeView();
    const shown = list.slice(0, state.limit);
    return `<section class="page"><div class="page-hero"><button class="back-link" data-back>← ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-poet="${escapeHTML(person.i)}">${escapeHTML(person.n)}</button><span>/</span><span>${escapeHTML(book.n)}</span></div><p class="eyebrow">${escapeHTML(person.n)}</p><h1>${escapeHTML(book.n)}</h1><p>${escapeHTML(bookContext(person, book, list))}</p><div class="page-actions"><button class="button" data-random="book">${icon('dice')}${tr('random')}</button><button class="button secondary" data-book-info="${escapeHTML(person.i + '/' + book.i)}">${icon('info')}${tr('bookInfo')}</button></div></div><div class="section-head"><div><h2>${tr('sections')}</h2><p>${fa(list.length)} ${lang === 'fa' ? 'بخش' : 'sections'}</p></div></div><div class="section-list">${shown.map((poem, index) => `<article class="section-card glass" data-poem="${escapeHTML(idOf(poem))}"><span class="section-no">${fa(index + 1)}</span><h3>${escapeHTML(poem.title)}</h3><span class="go">←</span></article>`).join('')}</div>${list.length > state.limit ? `<button class="more-button" data-more-sections>${tr('more')}</button>` : ''}</section>`;
  };
  const poetQuick = person => `<article class="quick-card glass" data-poet="${escapeHTML(person.i)}">${icon('user')}<div><strong>${escapeHTML(person.n)}</strong><small>${escapeHTML(blurbs[person.i] || '')}</small></div><span>←</span></article>`;
  const bookQuick = item => `<article class="quick-card glass" data-book="${escapeHTML(item.poet.i + '/' + item.book.i)}">${icon('book')}<div><strong>${escapeHTML(item.book.n)}</strong><small>${escapeHTML(item.poet.n)} · ${fa(item.list.length)} ${lang === 'fa' ? 'بخش' : 'parts'}</small></div><span>←</span></article>`;
  const resultCard = poem => `<article class="result-card glass" data-poem="${escapeHTML(idOf(poem))}"><div><div class="result-meta"><span>${escapeHTML(poem.poetName)}</span><i></i><span>${escapeHTML(poem.bookTitle)}</span></div><h3>${escapeHTML(poem.title)}</h3><div class="result-book">${fa(poem.coupletCount)} ${lang === 'fa' ? 'بیت' : 'couplets'}</div></div><button class="save-btn ${favorites.has(idOf(poem)) ? 'saved' : ''}" data-fav="${escapeHTML(idOf(poem))}" aria-label="${tr('save')}">${favorites.has(idOf(poem)) ? '★' : '☆'}</button><p class="result-excerpt">${escapeHTML(poem.couples.slice(0, 2).map(couple => couple.join(' · ')).join(' ') || (lang === 'fa' ? 'برای خواندن انتخاب کن' : 'Open to read'))}</p></article>`;
  const archiveResults = () => {
    const query = normalize(state.query);
    const poetHits = query ? people.filter(person => poetMatches(person, query)) : [];
    const bookHits = query ? catalogue.filter(item => bookMatches(item, query)) : [];
    const list = filteredPoems();
    const shown = list.slice(0, state.limit);
    const showSearchWait = Boolean(query && !searchReady && searchPromise);
    const quickResults = query && state.archiveType !== 'poems'
      ? `<div class="quick-grid">${poetHits.map(poetQuick).join('')}${bookHits.map(bookQuick).join('')}</div>` : '';
    const poemResults = state.archiveType === 'poets' || state.archiveType === 'books' ? '' : shown.map(resultCard).join('');
    const empty = !quickResults && !poemResults && !showSearchWait ? `<div class="empty">${tr('empty')}</div>` : '';
    return `<div id="archive-results"><div class="result-summary">${showSearchWait ? tr('searching') : query ? `${fa(poetHits.length + bookHits.length + list.length)} ${lang === 'fa' ? 'نتیجه در شاعر، کتاب و شعر' : 'results across poets, books and poems'}` : `${fa(poems.length)} ${lang === 'fa' ? 'شعر، قابل جست‌وجو و انتخاب' : 'poems, ready to explore'}`}</div>${quickResults}<div class="result-list">${poemResults}</div>${empty}${list.length > state.limit && state.archiveType !== 'poets' && state.archiveType !== 'books' ? `<button class="more-button" data-more-archive>${tr('more')}</button>` : ''}</div>`;
  };
  const archiveView = () => {
    const bookOptions = state.poet === 'همه' ? catalogue : catalogue.filter(item => item.poet.n === state.poet);
    const genres = ['all', 'غزل', 'رباعی', 'مثنوی', 'دوبیتی', 'قطعه', 'قصیده', 'ساقی‌نامه'];
    return `<section class="page"><div class="page-hero"><p class="eyebrow">${tr('archive')}</p><h1>${tr('archive')}</h1><p>${lang === 'fa' ? 'جست‌وجو در نام شاعران، مجموعه‌ها، عنوان‌ها و متن کامل شعرها.' : 'Search poets, collections, titles and full poem text.'}</p></div><label class="archive-search">${icon('search')}<input id="archive-search" value="${escapeHTML(state.query)}" placeholder="${tr('search')}" autocomplete="off" enterkeyhint="search"></label><div class="tabs"><button class="tab ${state.archiveType === 'all' ? 'active' : ''}" data-archive-type="all">${tr('all')}</button><button class="tab ${state.archiveType === 'poets' ? 'active' : ''}" data-archive-type="poets">${tr('poetType')}</button><button class="tab ${state.archiveType === 'books' ? 'active' : ''}" data-archive-type="books">${tr('bookType')}</button><button class="tab ${state.archiveType === 'poems' ? 'active' : ''}" data-archive-type="poems">${tr('poemType')}</button></div><div class="archive-controls"><select class="select" id="archive-poet" aria-label="${tr('choosePoet')}"><option value="همه">${tr('choosePoet')}</option>${people.map(person => `<option value="${escapeHTML(person.n)}" ${state.poet === person.n ? 'selected' : ''}>${escapeHTML(person.n)}</option>`).join('')}</select><select class="select" id="archive-book" aria-label="${tr('chooseBook')}"><option value="همه">${tr('chooseBook')}</option>${bookOptions.map(item => `<option value="${escapeHTML(item.poet.i + '/' + item.book.i)}" ${state.book === item.poet.i + '/' + item.book.i ? 'selected' : ''}>${escapeHTML(item.book.n)} · ${escapeHTML(item.poet.n)}</option>`).join('')}</select><select class="select" id="archive-genre" aria-label="نوع شعر">${genres.map(genre => `<option value="${genre}" ${state.genre === genre ? 'selected' : ''}>${genre === 'all' ? tr('all') : genre}</option>`).join('')}</select><button class="button secondary" data-clear-filters>${lang === 'fa' ? 'پاک کردن فیلترها' : 'Clear filters'}</button></div>${archiveResults()}</section>`;
  };
  const coupletFromKey = key => {
    const parts = key.split('/');
    const index = Number(parts.pop());
    const poemId = parts.pop();
    const bookId = parts.pop();
    const poetId = parts.join('/');
    const poem = poems.find(item => item.poetId === poetId && item.bookId === bookId && item.id === poemId);
    return poem && Number.isInteger(index) ? { poem, index, text: (poem.couples[index] || []).filter(Boolean).join(' · ') } : null;
  };
  const poemView = () => {
    const poem = poems.find(item => item.poetId === state.poetId && item.bookId === state.bookId && item.id === state.poemId);
    if (!poem) return homeView();
    markRead(poem);
    state.active = poem;
    const list = poemsByBook[`${state.poetId}/${state.bookId}`] || [];
    const position = list.findIndex(item => item.id === poem.id);
    const previous = list[position - 1];
    const next = list[position + 1];
    const person = peopleById[poem.poetId];
    const book = person?.b.find(item => item.i === poem.bookId) || { i: poem.bookId, n: poem.bookTitle };
    return `<section class="poem-shell"><div class="poem-heading"><button class="back-link" data-back>← ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-poet="${escapeHTML(poem.poetId)}">${escapeHTML(poem.poetName)}</button><span>/</span><span>${escapeHTML(poem.bookTitle)}</span></div><p class="kicker">${escapeHTML(poem.poetName)} · ${escapeHTML(poem.bookTitle)}</p><h1>${escapeHTML(poem.title)}</h1><p>${fa(poem.couples.length)} ${lang === 'fa' ? 'بیت' : 'couplets'}</p><div class="poem-tools"><button class="button secondary" data-fav="${escapeHTML(idOf(poem))}">${favorites.has(idOf(poem)) ? '★ ' + tr('saved') : '☆ ' + tr('save')}</button><button class="button secondary" data-share="poem">↗ ${lang === 'fa' ? 'اشتراک‌گذاری' : 'Share'}</button><button class="button secondary" data-copy>${icon('copy')}${tr('copy')}</button><button class="button" data-random="book">${icon('dice')}${tr('random')}</button></div></div><div class="context-card glass"><strong>${tr('poemInfo')}</strong><br>${escapeHTML(bookContext(person, book, list))}</div><div class="poem-copy">${poem.couples.map((couple, index) => { const key = `${idOf(poem)}/${index}`; const note = notes[key] || ''; const saved = coupletFavorites.has(key); return `<article class="couplet"><span class="couplet-no">${fa(index + 1)}</span><div class="couplet-text"><p>${escapeHTML(couple[0] || '')}</p>${couple[1] ? `<p>${escapeHTML(couple[1])}</p>` : ''}${note ? `<p class="verse-note">${escapeHTML(note)}</p>` : ''}</div><div class="couplet-actions"><button class="couplet-note" data-couplet-note="${escapeHTML(key)}" aria-label="${tr('note')}" title="${tr('note')}">＋</button><button class="couplet-share" data-couplet-share="${escapeHTML(key)}" aria-label="${lang === 'fa' ? 'اشتراک‌گذاری' : 'Share'}" title="${lang === 'fa' ? 'اشتراک‌گذاری' : 'Share'}">↗</button></div><button class="couplet-heart ${saved ? 'saved' : ''}" data-couplet-fav="${escapeHTML(key)}" aria-label="${tr('save')}" title="${tr('save')}">${saved ? '♥' : '♡'}</button></article>`; }).join('')}</div><div class="poem-nav">${previous ? `<button data-poem="${escapeHTML(idOf(previous))}">← ${escapeHTML(previous.title)}</button>` : '<span></span>'}${next ? `<button data-poem="${escapeHTML(idOf(next))}">${escapeHTML(next.title)} →</button>` : '<span></span>'}</div></section>`;
  };
  const accountView = () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${now.getMonth()}`;
    const todayCount = readingHistory.filter(item => new Date(item.at).toDateString() === now.toDateString()).length;
    const monthCount = readingHistory.filter(item => { const date = new Date(item.at); return `${date.getFullYear()}-${date.getMonth()}` === month; }).length;
    const recent = readingHistory.slice().sort((a, b) => b.at - a.at).slice(0, 8);
    const savedPoems = poems.filter(poem => favorites.has(idOf(poem))).slice(0, 12);
    const savedPoets = people.filter(person => poetFavorites.has(person.i));
    const savedCouplets = [...coupletFavorites].map(coupletFromKey).filter(Boolean).slice(0, 12);
    const tab = state.favoriteTab;
    const items = tab === 'poems'
      ? savedPoems.map(poem => `<article class="history-item glass" data-poem="${escapeHTML(idOf(poem))}"><span><h3>${escapeHTML(poem.title)}</h3><small>${escapeHTML(poem.poetName)}</small></span><span>←</span></article>`).join('')
      : tab === 'poets'
        ? savedPoets.map(person => `<article class="favorite-poet glass" data-poet="${escapeHTML(person.i)}"><span><h3>${escapeHTML(person.n)}</h3><small>${escapeHTML(blurbs[person.i] || '')}</small></span><span>←</span></article>`).join('')
        : savedCouplets.map(item => `<article class="favorite-couplet glass" data-poem="${escapeHTML(idOf(item.poem))}"><span><h3>${escapeHTML(item.text.slice(0, 75))}</h3><small>${escapeHTML(item.poem.poetName)} · ${escapeHTML(item.poem.title)}</small></span><span>♥</span></article>`).join('');
    return `<section class="page"><div class="page-hero"><p class="eyebrow">${tr('account')}</p><h1>${escapeHTML(profile || tr('account'))}</h1><p>${lang === 'fa' ? 'کتابخانه و ردپای خواندن تو؛ بدون حساب جداگانه.' : 'Your library and reading trail.'}</p></div><div class="profile-field"><input class="field" id="profile-input" value="${escapeHTML(profile)}" placeholder="${tr('profilePlaceholder')}" aria-label="${tr('profile')}"><button class="button" data-save-profile>${tr('save')}</button></div><div class="account-grid"><div class="stat-card glass"><strong>${fa(todayCount)}</strong><span>${tr('today')}</span></div><div class="stat-card glass"><strong>${fa(monthCount)}</strong><span>${tr('month')}</span></div><div class="stat-card glass"><strong>${fa(readingHistory.length)}</strong><span>${tr('total')}</span></div></div><div class="tabs"><button class="tab ${tab === 'poems' ? 'active' : ''}" data-favorite-tab="poems">${tr('saved')} · ${fa(favorites.size)}</button><button class="tab ${tab === 'poets' ? 'active' : ''}" data-favorite-tab="poets">${tr('poets')} · ${fa(poetFavorites.size)}</button><button class="tab ${tab === 'couplets' ? 'active' : ''}" data-favorite-tab="couplets">${lang === 'fa' ? 'بیت‌ها' : 'Verses'} · ${fa(coupletFavorites.size)}</button></div><div class="history-list account-items">${items || `<div class="empty">${tr('empty')}</div>`}</div><div class="section-head account-history-heading"><div><h2>${tr('history')}</h2><p>${fa(recent.length)} ${lang === 'fa' ? 'آخرین خوانش' : 'recent reads'}</p></div><button class="button secondary" data-clear-history>${lang === 'fa' ? 'پاک کردن' : 'Clear'}</button></div><div class="history-list">${recent.map(item => { const poem = poems.find(candidate => idOf(candidate) === item.id); return poem ? `<article class="history-item glass" data-poem="${escapeHTML(item.id)}"><span><h3>${escapeHTML(poem.title)}</h3><small>${escapeHTML(poem.poetName)} · ${new Date(item.at).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US')}</small></span><span>←</span></article>` : ''; }).join('') || `<div class="empty">${tr('empty')}</div>`}</div></section>`;
  };
  const settingsView = () => `<section class="page"><div class="page-hero"><p class="eyebrow">${tr('settings')}</p><h1>${tr('settings')}</h1><p>${lang === 'fa' ? 'جریان را برای شیوهٔ خواندن خودت تنظیم کن.' : 'Make Jaryan yours.'}</p></div><div class="settings-grid"><div class="setting-card glass"><div><h3>${tr('size')}</h3><p>${lang === 'fa' ? 'اندازهٔ پیش‌فرض ۱۰۰٪ است و برای خوانایی تا ۴۰۰٪ افزایش می‌یابد.' : 'The default is 100%, with a readable range up to 400%.'}</p></div><div class="range-wrap"><input class="range" type="range" min="100" max="400" step="1" value="${sizeScale}" data-size-range aria-label="${tr('size')}"><span class="range-value" id="size-scale-label">${fa(sizeScale)}٪</span><button class="default-size" data-size-default>${lang === 'fa' ? 'پیش‌فرض' : 'Default'}</button></div></div><div class="setting-card glass"><div><h3>${tr('font')}</h3><p>${lang === 'fa' ? 'راوی، یکان، ایران‌سنس یا نستعلیق' : 'Choose a typeface'}</p></div><div class="setting-options"><button class="${font === 'ravi' ? 'active' : ''}" data-font="ravi">Ravi</button><button class="${font === 'yekan' ? 'active' : ''}" data-font="yekan">Yekan</button><button class="${font === 'iransans' ? 'active' : ''}" data-font="iransans">ایران‌سنس</button><button class="${font === 'nastaliq' ? 'active' : ''}" data-font="nastaliq">نستعلیق</button></div></div><div class="setting-card glass"><div><h3>${tr('language')}</h3><p>فارسی / English</p></div><div class="setting-options"><button class="${lang === 'fa' ? 'active' : ''}" data-lang="fa">فارسی</button><button class="${lang === 'en' ? 'active' : ''}" data-lang="en">English</button></div></div><div class="setting-card glass"><div><h3>${tr('theme')}</h3><p>${lang === 'fa' ? 'روشن، کاغذی، تیره یا هماهنگ با تنظیمات سیستم.' : 'Light, paper, dark or your system preference.'}</p></div><div class="setting-options"><button class="${theme === 'light' ? 'active' : ''}" data-theme="light">${tr('light')}</button><button class="${theme === 'paper' ? 'active' : ''}" data-theme="paper">${tr('paper')}</button><button class="${theme === 'dark' ? 'active' : ''}" data-theme="dark">${tr('dark')}</button><button class="${theme === 'system' ? 'active' : ''}" data-theme="system">${tr('system')}</button></div></div></div></section>`;

  let renderToken = 0;
  const render = async () => {
    applyPreferences();
    const token = ++renderToken;
    const main = document.getElementById('main');
    if (state.page === 'poem') {
      main.innerHTML = `<section class="page"><div class="loading glass">${lang === 'fa' ? 'در حال بارگذاری شعر...' : 'Loading poem...'}</div></section>`;
      try {
        const poem = poems.find(item => item.poetId === state.poetId && item.bookId === state.bookId && item.id === state.poemId);
        if (poem) await ensurePoemLoaded(poem);
      } catch {
        if (token === renderToken) main.innerHTML = `<section class="page"><div class="loading glass">${lang === 'fa' ? 'بارگذاری شعر ممکن نشد.' : 'Could not load this poem.'}</div></section>`;
        return;
      }
      if (token !== renderToken) return;
    }
    main.innerHTML = state.page === 'home' || state.page === 'poets' ? homeView()
      : state.page === 'poet' ? poetView()
        : state.page === 'book' ? bookView()
          : state.page === 'poem' ? poemView()
            : state.page === 'archive' ? archiveView()
              : state.page === 'account' ? accountView() : settingsView();
    document.querySelectorAll('[data-route]').forEach(element => element.classList.toggle('active', element.dataset.route === state.page));
  };

  let searchTimer = 0;
  const refreshArchiveResults = () => {
    const results = document.getElementById('archive-results');
    if (results) results.outerHTML = archiveResults();
  };
  const handleSearchInput = target => {
    const value = target.value;
    const caret = target.selectionStart ?? value.length;
    state.query = value;
    state.limit = 24;
    if (target.id === 'home-search') {
      history.pushState({}, '', '#archive');
      routeFromHash();
      render().then(() => {
        const input = document.getElementById('archive-search');
        if (!input) return;
        input.focus();
        input.setSelectionRange(Math.min(caret, value.length), Math.min(caret, value.length));
      });
    } else {
      refreshArchiveResults();
    }
    clearTimeout(searchTimer);
    if (normalize(value)) {
      searchTimer = setTimeout(() => {
        loadSearchIndex().then(() => {
          if (state.query === value) refreshArchiveResults();
        });
      }, 160);
    }
  };

  document.addEventListener('input', event => {
    if (event.target.matches('#home-search, #archive-search')) handleSearchInput(event.target);
    if (event.target.matches('[data-size-range]')) {
      sizeScale = Math.max(100, Math.min(400, Number(event.target.value)));
      localStorage.setItem('jaryan-size-scale', String(sizeScale));
      applyPreferences();
      const label = document.getElementById('size-scale-label');
      if (label) label.textContent = `${fa(sizeScale)}٪`;
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'archive-poet') { state.poet = event.target.value; state.book = 'همه'; state.limit = 24; refreshArchiveResults(); }
    if (event.target.id === 'archive-book') { state.book = event.target.value; state.limit = 24; refreshArchiveResults(); }
    if (event.target.id === 'archive-genre') { state.genre = event.target.value; state.limit = 24; refreshArchiveResults(); }
  });
  document.addEventListener('click', event => {
    const target = event.target;
    if (target.id === 'modal-backdrop' || target.closest('[data-close-modal]')) { closeModal(); return; }
    const favorite = target.closest('[data-fav]');
    if (favorite) { toggleSet(favorites, favorite.dataset.fav, 'jaryan-favorites'); render(); showToast(favorites.has(favorite.dataset.fav) ? '✓' : '×'); return; }
    const coupletFavorite = target.closest('[data-couplet-fav]');
    if (coupletFavorite) { toggleSet(coupletFavorites, coupletFavorite.dataset.coupletFav, 'jaryan-couplet-favorites'); render(); showToast(coupletFavorites.has(coupletFavorite.dataset.coupletFav) ? '♥' : '×'); return; }
    const poetFavorite = target.closest('[data-poet-fav]');
    if (poetFavorite) { toggleSet(poetFavorites, poetFavorite.dataset.poetFav, 'jaryan-poet-favorites'); render(); return; }
    const note = target.closest('[data-couplet-note]');
    if (note) { openNoteEditor(note.dataset.coupletNote); return; }
    const noteSave = target.closest('[data-save-couplet-note]');
    if (noteSave) {
      const value = document.getElementById('note-editor')?.value.trim() || '';
      if (value) notes[noteSave.dataset.saveCoupletNote] = value;
      else delete notes[noteSave.dataset.saveCoupletNote];
      localStorage.setItem('jaryan-notes', JSON.stringify(notes));
      closeModal();
      render();
      return;
    }
    const share = target.closest('[data-share]');
    if (share && state.active) { shareText(state.active.title, [state.active.poetName, state.active.bookTitle, state.active.title, ...state.active.couples.flat()].join('\n')); return; }
    const coupletShare = target.closest('[data-couplet-share]');
    if (coupletShare) { const item = coupletFromKey(coupletShare.dataset.coupletShare); if (item) shareText(item.poem.title, `${item.poem.poetName} · ${item.poem.title}\n\n${item.text}`); return; }
    const archiveType = target.closest('[data-archive-type]');
    if (archiveType) { state.archiveType = archiveType.dataset.archiveType; state.limit = 24; render(); return; }
    if (target.closest('[data-more-archive]')) { state.limit += 24; refreshArchiveResults(); return; }
    if (target.closest('[data-more-sections]')) { state.limit += 24; render(); return; }
    if (target.closest('[data-clear-filters]')) { state.poet = 'همه'; state.book = 'همه'; state.genre = 'all'; state.archiveType = 'all'; state.limit = 24; render(); return; }
    const favoriteTab = target.closest('[data-favorite-tab]');
    if (favoriteTab) { state.favoriteTab = favoriteTab.dataset.favoriteTab; render(); return; }
    if (target.closest('[data-clear-history]')) { readingHistory = []; localStorage.removeItem('jaryan-history'); render(); return; }
    const profileSave = target.closest('[data-save-profile]');
    if (profileSave) { profile = document.getElementById('profile-input')?.value.trim() || ''; localStorage.setItem('jaryan-profile', profile); render(); return; }
    const sizeDefault = target.closest('[data-size-default]');
    if (sizeDefault) { sizeScale = 100; localStorage.setItem('jaryan-size-scale', '100'); render(); return; }
    const themeOption = target.closest('[data-theme]');
    if (themeOption) { theme = themeOption.dataset.theme; localStorage.setItem('jaryan-theme', theme); render(); return; }
    const fontOption = target.closest('button[data-font]');
    if (fontOption) { font = fontOption.dataset.font; localStorage.setItem('jaryan-font', font); applyPreferences(); render(); return; }
    const languageOption = target.closest('[data-lang]');
    if (languageOption) { lang = languageOption.dataset.lang; localStorage.setItem('jaryan-lang', lang); applyPreferences(); layout(); render(); return; }
    if (target.closest('#theme-toggle')) {
      theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
      localStorage.setItem('jaryan-theme', theme);
      applyPreferences();
      layout();
      render();
      return;
    }
    const bookInfo = target.closest('[data-book-info]');
    if (bookInfo) { const [poetId, bookId] = bookInfo.dataset.bookInfo.split('/'); const person = peopleById[poetId]; const book = person?.b.find(item => item.i === bookId); if (person && book) openInfo(`${tr('bookInfo')} · ${book.n}`, bookFacts[book.i] || bookContext(person, book, poemsByBook[`${poetId}/${bookId}`] || [])); return; }
    const poetInfo = target.closest('[data-poet-info]');
    if (poetInfo) { const person = peopleById[poetInfo.dataset.poetInfo]; if (person) openInfo(`${tr('info')} · ${person.n}`, bios[person.i] || ''); return; }
    if (target.closest('[data-copy]')) { if (state.active) navigator.clipboard?.writeText(state.active.couples.map(couple => couple.join('\n')).join('\n\n')); showToast('✓'); return; }
    if (target.closest('[data-random]')) {
      const scope = target.closest('[data-random]').dataset.random;
      let list = poems;
      if (scope === 'book') list = poemsByBook[`${state.poetId}/${state.bookId}`] || list;
      if (scope === 'poet') list = list.filter(poem => poem.poetId === state.poetId);
      const poem = list[Math.floor(Math.random() * list.length)];
      if (poem) navigate(`poem/${poem.poetId}/${poem.bookId}/${poem.id}`);
      return;
    }
    const poem = target.closest('[data-poem]');
    if (poem) { const item = poems.find(candidate => idOf(candidate) === poem.dataset.poem); if (item) navigate(`poem/${item.poetId}/${item.bookId}/${item.id}`); return; }
    const book = target.closest('[data-book]');
    if (book) { const [poetId, bookId] = book.dataset.book.split('/'); navigate(`book/${poetId}/${bookId}`); return; }
    const poet = target.closest('[data-poet]');
    if (poet) { navigate(`poet/${poet.dataset.poet}`); return; }
    if (target.closest('[data-back]')) { goBack(); return; }
    const route = target.closest('[data-route]');
    if (route) { navigate(route.dataset.route); return; }
  });
  window.addEventListener('popstate', () => { routeFromHash(); render(); });
  window.addEventListener('hashchange', () => { routeFromHash(); render(); });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#home-search, #archive-search')?.focus(); }
    if (event.key === 'Escape') closeModal();
  });
  let touchStart = null;
  document.addEventListener('touchstart', event => { if (event.touches.length === 1 && !event.target.closest('input,textarea,select,button,a')) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
  document.addEventListener('touchend', event => { if (!touchStart) return; const dx = event.changedTouches[0].clientX - touchStart.x; const dy = event.changedTouches[0].clientY - touchStart.y; touchStart = null; if (dx > 80 && Math.abs(dy) < 100 && state.page !== 'home') goBack(); }, { passive: true });

  routeFromHash();
  applyPreferences();
  layout();
  await render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
})();
