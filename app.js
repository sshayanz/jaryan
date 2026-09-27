(async () => {
  'use strict';

  const APP_VERSION = '0.1.0b7';
  const APP_VERSION_FA = '۰.۱.۰b۷';
  const app = document.getElementById('app');
  const API_BASE = String(window.JARYAN_API_BASE || '').replace(/\/$/, '');
  const fa = value => Number(value || 0).toLocaleString('fa-IR');
  const readJSON = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  };

  const userDB = (() => {
    const fallback = () => ({
       profile: localStorage.getItem('jaryan-profile') || '',
       account: readJSON('jaryan-account', { name: localStorage.getItem('jaryan-profile') || '', mobile: '', username: '' }),
      favorites: readJSON('jaryan-favorites', []),
      poetFavorites: readJSON('jaryan-poet-favorites', []),
      bookFavorites: readJSON('jaryan-book-favorites', []),
      coupletFavorites: readJSON('jaryan-couplet-favorites', []),
      notes: readJSON('jaryan-notes', {}),
      history: readJSON('jaryan-history', [])
    });
    const open = typeof indexedDB === 'undefined' ? Promise.resolve(null) : new Promise(resolve => {
      const request = indexedDB.open('jaryan-user-db', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('user');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    const load = async () => {
      const db = await open;
      if (!db) return fallback();
      return new Promise(resolve => {
        const request = db.transaction('user', 'readonly').objectStore('user').get('profile');
        request.onsuccess = () => resolve(request.result || fallback());
        request.onerror = () => resolve(fallback());
      });
    };
    const save = async value => {
       localStorage.setItem('jaryan-profile', value.profile || '');
       localStorage.setItem('jaryan-account', JSON.stringify(value.account || { name: '', mobile: '', username: '' }));
      localStorage.setItem('jaryan-favorites', JSON.stringify(value.favorites || []));
      localStorage.setItem('jaryan-poet-favorites', JSON.stringify(value.poetFavorites || []));
      localStorage.setItem('jaryan-book-favorites', JSON.stringify(value.bookFavorites || []));
      localStorage.setItem('jaryan-couplet-favorites', JSON.stringify(value.coupletFavorites || []));
      localStorage.setItem('jaryan-notes', JSON.stringify(value.notes || {}));
      localStorage.setItem('jaryan-history', JSON.stringify(value.history || []));
      const db = await open;
      if (!db) return;
      await new Promise(resolve => {
        const request = db.transaction('user', 'readwrite').objectStore('user').put(value, 'profile');
        request.onsuccess = request.onerror = () => resolve();
      });
    };
    return { load, save };
  })();

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
  const escapeRegExp = value => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const highlightText = (value, query) => {
    const terms = String(query || '').trim().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
    const escaped = escapeHTML(value);
    if (!terms.length) return escaped;
    const pattern = terms.map(escapeRegExp).join('|');
    return escaped.replace(new RegExp(`(${pattern})`, 'giu'), '<mark>$1</mark>');
  };
  const idOf = poem => `${poem.poetId}/${poem.bookId}/${poem.id}`;
  const queryWords = query => normalize(query).split(' ').filter(Boolean);
  const matchesNormalized = (haystack, query) => {
    const words = queryWords(query);
    return words.length === 0 || words.every(word => haystack.includes(word));
  };
  const matches = (value, query) => matchesNormalized(normalize(value), query);

  const portraits = [
    '<path d="M21 104c4-27 19-43 43-43s39 16 43 43M39 45c0-20 10-32 25-32s25 12 25 32-10 31-25 31-25-11-25-31Z"/><path d="M40 30c12-16 34-18 49-2M44 50c6 4 12 4 18 0M68 50c6 4 12 4 18 0M57 56c2 4 2 7 0 10M51 66c9 11 19 11 28 0M50 85c8 8 21 8 29 0M58 103V79M70 103V79M48 91l-9 13M80 91l9 13M31 23l-9 13M97 23l9 13"/>',
    '<path d="M19 104c6-28 21-43 45-43s39 15 45 43M39 44c1-21 10-32 26-32s25 11 25 32c-1 20-10 31-25 31S40 64 39 44Z"/><path d="M40 30c14 5 32 5 48-2M48 53h8M70 53h8M57 59c2 3 2 6 0 9M57 68c6 4 12 4 18 0M49 79c9 10 23 10 32 0M48 91c9 6 23 6 32 0M45 101l11-15M83 101 72 86"/>',
    '<path d="M20 104c5-28 20-43 44-43s39 15 44 43M40 44c0-20 9-32 24-32s24 12 24 32-9 31-24 31-24-11-24-31Z"/><path d="M42 29c14-10 31-9 44 2M49 54h7M72 54h7M59 59c2 3 2 6 0 9M56 68c5 5 11 5 17 0M50 82c9 7 21 7 30 0M43 99l13-16M85 99 72 83M90 26l12-11M99 35l13-2M31 28l-10-8"/>'
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
     gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m9.7 3.8.6-1.3h3.4l.6 1.3 1.5.7 1.4-.4 2.4 2.4-.4 1.4.7 1.5 1.3.6v3.4l-1.3.6-.7 1.5.4 1.4-2.4 2.4-1.4-.4-1.5.7-.6 1.3h-3.4l-.6-1.3-1.5-.7-1.4.4-2.4-2.4.4-1.4-.7-1.5-1.3-.6V10l1.3-.6.7-1.5-.4-1.4 2.4-2.4 1.4.4 1.5-.7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 0Z"/><path d="M5 4v16M8 7h7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>',
     check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m5 12 4 4L19 6"/></svg>',
     share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V4M7 9l5-5 5 5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
     download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v11M7 10l5 5 5-5M5 20h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14"/></svg>',
    focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4Z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.8 8.7c0 5.5-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z"/></svg>',
     dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 2.8-1.7 6.1L4.2 10.6l6.1 1.7 1.7 6.1 1.7-6.1 6.1-1.7-6.1-1.7Z"/><path d="m19.1 16.1-.6 2.1-2.1.6 2.1.6.6 2.1.6-2.1 2.1-.6-2.1-.6ZM5 3l.4 1.6L7 5l-1.6.4L5 7l-.4-1.6L3 5l1.6-.4Z"/></svg>',
     shine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 2.8-1.7 6.1L4.2 10.6l6.1 1.7 1.7 6.1 1.7-6.1 6.1-1.7-6.1-1.7Z"/><path d="m19.1 16.1-.6 2.1-2.1.6 2.1.6.6 2.1.6-2.1 2.1-.6-2.1-.6ZM5 3l.4 1.6L7 5l-1.6.4L5 7l-.4-1.6L3 5l1.6-.4Z"/></svg>',
     fortune: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 2.8-1.7 6.1L4.2 10.6l6.1 1.7 1.7 6.1 1.7-6.1 6.1-1.7-6.1-1.7Z"/><path d="m19.1 16.1-.6 2.1-2.1.6 2.1.6.6 2.1.6-2.1 2.1-.6-2.1-.6ZM5 3l.4 1.6L7 5l-1.6.4L5 7l-.4-1.6L3 5l1.6-.4Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  };
  const icon = name => icons[name] || '';

  const translations = {
    fa: {
      home: 'خانه', poets: 'شاعران', archive: 'آرشیو', account: 'حساب من', settings: 'تنظیمات',
       search: 'جست‌وجوی شعرها…', random: 'شعر تصادفی', randomPoem: 'فال شما',
       books: 'مجموعه‌ها', sections: 'بخش‌ها', save: 'ذخیره', saved: 'ذخیره‌شده‌ها', savedItem: 'ذخیره‌شده', history: 'تاریخچهٔ خواندن',
       today: 'امروز', month: 'این ماه', total: 'مجموع خوانده‌ها', more: 'نمایش بیشتر', back: 'بازگشت',
       copy: 'کپی شعر', note: 'یادداشت', writeNote: 'یادداشتت را اینجا بنویس...', font: 'فونت', appFont: 'فونت برنامه', poemFont: 'فونت اشعار',
       size: 'اندازهٔ نوشته', language: 'زبان', theme: 'تم', light: 'روشن', lightMode: 'لایت مود', paper: 'کاغذی', dark: 'تیره', darkMode: 'دارک مود',
       system: 'سیستم', toggleTheme: 'تغییر تم', profile: 'نام نمایشی', profilePlaceholder: 'نام خود را بنویسید', empty: 'نتیجه‌ای پیدا نشد.',
       name: 'نام', mobile: 'شماره موبایل', mobilePlaceholder: 'مثلاً ۰۹۱۲۱۲۳۴۵۶۷', current: 'فعلی', large: 'بزرگ', larger: 'بزرگ‌تر', login: 'ورود به حساب', register: 'ساخت حساب', accountTitle: 'حساب کاربری',
       iranNastaliq: 'ایران نستعلیق', shekastehNastaliq: 'شکسته نستعلیق', mirEmad: 'میرعماد', serverNotice: 'نام، شماره و اطلاعات دستگاه با رضایت تو برای حساب ذخیره می‌شود.', consent: 'با ذخیرهٔ اطلاعات حساب و دستگاه موافقم',
       feedback: 'ارسال نظر', feedbackTitle: 'نظر یا پیشنهادت را بفرست', feedbackPlaceholder: 'پیامت را بنویس...', feedbackCategory: 'نوع پیام', feedbackGeneral: 'نظر عمومی', feedbackBug: 'گزارش باگ', feedbackSuggestion: 'پیشنهاد', sendFeedback: 'ارسال نظر', feedbackRequired: 'متن نظر را وارد کن', feedbackSent: 'نظر با موفقیت ارسال شد', feedbackOffline: 'نظر محلی ذخیره شد؛ برای ارسال آنلاین سرور را فعال کن',
      info: 'دربارهٔ این شاعر', bookInfo: 'دربارهٔ این مجموعه', poemInfo: 'برای مکث و دوباره‌خوانی',
       all: 'همه', poetType: 'شاعر', bookType: 'کتاب', poemType: 'شعر', choosePoet: 'همهٔ شاعران',
       chooseBook: 'همهٔ کتاب‌ها', menu: 'منو', searching: 'در حال آماده‌سازی جست‌وجوی متن شعر...', adminPanel: 'پنل مدیریت', adminAccess: 'دسترسی مدیریت فعال است', adminExport: 'خروجی داده‌های من', adminClearOutbox: 'پاک کردن صف نظرها', adminStats: 'آمار محلی حساب', adminSaved: 'ذخیره‌شده', adminReads: 'خوانده‌شده', adminQueued: 'نظر در صف', adminExported: 'خروجی آماده شد', adminCleared: 'صف نظرها پاک شد'
    },
    en: {
      home: 'Home', poets: 'Poets', archive: 'Archive', account: 'My space', settings: 'Settings',
      search: 'Search a poet, book, title or verse', random: 'Random poem', randomPoem: 'Poem fortune',
       books: 'Collections', sections: 'Sections', save: 'Save', saved: 'Saved', savedItem: 'Saved', history: 'Reading history',
      today: 'Today', month: 'This month', total: 'Total reads', more: 'Show more', back: 'Back',
       copy: 'Copy poem', note: 'Note', writeNote: 'Write a note...', font: 'Font', appFont: 'App font', poemFont: 'Poem font', size: 'App scale',
       language: 'Language', theme: 'Theme', light: 'Light', lightMode: 'Light mode', paper: 'Paper', dark: 'Dark', darkMode: 'Dark mode', system: 'System',
         toggleTheme: 'Toggle theme', profile: 'Display name', profilePlaceholder: 'Write your name', empty: 'No result found.',
        name: 'Name', mobile: 'Mobile number', mobilePlaceholder: 'e.g. +1 555 123 4567', current: 'Current', large: 'Large', larger: 'Larger', login: 'Sign in', register: 'Create account', accountTitle: 'User account',
       iranNastaliq: 'Iran Nastaliq', shekastehNastaliq: 'Shekasteh Nastaliq', mirEmad: 'Mir Emad', serverNotice: 'Your name, mobile and device details are stored with your consent.', consent: 'I agree to save account and device details',
       feedback: 'Send feedback', feedbackTitle: 'Send your feedback', feedbackPlaceholder: 'Write your message...', feedbackCategory: 'Message type', feedbackGeneral: 'General', feedbackBug: 'Bug report', feedbackSuggestion: 'Suggestion', sendFeedback: 'Send feedback', feedbackRequired: 'Write a message first', feedbackSent: 'Feedback sent', feedbackOffline: 'Feedback saved locally; enable the server for online delivery',
      info: 'About this poet', bookInfo: 'About this collection', poemInfo: 'A note for rereading', all: 'All',
      poetType: 'Poet', bookType: 'Book', poemType: 'Poem', choosePoet: 'All poets', chooseBook: 'All books',
       menu: 'Menu', searching: 'Preparing full-text search...', adminPanel: 'Admin panel', adminAccess: 'Admin access enabled', adminExport: 'Export my data', adminClearOutbox: 'Clear feedback queue', adminStats: 'Local account stats', adminSaved: 'Saved', adminReads: 'Reads', adminQueued: 'Queued feedback', adminExported: 'Export ready', adminCleared: 'Feedback queue cleared'
    }
  };
  const tr = key => translations[lang][key] || key;

  let lang = localStorage.getItem('jaryan-lang') || 'fa';
  const themeOptions = ['dark-mode', 'light-mode', 'dark', 'light', 'paper', 'system'];
  const storedTheme = localStorage.getItem('jaryan-theme');
  const migratedTheme = !localStorage.getItem('jaryan-theme-schema') && storedTheme === 'dark' ? 'dark-mode' : storedTheme;
  let theme = themeOptions.includes(migratedTheme) ? migratedTheme : 'system';
  localStorage.setItem('jaryan-theme-schema', 'b7');
  const systemPrefersDark = () => Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const isDarkTheme = () => theme === 'dark-mode' || theme === 'dark' || (theme === 'system' && systemPrefersDark());
  const normalizedDigits = value => String(value ?? '').replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const normalizedAdminName = value => String(value ?? '').trim().toLocaleLowerCase('fa-IR').replace(/\s+/g, ' ');
  const isAdminAccount = () => normalizedDigits(account?.mobile || account?.username).replace(/\D/g, '') === '09352282285'
    && ['شایان', 'shayan'].includes(normalizedAdminName(account?.name || profile));
  let appFont = localStorage.getItem('jaryan-app-font') || localStorage.getItem('jaryan-font') || (lang === 'en' ? 'english' : 'ravi');
  let poemFont = ['ravi', 'iran-nastaliq', 'shekasteh', 'mir-emad'].includes(localStorage.getItem('jaryan-poem-font'))
    ? localStorage.getItem('jaryan-poem-font') : 'ravi';
  let profile = localStorage.getItem('jaryan-profile') || '';
  let account = readJSON('jaryan-account', { name: profile, mobile: '', username: '' });
  account = account && typeof account === 'object' ? { ...account, loggedIn: account.loggedIn !== false } : { name: profile, mobile: '', username: '', loggedIn: false };
  if (profile === 'خوانندهٔ جریان' || profile === 'خواننده جریان') {
    profile = '';
    localStorage.removeItem('jaryan-profile');
  }
  let sizeScale = Math.max(100, Math.min(400, Number(localStorage.getItem('jaryan-size-scale') || 100)));
  let uiScale = ['current', 'large', 'larger'].includes(localStorage.getItem('jaryan-ui-scale'))
    ? localStorage.getItem('jaryan-ui-scale') : 'current';
  let favorites = new Set(readJSON('jaryan-favorites', []));
  let poetFavorites = new Set(readJSON('jaryan-poet-favorites', []));
  let bookFavorites = new Set(readJSON('jaryan-book-favorites', []));
  let coupletFavorites = new Set(readJSON('jaryan-couplet-favorites', []));
  let notes = readJSON('jaryan-notes', {});
  let readingHistory = readJSON('jaryan-history', []);
  const state = {
    page: 'home', poetId: null, bookId: null, poemId: null, query: '', poet: 'همه', book: 'همه',
    genre: 'all', archiveType: 'all', searchCommitted: false, limit: 24, active: null, favoriteTab: 'poems'
  };
  let focusIndex = 0;

  const savedUser = await userDB.load();
  if (savedUser) {
    account = { ...account, ...(savedUser.account || {}), loggedIn: savedUser.account?.loggedIn !== false && account.loggedIn !== false };
    profile = account.loggedIn ? account.name || savedUser.profile || profile : '';
    favorites = new Set(savedUser.favorites || [...favorites]);
    poetFavorites = new Set(savedUser.poetFavorites || [...poetFavorites]);
    bookFavorites = new Set(savedUser.bookFavorites || [...bookFavorites]);
    coupletFavorites = new Set(savedUser.coupletFavorites || [...coupletFavorites]);
    notes = savedUser.notes || notes;
    readingHistory = savedUser.history || readingHistory;
  }
  const saveUserData = () => userDB.save({
    profile,
    account,
    favorites: [...favorites],
    poetFavorites: [...poetFavorites],
    bookFavorites: [...bookFavorites],
    coupletFavorites: [...coupletFavorites],
    notes,
    history: readingHistory
  });

  const deviceInfo = () => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform || '',
    language: navigator.language || '',
    languages: navigator.languages || [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    deviceMemory: navigator.deviceMemory || null,
    touchPoints: navigator.maxTouchPoints || 0,
    referrer: document.referrer || ''
  });
  const serverRequest = async (path, payload) => {
    const response = await fetch(`${API_BASE}/api/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  };
  const syncAccountToServer = async () => {
    if (!account?.consentAt || !account.name || !account.mobile) return false;
    const result = await serverRequest('/users/upsert', { name: account.name, mobile: account.mobile, consentAt: account.consentAt, device: deviceInfo() });
    account = { ...account, remoteId: result.user?.id || account.remoteId, remoteSyncedAt: new Date().toISOString() };
    saveUserData();
    return true;
  };
  const submitFeedback = async (message, category) => serverRequest('/feedback', {
    name: account?.name || '', mobile: account?.mobile || '', message, category, page: location.hash || '#home', device: deviceInfo()
  });

  const ensureLanguageFonts = () => {
    const appChoices = lang === 'fa' ? ['ravi', 'yekan'] : ['english', 'english-serif', 'english-mono'];
    if (!appChoices.includes(appFont)) appFont = appChoices[0];
    if (!['ravi', 'iran-nastaliq', 'shekasteh', 'mir-emad'].includes(poemFont)) poemFont = 'ravi';
    localStorage.setItem('jaryan-app-font', appFont);
    localStorage.setItem('jaryan-poem-font', poemFont);
    return { appFont, poemFont };
  };
  const applyPreferences = () => {
    const activeFonts = ensureLanguageFonts();
    const scale = { current: 1, large: 1.12, larger: 1.25 }[uiScale] || 1;
    document.documentElement.className = `theme-${theme}`;
    document.documentElement.dataset.font = activeFonts.appFont;
    document.documentElement.dataset.appFont = activeFonts.appFont;
    document.documentElement.dataset.poemFont = activeFonts.poemFont;
    document.documentElement.dataset.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.style.setProperty('--scale', String(sizeScale / 100));
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      const dark = isDarkTheme();
      themeToggle.innerHTML = icon(dark ? 'sun' : 'moon');
      themeToggle.setAttribute('aria-label', tr('toggleTheme'));
      themeToggle.setAttribute('title', tr('toggleTheme'));
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  };
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (theme === 'system') applyPreferences();
  });
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
  const setFabOpen = (open, root = null) => {
    const fab = root || document.querySelector('.poem-fab');
    const trigger = fab?.querySelector('[data-poem-fab]');
    const surface = fab?.querySelector('.poem-fab-menu');
    if (!fab || !trigger) return;
    fab.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? 'بستن ابزارهای شعر' : 'بازکردن ابزارهای شعر');
    if (!open || !surface) return;
    requestAnimationFrame(() => fab.style.setProperty('--fab-open-height', `${Math.max(44, surface.scrollHeight)}px`));
  };
  const closeFab = () => setFabOpen(false);
  const scrollToPageStart = () => requestAnimationFrame(() => {
    const main = document.getElementById('main');
    if (main) window.scrollTo({ top: Math.max(0, main.offsetTop - 8), behavior: 'smooth' });
  });
  const cleanFooter = () => {
    document.querySelector('.footer a')?.remove();
    const version = document.querySelector('.footer-links span');
    if (version) version.textContent = lang === 'fa' ? `نسخهٔ ${APP_VERSION_FA}` : `Version ${APP_VERSION}`;
    const help = document.querySelector('.setting-help');
    if (!help) return;
    const copy = help.querySelector('p');
    if (copy) copy.textContent = lang === 'fa' ? `نسخهٔ ${APP_VERSION_FA} · جریان آرشیوی برای خواندن آرام.` : `${APP_VERSION} · A quiet archive for reading.`;
  };
  const syncPoemActions = () => {
    document.querySelectorAll('.poem-tools [data-fav], .poem-fab [data-fav], [data-poet-fav], [data-book-fav]').forEach(button => {
      const saved = button.hasAttribute('data-poet-fav')
        ? poetFavorites.has(button.dataset.poetFav)
        : button.hasAttribute('data-book-fav')
          ? bookFavorites.has(button.dataset.bookFav)
          : favorites.has(button.dataset.fav);
      button.classList.toggle('saved', saved);
      const label = saved ? tr('savedItem') : tr('save');
      button.innerHTML = `${icon('bookmark')}${label}`;
      button.setAttribute('aria-label', label);
    });
  };
  const updateFocusMode = (scroll = false) => {
    const root = document.documentElement;
    const items = [...document.querySelectorAll('.poem-copy .couplet')];
    if (!items.length) return;
    focusIndex = Math.max(0, Math.min(focusIndex, items.length - 1));
    items.forEach((item, index) => {
      item.classList.toggle('is-focus-active', root.classList.contains('focus-mode') && index === focusIndex);
      item.classList.toggle('is-focus-muted', root.classList.contains('focus-mode') && index !== focusIndex);
    });
    if (!root.classList.contains('focus-mode')) return;
    let controls = document.querySelector('.focus-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'focus-controls';
       controls.innerHTML = `<button type="button" data-focus-next>${lang === 'fa' ? 'بیت بعدی →' : 'Next couplet →'}</button><span data-focus-position></span><button type="button" data-focus-prev>← ${lang === 'fa' ? 'بیت قبلی' : 'Previous couplet'}</button><button type="button" class="focus-exit" data-focus-exit aria-label="${tr('back')}" title="${tr('back')}">${icon('close')}</button>`;
      document.querySelector('.poem-shell')?.append(controls);
    }
    controls.querySelector('[data-focus-position]').textContent = `${fa(focusIndex + 1)} / ${fa(items.length)}`;
    controls.querySelector('[data-focus-prev]').disabled = focusIndex === 0;
    controls.querySelector('[data-focus-next]').disabled = focusIndex === items.length - 1;
    if (scroll) requestAnimationFrame(() => items[focusIndex]?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  };
  const setFocusMode = open => {
    if (!open) {
      document.documentElement.classList.remove('focus-mode');
      document.querySelector('.focus-controls')?.remove();
      updateFocusMode();
      return;
    }
    focusIndex = 0;
    document.documentElement.classList.add('focus-mode');
    updateFocusMode(true);
  };
  const moveFocus = delta => {
    if (!document.documentElement.classList.contains('focus-mode')) return;
    focusIndex += delta;
    updateFocusMode(true);
  };
  const navigate = (route, replace = false) => {
    const url = `#${route}`;
    if (replace) history.replaceState({}, '', url);
    else history.pushState({}, '', url);
    routeFromHash();
    closeModal();
    const pending = render();
    if (String(route).split('/')[0] === 'home' || String(route).split('/')[0] === 'poets') window.scrollTo({ top: 0, behavior: 'smooth' });
    else pending.then(scrollToPageStart);
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
  const openRegister = () => {
    const modal = document.querySelector('#modal-backdrop .modal');
    if (!modal) return;
    const savedName = account?.name || profile;
    const savedMobile = account?.mobile || account?.username || '';
    const isLogin = Boolean(savedMobile);
     modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="${tr('back')}">${icon('close')}</button><p class="eyebrow">${tr('account')}</p><h2>${isLogin ? tr('login') : tr('register')}</h2><p>${tr('serverNotice')}</p><label class="register-label" for="register-name">${tr('name')}</label><div class="input-with-clear register-field"><input class="field" id="register-name" value="${escapeHTML(savedName)}" placeholder="${tr('profilePlaceholder')}" maxlength="40" autocomplete="name"><button type="button" class="input-clear" data-clear-input="register-name" aria-label="پاک کردن">${icon('close')}</button></div><label class="register-label" for="register-mobile">${tr('mobile')}</label><div class="input-with-clear register-field"><input class="field" id="register-mobile" value="${escapeHTML(savedMobile)}" placeholder="${tr('mobilePlaceholder')}" maxlength="24" inputmode="tel" autocomplete="tel"><button type="button" class="input-clear" data-clear-input="register-mobile" aria-label="پاک کردن">${icon('close')}</button></div><label class="consent-line"><input type="checkbox" id="register-consent" ${account?.consentAt ? 'checked' : ''}><span>${tr('consent')}</span></label><div class="modal-actions"><button class="button" data-register-save>${isLogin ? tr('login') : tr('register')}</button><button class="button secondary" data-close-modal>${tr('back')}</button></div>`;
    document.getElementById('modal-backdrop').classList.add('open');
    setTimeout(() => document.getElementById('register-name')?.focus(), 0);
  };
  const openFeedback = () => {
    const modal = document.querySelector('#modal-backdrop .modal');
    if (!modal) return;
     modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="${tr('back')}">${icon('close')}</button><p class="eyebrow">${tr('feedback')}</p><h2>${tr('feedbackTitle')}</h2><label class="register-label" for="feedback-category">${tr('feedbackCategory')}</label><select class="field feedback-field" id="feedback-category"><option value="general">${tr('feedbackGeneral')}</option><option value="bug">${tr('feedbackBug')}</option><option value="suggestion">${tr('feedbackSuggestion')}</option></select><label class="register-label" for="feedback-message">${tr('feedback')}</label><div class="input-with-clear textarea-with-clear"><textarea id="feedback-message" placeholder="${tr('feedbackPlaceholder')}" maxlength="3000"></textarea><button type="button" class="input-clear" data-clear-input="feedback-message" aria-label="پاک کردن">${icon('close')}</button></div><div class="modal-actions"><button class="button" data-feedback-send>${tr('sendFeedback')}</button><button class="button secondary" data-close-modal>${tr('back')}</button></div>`;
    document.getElementById('modal-backdrop').classList.add('open');
    setTimeout(() => document.getElementById('feedback-message')?.focus(), 0);
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
    saveUserData();
  };
  const collectionSketch = index => `<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M18 24c18-7 31-4 42 7v48c-11-11-24-14-42-7V24Z"/><path d="M102 24c-18-7-31-4-42 7v48c11-11 24-14 42-7V24Z"/><path d="M60 31v48M27 37c10-1 19 2 27 8M93 37c-10-1-19 2-27 8M29 51c9 0 17 3 25 8M91 51c-9 0-17 3-25 8"/><path d="M83 14c7 5 11 12 10 21"/></svg>`;

   const layout = () => {
       app.innerHTML = `<header class="topbar"><a class="brand" data-route="home" href="#home"><span class="brand-mark">${icon('brand')}</span><span class="brand-name">جریان</span></a><nav class="nav"><button data-route="home">${tr('home')}</button><button data-route="poets">${tr('poets')}</button><button data-route="archive">${tr('archive')}</button><button data-route="settings">${tr('settings')}</button></nav><div class="top-actions"><button class="top-button" id="theme-toggle" aria-label="${tr('toggleTheme')}" title="${tr('toggleTheme')}">${icon(isDarkTheme() ? 'sun' : 'moon')}</button><button class="top-button" data-route="account" aria-label="${tr('account')}" title="${tr('account')}">${icon('user')}</button></div></header><main id="main"></main><footer class="footer"><span>${lang === 'fa' ? '© ۱۴۰۵ جریان؛ آرشیوی برای هر وقت که دلت شعر می‌خواهد' : '© 2026 Jaryan; an archive for every moment you want a poem'}</span><span class="footer-links"><span>نسخهٔ ${APP_VERSION_FA}</span><button class="footer-feedback" data-feedback>${tr('feedback')}</button></span></footer><div class="modal-backdrop" id="modal-backdrop"><section class="modal glass"><button class="icon-button modal-close" data-close-modal aria-label="بستن">${icon('close')}</button><h2 id="modal-title"></h2><p id="modal-copy"></p></section></div><div id="toast" role="status" aria-live="polite"></div>`;
      document.querySelector('.mobile-nav')?.remove();
      document.body.insertAdjacentHTML('beforeend', `<nav class="mobile-nav"><span class="nav-slider" aria-hidden="true"></span><button data-route="home">${icon('home')}<span>${tr('home')}</span></button><button data-route="archive">${icon('search')}<span>${lang === 'fa' ? 'جست‌وجو' : 'Search'}</span></button><button data-route="account">${icon('user')}<span>${tr('account')}</span></button><button data-route="settings">${icon('gear')}<span>${tr('settings')}</span></button></nav>`);
  };

  const poetCard = (person, index) => `<article class="poet-card glass" data-poet="${escapeHTML(person.i)}"><span class="poet-index">${String(index + 1).padStart(2, '0')}</span><div class="poet-card-actions"><button class="icon-button" data-random="poet" data-random-poet="${escapeHTML(person.i)}" aria-label="${tr('randomPoem')}" title="${tr('randomPoem')}">${icon('fortune')}</button></div><h3>${escapeHTML(person.n)}</h3><p>${escapeHTML(blurbs[person.i] || '')}</p><span class="poet-count">${fa(poetCounts[person.i])} ${lang === 'fa' ? 'شعر' : 'poems'}</span><svg class="poet-sketch" viewBox="0 0 128 128" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${portraits[index % portraits.length]}</svg></article>`;
   const homeView = () => `<section class="landing"><div class="hero"><h1 class="hero-title"><span>${lang === 'fa' ? 'جریانِ شعر فارسی' : 'Persian poetry in flow'}</span><span>${lang === 'fa' ? 'هر حالی، یه شعر داره' : 'Every feeling has a poem'}</span><span>${lang === 'fa' ? 'مجموعه‌ای از شعرهای فارسی و آثار شاعران ایرانی، از کلاسیک تا معاصر' : 'Persian poems and Iranian poets, from classic to contemporary'}</span></h1><div class="hero-actions"><button class="button shine-button" data-random="all">${icon('fortune')}${tr('randomPoem')}</button><button class="button secondary search-action" data-route="archive">${icon('search')}${lang === 'fa' ? 'جست‌وجو' : 'Search'}</button></div><div class="metrics" data-counter-group><div class="metric"><strong data-count="${poems.length}">۰</strong><span>${lang === 'fa' ? 'شعر' : 'poems'}</span></div><div class="metric"><strong data-count="${catalogue.length}">۰</strong><span>${lang === 'fa' ? 'کتاب' : 'books'}</span></div><div class="metric"><strong data-count="${people.length}">۰</strong><span>${lang === 'fa' ? 'شاعر' : 'poets'}</span></div></div></div><div class="section-wrap"><div class="section-head"><div><p class="eyebrow">${lang === 'fa' ? 'از میان نام‌های ماندگار' : 'Names worth returning to'}</p><h2>${tr('poets')}</h2></div></div><div class="poet-grid">${people.map(poetCard).join('')}</div></div></section>`;
  const poetView = () => {
    const person = peopleById[state.poetId];
    if (!person) return homeView();
    const books = person.b.map((book, index) => {
      const list = poemsByBook[`${person.i}/${book.i}`] || [];
      return `<article class="collection-card glass" data-book="${escapeHTML(person.i + '/' + book.i)}"><button class="icon-button collection-info" data-book-info="${escapeHTML(person.i + '/' + book.i)}" aria-label="${tr('bookInfo')}">${icon('info')}</button><span class="book-count">${fa(list.length)} ${lang === 'fa' ? 'بخش' : 'parts'}</span><h3>${escapeHTML(book.n)}</h3><div class="collection-sketch">${collectionSketch(index)}</div></article>`;
    }).join('');
     return `<section class="page"><div class="page-hero"><button class="back-link" data-back>← ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-route="archive">${tr('archive')}</button></div><h1>${escapeHTML(person.n)}</h1><div class="page-actions"><button class="button secondary poet-save-button" data-poet-fav="${escapeHTML(person.i)}">${icon('bookmark')}${poetFavorites.has(person.i) ? tr('saved') : tr('save')}</button><button class="button secondary" data-poet-info="${escapeHTML(person.i)}">${icon('info')}${tr('info')}</button><button class="button" data-random="poet">${icon('dice')}${tr('randomPoem')}</button></div></div><div class="section-head"><div><h2>${tr('books')}</h2><p>${fa(person.b.length)} ${lang === 'fa' ? 'مجموعه برای خواندن' : 'collections to read'}</p></div></div><div class="book-grid collection-grid">${books}</div></section>`;
  };
  const bookContext = (person, book, list) => bookFacts[book.i] || `${book.n} مجموعه‌ای از ${fa(list.length)} بخش از آثار ${person.n} است؛ برای خواندن آرام و پیوسته، از ابتدا یا هرجا که خواستی شروع کن.`;
  const bookView = () => {
    const person = peopleById[state.poetId];
    const book = person?.b.find(item => item.i === state.bookId);
    const list = poemsByBook[`${state.poetId}/${state.bookId}`] || [];
    if (!person || !book) return homeView();
    const shown = list.slice(0, state.limit);
     const bookKey = `${person.i}/${book.i}`;
      return `<section class="page book-page"><div class="page-hero"><button class="back-link" data-back>← ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-poet="${escapeHTML(person.i)}">${escapeHTML(person.n)}</button><span>/</span><span>${escapeHTML(book.n)}</span></div><h1>${escapeHTML(book.n)}</h1><div class="page-actions"><button class="button secondary book-save-button" data-book-fav="${escapeHTML(bookKey)}">${icon('bookmark')}${bookFavorites.has(bookKey) ? tr('saved') : tr('save')}</button><button class="button secondary" data-book-info="${escapeHTML(bookKey)}">${icon('info')}${tr('bookInfo')}</button><button class="button" data-random="book">${icon('dice')}${tr('random')}</button></div></div><div class="section-head"><div><h2>${tr('sections')}</h2><p>${fa(list.length)} ${lang === 'fa' ? 'بخش' : 'sections'}</p></div></div><div class="section-list">${shown.map((poem, index) => `<article class="section-card glass" data-poem="${escapeHTML(idOf(poem))}"><span class="section-no">${fa(index + 1)}</span><h3>${escapeHTML(poem.title)}</h3><span class="go">←</span></article>`).join('')}</div>${list.length > state.limit ? `<button class="more-button" data-more-sections>${tr('more')}</button>` : ''}</section>`;
  };
  const poetQuick = person => `<article class="quick-card glass" data-poet="${escapeHTML(person.i)}">${icon('user')}<div><strong>${escapeHTML(person.n)}</strong><small>${escapeHTML(blurbs[person.i] || '')}</small></div><span>←</span></article>`;
  const bookQuick = item => `<article class="quick-card glass" data-book="${escapeHTML(item.poet.i + '/' + item.book.i)}">${icon('book')}<div><strong>${escapeHTML(item.book.n)}</strong><small>${escapeHTML(item.poet.n)} · ${fa(item.list.length)} ${lang === 'fa' ? 'بخش' : 'parts'}</small></div><span>←</span></article>`;
   const resultCard = poem => `<article class="result-card glass" data-poem="${escapeHTML(idOf(poem))}"><div><div class="result-meta"><span>${escapeHTML(poem.poetName)}</span><i></i><span>${escapeHTML(poem.bookTitle)}</span></div><h3>${escapeHTML(poem.title)}</h3><div class="result-book">${fa(poem.coupletCount)} ${lang === 'fa' ? 'بیت' : 'couplets'}</div></div><button class="save-btn ${favorites.has(idOf(poem)) ? 'saved' : ''}" data-fav="${escapeHTML(idOf(poem))}" aria-label="${tr('save')}">${icon('bookmark')}</button><p class="result-excerpt">${escapeHTML(poem.couples.slice(0, 2).map(couple => couple.join(' · ')).join(' ') || (lang === 'fa' ? 'برای خواندن انتخاب کن' : 'Open to read'))}</p></article>`;
  const searchResultCard = (poem, query) => {
    const hits = poem.couples.filter(couple => matches(couple.filter(Boolean).join(' '), query)).slice(0, 6);
    if (!hits.length) return '';
    return `<article class="search-result glass" data-poem="${escapeHTML(idOf(poem))}">${hits.map(couple => `<div class="search-hit"><div class="search-hit-couplet"><span>${highlightText(couple[0] || '', query)}</span>${couple[1] ? `<span>${highlightText(couple[1], query)}</span>` : ''}</div><div class="search-hit-address">${escapeHTML(poem.poetName)} · ${escapeHTML(poem.bookTitle)} · ${escapeHTML(poem.title)}</div></div>`).join('')}</article>`;
  };
  const prepareSearchResults = async () => {
    const targets = filteredPoems().slice(0, state.limit);
    const shards = new Map();
    targets.forEach(poem => shards.set(`${poem.poetId}/${poem.bookId}/${poem.chunk ?? 'full'}`, poem));
    await Promise.all([...shards.values()].slice(0, 8).map(poem => loadBook(poem.poetId, poem.bookId, poem.chunk)));
  };
  const archiveResults = () => {
    const query = normalize(state.query);
    if (!query) return `<div id="archive-results"></div>`;
    if (!state.searchCommitted) return `<div id="archive-results"></div>`;
    const list = filteredPoems();
    const shown = list.slice(0, state.limit).map(poem => searchResultCard(poem, query)).join('');
    const empty = !shown ? `<div class="empty">${tr('empty')}</div>` : '';
    return `<div id="archive-results"><div class="result-summary">${fa(list.length)} ${lang === 'fa' ? 'بیت و شعر منطبق' : 'matching poems'}</div><div class="search-result-list">${shown}</div>${empty}${list.length > state.limit ? `<button class="more-button" data-more-archive>${tr('more')}</button>` : ''}</div>`;
  };
  const archiveView = () => {
    const bookOptions = state.poet === 'همه' ? [] : catalogue.filter(item => item.poet.n === state.poet);
      return `<section class="page search-page"><div class="page-hero"><h1>${lang === 'fa' ? 'جست‌وجوی شعرها' : 'Search poems'}</h1><p>${lang === 'fa' ? 'یک واژه یا عبارت را بنویس تا فقط بیت‌های منطبق را ببینی.' : 'Type a word or phrase to see matching couplets.'}</p></div><label class="archive-search">${icon('search')}<input id="archive-search" value="${escapeHTML(state.query)}" placeholder="${tr('search')}" autocomplete="off" enterkeyhint="search"><button type="button" class="input-clear" data-clear-input="archive-search" aria-label="پاک کردن">${icon('close')}</button></label><div class="archive-controls search-filters"><select class="select" id="archive-poet" aria-label="${tr('choosePoet')}"><option value="همه">${tr('choosePoet')}</option>${people.map(person => `<option value="${escapeHTML(person.n)}" ${state.poet === person.n ? 'selected' : ''}>${escapeHTML(person.n)}</option>`).join('')}</select><select class="select" id="archive-book" aria-label="${tr('chooseBook')}" ${state.poet === 'همه' ? 'disabled' : ''}><option value="همه">${tr('chooseBook')}</option>${bookOptions.map(item => `<option value="${escapeHTML(item.poet.i + '/' + item.book.i)}" ${state.book === item.poet.i + '/' + item.book.i ? 'selected' : ''}>${escapeHTML(item.book.n)} · ${escapeHTML(item.poet.n)}</option>`).join('')}</select></div>${archiveResults()}</section>`;
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
  const legacyPoemView = () => {
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
  const poemView = () => {
    const poem = poems.find(item => item.poetId === state.poetId && item.bookId === state.bookId && item.id === state.poemId);
    if (!poem) return homeView();
    markRead(poem);
    state.active = poem;
    const list = poemsByBook[`${state.poetId}/${state.bookId}`] || [];
    const position = list.findIndex(item => item.id === poem.id);
    const previous = list[position - 1];
    const next = list[position + 1];
    const copyButton = `<button class="button secondary copy-button" data-copy><span class="copy-icon copy-icon-default">${icon('copy')}</span><span class="copy-icon copy-icon-success">${icon('check')}</span><span class="copy-label">${tr('copy')}</span></button>`;
     const fab = `<div class="poem-fab" role="group" aria-label="ابزارهای شعر"><div class="poem-fab-menu" id="poem-fab-surface" role="menu"><button data-share="poem" role="menuitem" style="--fab-index:0" aria-label="اشتراک‌گذاری">${icon('share')}<span>اشتراک شعر</span></button><button data-copy role="menuitem" style="--fab-index:1" aria-label="${tr('copy')}">${icon('copy')}<span>${tr('copy')}</span></button><button data-focus-mode role="menuitem" style="--fab-index:2" aria-label="حالت تمرکز">${icon('focus')}<span>حالت تمرکز</span></button><div class="poem-size-control" role="group" style="--fab-index:3" aria-label="اندازهٔ شعر"><button data-poem-size="up" aria-label="بزرگ‌تر">${icon('plus')}</button><span>اندازه</span><button data-poem-size="down" aria-label="کوچک‌تر">${icon('minus')}</button></div></div><button class="poem-fab-toggle" data-poem-fab aria-expanded="false" aria-controls="poem-fab-surface" aria-label="بازکردن ابزارهای شعر">${icon('plus')}</button></div>`;
     return `<section class="poem-shell"><div class="poem-topline"><button class="back-link" data-back>← ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-poet="${escapeHTML(poem.poetId)}">${escapeHTML(poem.poetName)}</button><span>/</span><span>${escapeHTML(poem.bookTitle)}</span></div></div><div class="poem-heading"><p class="kicker">${escapeHTML(poem.poetName)} · ${escapeHTML(poem.bookTitle)}</p><h1>${escapeHTML(poem.title)}</h1><p>${fa(poem.couples.length)} ${lang === 'fa' ? 'بیت' : 'couplets'}</p><div class="poem-tools"><button class="button secondary" data-fav="${escapeHTML(idOf(poem))}">${icon('bookmark')}${favorites.has(idOf(poem)) ? tr('saved') : tr('save')}</button><button class="button secondary" data-share="poem">${icon('share')}${lang === 'fa' ? 'اشتراک‌گذاری' : 'Share'}</button>${copyButton}<button class="button secondary focus-button" data-focus-mode>${icon('focus')}<span>${lang === 'fa' ? 'حالت تمرکز' : 'Focus mode'}</span></button></div></div><div class="poem-copy">${poem.couples.map((couple, index) => { const key = `${idOf(poem)}/${index}`; const note = notes[key] || ''; const saved = coupletFavorites.has(key); return `<article class="couplet"><span class="couplet-no">${fa(index + 1)}</span><div class="couplet-text"><p>${escapeHTML(couple[0] || '')}</p>${couple[1] ? `<p>${escapeHTML(couple[1])}</p>` : ''}${note ? `<p class="verse-note">${escapeHTML(note)}</p>` : ''}</div><div class="couplet-actions"><button class="couplet-note" data-couplet-note="${escapeHTML(key)}" aria-label="${tr('note')}" title="${tr('note')}">${icon('plus')}</button><button class="couplet-share" data-couplet-share="${escapeHTML(key)}" aria-label="${lang === 'fa' ? 'اشتراک‌گذاری' : 'Share'}" title="${lang === 'fa' ? 'اشتراک‌گذاری' : 'Share'}">${icon('share')}</button></div><button class="couplet-heart ${saved ? 'saved' : ''}" data-couplet-fav="${escapeHTML(key)}" aria-label="${lang === 'fa' ? 'پسندیدن' : 'Like'}" title="${lang === 'fa' ? 'پسندیدن' : 'Like'}">${icon('heart')}</button></article>`; }).join('')}</div><div class="poem-nav">${previous ? `<button data-poem="${escapeHTML(idOf(previous))}">→ ${escapeHTML(previous.title)}</button>` : '<span></span>'}${next ? `<button data-poem="${escapeHTML(idOf(next))}">${escapeHTML(next.title)} ←</button>` : '<span></span>'}</div>${fab}</section>`;
  };

  const legacyAccountView = () => {
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
  const downloadJSON = (filename, value) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const adminPanelView = () => {
    if (!isAdminAccount()) return '';
    const queue = readJSON('jaryan-feedback-outbox', []);
    const copy = lang === 'fa'
      ? 'این پنل برای مدیریت داده‌های محلی همین حساب فعال شده است.'
      : 'This panel manages the local data for this account.';
    return `<div class="admin-panel glass" aria-labelledby="admin-panel-title"><div class="admin-panel-head"><div><p class="kicker">${tr('adminAccess')}</p><h2 id="admin-panel-title">${tr('adminPanel')}</h2></div><span class="admin-badge">ADMIN</span></div><p class="admin-copy">${copy}</p><div class="admin-grid"><div class="admin-stat"><strong>${fa(favorites.size)}</strong><span>${tr('adminSaved')}</span></div><div class="admin-stat"><strong>${fa(readingHistory.length)}</strong><span>${tr('adminReads')}</span></div><div class="admin-stat"><strong>${fa(queue.length)}</strong><span>${tr('adminQueued')}</span></div></div><div class="admin-actions"><button class="button secondary" data-admin-export>${icon('download')}${tr('adminExport')}</button>${queue.length ? `<button class="button secondary" data-admin-clear-outbox>${icon('close')}${tr('adminClearOutbox')}</button>` : ''}</div></div>`;
  };
  const accountView = () => {
    if (!profile) return `<section class="page account-page"><div class="account-gate glass"><span class="account-glyph">${icon('user')}</span><p class="eyebrow">${tr('account')}</p><h1>${lang === 'fa' ? 'حساب جریان' : 'Your Jaryan account'}</h1><p>${lang === 'fa' ? 'برای نگه‌داشتن شعرهای محبوب، بیت‌ها و مسیر خواندنت، یک حساب محلی بساز یا با شماره‌ات وارد شو.' : 'Create a local account or sign in with your mobile to keep your library and reading trail.'}</p><button class="button" data-register>${icon('plus')}${account?.mobile ? tr('login') : tr('register')}</button><small>${lang === 'fa' ? 'اطلاعات این نسخه روی همین دستگاه ذخیره می‌شود.' : 'This version stores your account on this device.'}</small></div></section>`;
    let page = legacyAccountView().replace(`<p class="eyebrow">${tr('account')}</p><h1>${escapeHTML(profile || tr('account'))}</h1>`, `<div class="account-title-spacer" aria-hidden="true"></div><h1>${tr('accountTitle')}</h1>`);
    page = page.replace(/<div class="profile-field"><input([^>]+)><button class="button" data-save-profile>/, `<div class="profile-field"><div class="input-with-clear"><input$1><button type="button" class="input-clear" data-clear-input="profile-input" aria-label="${lang === 'fa' ? 'پاک کردن' : 'Clear'}">${icon('close')}</button></div><button class="button" data-save-profile>`);
    page = page.replace('<button class="button" data-save-profile>', `<button class="button secondary" data-logout>${lang === 'fa' ? 'خروج' : 'Sign out'}</button><button class="button" data-save-profile>`);
    return isAdminAccount() ? page.replace('</section>', `${adminPanelView()}</section>`) : page;
  };

    const settingsViewNext = () => {
     const setting = (title, copy, content, className = '') => `<div class="setting-card glass ${className}"><div><h3>${title}</h3><p>${copy}</p></div>${content}</div>`;
     const language = `<div class="setting-options"><button class="${lang === 'fa' ? 'active' : ''}" data-lang="fa">فارسی</button><button class="${lang === 'en' ? 'active' : ''}" data-lang="en">English</button></div>`;
      const themes = `<div class="setting-options theme-options"><button class="${theme === 'dark-mode' ? 'active' : ''}" data-theme="dark-mode">${tr('darkMode')}</button><button class="${theme === 'light-mode' ? 'active' : ''}" data-theme="light-mode">${tr('lightMode')}</button><button class="${theme === 'dark' ? 'active' : ''}" data-theme="dark">${tr('dark')}</button><button class="${theme === 'light' ? 'active' : ''}" data-theme="light">${tr('light')}</button><button class="${theme === 'paper' ? 'active' : ''}" data-theme="paper">${tr('paper')}</button><button class="${theme === 'system' ? 'active' : ''}" data-theme="system">${tr('system')}</button></div>`;
       const appFonts = lang === 'fa'
         ? `<div class="setting-options"><button class="${appFont === 'ravi' ? 'active' : ''}" data-app-font="ravi">Ravi</button><button class="${appFont === 'yekan' ? 'active' : ''}" data-app-font="yekan">Yekan</button></div>`
         : `<div class="setting-options"><button class="${appFont === 'english' ? 'active' : ''}" data-app-font="english">System Sans</button><button class="${appFont === 'english-serif' ? 'active' : ''}" data-app-font="english-serif">Georgia</button><button class="${appFont === 'english-mono' ? 'active' : ''}" data-app-font="english-mono">Mono</button></div>`;
       const poemFonts = `<div class="setting-options poem-font-options"><button class="${poemFont === 'ravi' ? 'active' : ''}" data-poem-font="ravi">Ravi</button><button class="${poemFont === 'iran-nastaliq' ? 'active' : ''}" data-poem-font="iran-nastaliq">${tr('iranNastaliq')}</button><button class="${poemFont === 'shekasteh' ? 'active' : ''}" data-poem-font="shekasteh">${tr('shekastehNastaliq')}</button><button class="${poemFont === 'mir-emad' ? 'active' : ''}" data-poem-font="mir-emad">${tr('mirEmad')}</button></div>`;
       const fonts = `<div class="font-sections"><section class="font-section"><h4>${tr('appFont')}</h4>${appFonts}</section><section class="font-section"><h4>${tr('poemFont')}</h4>${poemFonts}</section></div>`;
      const size = `<div class="setting-options scale-options"><button class="${uiScale === 'current' ? 'active' : ''}" data-ui-scale="current">${tr('current')}</button><button class="${uiScale === 'large' ? 'active' : ''}" data-ui-scale="large">${tr('large')}</button><button class="${uiScale === 'larger' ? 'active' : ''}" data-ui-scale="larger">${tr('larger')}</button></div>`;
      return `<section class="page"><div class="page-hero"><h1>${tr('settings')}</h1><p>${lang === 'fa' ? 'جریان را برای شیوهٔ خواندن خودت تنظیم کن.' : 'Make Jaryan yours.'}</p></div><div class="settings-grid">${setting(tr('language'), lang === 'fa' ? 'فارسی / English' : 'Persian / English', language)}${setting(tr('theme'), lang === 'fa' ? 'روشن، کاغذی، تیره یا هماهنگ با تنظیمات سیستم.' : 'Light, paper, dark or your system preference.', themes)}${setting(tr('font'), lang === 'fa' ? 'راوی، یکان یا نستعلیق' : 'Choose a typeface', fonts)}${setting(tr('size'), lang === 'fa' ? 'مقیاس کلی همهٔ بخش‌های برنامه.' : 'Scale the whole app.', size)}${setting('نسخهٔ جریان', lang === 'fa' ? `${APP_VERSION_FA} · جریان آرشیوی برای خواندن آرام.` : `${APP_VERSION} · A quiet archive for reading.`, `<a class="button secondary" href="mailto:feedback@jaryan.app">${lang === 'fa' ? 'ارسال نظر' : 'Send feedback'}</a>`, 'setting-help')}</div></section>`;
   };

   const animateCounters = () => {
    const group = document.querySelector('[data-counter-group]');
    if (!group) return;
    const run = () => group.querySelectorAll('[data-count]').forEach(element => {
      const target = Number(element.dataset.count || 0);
      const started = performance.now();
      const tick = now => {
        const progress = Math.min(1, (now - started) / 850);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = fa(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (!('IntersectionObserver' in window)) return run();
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      run();
    }, { threshold: 0.35 });
    observer.observe(group);
  };

  let renderToken = 0;
  const render = async () => {
    applyPreferences();
    if (state.page !== 'poem' && document.documentElement.classList.contains('focus-mode')) setFocusMode(false);
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
              : state.page === 'account' ? accountView() : settingsViewNext();
     cleanFooter();
     syncPoemActions();
     updateFocusMode();
     document.querySelectorAll('[data-route]').forEach(element => element.classList.toggle('active', element.dataset.route === state.page));
    const navIndex = state.page === 'archive' ? 1 : state.page === 'account' ? 2 : state.page === 'settings' ? 3 : 0;
    document.documentElement.style.setProperty('--nav-index', String(navIndex));
    animateCounters();
  };

   let searchTimer = 0;
   let searchRun = 0;
  const refreshArchiveResults = () => {
    const results = document.getElementById('archive-results');
    if (results) results.outerHTML = archiveResults();
  };
   const handleSearchInput = target => {
    const value = target.value;
    const caret = target.selectionStart ?? value.length;
     state.query = value;
     state.limit = 24;
     state.searchCommitted = false;
     const run = ++searchRun;
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
      searchTimer = setTimeout(async () => {
        await loadSearchIndex();
        if (run !== searchRun || state.query !== value) return;
        await prepareSearchResults();
        if (run !== searchRun || state.query !== value) return;
        state.searchCommitted = true;
        refreshArchiveResults();
      }, 160);
    }
  };

   document.addEventListener('input', event => {
    if (event.target.matches('#home-search, #archive-search')) handleSearchInput(event.target);
   });
  document.addEventListener('change', event => {
    if (event.target.id === 'archive-poet') { state.poet = event.target.value; state.book = 'همه'; state.limit = 24; state.searchCommitted = false; render().then(async () => { if (!normalize(state.query)) return; await loadSearchIndex(); await prepareSearchResults(); state.searchCommitted = true; refreshArchiveResults(); }); }
    if (event.target.id === 'archive-book') { state.book = event.target.value; state.limit = 24; state.searchCommitted = false; render().then(async () => { if (!normalize(state.query)) return; await loadSearchIndex(); await prepareSearchResults(); state.searchCommitted = true; refreshArchiveResults(); }); }
  });
  document.addEventListener('click', event => {
    const target = event.target;
    if (target.id === 'modal-backdrop' || target.closest('[data-close-modal]')) { closeModal(); return; }
    const clearInput = target.closest('[data-clear-input]');
    if (clearInput) {
      const input = document.getElementById(clearInput.dataset.clearInput);
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
      return;
    }
    const favorite = target.closest('[data-fav]');
    if (favorite) { toggleSet(favorites, favorite.dataset.fav, 'jaryan-favorites'); saveUserData(); render(); showToast(favorites.has(favorite.dataset.fav) ? '✓' : '×'); return; }
    const coupletFavorite = target.closest('[data-couplet-fav]');
    if (coupletFavorite) { toggleSet(coupletFavorites, coupletFavorite.dataset.coupletFav, 'jaryan-couplet-favorites'); saveUserData(); render(); showToast(coupletFavorites.has(coupletFavorite.dataset.coupletFav) ? '♥' : '×'); return; }
    const poetFavorite = target.closest('[data-poet-fav]');
    if (poetFavorite) { toggleSet(poetFavorites, poetFavorite.dataset.poetFav, 'jaryan-poet-favorites'); saveUserData(); render(); return; }
    const bookFavorite = target.closest('[data-book-fav]');
    if (bookFavorite) { toggleSet(bookFavorites, bookFavorite.dataset.bookFav, 'jaryan-book-favorites'); saveUserData(); render(); return; }
    const note = target.closest('[data-couplet-note]');
    if (note) { openNoteEditor(note.dataset.coupletNote); return; }
    const noteSave = target.closest('[data-save-couplet-note]');
    if (noteSave) {
      const value = document.getElementById('note-editor')?.value.trim() || '';
      if (value) notes[noteSave.dataset.saveCoupletNote] = value;
      else delete notes[noteSave.dataset.saveCoupletNote];
       localStorage.setItem('jaryan-notes', JSON.stringify(notes));
       saveUserData();
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
    if (target.closest('[data-more-archive]')) { state.limit += 24; state.searchCommitted = false; refreshArchiveResults(); prepareSearchResults().then(() => { state.searchCommitted = true; refreshArchiveResults(); }); return; }
    if (target.closest('[data-more-sections]')) { state.limit += 24; render(); return; }
    if (target.closest('[data-clear-filters]')) { state.poet = 'همه'; state.book = 'همه'; state.genre = 'all'; state.archiveType = 'all'; state.limit = 24; render(); return; }
    const favoriteTab = target.closest('[data-favorite-tab]');
    if (favoriteTab) { state.favoriteTab = favoriteTab.dataset.favoriteTab; render(); return; }
    if (target.closest('[data-clear-history]')) { readingHistory = []; localStorage.removeItem('jaryan-history'); saveUserData(); render(); return; }
      const profileSave = target.closest('[data-save-profile]');
      if (profileSave) { profile = document.getElementById('profile-input')?.value.trim() || ''; account = { ...(account || {}), name: profile, username: account?.mobile || account?.username || '' }; saveUserData(); render(); return; }
      const adminExport = target.closest('[data-admin-export]');
      if (adminExport && isAdminAccount()) {
        downloadJSON(`jaryan-${APP_VERSION}-data.json`, { exportedAt: new Date().toISOString(), account, profile, favorites: [...favorites], poetFavorites: [...poetFavorites], bookFavorites: [...bookFavorites], coupletFavorites: [...coupletFavorites], notes, history: readingHistory, feedbackOutbox: readJSON('jaryan-feedback-outbox', []) });
        showToast(tr('adminExported'));
        return;
      }
      const adminClearOutbox = target.closest('[data-admin-clear-outbox]');
      if (adminClearOutbox && isAdminAccount()) { localStorage.removeItem('jaryan-feedback-outbox'); render(); showToast(tr('adminCleared')); return; }
     const feedbackLink = target.closest('[data-feedback], a[href^="mailto:feedback@jaryan.app"]');
     if (feedbackLink) { event.preventDefault(); openFeedback(); return; }
     const feedbackSend = target.closest('[data-feedback-send]');
     if (feedbackSend) {
       const message = document.getElementById('feedback-message')?.value.trim() || '';
       const category = document.getElementById('feedback-category')?.value || 'general';
       if (!message) { showToast(tr('feedbackRequired')); return; }
       feedbackSend.disabled = true;
       submitFeedback(message, category).then(() => { closeModal(); showToast(tr('feedbackSent')); }).catch(() => {
         const queue = readJSON('jaryan-feedback-outbox', []);
         queue.push({ message, category, createdAt: new Date().toISOString() });
         localStorage.setItem('jaryan-feedback-outbox', JSON.stringify(queue.slice(-20)));
         closeModal();
         showToast(tr('feedbackOffline'));
       });
       return;
     }
     if (target.closest('[data-register]')) { openRegister(); return; }
     if (target.closest('[data-register-save]')) {
       const name = document.getElementById('register-name')?.value.trim();
       const mobile = document.getElementById('register-mobile')?.value.trim();
       const consent = Boolean(document.getElementById('register-consent')?.checked);
       if (!name || !mobile) { showToast(lang === 'fa' ? 'نام و شماره موبایل را وارد کن' : 'Enter your name and mobile number'); return; }
       if (!consent) { showToast(lang === 'fa' ? 'برای ادامه، رضایت ذخیرهٔ اطلاعات را تأیید کن' : 'Confirm consent to continue'); return; }
       account = { ...account, name, mobile, username: mobile, loggedIn: true, consentAt: account?.consentAt || new Date().toISOString() };
       profile = name;
       saveUserData();
       closeModal();
       render();
       syncAccountToServer().then(() => showToast(lang === 'fa' ? 'حساب روی سرور ثبت شد' : 'Account synced')).catch(() => showToast(lang === 'fa' ? 'حساب روی دستگاه ذخیره شد' : 'Account saved on this device'));
       return;
     }
     if (target.closest('[data-logout]')) { profile = ''; account = { ...(account || {}), loggedIn: false }; saveUserData(); render(); return; }
    const sizeDefault = target.closest('[data-size-default]');
    if (sizeDefault) { sizeScale = 100; localStorage.setItem('jaryan-size-scale', '100'); render(); return; }
     const scaleOption = target.closest('[data-ui-scale]');
     if (scaleOption) { uiScale = scaleOption.dataset.uiScale; localStorage.setItem('jaryan-ui-scale', uiScale); applyPreferences(); render(); return; }
     const themeOption = target.closest('[data-theme]');
    if (themeOption) { theme = themeOption.dataset.theme; localStorage.setItem('jaryan-theme', theme); render(); return; }
     const appFontOption = target.closest('button[data-app-font]');
     if (appFontOption) { appFont = appFontOption.dataset.appFont; localStorage.setItem('jaryan-app-font', appFont); applyPreferences(); render(); return; }
     const poemFontOption = target.closest('button[data-poem-font]');
     if (poemFontOption) { poemFont = poemFontOption.dataset.poemFont; localStorage.setItem('jaryan-poem-font', poemFont); applyPreferences(); render(); return; }
     const languageOption = target.closest('button[data-lang]');
      if (languageOption) { lang = languageOption.dataset.lang; ensureLanguageFonts(); localStorage.setItem('jaryan-lang', lang); applyPreferences(); layout(); render(); return; }
      if (target.closest('#theme-toggle')) {
        theme = isDarkTheme() ? 'light-mode' : 'dark-mode';
        localStorage.setItem('jaryan-theme', theme);
        render();
        return;
      }
    const bookInfo = target.closest('[data-book-info]');
    if (bookInfo) { const [poetId, bookId] = bookInfo.dataset.bookInfo.split('/'); const person = peopleById[poetId]; const book = person?.b.find(item => item.i === bookId); if (person && book) openInfo(`${tr('bookInfo')} · ${book.n}`, bookFacts[book.i] || bookContext(person, book, poemsByBook[`${poetId}/${bookId}`] || [])); return; }
    const poetInfo = target.closest('[data-poet-info]');
    if (poetInfo) { const person = peopleById[poetInfo.dataset.poetInfo]; if (person) openInfo(`${tr('info')} · ${person.n}`, bios[person.i] || ''); return; }
     if (target.closest('[data-copy]')) { const copyButton = target.closest('[data-copy]'); if (state.active) navigator.clipboard?.writeText(state.active.couples.map(couple => couple.join('\n')).join('\n\n')); copyButton.classList.add('copied'); showToast('کپی شد'); return; }
     const fabTrigger = target.closest('[data-poem-fab]');
     if (fabTrigger) { const fab = fabTrigger.closest('.poem-fab'); setFabOpen(!fab?.classList.contains('open'), fab); return; }
     if (target.closest('[data-focus-mode]')) { setFocusMode(!document.documentElement.classList.contains('focus-mode')); closeFab(); return; }
     if (target.closest('[data-focus-prev]')) { moveFocus(-1); return; }
     if (target.closest('[data-focus-next]')) { moveFocus(1); return; }
     if (target.closest('[data-focus-exit]')) { setFocusMode(false); return; }
    const poemSize = target.closest('[data-poem-size]');
    if (poemSize) { sizeScale = Math.max(85, Math.min(150, sizeScale + (poemSize.dataset.poemSize === 'up' ? 5 : -5))); document.documentElement.style.setProperty('--scale', String(sizeScale / 100)); localStorage.setItem('jaryan-size-scale', String(sizeScale)); return; }
    if (target.closest('[data-random]')) {
      const scope = target.closest('[data-random]').dataset.random;
      let list = poems;
      if (scope === 'book') list = poemsByBook[`${state.poetId}/${state.bookId}`] || list;
       if (scope === 'poet') list = list.filter(poem => poem.poetId === (target.closest('[data-random-poet]')?.dataset.randomPoet || state.poetId));
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
  const renderFromHistory = () => {
    routeFromHash();
    const pending = render();
    if (state.page === 'home' || state.page === 'poets') window.scrollTo({ top: 0, behavior: 'smooth' });
    else pending.then(scrollToPageStart);
  };
  window.addEventListener('popstate', renderFromHistory);
  window.addEventListener('hashchange', renderFromHistory);
  document.addEventListener('pointerdown', event => {
    const fab = document.querySelector('.poem-fab');
    if (fab?.classList.contains('open') && !fab.contains(event.target)) closeFab();
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#home-search, #archive-search')?.focus(); }
     if (event.key === 'Escape') { closeModal(); closeFab(); if (document.documentElement.classList.contains('focus-mode')) setFocusMode(false); else document.querySelector('[data-poem-fab]')?.focus(); }
     if (document.documentElement.classList.contains('focus-mode') && (event.key === 'ArrowUp' || event.key === 'PageUp')) { event.preventDefault(); moveFocus(-1); }
     if (document.documentElement.classList.contains('focus-mode') && (event.key === 'ArrowDown' || event.key === 'PageDown')) { event.preventDefault(); moveFocus(1); }
  });
  let touchStart = null;
   document.addEventListener('touchstart', event => { if (event.touches.length === 1 && !event.target.closest('input,textarea,select,button,a')) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
   document.addEventListener('touchend', event => {
     if (!touchStart) return;
     const start = touchStart;
     const dx = event.changedTouches[0].clientX - start.x;
     const dy = event.changedTouches[0].clientY - start.y;
     touchStart = null;
     if (document.documentElement.classList.contains('focus-mode')) {
       if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
         if (start.y <= window.innerHeight * .34) moveFocus(-1);
         else if (start.y >= window.innerHeight * .66) moveFocus(1);
       }
       return;
     }
     if (dx > 80 && Math.abs(dy) < 100 && state.page !== 'home') goBack();
   }, { passive: true });

  routeFromHash();
  applyPreferences();
  layout();
  await render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
})();
