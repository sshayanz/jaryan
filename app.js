(async () => {
  'use strict';

  const APP_VERSION = '0.6.5';
  const APP_VERSION_FA = '۰.۶.۵';
  const app = document.getElementById('app');
  const bootStartedAt = performance.now();
  const API_BASE = String(window.JARYAN_API_BASE || '').replace(/\/$/, '');
  const fa = value => Number(value || 0).toLocaleString(typeof lang !== 'undefined' && lang === 'en' ? 'en-US' : 'fa-IR');
  const readJSON = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  };

  const userDB = (() => {
    const wait = (promise, fallback) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallback), 800))]).catch(() => fallback);
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
    const open = typeof indexedDB === 'undefined' ? Promise.resolve(null) : (() => {
      try {
        return new Promise(resolve => {
          try {
            const request = indexedDB.open('jaryan-user-db', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('user');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      } catch {
        return Promise.resolve(null);
      }
    })();
    const load = async () => {
      const fallbackValue = fallback();
      const db = await wait(open, null);
      if (!db) return fallback();
      return wait(new Promise(resolve => {
        try {
          const request = db.transaction('user', 'readonly').objectStore('user').get('profile');
          request.onsuccess = () => resolve(request.result || fallbackValue);
          request.onerror = () => resolve(fallbackValue);
        } catch {
          resolve(fallbackValue);
        }
      }), fallbackValue);
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
       const db = await wait(open, null);
       if (!db) return;
       await wait(new Promise(resolve => {
         try {
           const request = db.transaction('user', 'readwrite').objectStore('user').put(value, 'profile');
           request.onsuccess = request.onerror = () => resolve();
         } catch {
           resolve();
         }
       }), undefined);
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

  let catalog;
  let index;
  try {
    [catalog, index] = await Promise.all([fetchJSON('data/catalog.json'), fetchJSON('data/poem-index.json')]);
  } catch {
    app.innerHTML = '<section class="boot-error"><h1>بارگذاری جریان ممکن نشد.</h1><p>اتصال یا فایل‌های برنامه در دسترس نیستند.</p><button class="button" id="boot-retry" type="button">تلاش دوباره</button></section>';
    document.getElementById('boot-retry')?.addEventListener('click', () => window.location.reload());
    return;
  }
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
  const couplets = poems.reduce((total, poem) => total + poem.coupletCount, 0);

  const bios = {
    moulavi: 'جلال‌الدین محمد بلخی، مشهور به مولانا، در ۶۰۴ق در بلخ زاده شد و بیشتر عمر خود را در قونیه گذراند. مثنوی و غزل‌های او از مهم‌ترین آثار عرفان فارسی‌اند.',
    hafez: 'خواجه شمس‌الدین محمد حافظ شیرازی، شاعر سدهٔ هشتم هجری، در شیراز زیست و به‌ویژه برای غزل‌های چندلایه و موسیقایی‌اش شناخته می‌شود.',
    khayyam: 'عمر خیام نیشابوری، زادهٔ ۴۳۹ق، ریاضی‌دان، منجم، فیلسوف و رباعی‌سرای ایرانی بود و در تدوین گاه‌شماری جلالی نقش داشت.',
    saadi: 'مشرف‌الدین مصلح سعدی شیرازی، شاعر سدهٔ هفتم هجری، پس از سال‌ها سفر به شیراز بازگشت. بوستان و گلستان از آثار ماندگار او هستند.',
    saeb: 'صائب تبریزی، شاعر سدهٔ یازدهم هجری، از برجسته‌ترین غزل‌سرایان سبک هندی است و به تصویرسازی و مضمون‌پردازی مشهور است.',
    attar: 'فریدالدین عطار نیشابوری، شاعر و عارف سدهٔ ششم و هفتم هجری، در نیشابور می‌زیست و منطق‌الطیر از شناخته‌شده‌ترین آثار اوست.',
    babataher: 'باباطاهر عریان، شاعر دوبیتی‌سرای منسوب به همدان، از چهره‌های کهن شعر عامیانه و عارفانهٔ فارسی است.',
    ferdowsi: 'ابوالقاسم فردوسی توسی، شاعر بزرگ سدهٔ چهارم هجری، نزدیک به سه دهه از زندگی خود را صرف سرودن شاهنامه کرد و زبان و اسطوره‌های ایران را در این اثر ماندگار پاس داشت.',
    nezami: 'الیاس بن یوسف، مشهور به نظامی گنجوی، شاعر سدهٔ ششم هجری و آفرینندهٔ خمسه است؛ منظومه‌هایی روایی که عشق، خرد و تجربهٔ انسانی را با زبانی تصویری روایت می‌کنند.',
    sohrab: 'سهراب سپهری، شاعر و نقاش معاصر ایرانی، با زبانی تصویری و تأمل‌برانگیز از طبیعت، تنهایی و نگاه تازه به زندگی سخن می‌گوید.',
    forough: 'فروغ فرخزاد، شاعر معاصر ایرانی، از مهم‌ترین صداهای شعر نو است و در شعرهایش تجربهٔ شخصی، عشق، آزادی و زیست زنانه را بی‌پرده روایت می‌کند.',
    nima: 'نیما یوشیج، بنیان‌گذار شعر نو فارسی، با تغییر در وزن و روایت شعری راهی تازه برای بیان تجربهٔ انسان معاصر گشود.'
  };
  const blurbs = {
    moulavi: 'عرفان و روایت',
    hafez: 'غزل و رندی',
    khayyam: 'رباعی و اندیشه',
    saadi: 'حکایت و اخلاق',
    saeb: 'مضمون و تصویر',
    attar: 'عرفان و تمثیل',
    babataher: 'دوبیتی و دل',
    ferdowsi: 'حماسه و اسطوره',
    nezami: 'عشق و روایت',
    sohrab: 'طبیعت و تأمل',
    forough: 'عشق و آزادی',
    nima: 'شعر نو و طبیعت'
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
    '2beytiha': 'دوبیتی‌های باباطاهر با زبان ساده و عاطفی، از عشق، فراق و تجربهٔ عرفانی سخن می‌گویند.',
    'ferdowsi/shahnameh': 'شاهنامهٔ فردوسی منظومه‌ای حماسی دربارهٔ تاریخ اسطوره‌ای و پهلوانی ایران است؛ روایتی گسترده از آفرینش، پادشاهی، نبرد و ایستادگی که با زبان موسیقایی فردوسی ماندگار شده است.',
    'nezami/khamsa': 'خمسه یا پنج گنج نظامی مجموعه‌ای از پنج منظومهٔ روایی است که داستان‌های عاشقانه، حکمی و اخلاقی را با جزئیات تصویری و ساختار روایی منسجم دنبال می‌کند.',
    'sohrab/hasht-ketab': 'هشت کتاب مجموعهٔ اصلی شعرهای سهراب سپهری است؛ سفری شاعرانه از طبیعت و اشیای روزمره به سوی سکوت، آگاهی و دیدن دوبارهٔ جهان.',
    'forough/selected-poems': 'این گزیده، مسیر تحول زبان و نگاه فروغ فرخزاد را از شعرهای نخستین تا شعرهای پخته‌تر نشان می‌دهد؛ مجموعه‌ای صمیمی، جسور و متمرکز بر تجربهٔ زیسته.',
    'nima/selected-poems': 'این گزیده از شعرهای نیما یوشیج نمونه‌هایی از زبان تازه، تصویرهای طبیعی و روایت‌های اجتماعی او را کنار هم می‌گذارد و مسیر شکل‌گیری شعر نو را نشان می‌دهد.'
  };
  const poetNamesEn = {
    moulavi: 'Rumi', hafez: 'Hafez', khayyam: 'Omar Khayyam', saadi: 'Saadi',
    saeb: 'Saeb Tabrizi', attar: 'Attar', babataher: 'Baba Taher', ferdowsi: 'Ferdowsi',
    nezami: 'Nizami Ganjavi', sohrab: 'Sohrab Sepehri', forough: 'Forough Farrokhzad', nima: 'Nima Yooshij'
  };
  const bookNamesEn = {
    'masnavi-daftar1': 'Masnavi, Book One', 'masnavi-daftar2': 'Masnavi, Book Two',
    'masnavi-daftar3': 'Masnavi, Book Three', 'masnavi-daftar4': 'Masnavi, Book Four',
    'masnavi-daftar5': 'Masnavi, Book Five', 'masnavi-daftar6': 'Masnavi, Book Six',
    'divan-shams': 'Divan of Shams', ghazal: 'Ghazals', ghete: 'Fragments', ghaside: 'Odes',
    robaee: 'Quatrains', masnavi: 'Masnavi', saghiname: 'Saqi-nama', boostan: 'Bustan',
    manteghotteyr: 'The Conference of the Birds', '2beytiha': 'Baba Taher Quatrains',
    shahnameh: 'Shahnameh', khamsa: 'The Five Treasures', 'hasht-ketab': 'Eight Books',
    'selected-poems': 'Selected Poems'
  };
  const blurbsEn = {
    moulavi: 'Mysticism and story', hafez: 'Ghazal and wit', khayyam: 'Quatrain and thought',
    saadi: 'Wisdom and ethics', saeb: 'Image and metaphor', attar: 'Mysticism and allegory',
    babataher: 'Quatrain and feeling', ferdowsi: 'Epic and myth', nezami: 'Love and narrative',
    sohrab: 'Nature and reflection', forough: 'Love and freedom', nima: 'Modern verse and nature'
  };
  const biosEn = {
    moulavi: 'Jalal al-Din Muhammad Rumi was born in Balkh in 1207 and spent most of his life in Konya. The Masnavi and his ghazals are among the central works of Persian mystical literature.',
    hafez: 'Khwaja Shams al-Din Muhammad Hafez Shirazi lived in fourteenth-century Shiraz and is celebrated for layered, musical ghazals that still invite repeated reading.',
    khayyam: 'Omar Khayyam was an Iranian mathematician, astronomer, philosopher and quatrain poet. His work joins precise thought with a sharp awareness of time and uncertainty.',
    saadi: 'Saadi Shirazi was a thirteenth-century poet and traveler whose Bustan and Gulistan combine humane stories, ethical reflection and a remarkably clear voice.',
    saeb: 'Saeb Tabrizi was one of the leading poets of the Indian style. His ghazals are known for vivid images, compressed ideas and unexpected turns of metaphor.',
    attar: 'Farid al-Din Attar of Nishapur was a mystic and poet whose Conference of the Birds became one of the best-known allegories in Persian literature.',
    babataher: 'Baba Taher is remembered for direct, intimate quatrains shaped by love, separation and a devotional understanding of ordinary life.',
    ferdowsi: 'Abu al-Qasim Ferdowsi spent nearly three decades composing the Shahnameh, preserving Iranian legends, heroes and language in one enduring epic.',
    nezami: 'Nizami Ganjavi created the Five Treasures, a group of narrative poems that explore love, wisdom and human experience through precise imagery.',
    sohrab: 'Sohrab Sepehri was a modern Iranian poet and painter whose reflective, image-rich poems look at nature, solitude and the act of seeing.',
    forough: 'Forough Farrokhzad was a major voice of modern Persian poetry. Her work speaks candidly about intimacy, freedom, identity and lived experience.',
    nima: 'Nima Yooshij founded modern Persian poetry by changing its rhythms and forms, opening a new way to speak about contemporary life.'
  };
  const bookFactsEn = {
    'masnavi-daftar1': 'The first book of the Masnavi opens with the Song of the Reed and develops stories about longing, healing, discipline and spiritual attention.',
    'masnavi-daftar2': 'The second book continues Rumi’s allegorical stories, using everyday characters and surprising turns to explore ethical and mystical ideas.',
    'masnavi-daftar3': 'Book Three moves between connected tales, dialogue and interpretation, showing how narrative can become a form of spiritual inquiry.',
    'masnavi-daftar4': 'The fourth book blends story and commentary while returning to questions of desire, wisdom, trust and the limits of appearances.',
    'masnavi-daftar5': 'Book Five gathers stories and mystical conversations that approach meaning through humor, paradox and a patient narrative voice.',
    'masnavi-daftar6': 'The final book of the Masnavi continues its teaching stories and closes the six-book journey through reflection, conflict and return.',
    'divan-shams': 'The Divan of Shams gathers Rumi’s ecstatic ghazals and quatrains, named for his transformative bond with Shams of Tabriz.',
    ghazal: 'Persian ghazals use compressed images, inner music and emotional turns to reward slow reading and return.',
    ghete: 'Fragments are shorter poems that often carry a narrative, aphoristic or occasional voice.',
    ghaside: 'The ode is a major Persian form, traditionally shaped around sustained praise, meditation or description.',
    robaee: 'A quatrain is a compact four-line form that holds one thought, image or turn in a small space.',
    masnavi: 'Masnavi is a rhyming-couplet form suited to narrative, ethical reflection and mystical storytelling.',
    saghiname: 'Saqi-nama addresses the cupbearer while moving through longing, restlessness, celebration and meaning.',
    boostan: 'Saadi’s Bustan is a narrative and ethical poem about conduct, justice, generosity and the texture of human life.',
    manteghotteyr: 'The Conference of the Birds follows birds travelling toward the Simurgh and discovering that the truth they seek is also within them.',
    '2beytiha': 'Baba Taher’s quatrains speak in a direct, emotional voice about love, separation and spiritual experience.',
    'ferdowsi/shahnameh': 'The Shahnameh is Ferdowsi’s epic account of Iran’s mythic and heroic history, from creation and kingship to battle and endurance.',
    'nezami/khamsa': 'The Five Treasures is a set of five narrative poems that follow love, wisdom and moral experience with rich visual detail.',
    'sohrab/hasht-ketab': 'Eight Books is Sohrab Sepehri’s principal poetry collection, travelling from nature and daily objects toward silence and renewed attention.',
    'forough/selected-poems': 'This selection follows Forough Farrokhzad’s changing voice from her early poems to mature work focused on intimacy and lived experience.',
    'nima/selected-poems': 'This selection presents Nima Yooshij’s new rhythms, natural images and social observation at the foundation of modern Persian poetry.'
  };
  const poetName = person => lang === 'fa' ? person.n : (poetNamesEn[person.i] || person.n);
  const bookName = book => lang === 'fa' ? book.n : (bookNamesEn[book.i] || book.n);
  const poemDisplayTitle = poem => {
    if (lang === 'fa') return poem.title;
    const title = String(poem.title || '');
    const numbered = title.match(/^(بخش|دوبیتی|غزل|رباعی|قطعه|قصیده|مثنوی)\s*(?:شمارهٔ?\s*)?([۰-۹0-9]+)/);
    if (numbered) {
      const labels = { بخش: 'Section', دوبیتی: 'Quatrain', غزل: 'Ghazal', رباعی: 'Quatrain', قطعه: 'Fragment', قصیده: 'Ode', مثنوی: 'Masnavi section' };
      return `${labels[numbered[1]] || 'Poem'} ${normalizedDigits(numbered[2])}`;
    }
    const known = {
      'آغاز شاهنامه': 'Opening of the Shahnameh', 'توانا بود هر که دانا بود': 'Whoever has knowledge has strength',
      'رزم رستم و سهراب': 'The battle of Rostam and Sohrab', 'آغاز مخزن‌الاسرار': 'Opening of The Treasury of Mysteries',
      نیایش: 'Prayer', 'خسرو و شیرین': 'Khosrow and Shirin', 'صدای پای آب': 'The Sound of Water’s Footsteps',
      نشانی: 'The Address', 'آب را گل نکنیم': 'Let Us Not Muddy the Water', 'ایمان بیاوریم به آغاز فصل سرد': 'Let Us Believe in the Beginning of the Cold Season',
      'تولدی دیگر': 'Another Birth', گریه: 'Cry', 'خانه‌ام ابری است': 'My House Is Cloudy', 'تو را من چشم در راهم': 'I Am Waiting for You', 'مرغ آمین': 'The Amen Bird'
    };
    return known[title] || `Poem ${fa((poemsByBook[`${poem.poetId}/${poem.bookId}`] || []).findIndex(item => item.id === poem.id) + 1)}`;
  };
  const poetDescription = person => lang === 'fa'
    ? (bios[person.i] || `${person.n} از شاعران این آرشیو است. این صفحه گزیده‌ای از آثار و مجموعه‌های او را برای خواندن و دوباره‌خوانی گرد آورده است.`)
    : (biosEn[person.i] || `${poetName(person)} is one of the poets in this archive. This page gathers a selection of their works for reading and returning to.`);
  const bookDescription = (person, book, list = []) => {
    const facts = lang === 'fa' ? bookFacts : bookFactsEn;
    const fallback = lang === 'fa'
      ? `${book.n} مجموعه‌ای از آثار ${person.n} است. این بخش ${fa(list.length)} شعر دارد و مقدمه‌ای برای آشنایی با فضای زبانی و موضوعی این مجموعه فراهم می‌کند.`
      : `${bookName(book)} is a collection of works by ${poetName(person)}. It contains ${fa(list.length)} poems and offers an entry into this poet’s language and themes.`;
    const fact = facts[`${person.i}/${book.i}`] || facts[book.i];
    return `${fact || fallback} ${lang === 'fa' ? `این مجموعه ${fa(list.length)} شعر نمایه‌شده برای خواندن دارد.` : `The collection contains ${fa(list.length)} indexed poems.`}`;
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
  const normalizeMobile = value => String(value || '')
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[()\s-]/g, '');
  const validEmail = value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const validMobile = value => !value || /^\+?\d{7,15}$/.test(normalizeMobile(value));

  const icons = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    brand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7c4-4 6 4 10 0s5 1 6-1M4 12c4-4 6 4 10 0s5 1 6-1M4 17c4-4 6 4 10 0s5 1 6-1"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 15.2A8 8 0 1 1 8.8 4 6.2 6.2 0 0 0 20 15.2Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
     user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3-6 7-6s6.2 2 7 6"/></svg>',
     smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1.9 2 5.1 2 7 0M9 9.5h.01M15 9.5h.01"/></svg>',
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
     note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h14v16H5Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
     chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 4-6"/></svg>',
     refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.7-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8 8 0 0 0 14.7 4L21 14"/><path d="M21 19v-5h-5"/></svg>',
     close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  };
  const icon = name => icons[name] || '';

  const translations = {
    fa: {
      home: 'خانه', poets: 'شاعران', archive: 'آرشیو', account: 'حساب من', settings: 'تنظیمات',
       search: 'جست‌وجوی شعرها…', random: 'شعر تصادفی', randomPoem: 'فال شما',
       books: 'مجموعه‌ها', sections: 'بخش‌ها', save: 'ذخیره', saved: 'ذخیره‌شده‌ها', savedItem: 'ذخیره‌شده', history: 'تاریخچهٔ خواندن',
       today: 'امروز', month: 'این ماه', total: 'مجموع خوانده‌ها', more: 'نمایش بیشتر', morePoets: 'بیشتر', lessPoets: 'کمتر', back: 'بازگشت',
       copy: 'کپی شعر', note: 'یادداشت', writeNote: 'یادداشتت را اینجا بنویس...', font: 'فونت', appFont: 'فونت برنامه', poemFont: 'فونت اشعار',
       size: 'اندازهٔ نوشته', language: 'زبان', theme: 'تم', light: 'روشن', lightMode: 'لایت مود', paper: 'کاغذی', dark: 'تیره', darkMode: 'دارک مود',
       system: 'سیستم', toggleTheme: 'تغییر تم', profile: 'نام نمایشی', profilePlaceholder: 'نام خود را بنویسید', empty: 'نتیجه‌ای پیدا نشد.',
        name: 'نام', mobile: 'شماره موبایل', mobilePlaceholder: 'مثلاً ۰۹۱۲۱۲۳۴۵۶۷', current: 'فعلی', large: 'بزرگ', larger: 'بزرگ‌تر', login: 'ورود به حساب', register: 'ساخت حساب', accountTitle: 'حساب کاربری', admin: 'ادمین', username: 'نام کاربری', usernamePlaceholder: 'نام کاربری خود را وارد کن', password: 'کلمه عبور', passwordPlaceholder: 'کلمه عبور خود را وارد کن', rememberLogin: 'ذخیرهٔ نام کاربری و کلمه عبور روی این دستگاه', authIntro: 'برای نگه‌داشتن شعرها و مسیر خواندنت وارد شو یا حساب بساز.', mobileLogin: 'ورود با شماره موبایل', mobileSoon: 'به‌زودی', smsNotice: 'این روش تا زمان اتصال پنل پیامک غیرفعال است.', sendCode: 'ارسال کد', authSubmitLogin: 'ورود', authSubmitRegister: 'ثبت نام', usernameRequired: 'نام کاربری را وارد کن', passwordRequired: 'کلمه عبور را وارد کن', usernameShort: 'نام کاربری باید حداقل ۳ کاراکتر باشد', passwordShort: 'کلمه عبور باید حداقل ۵ کاراکتر باشد', invalidCredentials: 'نام کاربری یا کلمه عبور درست نیست', usernameTaken: 'این نام کاربری قبلاً ثبت شده است', registerSuccess: 'حساب ساخته شد', loginSuccess: 'با موفقیت وارد شدی', accountIntro: 'اطلاعات حساب و مسیر خواندنت را یک‌جا مدیریت کن.', displayName: 'نام نمایشی', email: 'ایمیل', emailPlaceholder: 'name@example.com', birthDate: 'تاریخ تولد', saveChanges: 'ذخیرهٔ تغییرات', profileSaved: 'اطلاعات حساب ذخیره شد', security: 'امنیت حساب', currentPassword: 'کلمه عبور فعلی', newUsername: 'نام کاربری جدید', newPassword: 'کلمه عبور جدید', changeCredentials: 'تغییر اطلاعات ورود', credentialsSaved: 'اطلاعات ورود تغییر کرد', credentialsHint: 'برای تغییر نام کاربری یا کلمه عبور، کلمه عبور فعلی را وارد کن.', accountLogout: 'خروج از حساب', readingChart: 'رفتار مطالعه', lastSevenDays: 'هفت روز اخیر', adminUsers: 'کاربران', adminRegistrations: 'ثبت‌نام‌ها', adminActive: 'فعال در هفت روز اخیر', adminFeedback: 'نظرات کاربران', adminUserEdit: 'ویرایش کاربر', adminSaveUser: 'ذخیره کاربر', adminNoUsers: 'هنوز کاربری ثبت نشده است', adminNoFeedback: 'هنوز نظری ثبت نشده است', adminUserSaved: 'اطلاعات کاربر ذخیره شد', adminFeedbackClear: 'پاک کردن نظرات', adminExportAll: 'خروجی کامل', adminLocalNotice: 'این پنل، داده‌های حساب‌های ثبت‌شده روی همین دستگاه را مدیریت می‌کند.',
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
       today: 'Today', month: 'This month', total: 'Total reads', more: 'Show more', morePoets: 'More', lessPoets: 'Less', back: 'Back',
       copy: 'Copy poem', note: 'Note', writeNote: 'Write a note...', font: 'Font', appFont: 'App font', poemFont: 'Poem font', size: 'App scale',
       language: 'Language', theme: 'Theme', light: 'Light', lightMode: 'Light mode', paper: 'Paper', dark: 'Dark', darkMode: 'Dark mode', system: 'System',
         toggleTheme: 'Toggle theme', profile: 'Display name', profilePlaceholder: 'Write your name', empty: 'No result found.',
         name: 'Name', mobile: 'Mobile number', mobilePlaceholder: 'e.g. +1 555 123 4567', current: 'Current', large: 'Large', larger: 'Larger', login: 'Sign in', register: 'Create account', accountTitle: 'User account', admin: 'Admin', username: 'Username', usernamePlaceholder: 'Enter your username', password: 'Password', passwordPlaceholder: 'Enter your password', rememberLogin: 'Remember username and password on this device', authIntro: 'Sign in or create an account to keep your poems and reading trail.', mobileLogin: 'Sign in with mobile', mobileSoon: 'Coming soon', smsNotice: 'This method is disabled until an SMS provider is connected.', sendCode: 'Send code', authSubmitLogin: 'Sign in', authSubmitRegister: 'Create account', usernameRequired: 'Enter a username', passwordRequired: 'Enter a password', usernameShort: 'Username must be at least 3 characters', passwordShort: 'Password must be at least 5 characters', invalidCredentials: 'The username or password is incorrect', usernameTaken: 'That username is already registered', registerSuccess: 'Account created', loginSuccess: 'You are signed in', accountIntro: 'Manage your account details and reading trail in one place.', displayName: 'Display name', email: 'Email', emailPlaceholder: 'name@example.com', birthDate: 'Birth date', saveChanges: 'Save changes', profileSaved: 'Account details saved', security: 'Account security', currentPassword: 'Current password', newUsername: 'New username', newPassword: 'New password', changeCredentials: 'Change sign-in details', credentialsSaved: 'Sign-in details changed', credentialsHint: 'Enter your current password before changing the username or password.', accountLogout: 'Sign out', readingChart: 'Reading behavior', lastSevenDays: 'Last seven days', adminUsers: 'Users', adminRegistrations: 'Registrations', adminActive: 'Active in seven days', adminFeedback: 'User feedback', adminUserEdit: 'Edit user', adminSaveUser: 'Save user', adminNoUsers: 'No users registered yet', adminNoFeedback: 'No feedback yet', adminUserSaved: 'User details saved', adminFeedbackClear: 'Clear feedback', adminExportAll: 'Full export', adminLocalNotice: 'This panel manages accounts registered on this device.',
       iranNastaliq: 'Iran Nastaliq', shekastehNastaliq: 'Shekasteh Nastaliq', mirEmad: 'Mir Emad', serverNotice: 'Your name, mobile and device details are stored with your consent.', consent: 'I agree to save account and device details',
       feedback: 'Send feedback', feedbackTitle: 'Send your feedback', feedbackPlaceholder: 'Write your message...', feedbackCategory: 'Message type', feedbackGeneral: 'General', feedbackBug: 'Bug report', feedbackSuggestion: 'Suggestion', sendFeedback: 'Send feedback', feedbackRequired: 'Write a message first', feedbackSent: 'Feedback sent', feedbackOffline: 'Feedback saved locally; enable the server for online delivery',
      info: 'About this poet', bookInfo: 'About this collection', poemInfo: 'A note for rereading', all: 'All',
      poetType: 'Poet', bookType: 'Book', poemType: 'Poem', choosePoet: 'All poets', chooseBook: 'All books',
       menu: 'Menu', searching: 'Preparing full-text search...', adminPanel: 'Admin panel', adminAccess: 'Admin access enabled', adminExport: 'Export my data', adminClearOutbox: 'Clear feedback queue', adminStats: 'Local account stats', adminSaved: 'Saved', adminReads: 'Reads', adminQueued: 'Queued feedback', adminExported: 'Export ready', adminCleared: 'Feedback queue cleared'
    }
  };
  Object.assign(translations.fa, {
    searchError: 'جست‌وجو آماده نشد؛ دوباره تلاش کن.',
      searchPrompt: 'هر چه در جستن آنی…',
    notFound: 'این صفحه پیدا نشد.',
     notFoundCopy: 'مسیر موردنظر وجود ندارد یا حذف شده است.',
     retry: 'تلاش دوباره',
     backToCollection: 'بازگشت به مجموعه',
    adminNotConfigured: 'مدیریت محلی در این نسخه فعال نشده است.',
    invalidEmail: 'ایمیل معتبر وارد کن.',
    invalidMobile: 'شماره موبایل معتبر وارد کن.',
    copyUnavailable: 'کپی در این مرورگر در دسترس نیست.'
  });
  Object.assign(translations.en, {
     searchError: 'Search is unavailable. Try again.',
      searchPrompt: 'Whatever you seek…',
    notFound: 'Page not found.',
     notFoundCopy: 'This route does not exist or has been removed.',
     retry: 'Try again',
     backToCollection: 'Back to collection',
    adminNotConfigured: 'Local administration is not configured in this build.',
    invalidEmail: 'Enter a valid email address.',
    invalidMobile: 'Enter a valid mobile number.',
      copyUnavailable: 'Copy is unavailable in this browser.'
   });
   Object.assign(translations.fa, {
     accountDataConsent: 'با ثبت حساب، نام کاربری و اطلاعاتی که وارد می‌کنی همراه IP، کشور تقریبی و مشخصات مرورگر و دستگاه برای مدیریت سایت ذخیره می‌شود. گذرواژه و تاریخچهٔ خواندن ذخیره نمی‌شوند.',
     consentRequired: 'برای ثبت حساب و ذخیرهٔ اطلاعات روی سرور، موافقت را انتخاب کن.',
     jalaliDateHint: 'به‌شکل سال/ماه/روز شمسی، مانند ۱۴۰۵/۰۱/۰۱',
      flowPopular: 'پربازدیدترین‌ها', flowPoets: 'شاعران', flowPoems: 'شعرها', flowFortunes: 'فال',
      flowHafez: 'فال حافظ', flowMolana: 'فال مولانا', flowTarot: 'فال تاروت', flowTarotSoon: 'هنوز راه‌اندازی نشده',
      flowShared: 'بیشترین اشتراک‌گذاری', flowSharedPoems: 'شعرها', flowSharedCouplets: 'بیت‌ها', flowRecent: 'تازه‌ترین‌ها',
       flowVerse: 'یه بیت', flowVerseHint: 'برای بیت تازه لمس کن یا ۳ ثانیه نگه‌دار', flowViewedCount: 'بازدید', flowSharedCount: 'اشتراک',
      flowNoPopular: 'با بیشتر شدن بازدیدها، اینجا پربازدیدترین‌ها را می‌بینی.', flowNoShared: 'هنوز اشتراکی ثبت نشده است.', flowUnavailable: 'داده‌های آمار در دسترس نیست؛ سرور اختیاری را فعال کن.',
      flowNoRecent: 'شاعر تازه‌ای به آرشیو اضافه نشده است.', flowLoading: 'در حال بارگذاری...', flowVerseLoading: 'در حال انتخاب یک بیت کوتاه...', flowVerseUnavailable: 'بارگذاری بیت شعر ممکن نشد.',
      flowFortuneAction: 'گرفتن فال', offlineSaved: 'شعر برای آفلاین آماده شد', offlineSaveFailed: 'ذخیرهٔ آفلاین انجام نشد؛ اتصال را بررسی کن.',
     adminServerOnly: 'پنل مدیریت فقط با رمز تنظیم‌شده روی سرور باز می‌شود.', adminLoading: 'در حال دریافت اطلاعات اعضا...',
     adminRefresh: 'به‌روزرسانی', adminDevices: 'دستگاه‌ها و نشست‌ها', adminIp: 'IP', adminCountry: 'کشور',
     adminPage: 'صفحه', adminNoServerData: 'هنوز داده‌ای روی سرور ثبت نشده است.', adminSyncError: 'دریافت اطلاعات سرور ممکن نشد.',
     adminLocalOnly: 'حساب‌های قدیمی که با رضایت سرور همگام نشده‌اند اینجا دیده نمی‌شوند.'
   });
   Object.assign(translations.en, {
     accountDataConsent: 'Creating an account stores your username and submitted profile details, plus IP, approximate country, browser and device details for site administration. Passwords and reading history are not stored on the server.',
     consentRequired: 'Agree to server-side account records to create an account.',
     jalaliDateHint: 'Persian calendar: year/month/day, for example 1405/01/01',
      flowPopular: 'Most viewed', flowPoets: 'Poets', flowPoems: 'Poems', flowFortunes: 'Fortunes',
      flowHafez: 'Hafez fortune', flowMolana: 'Molana fortune', flowTarot: 'Tarot reading', flowTarotSoon: 'Not available yet',
      flowShared: 'Most shared', flowSharedPoems: 'Poems', flowSharedCouplets: 'Couplets', flowRecent: 'Recently added poets',
       flowVerse: 'A verse', flowVerseHint: 'Tap for a new verse or hold for 3 seconds', flowViewedCount: 'views', flowSharedCount: 'shares',
      flowNoPopular: 'As more poems are read, the most-viewed items will appear here.', flowNoShared: 'Nothing has been shared yet.', flowUnavailable: 'Statistics are unavailable. Enable the optional server.',
      flowNoRecent: 'No poets have been added recently.', flowLoading: 'Loading...', flowVerseLoading: 'Choosing a short verse...', flowVerseUnavailable: 'Could not load a verse.',
      flowFortuneAction: 'Draw a fortune', offlineSaved: 'Poem is ready offline', offlineSaveFailed: 'Could not save offline. Check your connection.',
     adminServerOnly: 'Admin access uses a password configured on the server.', adminLoading: 'Loading member records...',
     adminRefresh: 'Refresh', adminDevices: 'Devices and sessions', adminIp: 'IP', adminCountry: 'Country',
     adminPage: 'Page', adminNoServerData: 'No records are stored on the server yet.', adminSyncError: 'Could not load server records.',
     adminLocalOnly: 'Older accounts that have not consented to server sync are not listed here.'
   });
   Object.assign(translations.fa, {
    savedToast: 'ذخیره شد',
    removedToast: 'از ذخیره‌ها حذف شد',
    poetSavedToast: 'شاعر ذخیره شد',
    bookSavedToast: 'مجموعه ذخیره شد',
    noteSaved: 'یادداشت ذخیره شد',
    historyCleared: 'تاریخچه پاک شد',
    share: 'اشتراک‌گذاری',
    shareTitle: 'اشتراک شعر',
    shareChoiceCopy: 'چطور می‌خواهی این شعر را به اشتراک بگذاری؟',
    shareWhole: 'کل شعر',
    shareWholeCopy: 'همهٔ ابیات این شعر',
    shareSelected: 'انتخاب ابیات',
    shareSelectedCopy: 'فقط ابیاتی که انتخاب می‌کنی',
    shareFormat: 'قالب اشتراک‌گذاری را انتخاب کن',
    shareText: 'متن',
    shareImage: 'تصویر PNG',
    shareImageCopy: 'تصویر کم‌حجم با نشان جریان',
    chooseVerses: 'ابیات موردنظر را انتخاب کن',
    shareConfirm: 'ادامه',
    shareEmpty: 'حداقل یک بیت را انتخاب کن',
    shareFallback: 'فایل تصویر آماده شد و دانلود می‌شود',
    shareCancelled: 'اشتراک‌گذاری لغو شد',
    works: 'اثر',
    collections: 'مجموعه',
    poetsCount: 'شاعر',
    appVersion: 'نسخهٔ جریان',
    heroLead: 'مجموعه‌ای از شعرهای پارسی و آثار شاعران ایرانی',
    backArrow: '←',
    nextArrow: '→',
      clear: 'پاک کردن'
  });
  Object.assign(translations.en, {
    savedToast: 'Saved',
    removedToast: 'Removed from saved',
    poetSavedToast: 'Poet saved',
    bookSavedToast: 'Collection saved',
    noteSaved: 'Note saved',
    historyCleared: 'Reading history cleared',
    share: 'Share',
    shareTitle: 'Share poem',
    shareChoiceCopy: 'How would you like to share this poem?',
    shareWhole: 'Full poem',
    shareWholeCopy: 'Every couplet in this poem',
    shareSelected: 'Choose couplets',
    shareSelectedCopy: 'Only the couplets you select',
    shareFormat: 'Choose a sharing format',
    shareText: 'Text',
    shareImage: 'PNG image',
    shareImageCopy: 'A compact image with the Jaryan tag',
    chooseVerses: 'Choose the couplets to share',
    shareConfirm: 'Continue',
    shareEmpty: 'Choose at least one couplet',
    shareFallback: 'The image is ready and will download',
    shareCancelled: 'Sharing cancelled',
    works: 'works',
    collections: 'collections',
    poetsCount: 'poets',
    appVersion: 'Jaryan version',
    heroLead: 'A collection of Persian poems and works by Iranian poets',
    backArrow: '→',
    nextArrow: '←',
      clear: 'Clear'
  });
  Object.assign(translations.fa, {
    viewAllPoets: 'مشاهده‌ی همه‌ی شاعران',
    closePoets: 'نمایش کمتر',
    smaller: 'کوچک‌تر',
    defaultSize: 'پیش‌فرض',
    accountOverview: 'نمای کلی',
    accountProfile: 'اطلاعات کاربری',
    accountLibrary: 'کتابخانه',
    siteSettings: 'تنظیمات سایت',
    selectedPoets: 'شاعران منتخب',
    readPoems: 'شعرهای خوانده‌شده',
    recentActivity: 'فعالیت اخیر',
    notesTitle: 'یادداشت‌ها',
    offlinePoems: 'شعرهای آفلاین',
     offlineAdd: 'ذخیره برای آفلاین',
     offlineRemove: 'حذف از آفلاین',
     offlineEmpty: 'هنوز شعری برای خواندن آفلاین انتخاب نشده است.',
      dailyFortune: 'فال امروز', dailyFortuneOpen: 'خواندن شعر', dailyFortuneDate: 'تاریخ امروز',
      accountNotes: 'یادداشت‌ها', accountProfileShort: 'اطلاعات کاربری', accountFavorites: 'علاقه‌مندی‌ها', accountStats: 'آمار', accountUpdate: 'بروزرسانی', favoriteLibraryTitle: 'مخزن شعرهای برگزیده', favoriteLibraryCopy: 'شعرها و انتخاب‌های تو، یک‌جا و مرتب.', favoritePoems: 'شعرهای برگزیده', favoriteVerses: 'بیت‌های پسندیده', favoritePoets: 'شاعران منتخب', favoritePoemCount: 'شعر', favoriteVerseCount: 'بیت', favoritePoetCount: 'شاعر', recentViews: 'مشاهده‌های اخیر', recentViewsCopy: 'آخرین شعرهایی که باز کردی.',
     accountWelcome: 'فضای شخصی تو، ساده و مرتب', accountSecurity: 'ورود و امنیت حساب', accountSecurityHint: 'تغییر نام کاربری، رمز عبور یا خروج از حساب.',
     forgotPassword: 'فراموشی رمز عبور', forgotPasswordCopy: 'بازیابی رمز برای این حساب هنوز به ایمیل یا پیامک متصل نشده است.', usernameReadOnly: 'نام کاربری قابل ویرایش نیست',
     updateChecking: 'در حال بررسی نسخه...', updateCurrent: 'نسخهٔ نصب‌شده به‌روز است.', updateAvailable: 'نسخهٔ جدید آمادهٔ دریافت است.', updateCacheCurrent: 'کش دستگاه با همین نسخه هماهنگ است.', updateCacheOld: 'کش دستگاه هنوز نسخهٔ قبلی را دارد.', updateCacheUnknown: 'وضعیت کش دستگاه هنوز مشخص نیست.', updateInstall: 'دریافت و بروزرسانی', updateRetry: 'بررسی دوباره', updateUpdating: 'در حال بروزرسانی...', updateError: 'بررسی نسخه انجام نشد؛ اتصال را بررسی کن.', installedVersion: 'نسخهٔ نصب‌شده', serverVersion: 'نسخهٔ سمت سرور', cacheVersion: 'وضعیت کش', cacheCurrent: 'همگام', cacheOld: 'قدیمی', cacheUnknown: 'نامشخص',
     noNotes: 'هنوز یادداشتی ثبت نکرده‌ای.', noFavorites: 'هنوز چیزی به علاقه‌مندی‌ها اضافه نشده است.', noStats: 'با خواندن چند شعر، آمار مطالعه‌ات اینجا ساخته می‌شود.'
  });
  Object.assign(translations.en, {
    viewAllPoets: 'View all poets',
    closePoets: 'Show less',
    smaller: 'Smaller',
    defaultSize: 'Default',
    accountOverview: 'Overview',
    accountProfile: 'Profile',
    accountLibrary: 'Library',
    siteSettings: 'Site settings',
    selectedPoets: 'Selected poets',
    readPoems: 'Read poems',
    recentActivity: 'Recent activity',
    notesTitle: 'Notes',
    offlinePoems: 'Offline poems',
     offlineAdd: 'Save offline',
     offlineRemove: 'Remove offline',
     offlineEmpty: 'No poems have been selected for offline reading yet.',
      dailyFortune: 'Today’s fortune', dailyFortuneOpen: 'Read poem', dailyFortuneDate: 'Today',
      accountNotes: 'Notes', accountProfileShort: 'Profile', accountFavorites: 'Favorites', accountStats: 'Stats', accountUpdate: 'Update', favoriteLibraryTitle: 'Selected poems library', favoriteLibraryCopy: 'Your poems and selections, kept together.', favoritePoems: 'Selected poems', favoriteVerses: 'Selected verses', favoritePoets: 'Selected poets', favoritePoemCount: 'poems', favoriteVerseCount: 'verses', favoritePoetCount: 'poets', recentViews: 'Recent views', recentViewsCopy: 'The latest poems you opened.',
     accountWelcome: 'Your personal space, kept simple', accountSecurity: 'Sign-in and security', accountSecurityHint: 'Change your username, password, or sign out.',
     forgotPassword: 'Forgot password', forgotPasswordCopy: 'Password recovery is not connected to email or SMS for this account yet.', usernameReadOnly: 'Username cannot be edited',
     updateChecking: 'Checking version...', updateCurrent: 'This installation is up to date.', updateAvailable: 'A newer version is ready.', updateCacheCurrent: 'The device cache matches this version.', updateCacheOld: 'The device cache still has an older version.', updateCacheUnknown: 'The device cache status is not available yet.', updateInstall: 'Download and update', updateRetry: 'Check again', updateUpdating: 'Updating...', updateError: 'Could not check the version. Check your connection.', installedVersion: 'Installed version', serverVersion: 'Server version', cacheVersion: 'Cache status', cacheCurrent: 'Synced', cacheOld: 'Older', cacheUnknown: 'Unknown',
     noNotes: 'You have not written a note yet.', noFavorites: 'Nothing has been added to favorites yet.', noStats: 'Read a few poems and your reading stats will appear here.'
  });
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
   const jalaliFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
   const jalaliParts = date => Object.fromEntries(jalaliFormatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
   const jalaliDateValue = value => {
     const raw = normalizedDigits(value).trim();
     const jalali = raw.match(/^(13|14)\d{2}[/-]([0-1]?\d)[/-]([0-3]?\d)$/);
     if (jalali) return `${raw.match(/^(\d{4})/)[1]}/${jalali[2].padStart(2, '0')}/${jalali[3].padStart(2, '0')}`;
     const gregorian = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
     if (!gregorian) return '';
     const parts = jalaliParts(new Date(`${gregorian[1]}-${gregorian[2]}-${gregorian[3]}T00:00:00Z`));
     return `${parts.year}/${parts.month}/${parts.day}`;
   };
   const validJalaliDate = value => {
     if (!value) return true;
     const match = jalaliDateValue(value).match(/^((?:13|14)\d{2})\/([0-1]\d)\/([0-3]\d)$/);
     if (!match) return false;
     const [, year, month, day] = match;
     const monthNumber = Number(month);
     const dayNumber = Number(day);
     if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > (monthNumber <= 6 ? 31 : monthNumber <= 11 ? 30 : 30)) return false;
     const start = Date.UTC(Number(year) + 621, 1, 20);
     for (let offset = 0; offset < 430; offset += 1) {
       const parts = jalaliParts(new Date(start + offset * 86400000));
       if (parts.year === year && parts.month === month && parts.day === day) return true;
     }
     return false;
   };
  const usernameKey = value => String(value ?? '').trim().normalize('NFKC').toLocaleLowerCase('fa-IR');
  const ADMIN_USERNAME = 'admin';
  let adminSession = false;
  const isAdminAccount = () => Boolean(adminSession && account?.role === 'admin' && usernameKey(account?.username) === ADMIN_USERNAME);
  let appFont = localStorage.getItem('jaryan-app-font') || localStorage.getItem('jaryan-font') || (lang === 'en' ? 'english' : 'ravi');
  let poemFont = ['ravi', 'iran-nastaliq', 'shekasteh', 'mir-emad'].includes(localStorage.getItem('jaryan-poem-font'))
    ? localStorage.getItem('jaryan-poem-font') : 'ravi';
  let profile = localStorage.getItem('jaryan-profile') || '';
  const storedAccount = readJSON('jaryan-account', { name: profile, mobile: '', username: '' });
  let account = storedAccount && typeof storedAccount === 'object'
    ? { name: '', mobile: '', username: '', role: 'user', ...storedAccount, loggedIn: Boolean(storedAccount.loggedIn !== false && (storedAccount.username || storedAccount.mobile || storedAccount.role === 'admin')) }
    : { name: profile, mobile: '', username: '', role: 'user', loggedIn: false };
  let authUsers = readJSON('jaryan-auth-users', {});
  authUsers = authUsers && typeof authUsers === 'object' && !Array.isArray(authUsers) ? authUsers : {};
  let feedbackHistory = readJSON('jaryan-feedback-history', []);
  feedbackHistory = Array.isArray(feedbackHistory) ? feedbackHistory : [];
  if (profile === 'خوانندهٔ جریان' || profile === 'خواننده جریان') {
    profile = '';
    localStorage.removeItem('jaryan-profile');
  }
  let sizeScale = Math.max(100, Math.min(400, Number(localStorage.getItem('jaryan-size-scale') || 100)));
  const storedUiScale = localStorage.getItem('jaryan-ui-scale');
  let uiScale = ['smaller', 'default', 'large', 'larger'].includes(storedUiScale)
    ? storedUiScale : 'default';
  let favorites = new Set(readJSON('jaryan-favorites', []));
  let poetFavorites = new Set(readJSON('jaryan-poet-favorites', []));
  let bookFavorites = new Set(readJSON('jaryan-book-favorites', []));
  let coupletFavorites = new Set(readJSON('jaryan-couplet-favorites', []));
  let offlinePoems = new Set(readJSON('jaryan-offline-poems', []));
  let notes = readJSON('jaryan-notes', {});
  let readingHistory = readJSON('jaryan-history', []);
  const state = {
    page: 'home', poetId: null, bookId: null, poemId: null, query: '', poet: 'همه', book: 'همه',
      genre: 'all', archiveType: 'all', searchCommitted: false, searchError: false, limit: 24, active: null, favoriteTab: 'poems', accountTab: 'overview', favoriteShelfExpanded: { poems: false, verses: false, poets: false }, recentExpanded: false, authMode: 'login', homePeopleExpanded: false, flowPopular: [], flowPopularPoets: [], flowSharedPoets: [], flowSharedPoems: [], flowSharedCouplets: [], flowLoaded: false, flowLoading: false, flowError: false, flowVerse: null, flowVerseLoading: false, flowVerseRequested: false, adminData: null, adminError: '', adminLoading: false,
     update: { status: 'idle', remoteVersion: '', cacheStatus: 'unknown', checkedAt: null }
  };
  let focusIndex = 0;

   const localDayKey = () => {
     const date = new Date();
     return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
   };
   const stableHash = value => [...String(value)].reduce((hash, char) => Math.imul(31, hash) + char.codePointAt(0), 7) >>> 0;
    const dailyFortune = () => {
      const userKey = account?.username || account?.mobile || account?.name || 'guest';
      return poems[stableHash(`${usernameKey(userKey)}|${localDayKey()}`) % poems.length];
    };
    const persianDateLabel = () => {
      const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
      return `${values.weekday} ${values.year}/${values.month}/${values.day}`;
    };
   const compareVersions = (left, right) => {
     const a = String(left || '0').split('.').map(Number);
     const b = String(right || '0').split('.').map(Number);
     for (let index = 0; index < 3; index += 1) {
       if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
     }
     return 0;
   };
   const checkForUpdates = async () => {
     state.update = { ...state.update, status: 'checking' };
     render();
     try {
       const response = await fetch(`app.js?version-check=${Date.now()}`, { cache: 'no-store' });
       if (!response.ok) throw new Error('Version check failed');
       const source = await response.text();
       const remoteVersion = source.match(/const APP_VERSION = ['"]([^'"]+)['"]/)?.[1] || APP_VERSION;
       const cacheKeys = 'caches' in window ? await caches.keys() : [];
        const currentCaches = cacheKeys.filter(key => key.startsWith(`jaryan-${APP_VERSION}`) && key.endsWith('-shell'));
        const currentCache = currentCaches.length > 0;
        const oldCache = cacheKeys.some(key => key.startsWith('jaryan-') && !currentCaches.includes(key));
       state.update = {
         status: compareVersions(remoteVersion, APP_VERSION) > 0 ? 'available' : 'current',
         remoteVersion,
         cacheStatus: currentCache ? 'current' : oldCache ? 'old' : 'unknown',
         checkedAt: Date.now()
       };
     } catch {
       state.update = { ...state.update, status: 'error', checkedAt: Date.now() };
     }
     render();
   };
   const applyUpdate = async () => {
     state.update = { ...state.update, status: 'updating' };
     render();
     try {
        const registration = await navigator.serviceWorker?.getRegistration();
        await registration?.update();
        registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
     } finally {
       window.location.reload();
     }
   };

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
  if (account?.role === 'admin') {
    try {
      const response = await fetch(`${API_BASE}/api/v1/admin/session`, { credentials: 'include', cache: 'no-store' });
      adminSession = response.ok && Boolean((await response.json()).authenticated);
    } catch { adminSession = false; }
  }
  if (account.loggedIn && !isAdminAccount() && !authUsers[usernameKey(account.username)]) {
    account = { ...account, loggedIn: false };
    profile = '';
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
  const saveAuthUsers = () => localStorage.setItem('jaryan-auth-users', JSON.stringify(authUsers));
  const saveFeedbackHistory = () => localStorage.setItem('jaryan-feedback-history', JSON.stringify(feedbackHistory.slice(-100)));
  const hashSecret = async value => {
    const source = String(value ?? '');
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    let hash = 2166136261;
    for (const char of source) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    return `fallback-${(hash >>> 0).toString(16)}`;
  };
  const isAuthenticated = () => Boolean(account?.loggedIn && (isAdminAccount() || authUsers[usernameKey(account?.username)]));
  const currentUserRecord = () => authUsers[usernameKey(account?.username)] || null;
  const accountLabel = () => isAdminAccount() ? tr('admin') : tr('account');
  const rememberLogin = (username, passwordHash) => localStorage.setItem('jaryan-remembered-login', JSON.stringify({ username, passwordHash }));
  const clearRememberedLogin = () => localStorage.removeItem('jaryan-remembered-login');
  const recordFeedback = record => {
    feedbackHistory = [...feedbackHistory, { id: globalThis.crypto?.randomUUID?.() || String(Date.now()), ...record }].slice(-100);
    saveFeedbackHistory();
  };

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
  const serverRequest = async (path, payload, method = 'POST') => {
    const response = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...(method === 'GET' ? {} : { body: JSON.stringify(payload || {}) }),
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  };
  const getDeviceId = () => {
    let value = localStorage.getItem('jaryan-device-id');
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('jaryan-device-id', value);
    }
    return value;
  };
  const syncAccountToServer = async (source = currentUserRecord()) => {
    if (!source?.consentAt || !source.localId) return false;
    const result = await serverRequest('/members/sync', {
      localId: source.localId, username: source.username, displayName: source.displayName || source.username,
      email: source.email || '', mobile: source.mobile || '', birthDate: source.birthDate || '', consentAt: source.consentAt,
      deviceId: getDeviceId(), device: deviceInfo()
    });
    const key = usernameKey(source.username);
    authUsers[key] = { ...source, remoteId: result.member?.id || source.remoteId, remoteSyncedAt: new Date().toISOString() };
    account = { ...account, remoteId: authUsers[key].remoteId, remoteSyncedAt: authUsers[key].remoteSyncedAt };
    saveAuthUsers();
    saveUserData();
    return true;
  };
  const submitFeedback = async (message, category) => serverRequest('/feedback', {
    memberId: isAuthenticated() && !isAdminAccount() ? account?.remoteId || '' : '',
    message, category, page: location.hash || '#home', device: deviceInfo()
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
    const scale = { smaller: .9, default: 1, large: 1.1, larger: 1.2 }[uiScale] || 1;
    document.documentElement.className = `theme-${theme}`;
    document.documentElement.dataset.font = activeFonts.appFont;
    document.documentElement.dataset.appFont = activeFonts.appFont;
    document.documentElement.dataset.poemFont = activeFonts.poemFont;
     document.documentElement.dataset.lang = lang;
     document.documentElement.dataset.textScale = uiScale;
     document.documentElement.lang = lang;
     document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
     document.documentElement.style.setProperty('--scale', String(sizeScale / 100));
     document.documentElement.style.setProperty('--text-scale', String(scale));
     document.documentElement.style.setProperty('--ui-scale', '1');
     document.title = lang === 'fa' ? 'جریان | آرشیو شعر فارسی' : 'Jaryan | Persian poetry archive';
     document.querySelector('meta[name="description"]')?.setAttribute('content', lang === 'fa' ? 'آرشیو شعر فارسی؛ بخوان و فال بگیر' : 'A calm archive for reading and discovering Persian poetry.');
     const splash = document.getElementById('splash-screen');
     if (splash) {
       splash.setAttribute('aria-label', lang === 'fa' ? 'جریان' : 'Jaryan');
       const label = splash.querySelector('.splash-lockup strong');
       if (label) label.textContent = lang === 'fa' ? 'جریان' : 'Jaryan';
     }
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
    let hash = '';
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { hash = ''; }
    state.page = 'home';
    state.poetId = state.bookId = state.poemId = null;
    if (!hash || hash === 'home' || hash === 'poets') return;
    const [kind, ...rest] = hash.split('/');
    if (kind === 'poet' && peopleById[rest[0]]) [state.page, state.poetId] = ['poet', rest[0]];
    else if (kind === 'book' && peopleById[rest[0]]?.b.some(book => book.i === rest[1])) [state.page, state.poetId, state.bookId] = ['book', rest[0], rest[1]];
    else if (kind === 'poem' && poems.some(poem => poem.poetId === rest[0] && poem.bookId === rest[1] && poem.id === rest[2])) [state.page, state.poetId, state.bookId, state.poemId] = ['poem', rest[0], rest[1], rest[2]];
    else if (kind === 'archive') state.page = 'archive';
    else if (kind === 'flow') state.page = 'flow';
    else if (kind === 'account' || kind === 'settings') { state.page = kind; if (kind === 'account') state.accountTab = 'overview'; }
    else state.page = 'not-found';
  };
  let modalTrigger = null;
  const openModal = () => {
    const backdrop = document.getElementById('modal-backdrop');
    const modal = backdrop?.querySelector('.modal');
    if (!backdrop || !modal) return;
    const heading = modal.querySelector('h2');
    if (heading) {
      heading.id = heading.id || `modal-title-${Date.now()}`;
      modal.setAttribute('aria-labelledby', heading.id);
    } else modal.removeAttribute('aria-labelledby');
    modal.querySelectorAll('.input-clear').forEach(button => button.setAttribute('aria-label', tr('clear')));
    modalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backdrop.classList.add('open');
    document.documentElement.classList.add('modal-open');
    document.querySelectorAll('#app > .topbar, #app > main, #app > .footer, body > .mobile-nav').forEach(element => { element.inert = true; });
    setTimeout(() => {
      const first = modal.querySelector('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
      else modal.focus();
    }, 0);
  };
  const closeModal = () => {
    const backdrop = document.getElementById('modal-backdrop');
    if (!backdrop?.classList.contains('open')) return;
    backdrop.classList.remove('open');
    document.documentElement.classList.remove('modal-open');
    document.querySelectorAll('#app > .topbar, #app > main, #app > .footer, body > .mobile-nav').forEach(element => { element.inert = false; });
    backdrop.querySelector('.modal')?.classList.remove('share-modal');
    modalTrigger?.focus?.();
    modalTrigger = null;
  };
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
     trigger.setAttribute('aria-label', open ? (lang === 'fa' ? 'بستن ابزارهای شعر' : 'Close poem tools') : (lang === 'fa' ? 'بازکردن ابزارهای شعر' : 'Open poem tools'));
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
       if (copy) copy.textContent = lang === 'fa' ? `نسخهٔ ${APP_VERSION_FA}` : `Version ${APP_VERSION}`;
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
       controls.innerHTML = `<button type="button" data-focus-next>${lang === 'fa' ? 'بیت بعدی →' : 'Next couplet →'}</button><span data-focus-position></span><button type="button" data-focus-prev>${lang === 'fa' ? '← بیت قبلی' : 'Previous couplet ←'}</button><button type="button" class="focus-exit" data-focus-exit aria-label="${tr('back')}" title="${tr('back')}">${icon('close')}</button>`;
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
  const pickFlowVerse = async () => {
    const shortBooks = new Set(['khayyam/robaee', 'babataher/2beytiha', 'hafez/robaee']);
    const candidates = poems.filter(poem => shortBooks.has(`${poem.poetId}/${poem.bookId}`) && poem.coupletCount);
    for (let attempt = 0; attempt < Math.min(candidates.length, 24); attempt += 1) {
      const poem = candidates[Math.floor(Math.random() * candidates.length)];
      await ensurePoemLoaded(poem);
      const short = poem.couples.filter(couple => couple?.length === 2 && couple.every(line => line && line.length <= 40));
      if (!short.length) continue;
      const couplets = shortBooks.has(`${poem.poetId}/${poem.bookId}`) && short.length > 1
        ? short.slice(0, 2)
        : [short[Math.floor(Math.random() * short.length)]];
      return { poemId: idOf(poem), poetId: poem.poetId, poetName: poetName(peopleById[poem.poetId]), poemTitle: poemDisplayTitle(poem), couplets };
    }
    return null;
  };
  const refreshFlowVerse = (showLoading = false) => {
    if (state.flowVerseLoading) return;
    state.flowVerseRequested = true;
    state.flowVerseLoading = true;
    if (showLoading && state.page === 'flow') render();
    pickFlowVerse().then(verse => { state.flowVerse = verse; })
      .catch(() => { state.flowVerse = null; })
      .finally(() => {
        state.flowVerseLoading = false;
        if (state.page === 'flow') render();
      });
  };
  const offlineResource = poemOrId => {
    const poem = typeof poemOrId === 'string' ? poems.find(item => idOf(item) === poemOrId) : poemOrId;
    if (!poem) return '';
    const filename = poem.chunk == null
      ? `data/poems/${encodeURIComponent(poem.poetId)}__${encodeURIComponent(poem.bookId)}.bin`
      : `data/poems/chunks/${encodeURIComponent(poem.poetId)}__${encodeURIComponent(poem.bookId)}__${poem.chunk}.bin`;
    return new URL(filename, location.href).href;
  };
  const purgeOfflineResource = url => {
    if (url && 'serviceWorker' in navigator) navigator.serviceWorker.ready.then(registration => registration.active?.postMessage({ type: 'DELETE_CACHE_URL', url })).catch(() => {});
  };
  const removeOfflinePoem = id => {
    const resource = offlineResource(id);
    offlinePoems.delete(id);
    localStorage.setItem('jaryan-offline-poems', JSON.stringify([...offlinePoems]));
    if (resource && ![...offlinePoems].some(savedId => offlineResource(savedId) === resource)) purgeOfflineResource(resource);
  };
  const clearOfflinePoems = () => {
    const resources = new Set([...offlinePoems].map(offlineResource).filter(Boolean));
    offlinePoems.clear();
    localStorage.removeItem('jaryan-offline-poems');
    resources.forEach(purgeOfflineResource);
  };

  let searchReady = false;
  let searchPromise = null;
  let searchWorker = null;
  let searchInitResolve = null;
  let searchInitReject = null;
  let searchRequest = 0;
  const searchRequests = new Map();
  let searchMatches = null;
  const failSearch = error => {
    searchInitReject?.(error);
    searchInitResolve = searchInitReject = null;
    searchRequests.forEach(request => request.reject(error));
    searchRequests.clear();
  };
  const createSearchWorker = () => {
    if (searchWorker) return searchWorker;
    searchWorker = new Worker('./search-worker.js');
    searchWorker.onmessage = event => {
      const data = event.data || {};
      if (data.type === 'ready') {
        searchReady = true;
        searchInitResolve?.(true);
        searchInitResolve = searchInitReject = null;
      } else if (data.type === 'result') {
        const request = searchRequests.get(data.requestId);
        if (!request) return;
        searchRequests.delete(data.requestId);
        request.resolve(new Set(data.ids));
      } else if (data.type === 'error') failSearch(new Error(data.message || 'Search failed'));
    };
    searchWorker.onerror = event => failSearch(event.error || new Error('Search worker failed'));
    return searchWorker;
  };
  const loadSearchIndex = () => {
    if (searchPromise) return searchPromise;
    const worker = createSearchWorker();
    searchPromise = new Promise((resolve, reject) => {
      searchInitResolve = resolve;
      searchInitReject = reject;
      worker.postMessage({ type: 'init', path: new URL('data/search.bin', location.href).href });
    }).catch(() => {
      searchReady = false;
      return false;
    });
    return searchPromise;
  };
  const querySearchIndex = async query => {
    if (!(await loadSearchIndex())) return null;
    const requestId = ++searchRequest;
    return new Promise((resolve, reject) => {
      searchRequests.set(requestId, { resolve, reject });
      searchWorker.postMessage({ type: 'query', query, requestId });
    });
  };
  const localPoemText = poem => normalize(`${poem.title} ${poem.poetName} ${poem.bookTitle} ${poemDisplayTitle(poem)} ${poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName })} ${bookName(peopleById[poem.poetId]?.b.find(book => book.i === poem.bookId) || { i: poem.bookId, n: poem.bookTitle })}`);
  const poemMatches = (poem, query) => matchesNormalized(localPoemText(poem), query);
  const poetMatches = (person, query) => matches(`${person.n} ${poetDescription(person)} ${blurbs[person.i] || ''}`, query);
  const bookMatches = (item, query) => matches(`${item.book.n} ${item.poet.n} ${bookDescription(item.poet, item.book, item.list)}`, query);
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
    if (state.query.trim()) list = list.filter(poem => searchReady && searchMatches ? searchMatches.has(idOf(poem)) : poemMatches(poem, state.query));
    return list;
  };

  const openInfo = (title, copy) => {
    const modal = document.querySelector('#modal-backdrop .modal');
    if (!modal) return;
    modal.classList.remove('share-modal');
    modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="بستن">${icon('close')}</button><h2 id="modal-title"></h2><p id="modal-copy"></p>`;
    modal.querySelector('#modal-title').textContent = title;
    modal.querySelector('#modal-copy').textContent = copy;
    openModal();
  };
  const openNoteEditor = key => {
    const modal = document.querySelector('#modal-backdrop .modal');
    if (!modal) return;
    modal.classList.remove('share-modal');
    modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="بستن">${icon('close')}</button><h2>${lang === 'fa' ? 'یادداشت بیت' : 'Verse note'}</h2><p>${lang === 'fa' ? 'یادداشتت را برای این بیت نگه دار.' : 'Keep a note for this verse.'}</p><textarea id="note-editor" placeholder="${tr('writeNote')}">${escapeHTML(notes[key] || '')}</textarea><div class="modal-actions"><button class="button" data-save-couplet-note="${escapeHTML(key)}">${tr('save')}</button><button class="button secondary" data-close-modal>${tr('back')}</button></div>`;
    openModal();
    setTimeout(() => document.getElementById('note-editor')?.focus(), 0);
  };
  const openRegister = () => {
    const modal = document.querySelector('#modal-backdrop .modal');
    if (!modal) return;
    modal.classList.remove('share-modal');
    const savedName = account?.name || profile;
    const savedMobile = account?.mobile || account?.username || '';
    const isLogin = Boolean(savedMobile);
     modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="${tr('back')}">${icon('close')}</button><p class="eyebrow">${tr('account')}</p><h2>${isLogin ? tr('login') : tr('register')}</h2><p>${tr('serverNotice')}</p><label class="register-label" for="register-name">${tr('name')}</label><div class="input-with-clear register-field"><input class="field" id="register-name" value="${escapeHTML(savedName)}" placeholder="${tr('profilePlaceholder')}" maxlength="40" autocomplete="name"><button type="button" class="input-clear" data-clear-input="register-name" aria-label="پاک کردن">${icon('close')}</button></div><label class="register-label" for="register-mobile">${tr('mobile')}</label><div class="input-with-clear register-field"><input class="field" id="register-mobile" value="${escapeHTML(savedMobile)}" placeholder="${tr('mobilePlaceholder')}" maxlength="24" inputmode="tel" autocomplete="tel"><button type="button" class="input-clear" data-clear-input="register-mobile" aria-label="پاک کردن">${icon('close')}</button></div><label class="consent-line"><input type="checkbox" id="register-consent" ${account?.consentAt ? 'checked' : ''}><span>${tr('consent')}</span></label><div class="modal-actions"><button class="button" data-register-save>${isLogin ? tr('login') : tr('register')}</button><button class="button secondary" data-close-modal>${tr('back')}</button></div>`;
    openModal();
    setTimeout(() => document.getElementById('register-name')?.focus(), 0);
  };
  const openFeedback = () => {
    const modal = document.querySelector('#modal-backdrop .modal');
    if (!modal) return;
    modal.classList.remove('share-modal');
     modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="${tr('back')}">${icon('close')}</button><p class="eyebrow">${tr('feedback')}</p><h2>${tr('feedbackTitle')}</h2><label class="register-label" for="feedback-category">${tr('feedbackCategory')}</label><select class="field feedback-field" id="feedback-category"><option value="general">${tr('feedbackGeneral')}</option><option value="bug">${tr('feedbackBug')}</option><option value="suggestion">${tr('feedbackSuggestion')}</option></select><label class="register-label" for="feedback-message">${tr('feedback')}</label><div class="input-with-clear textarea-with-clear"><textarea id="feedback-message" placeholder="${tr('feedbackPlaceholder')}" maxlength="3000"></textarea><button type="button" class="input-clear" data-clear-input="feedback-message" aria-label="پاک کردن">${icon('close')}</button></div><div class="modal-actions"><button class="button" data-feedback-send>${tr('sendFeedback')}</button><button class="button secondary" data-close-modal>${tr('back')}</button></div>`;
    openModal();
    setTimeout(() => document.getElementById('feedback-message')?.focus(), 0);
  };
  const copyText = async text => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      return copied;
    } catch {
      return false;
    }
  };
  const shareText = async (title, text) => {
    try {
      if (navigator.share) await navigator.share({ title, text });
      else if (await copyText(text)) showToast(lang === 'fa' ? 'متن برای اشتراک آماده شد' : 'Ready to share');
      else showToast(tr('copyUnavailable'));
    } catch {
      // Sharing can be cancelled by the user.
    }
  };
  let shareDraft = null;
  const shareMetadata = poem => {
    const person = peopleById[poem.poetId];
    const book = person?.b.find(item => item.i === poem.bookId);
    return `${poetName(person || { i: poem.poetId, n: poem.poetName })} · ${bookName(book || { i: poem.bookId, n: poem.bookTitle })} · ${poemDisplayTitle(poem)}`;
  };
  const shareTextFor = (poem, selected) => `${shareMetadata(poem)}\n\n${selected.map(couple => couple.filter(Boolean).join('\n')).join('\n\n')}\n\n${lang === 'fa' ? 'جریان · آرشیو شعر فارسی' : 'Jaryan · Persian poetry archive'}`;
  const canvasWrap = (ctx, text, maxWidth) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = words.shift();
    words.forEach(word => {
      const next = `${line} ${word}`;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    lines.push(line);
    return lines;
  };
  const buildShareImage = async (poem, selected) => {
    const canvas = document.createElement('canvas');
    const width = 900;
    const padding = 62;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    ctx.font = `700 30px ${lang === 'fa' ? 'Ravi' : 'DM Sans'}`;
    const heading = lang === 'fa' ? 'اشتراک شعر' : 'Shared poem';
    const metadataLines = canvasWrap(ctx, shareMetadata(poem), width - padding * 2);
    ctx.font = `400 32px Ravi, serif`;
    const bodyLines = selected.flatMap(couple => [
      ...canvasWrap(ctx, couple[0] || '', width - padding * 2),
      ...(couple[1] ? canvasWrap(ctx, couple[1], width - padding * 2) : []),
      ''
    ]);
    const lineHeight = 58;
    const height = Math.max(420, 155 + (metadataLines.length + bodyLines.length) * lineHeight + 82);
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--solid').trim() || '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#20231f';
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.font = `700 30px ${lang === 'fa' ? 'Ravi' : 'DM Sans'}`;
    let y = 78;
    metadataLines.forEach(line => { ctx.fillText(line, width - padding, y); y += 42; });
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#dfe2dc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, y + 12);
    ctx.lineTo(width - padding, y + 12);
    ctx.stroke();
    y += 68;
    ctx.font = '400 32px Ravi, serif';
    bodyLines.forEach(line => {
      if (line) ctx.fillText(line, width - padding, y);
      y += lineHeight;
    });
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#747a73';
    ctx.font = '600 18px DM Sans, sans-serif';
    ctx.fillText(lang === 'fa' ? 'جریان · آرشیو شعر فارسی' : 'JARYAN · PERSIAN POETRY ARCHIVE', padding, height - 34);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'));
  };
  const renderShareModal = () => {
    const modal = document.querySelector('#modal-backdrop .modal');
    const poem = shareDraft?.poem;
    if (!modal || !poem) return;
    modal.classList.add('share-modal');
    const selected = shareDraft.selected;
    const selectedCount = selected.size;
    const coupletPicker = shareDraft.mode === 'selected'
      ? `<div class="share-couplet-picker"><p class="share-step-label">${tr('chooseVerses')}</p>${poem.couples.map((couple, index) => `<button type="button" class="share-couplet-option ${selected.has(index) ? 'selected' : ''}" data-share-couplet="${index}" aria-pressed="${selected.has(index)}"><span>${fa(index + 1)}</span><span>${escapeHTML(couple.filter(Boolean).join(' · '))}</span>${selected.has(index) ? icon('check') : ''}</button>`).join('')}</div>`
      : '';
    modal.innerHTML = `<button class="icon-button modal-close" data-close-modal aria-label="${tr('back')}">${icon('close')}</button><p class="eyebrow">${tr('shareTitle')}</p><h2>${escapeHTML(poemDisplayTitle(poem))}</h2><p>${tr('shareChoiceCopy')}</p><div class="share-choice-grid"><button type="button" class="share-choice ${shareDraft.mode === 'all' ? 'selected' : ''}" data-share-mode="all"><span>${icon('book')}</span><strong>${tr('shareWhole')}</strong><small>${tr('shareWholeCopy')}</small></button><button type="button" class="share-choice ${shareDraft.mode === 'selected' ? 'selected' : ''}" data-share-mode="selected"><span>${icon('check')}</span><strong>${tr('shareSelected')}</strong><small>${tr('shareSelectedCopy')}</small></button></div>${coupletPicker}<div class="share-format"><p class="share-step-label">${tr('shareFormat')}</p><div class="share-format-grid"><button type="button" class="share-format-option ${shareDraft.format === 'text' ? 'selected' : ''}" data-share-format="text"><strong>${tr('shareText')}</strong><small>TXT</small></button><button type="button" class="share-format-option ${shareDraft.format === 'image' ? 'selected' : ''}" data-share-format="image"><strong>${tr('shareImage')}</strong><small>PNG</small></button></div></div><div class="modal-actions"><button class="button" data-share-confirm ${shareDraft.mode === 'selected' && !selectedCount ? 'disabled' : ''}>${tr('shareConfirm')}</button><button class="button secondary" data-close-modal>${tr('back')}</button></div>`;
  };
  const openShareWizard = (poem, initialIndex = null) => {
    if (!poem?.couples?.length) return;
    shareDraft = { poem, mode: initialIndex == null ? 'all' : 'selected', format: 'text', selected: new Set(initialIndex == null ? [] : [initialIndex]) };
    renderShareModal();
    openModal();
  };
  const performShare = async () => {
    const draft = shareDraft;
    if (!draft?.poem) return;
    const selected = draft.mode === 'all' ? draft.poem.couples : draft.poem.couples.filter((_, index) => draft.selected.has(index));
    if (!selected.length) { showToast(tr('shareEmpty')); return; }
    const title = poemDisplayTitle(draft.poem);
    const text = shareTextFor(draft.poem, selected);
    let prepared = false;
    shareDraft = null;
    closeModal();
    try {
      if (draft.format === 'image') {
        const blob = await buildShareImage(draft.poem, selected);
        const file = new File([blob], `jaryan-${draft.poem.id}.png`, { type: 'image/png' });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          await navigator.share({ title, text: lang === 'fa' ? 'شعر فارسی در جریان' : 'Persian poetry on Jaryan', files: [file] });
          prepared = true;
        } else {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast(tr('shareFallback'));
          prepared = true;
        }
      } else if (navigator.share) { await navigator.share({ title, text }); prepared = true; }
      else if (await copyText(text)) { showToast(lang === 'fa' ? 'متن برای اشتراک آماده شد' : 'Text ready to share'); prepared = true; }
      else showToast(tr('copyUnavailable'));
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(lang === 'fa' ? 'اشتراک‌گذاری انجام نشد' : 'Sharing failed');
    }
    if (prepared) serverRequest('/shares', draft.mode === 'all'
      ? { poemId: idOf(draft.poem), wholePoem: true }
      : { poemId: idOf(draft.poem), coupletIndexes: [...draft.selected] }).catch(() => {});
  };
  const toggleSet = (set, key, storageKey) => {
    set.has(key) ? set.delete(key) : set.add(key);
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  };
  const markRead = poem => {
    state.active = poem;
    const id = idOf(poem);
    if (state.lastTrackedPoem !== id) {
      state.lastTrackedPoem = id;
      serverRequest('/views', { poemId: id }).catch(() => {});
    }
    if (readingHistory[readingHistory.length - 1]?.id === id) return;
    readingHistory = [...readingHistory.filter(item => item.id !== id), { id, at: Date.now() }].slice(-100);
    localStorage.setItem('jaryan-history', JSON.stringify(readingHistory));
    saveUserData();
  };
    const layout = () => {
      const label = accountLabel();
      const adminClass = isAdminAccount() ? ' admin-route' : '';
        app.innerHTML = `<header class="topbar"><a class="brand" data-route="home" href="#home"><span class="brand-mark">${icon('brand')}</span><span class="brand-name">${lang === 'fa' ? 'جریان' : 'Jaryan'}</span></a><nav class="nav"><button data-route="home">${tr('home')}</button><button data-route="poets">${tr('poets')}</button><button data-route="flow">${lang === 'fa' ? 'جریان' : 'Jaryan'}</button><button data-route="settings">${tr('settings')}</button><button data-route="archive">${tr('archive')}</button></nav><div class="top-actions"><button class="top-button" id="theme-toggle" aria-label="${tr('toggleTheme')}" title="${tr('toggleTheme')}">${icon(isDarkTheme() ? 'sun' : 'moon')}</button><button class="top-button settings-route" data-route="settings" aria-label="${tr('settings')}" title="${tr('settings')}">${icon('gear')}</button></div></header><main id="main"></main><footer class="footer"><span>${lang === 'fa' ? '© ۱۴۰۵ جریان؛ آرشیوی برای هر وقت که دلت شعر می‌خواهد' : '© 2026 Jaryan; an archive for every moment you want a poem'}</span><span class="footer-links"><span>${lang === 'fa' ? `نسخهٔ ${APP_VERSION_FA}` : `Version ${APP_VERSION}`}</span><button class="footer-feedback" data-feedback>${tr('feedback')}</button></span></footer><div class="modal-backdrop" id="modal-backdrop"><section class="modal glass" role="dialog" aria-modal="true" aria-label="${lang === 'fa' ? 'پنجره' : 'Dialog'}" tabindex="-1"><button class="icon-button modal-close" data-close-modal aria-label="${tr('back')}">${icon('close')}</button><h2 id="modal-title"></h2><p id="modal-copy"></p></section></div><div id="toast" role="status" aria-live="polite"></div>`;
      document.querySelector('.mobile-nav')?.remove();
        document.body.insertAdjacentHTML('beforeend', `<nav class="mobile-nav"><span class="nav-slider" aria-hidden="true"></span><button data-route="home">${icon('home')}<span>${tr('home')}</span></button><button data-route="flow">${icon('brand')}<span>${lang === 'fa' ? 'جریان' : 'Jaryan'}</span></button><button data-route="archive">${icon('search')}<span>${lang === 'fa' ? 'جست‌وجو' : 'Search'}</span></button><button class="account-route${adminClass}" data-route="account" aria-label="${label}" title="${label}">${icon('user')}<span>${label}</span></button></nav>`);
    };

      const portraits = [
        '<path d="M21 104c4-27 19-43 43-43s39 16 43 43M39 45c0-20 10-32 25-32s25 12 25 32-10 31-25 31-25-11-25-31Z"/><path d="M40 30c12-16 34-18 49-2M44 50c6 4 12 4 18 0M68 50c6 4 12 4 18 0M57 56c2 4 2 7 0 10M51 66c9 11 19 11 28 0M50 85c8 8 21 8 29 0M58 103V79M70 103V79M48 91l-9 13M80 91l9 13M31 23l-9 13M97 23l9 13"/>',
        '<path d="M19 104c6-28 21-43 45-43s39 15 45 43M39 44c1-21 10-32 26-32s25 11 25 32c-1 20-10 31-25 31S40 64 39 44Z"/><path d="M40 30c14 5 32 5 48-2M48 53h8M70 53h8M57 59c2 3 2 6 0 9M57 68c6 4 12 4 18 0M49 79c9 10 23 10 32 0M48 91c9 6 23 6 32 0M45 101l11-15M83 101 72 86"/>',
        '<path d="M20 104c5-28 20-43 44-43s39 15 44 43M40 44c0-20 9-32 24-32s24 12 24 32-9 31-24 31-24-11-24-31Z"/><path d="M42 29c14-10 31-9 44 2M49 54h7M72 54h7M59 59c2 3 2 6 0 9M56 68c5 5 11 5 17 0M50 82c9 7 21 7 30 0M43 99l13-16M85 99 72 83M90 26l12-11M99 35l13-2M31 28l-10-8"/>'
      ];
      const poetCard = (person, index) => { const name = poetName(person); const nameClass = name.length > 8 ? ' poet-name-long' : ''; return `<article class="poet-card glass" data-poet="${escapeHTML(person.i)}"><div class="poet-card-actions"><button class="icon-button" data-random="poet" data-random-poet="${escapeHTML(person.i)}" aria-label="${tr('randomPoem')}" title="${tr('randomPoem')}">${icon('fortune')}</button></div><h3 class="poet-name${nameClass}">${escapeHTML(name)}</h3><p>${escapeHTML((lang === 'fa' ? blurbs[person.i] : blurbsEn[person.i]) || '')}</p><span class="poet-count">${fa(person.b.length)} ${lang === 'fa' ? 'کتاب' : 'books'}</span><svg class="poet-sketch" viewBox="0 0 128 128" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${portraits[index % portraits.length]}</svg></article>`; };
   const homeView = () => {
     const visiblePeople = state.homePeopleExpanded ? people : people.slice(0, 10);
              return `<section class="landing"><div class="hero"><h1 class="hero-title">${tr('heroLead')}</h1><div class="hero-actions"><button class="button shine-button" data-random="all">${icon('fortune')}${tr('randomPoem')}</button><button class="button secondary search-action" data-route="archive">${icon('search')}${lang === 'fa' ? 'جست‌وجو' : 'Search'}</button></div><div class="metrics metrics-compact" data-counter-group><div class="metric"><strong data-count="${catalogue.length}">${lang === 'fa' ? '۰' : '0'}</strong><span>${lang === 'fa' ? 'مجموعه' : tr('collections')}</span></div><div class="metric"><strong data-count="${people.length}">${lang === 'fa' ? '۰' : '0'}</strong><span>${lang === 'fa' ? 'شاعر' : tr('poetsCount')}</span></div></div></div><div class="section-wrap poets-section"><div class="section-divider" aria-hidden="true"></div><div class="section-head"><div><h2>${tr('poets')}</h2></div></div><div class="poet-grid">${visiblePeople.map(poetCard).join('')}</div>${people.length > visiblePeople.length || state.homePeopleExpanded ? `<button class="more-button poet-more-button" data-more-poets>${state.homePeopleExpanded ? tr('lessPoets') : tr('morePoets')}</button>` : ''}</div></section>`;
    };
   const poetView = () => {
     const person = peopleById[state.poetId];
     if (!person) return homeView();
     const books = person.b.map((book, index) => {
       const list = poemsByBook[`${person.i}/${book.i}`] || [];
         return `<article class="collection-card glass" data-book="${escapeHTML(person.i + '/' + book.i)}"><button class="icon-button collection-info" data-book-info="${escapeHTML(person.i + '/' + book.i)}" aria-label="${tr('bookInfo')}">${icon('info')}</button><div class="collection-card-top"><span class="collection-type">${tr('bookType')}</span></div><h3>${escapeHTML(bookName(book))}</h3><span class="book-count">${fa(list.length)} ${lang === 'fa' ? 'شعر' : 'poems'}</span></article>`;
     }).join('');
      return `<section class="page"><div class="page-hero"><button class="back-link" data-back>${tr('backArrow')} ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-route="archive">${tr('archive')}</button></div><h1>${escapeHTML(poetName(person))}</h1><div class="page-actions"><button class="button secondary poet-save-button" data-poet-fav="${escapeHTML(person.i)}">${icon('bookmark')}${poetFavorites.has(person.i) ? tr('saved') : tr('save')}</button><button class="button secondary" data-poet-info="${escapeHTML(person.i)}">${icon('info')}${tr('info')}</button><button class="button" data-random="poet">${icon('dice')}${tr('randomPoem')}</button></div></div><div class="context-card glass poet-about"><strong>${tr('info')}</strong><br>${escapeHTML(poetDescription(person))}</div><div class="section-head"><div><h2>${tr('books')}</h2><p>${fa(person.b.length)} ${lang === 'fa' ? 'مجموعه برای خواندن' : 'collections to read'}</p></div></div><div class="book-grid collection-grid">${books}</div></section>`;
  };
  const bookContext = (person, book, list) => bookDescription(person, book, list);
  const bookView = () => {
    const person = peopleById[state.poetId];
    const book = person?.b.find(item => item.i === state.bookId);
    const list = poemsByBook[`${state.poetId}/${state.bookId}`] || [];
    if (!person || !book) return homeView();
    const shown = list.slice(0, state.limit);
     const bookKey = `${person.i}/${book.i}`;
       return `<section class="page book-page"><div class="page-hero"><button class="back-link" data-back>${tr('backArrow')} ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-poet="${escapeHTML(person.i)}">${escapeHTML(poetName(person))}</button><span>/</span><span>${escapeHTML(bookName(book))}</span></div><h1>${escapeHTML(bookName(book))}</h1><div class="page-actions"><button class="button secondary book-save-button" data-book-fav="${escapeHTML(bookKey)}">${icon('bookmark')}${bookFavorites.has(bookKey) ? tr('saved') : tr('save')}</button><button class="button secondary" data-book-info="${escapeHTML(bookKey)}">${icon('info')}${tr('bookInfo')}</button><button class="button" data-random="book">${icon('dice')}${tr('random')}</button></div></div><div class="context-card glass book-about"><strong>${tr('bookInfo')}</strong><br>${escapeHTML(bookContext(person, book, list))}</div><div class="section-head"><div><h2>${tr('sections')}</h2><p>${fa(list.length)} ${lang === 'fa' ? 'شعر' : 'poems'}</p></div></div><div class="section-list">${shown.map((poem, index) => `<article class="section-card glass" data-poem="${escapeHTML(idOf(poem))}"><span class="section-no">${fa(index + 1)}</span><h3>${escapeHTML(poemDisplayTitle(poem))}</h3><span class="go">${tr('nextArrow')}</span></article>`).join('')}</div>${list.length > state.limit ? `<button class="more-button" data-more-sections>${tr('more')}</button>` : ''}</section>`;
  };
   const poetQuick = person => `<article class="quick-card glass" data-poet="${escapeHTML(person.i)}">${icon('user')}<div><strong>${escapeHTML(poetName(person))}</strong><small>${escapeHTML(lang === 'fa' ? blurbs[person.i] || '' : blurbsEn[person.i] || '')}</small></div><span>${tr('nextArrow')}</span></article>`;
   const bookQuick = item => `<article class="quick-card glass" data-book="${escapeHTML(item.poet.i + '/' + item.book.i)}">${icon('book')}<div><strong>${escapeHTML(bookName(item.book))}</strong><small>${escapeHTML(poetName(item.poet))} · ${fa(item.list.length)} ${lang === 'fa' ? 'شعر' : 'poems'}</small></div><span>${tr('nextArrow')}</span></article>`;
    const resultCard = poem => { const person = peopleById[poem.poetId]; const book = person?.b.find(item => item.i === poem.bookId); return `<article class="result-card glass" data-poem="${escapeHTML(idOf(poem))}"><div><div class="result-meta"><span>${escapeHTML(poetName(person || { i: poem.poetId, n: poem.poetName }))}</span><i></i><span>${escapeHTML(bookName(book || { i: poem.bookId, n: poem.bookTitle }))}</span></div><h3>${escapeHTML(poemDisplayTitle(poem))}</h3><div class="result-book">${fa(poem.coupletCount)} ${lang === 'fa' ? 'بیت' : 'couplets'}</div></div><button class="save-btn ${favorites.has(idOf(poem)) ? 'saved' : ''}" data-fav="${escapeHTML(idOf(poem))}" aria-label="${tr('save')}">${icon('bookmark')}</button><p class="result-excerpt">${escapeHTML(poem.couples.slice(0, 2).map(couple => couple.join(' · ')).join(' ') || (lang === 'fa' ? 'برای خواندن انتخاب کن' : 'Open to read'))}</p></article>`; };
  const searchResultCard = (poem, query) => {
    const hits = poem.couples.filter(couple => matches(couple.filter(Boolean).join(' '), query)).slice(0, 6);
    if (!hits.length) return '';
     const person = peopleById[poem.poetId];
     const book = person?.b.find(item => item.i === poem.bookId);
     return `<article class="search-result glass" data-poem="${escapeHTML(idOf(poem))}">${hits.map(couple => `<div class="search-hit"><div class="search-hit-couplet"><span>${highlightText(couple[0] || '', query)}</span>${couple[1] ? `<span>${highlightText(couple[1], query)}</span>` : ''}</div><div class="search-hit-address">${escapeHTML(poetName(person || { i: poem.poetId, n: poem.poetName }))} · ${escapeHTML(bookName(book || { i: poem.bookId, n: poem.bookTitle }))} · ${escapeHTML(poemDisplayTitle(poem))}</div></div>`).join('')}</article>`;
  };
  const prepareSearchResults = async () => {
    const targets = filteredPoems().slice(0, state.limit);
    const shards = new Map();
    targets.forEach(poem => shards.set(`${poem.poetId}/${poem.bookId}/${poem.chunk ?? 'full'}`, poem));
    const queue = [...shards.values()];
    for (let index = 0; index < queue.length; index += 2) {
      await Promise.all(queue.slice(index, index + 2).map(poem => loadBook(poem.poetId, poem.bookId, poem.chunk)));
    }
  };
  const archiveResults = () => {
    const query = normalize(state.query);
     if (!query) return `<div id="archive-results"><div class="empty search-empty-state" role="status" aria-live="polite"><span class="search-empty-glyph">${icon('search')}</span><p>${tr('searchPrompt')}</p></div></div>`;
    if (!state.searchCommitted) return `<div id="archive-results"><div class="empty search-pending" role="status" aria-live="polite">${tr('searching')}</div></div>`;
    if (state.searchError) return `<div id="archive-results"><div class="empty">${tr('searchError')}</div></div>`;
    const list = filteredPoems();
    const shown = list.slice(0, state.limit).map(poem => searchResultCard(poem, query)).join('');
    const empty = !shown ? `<div class="empty">${tr('empty')}</div>` : '';
    return `<div id="archive-results"><div class="result-summary">${fa(list.length)} ${lang === 'fa' ? 'بیت و شعر منطبق' : 'matching poems'}</div><div class="search-result-list">${shown}</div>${empty}${list.length > state.limit ? `<button class="more-button" data-more-archive>${tr('more')}</button>` : ''}</div>`;
  };
  const archiveView = () => {
    const bookOptions = state.poet === 'همه' ? [] : catalogue.filter(item => item.poet.n === state.poet);
       return `<section class="page search-page"><div class="page-hero"><h1>${lang === 'fa' ? 'جست‌وجوی شعرها' : 'Search poems'}</h1><p>${lang === 'fa' ? 'یک واژه یا عبارت را بنویس تا فقط بیت‌های منطبق را ببینی.' : 'Type a word or phrase to see matching couplets.'}</p></div><label class="archive-search">${icon('search')}<input id="archive-search" value="${escapeHTML(state.query)}" placeholder="${tr('search')}" autocomplete="off" enterkeyhint="search"><button type="button" class="input-clear" data-clear-input="archive-search" aria-label="${tr('clear')}">${icon('close')}</button></label><div class="archive-controls search-filters"><select class="select" id="archive-poet" aria-label="${tr('choosePoet')}"><option value="همه">${tr('choosePoet')}</option>${people.map(person => `<option value="${escapeHTML(person.n)}" ${state.poet === person.n ? 'selected' : ''}>${escapeHTML(poetName(person))}</option>`).join('')}</select><select class="select" id="archive-book" aria-label="${tr('chooseBook')}" ${state.poet === 'همه' ? 'disabled' : ''}><option value="همه">${tr('chooseBook')}</option>${bookOptions.map(item => `<option value="${escapeHTML(item.poet.i + '/' + item.book.i)}" ${state.book === item.poet.i + '/' + item.book.i ? 'selected' : ''}>${escapeHTML(bookName(item.book))} · ${escapeHTML(poetName(item.poet))}</option>`).join('')}</select></div>${archiveResults()}</section>`;
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
   const legacyPoemViewNext = () => {
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
     const title = poemDisplayTitle(poem);
     const metadata = `${poetName(person || { i: poem.poetId, n: poem.poetName })} · ${bookName(book)}`;
     const copyButton = `<button class="button secondary copy-button" data-copy><span class="copy-icon copy-icon-default">${icon('copy')}</span><span class="copy-icon copy-icon-success">${icon('check')}</span><span class="copy-label">${tr('copy')}</span></button>`;
     const couplets = poem.couples.map((couple, index) => {
       const key = `${idOf(poem)}/${index}`;
       const note = notes[key] || '';
       const saved = coupletFavorites.has(key);
       return `<article class="couplet"><span class="couplet-no">${fa(index + 1)}</span><div class="couplet-text"><p>${escapeHTML(couple[0] || '')}</p>${couple[1] ? `<p>${escapeHTML(couple[1])}</p>` : ''}${note ? `<p class="verse-note">${escapeHTML(note)}</p>` : ''}</div><div class="couplet-actions"><button class="couplet-note" data-couplet-note="${escapeHTML(key)}" aria-label="${tr('note')}" title="${tr('note')}">${icon('plus')}</button><button class="couplet-share" data-couplet-share="${escapeHTML(key)}" aria-label="${tr('share')}" title="${tr('share')}">${icon('share')}</button></div><button class="couplet-heart ${saved ? 'saved' : ''}" data-couplet-fav="${escapeHTML(key)}" aria-label="${lang === 'fa' ? 'پسندیدن' : 'Like'}" title="${lang === 'fa' ? 'پسندیدن' : 'Like'}">${icon('heart')}</button></article>`;
     }).join('');
     const fab = `<div class="poem-fab" role="group" aria-label="${lang === 'fa' ? 'ابزارهای شعر' : 'Poem tools'}"><div class="poem-fab-menu" id="poem-fab-surface" role="menu"><button data-share="poem" role="menuitem" style="--fab-index:0" aria-label="${tr('share')}">${icon('share')}<span>${tr('share')}</span></button><button data-copy role="menuitem" style="--fab-index:1" aria-label="${tr('copy')}">${icon('copy')}<span>${tr('copy')}</span></button><button data-focus-mode role="menuitem" style="--fab-index:2" aria-label="${lang === 'fa' ? 'حالت تمرکز' : 'Focus mode'}">${icon('focus')}<span>${lang === 'fa' ? 'حالت تمرکز' : 'Focus mode'}</span></button><div class="poem-size-control" role="group" style="--fab-index:3" aria-label="${tr('size')}"><button data-poem-size="up" aria-label="${tr('larger')}">${icon('plus')}</button><span>${tr('size')}</span><button data-poem-size="down" aria-label="${tr('large')}">${icon('minus')}</button></div></div><button class="poem-fab-toggle" data-poem-fab aria-expanded="false" aria-controls="poem-fab-surface" aria-label="${lang === 'fa' ? 'بازکردن ابزارهای شعر' : 'Open poem tools'}">${icon('plus')}</button></div>`;
     return `<section class="poem-shell"><div class="poem-topline"><button class="back-link" data-back>${tr('backArrow')} ${tr('back')}</button><div class="breadcrumbs"><button data-route="home">${tr('home')}</button><span>/</span><button data-poet="${escapeHTML(poem.poetId)}">${escapeHTML(poetName(person || { i: poem.poetId, n: poem.poetName }))}</button><span>/</span><span>${escapeHTML(bookName(book))}</span></div></div><div class="poem-heading"><p class="kicker">${escapeHTML(metadata)}</p><h1>${escapeHTML(title)}</h1><p>${fa(poem.couples.length)} ${lang === 'fa' ? 'بیت' : 'couplets'}</p><div class="poem-tools"><button class="button secondary" data-fav="${escapeHTML(idOf(poem))}">${icon('bookmark')}${favorites.has(idOf(poem)) ? tr('saved') : tr('save')}</button><button class="button secondary" data-share="poem">${icon('share')}${tr('share')}</button>${copyButton}<button class="button secondary focus-button" data-focus-mode>${icon('focus')}<span>${lang === 'fa' ? 'حالت تمرکز' : 'Focus mode'}</span></button></div></div><div class="context-card glass"><strong>${tr('poemInfo')}</strong><br>${escapeHTML(bookContext(person, book, list))}</div><div class="poem-copy">${couplets}</div><div class="poem-nav">${previous ? `<button data-poem="${escapeHTML(idOf(previous))}">${tr('backArrow')} ${escapeHTML(poemDisplayTitle(previous))}</button>` : '<span></span>'}${next ? `<button data-poem="${escapeHTML(idOf(next))}">${escapeHTML(poemDisplayTitle(next))} ${tr('nextArrow')}</button>` : '<span></span>'}</div>${fab}</section>`;
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
       ? savedPoems.map(poem => `<article class="history-item glass" data-poem="${escapeHTML(idOf(poem))}"><span><h3>${escapeHTML(poemDisplayTitle(poem))}</h3><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</small></span><span>${tr('nextArrow')}</span></article>`).join('')
      : tab === 'poets'
         ? savedPoets.map(person => `<article class="favorite-poet glass" data-poet="${escapeHTML(person.i)}"><span><h3>${escapeHTML(poetName(person))}</h3><small>${escapeHTML(lang === 'fa' ? blurbs[person.i] || '' : blurbsEn[person.i] || '')}</small></span><span>${tr('nextArrow')}</span></article>`).join('')
         : savedCouplets.map(item => `<article class="favorite-couplet glass" data-poem="${escapeHTML(idOf(item.poem))}"><span><h3>${escapeHTML(item.text.slice(0, 75))}</h3><small>${escapeHTML(poetName(peopleById[item.poem.poetId] || { i: item.poem.poetId, n: item.poem.poetName }))} · ${escapeHTML(poemDisplayTitle(item.poem))}</small></span><span>♥</span></article>`).join('');
     return `<section class="page"><div class="page-hero"><p class="eyebrow">${tr('account')}</p><h1>${escapeHTML(profile || tr('account'))}</h1></div><div class="profile-field"><input class="field" id="profile-input" value="${escapeHTML(profile)}" placeholder="${tr('profilePlaceholder')}" aria-label="${tr('profile')}"><button class="button" data-save-profile>${tr('save')}</button></div><div class="account-grid"><div class="stat-card glass"><strong>${fa(todayCount)}</strong><span>${tr('today')}</span></div><div class="stat-card glass"><strong>${fa(monthCount)}</strong><span>${tr('month')}</span></div><div class="stat-card glass"><strong>${fa(readingHistory.length)}</strong><span>${tr('total')}</span></div></div><div class="tabs"><button class="tab ${tab === 'poems' ? 'active' : ''}" data-favorite-tab="poems">${tr('saved')} · ${fa(favorites.size)}</button><button class="tab ${tab === 'poets' ? 'active' : ''}" data-favorite-tab="poets">${tr('poets')} · ${fa(poetFavorites.size)}</button><button class="tab ${tab === 'couplets' ? 'active' : ''}" data-favorite-tab="couplets">${lang === 'fa' ? 'بیت‌ها' : 'Verses'} · ${fa(coupletFavorites.size)}</button></div><div class="history-list account-items">${items || `<div class="empty">${tr('empty')}</div>`}</div><div class="section-head account-history-heading"><div><h2>${tr('history')}</h2><p>${fa(recent.length)} ${lang === 'fa' ? 'آخرین خوانش' : 'recent reads'}</p></div><button class="button secondary" data-clear-history>${lang === 'fa' ? 'پاک کردن' : 'Clear'}</button></div><div class="history-list">${recent.map(item => { const poem = poems.find(candidate => idOf(candidate) === item.id); return poem ? `<article class="history-item glass" data-poem="${escapeHTML(item.id)}"><span><h3>${escapeHTML(poem.title)}</h3><small>${escapeHTML(poem.poetName)} · ${new Date(item.at).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US')}</small></span><span>←</span></article>` : ''; }).join('') || `<div class="empty">${tr('empty')}</div>`}</div></section>`;
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
  const formatDate = value => value ? new Date(value).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const readingChart = () => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const count = readingHistory.filter(item => {
        const readAt = new Date(item.at);
        return readAt.getFullYear() === date.getFullYear() && readAt.getMonth() === date.getMonth() && readAt.getDate() === date.getDate();
      }).length;
      return { label: date.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US', { weekday: 'short' }), count };
    });
    const max = Math.max(1, ...days.map(day => day.count));
    const left = 18;
    const right = 702;
    const baseline = 112;
    const points = days.map((day, index) => ({
      x: left + (index * (right - left) / (days.length - 1)),
      y: baseline - Math.round((day.count / max) * 78)
    }));
    const pointString = points.map(point => `${point.x},${point.y}`).join(' ');
    const areaPath = `M ${left} ${baseline} L ${pointString.replaceAll(' ', ' L ')} L ${right} ${baseline} Z`;
    const gridLines = [34, 73, baseline].map(y => `<line class="reading-line-grid" x1="${left}" x2="${right}" y1="${y}" y2="${y}"/>`).join('');
    const pointLabels = points.map((point, index) => `<g class="reading-line-point"><circle cx="${point.x}" cy="${point.y}" r="3.5"/><text x="${point.x}" y="${Math.max(16, point.y - 11)}" text-anchor="middle">${fa(days[index].count)}</text><text class="reading-line-day" x="${point.x}" y="137" text-anchor="middle">${escapeHTML(days[index].label)}</text></g>`).join('');
    return `<div class="reading-line-chart" role="img" aria-label="${tr('readingChart')}" dir="ltr"><svg viewBox="0 0 720 150" preserveAspectRatio="none"><title>${escapeHTML(tr('readingChart'))}</title><path class="reading-line-area" d="${areaPath}"/><g aria-hidden="true">${gridLines}</g><polyline class="reading-line-path" points="${pointString}"/>${pointLabels}</svg></div>`;
  };
   const legacyAccountLibraryView = () => {
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
       ? savedPoems.map(poem => `<article class="history-item glass" data-poem="${escapeHTML(idOf(poem))}"><span><h3>${escapeHTML(poemDisplayTitle(poem))}</h3><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</small></span><span>${tr('nextArrow')}</span></article>`).join('')
      : tab === 'poets'
         ? savedPoets.map(person => `<article class="favorite-poet glass" data-poet="${escapeHTML(person.i)}"><span><h3>${escapeHTML(poetName(person))}</h3><small>${escapeHTML(lang === 'fa' ? blurbs[person.i] || '' : blurbsEn[person.i] || '')}</small></span><span>${tr('nextArrow')}</span></article>`).join('')
         : savedCouplets.map(item => `<article class="favorite-couplet glass" data-poem="${escapeHTML(idOf(item.poem))}"><span><h3>${escapeHTML(item.text.slice(0, 75))}</h3><small>${escapeHTML(poetName(peopleById[item.poem.poetId] || { i: item.poem.poetId, n: item.poem.poetName }))} · ${escapeHTML(poemDisplayTitle(item.poem))}</small></span><span>♥</span></article>`).join('');
    return `<div class="account-stats-grid"><div class="stat-card glass"><strong>${fa(todayCount)}</strong><span>${tr('today')}</span></div><div class="stat-card glass"><strong>${fa(monthCount)}</strong><span>${tr('month')}</span></div><div class="stat-card glass"><strong>${fa(readingHistory.length)}</strong><span>${tr('total')}</span></div></div><section class="reading-card glass"><div class="section-head"><div><p class="eyebrow">${tr('readingChart')}</p><h2>${tr('lastSevenDays')}</h2></div></div>${readingChart()}</section><section class="saved-section"><div class="section-head"><div><p class="eyebrow">${tr('saved')}</p><h2>${tr('saved')}</h2></div></div><div class="tabs"><button class="tab ${tab === 'poems' ? 'active' : ''}" data-favorite-tab="poems">${tr('saved')} · ${fa(favorites.size)}</button><button class="tab ${tab === 'poets' ? 'active' : ''}" data-favorite-tab="poets">${tr('poets')} · ${fa(poetFavorites.size)}</button><button class="tab ${tab === 'couplets' ? 'active' : ''}" data-favorite-tab="couplets">${lang === 'fa' ? 'بیت‌ها' : 'Verses'} · ${fa(coupletFavorites.size)}</button></div><div class="history-list account-items">${items || `<div class="empty">${tr('empty')}</div>`}</div></section><section class="history-section"><div class="section-head account-history-heading"><div><p class="eyebrow">${tr('history')}</p><h2>${tr('history')}</h2><p>${fa(recent.length)} ${lang === 'fa' ? 'آخرین خوانش' : 'recent reads'}</p></div><button class="button secondary" data-clear-history>${lang === 'fa' ? 'پاک کردن' : 'Clear'}</button></div><div class="history-list">${recent.map(item => { const poem = poems.find(candidate => idOf(candidate) === item.id); return poem ? `<article class="history-item glass" data-poem="${escapeHTML(item.id)}"><span><h3>${escapeHTML(poem.title)}</h3><small>${escapeHTML(poem.poetName)} · ${formatDate(item.at)}</small></span><span>←</span></article>` : ''; }).join('') || `<div class="empty">${tr('empty')}</div>`}</div></section>`;
  };
   const accountLibraryView = () => {
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
       ? savedPoems.map(poem => `<article class="history-item glass" data-poem="${escapeHTML(idOf(poem))}"><span><h3>${escapeHTML(poemDisplayTitle(poem))}</h3><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</small></span><span>${tr('nextArrow')}</span></article>`).join('')
       : tab === 'poets'
         ? savedPoets.map(person => `<article class="favorite-poet glass" data-poet="${escapeHTML(person.i)}"><span><h3>${escapeHTML(poetName(person))}</h3><small>${escapeHTML(lang === 'fa' ? blurbs[person.i] || '' : blurbsEn[person.i] || '')}</small></span><span>${tr('nextArrow')}</span></article>`).join('')
         : savedCouplets.map(item => `<article class="favorite-couplet glass" data-poem="${escapeHTML(idOf(item.poem))}"><span><h3>${escapeHTML(item.text.slice(0, 75))}</h3><small>${escapeHTML(poetName(peopleById[item.poem.poetId] || { i: item.poem.poetId, n: item.poem.poetName }))} · ${escapeHTML(poemDisplayTitle(item.poem))}</small></span><span>♥</span></article>`).join('');
     const history = recent.map(item => {
       const poem = poems.find(candidate => idOf(candidate) === item.id);
       if (!poem) return '';
       return `<article class="history-item glass" data-poem="${escapeHTML(item.id)}"><span><h3>${escapeHTML(poemDisplayTitle(poem))}</h3><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))} · ${formatDate(item.at)}</small></span><span>${tr('nextArrow')}</span></article>`;
     }).join('');
     return `<div class="account-stats-grid"><div class="stat-card glass"><strong>${fa(todayCount)}</strong><span>${tr('today')}</span></div><div class="stat-card glass"><strong>${fa(monthCount)}</strong><span>${tr('month')}</span></div><div class="stat-card glass"><strong>${fa(readingHistory.length)}</strong><span>${tr('total')}</span></div></div><section class="reading-card glass"><div class="section-head"><div><p class="eyebrow">${tr('readingChart')}</p><h2>${tr('lastSevenDays')}</h2></div></div>${readingChart()}</section><section class="saved-section"><div class="section-head"><div><p class="eyebrow">${tr('saved')}</p><h2>${tr('saved')}</h2></div></div><div class="tabs"><button class="tab ${tab === 'poems' ? 'active' : ''}" data-favorite-tab="poems">${tr('saved')} · ${fa(favorites.size)}</button><button class="tab ${tab === 'poets' ? 'active' : ''}" data-favorite-tab="poets">${tr('poets')} · ${fa(poetFavorites.size)}</button><button class="tab ${tab === 'couplets' ? 'active' : ''}" data-favorite-tab="couplets">${lang === 'fa' ? 'بیت‌ها' : 'Verses'} · ${fa(coupletFavorites.size)}</button></div><div class="history-list account-items">${items || `<div class="empty">${tr('empty')}</div>`}</div></section><section class="history-section"><div class="section-head account-history-heading"><div><p class="eyebrow">${tr('history')}</p><h2>${tr('history')}</h2><p>${fa(recent.length)} ${lang === 'fa' ? 'آخرین خوانش' : 'recent reads'}</p></div><button class="button secondary" data-clear-history>${lang === 'fa' ? 'پاک کردن' : 'Clear'}</button></div><div class="history-list">${history || `<div class="empty">${tr('empty')}</div>`}</div></section>`;
   };

   const authView = () => {
    const isRegister = state.authMode === 'register';
    const remembered = readJSON('jaryan-remembered-login', {});
    const rememberedUsername = remembered?.username || '';
    return `<section class="page account-page auth-page"><div class="page-hero"><p class="eyebrow">${tr('account')}</p><h1>${isRegister ? tr('register') : tr('login')}</h1><p>${tr('authIntro')}</p></div><section class="auth-card glass"><div class="auth-tabs" role="tablist"><button class="auth-tab ${!isRegister ? 'active' : ''}" data-auth-mode="login" role="tab" aria-selected="${!isRegister}">${tr('login')}</button><button class="auth-tab ${isRegister ? 'active' : ''}" data-auth-mode="register" role="tab" aria-selected="${isRegister}">${tr('register')}</button></div><div class="auth-form"><label class="register-label" for="auth-username">${tr('username')}</label><input class="field" id="auth-username" value="${escapeHTML(isRegister ? '' : rememberedUsername)}" minlength="3" maxlength="60" autocomplete="username" placeholder="${tr('usernamePlaceholder')}"><label class="register-label" for="auth-password">${tr('password')}</label><input class="field" id="auth-password" type="password" minlength="5" maxlength="120" autocomplete="${isRegister ? 'new-password' : 'current-password'}" placeholder="${tr('passwordPlaceholder')}"><label class="remember-line"><input type="checkbox" id="auth-remember" ${rememberedUsername && !isRegister ? 'checked' : ''}><span>${tr('rememberLogin')}</span></label><button class="button auth-submit" data-auth-submit>${isRegister ? tr('authSubmitRegister') : tr('authSubmitLogin')}</button></div><div class="sms-login" aria-disabled="true"><div class="sms-login-head"><strong>${tr('mobileLogin')}</strong><span>${tr('mobileSoon')}</span></div><div class="sms-login-row"><input class="field" type="tel" disabled placeholder="${tr('mobilePlaceholder')}"><button class="button secondary" disabled>${tr('sendCode')}</button></div><p>${tr('smsNotice')}</p></div></section></section>`;
   };
   const accountOfflineV65 = () => {
     const item = poem => `<article class="offline-item glass" data-poem="${escapeHTML(idOf(poem))}"><span><strong>${escapeHTML(poemDisplayTitle(poem))}</strong><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</small></span><button type="button" class="button secondary" data-offline-poem="${escapeHTML(idOf(poem))}">${offlinePoems.has(idOf(poem)) ? tr('offlineRemove') : tr('offlineAdd')}</button></article>`;
     const saved = [...offlinePoems].map(id => poems.find(poem => idOf(poem) === id)).filter(Boolean);
     const candidates = [...new Set([...favorites, ...readingHistory.map(entry => entry.id)])]
       .filter(id => !offlinePoems.has(id)).map(id => poems.find(poem => idOf(poem) === id)).filter(Boolean).slice(0, 12);
     return `<section class="account-section-v6"><div class="section-head"><div class="account-section-heading"><h2><span class="section-icon update-icon">${icon('download')}</span><span>${tr('offlinePoems')}</span></h2><p>${fa(saved.length)} ${lang === 'fa' ? 'شعر ذخیره‌شده روی این دستگاه' : 'poems saved on this device'}</p></div>${saved.length ? `<button type="button" class="button secondary" data-offline-clear>${lang === 'fa' ? 'پاک‌کردن فهرست' : 'Clear list'}</button>` : ''}</div><div class="offline-list">${saved.map(item).join('') || `<p class="empty offline-empty">${tr('offlineEmpty')}</p>`}</div>${candidates.length ? `<div class="offline-candidates"><p>${lang === 'fa' ? 'برای استفادهٔ آفلاین ذخیره کن:' : 'Save for offline reading:'}</p>${candidates.map(item).join('')}</div>` : ''}</section>`;
   };
   const adminServerView = () => {
     const data = state.adminData;
     const head = `<header class="admin-workspace-head"><div><div class="admin-title-row"><span class="admin-live-dot"></span><p class="eyebrow">${tr('admin')}</p><span class="admin-badge">SERVER</span></div><h1>${lang === 'fa' ? 'مدیریت جریان' : 'Jaryan administration'}</h1><p>${tr('adminLocalOnly')}</p></div><div class="admin-head-actions"><button type="button" class="button secondary" data-admin-refresh>${tr('adminRefresh')}</button><button type="button" class="button secondary" data-logout>${tr('accountLogout')}</button><button type="button" class="button" data-admin-export>${tr('adminExport')}</button></div></header>`;
     if (!data) return `<section class="page admin-page"><div class="admin-workspace">${head}<div class="empty">${escapeHTML(state.adminError || tr('adminLoading'))}</div></div></section>`;
     const memberCards = data.members.map(member => {
       const devices = member.devices.map(device => {
         const detail = device.details || {};
         const specs = [detail.platform, detail.language, detail.timezone, detail.screenWidth && detail.screenHeight ? `${detail.screenWidth}×${detail.screenHeight}` : ''].filter(Boolean).join(' · ');
         return `<li><strong>${tr('adminIp')}:</strong> <code dir="ltr">${escapeHTML(device.ip || '—')}</code> · <strong>${tr('adminCountry')}:</strong> ${escapeHTML(device.country || '—')}<br><small>${escapeHTML(formatDate(device.lastSeenAt))} · ${escapeHTML(specs)}<br>${escapeHTML(device.userAgent || '')}</small></li>`;
       }).join('');
       return `<article class="admin-user-card glass" data-server-member="${escapeHTML(member.id)}"><header class="admin-user-card-head"><div class="admin-user-identity"><span class="admin-avatar">${escapeHTML(Array.from(member.displayName || member.username)[0] || '?')}</span><div><strong>${escapeHTML(member.displayName)}</strong><small dir="ltr">@${escapeHTML(member.username)}</small></div></div></header><div class="admin-user-meta"><span>${lang === 'fa' ? 'ثبت‌نام' : 'Joined'} · ${formatDate(member.createdAt)}</span><span>${lang === 'fa' ? 'آخرین حضور' : 'Last seen'} · ${formatDate(member.lastSeenAt)}</span></div><div class="admin-user-fields"><label>${tr('displayName')}<input class="field" data-server-field="displayName" value="${escapeHTML(member.displayName || '')}"></label><label>${tr('email')}<input class="field" data-server-field="email" type="email" value="${escapeHTML(member.email || '')}"></label><label>${tr('mobile')}<input class="field" data-server-field="mobile" type="tel" value="${escapeHTML(member.mobile || '')}"></label><label>${tr('birthDate')}<input class="field jalali-date" data-server-field="birthDate" inputmode="numeric" dir="ltr" placeholder="YYYY/MM/DD" value="${escapeHTML(jalaliDateValue(member.birthDate || ''))}"></label></div><button type="button" class="button secondary" data-server-member-save>${tr('adminSaveUser')}</button><details class="admin-device-details"><summary>${tr('adminDevices')} · ${fa(member.devices.length)}</summary><ul>${devices || `<li>—</li>`}</ul></details></article>`;
     }).join('');
     const feedbackCards = data.feedback.map(item => `<article class="admin-feedback-card"><div class="admin-feedback-meta"><span class="feedback-status">${escapeHTML(item.category)}</span><time>${formatDate(item.createdAt)}</time></div><p>${escapeHTML(item.message)}</p><small>${escapeHTML(item.username ? `@${item.username}` : (lang === 'fa' ? 'مهمان' : 'Guest'))} · ${tr('adminPage')}: ${escapeHTML(item.page || '—')}${item.ip ? ` · ${tr('adminIp')}: ${escapeHTML(item.ip)}` : ''}${item.country ? ` · ${tr('adminCountry')}: ${escapeHTML(item.country)}` : ''}</small></article>`).join('');
     const views = data.views.map(item => `<li><span dir="ltr">${escapeHTML(item.poemId)}</span><strong>${fa(item.views)}</strong></li>`).join('');
     return `<section class="page admin-page"><div class="admin-workspace">${head}<div class="admin-kpis"><article class="admin-kpi glass"><strong>${fa(data.summary.members)}</strong><span>${tr('adminUsers')}</span></article><article class="admin-kpi glass"><strong>${fa(data.summary.active7Days)}</strong><span>${tr('adminActive')}</span></article><article class="admin-kpi glass"><strong>${fa(data.summary.feedback)}</strong><span>${tr('adminFeedback')}</span></article></div><div class="admin-workspace-grid"><section class="admin-panel-section"><div class="admin-section-head"><h2>${tr('adminUsers')}</h2></div><div class="admin-user-list">${memberCards || `<div class="empty">${tr('adminNoServerData')}</div>`}</div></section><aside class="admin-side-stack"><section class="admin-panel-section admin-inbox"><div class="admin-section-head"><h2>${tr('adminFeedback')}</h2></div><div class="admin-feedback-list">${feedbackCards || `<div class="empty">${tr('adminNoFeedback')}</div>`}</div></section><section class="admin-panel-section"><div class="admin-section-head"><h2>${tr('flowPopular')}</h2></div><ul class="admin-view-list">${views || `<li>${tr('flowNoPopular')}</li>`}</ul></section></aside></div></div></section>`;
   };
   const adminView = () => {
    const users = Object.entries(authUsers).map(([key, user]) => ({ ...user, key })).filter(user => user.role !== 'admin').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const queue = readJSON('jaryan-feedback-outbox', []);
    const knownFeedback = new Set(feedbackHistory.map(item => `${item.message}|${item.createdAt}`));
    const feedback = [...feedbackHistory, ...queue.filter(item => !knownFeedback.has(`${item.message}|${item.createdAt}`)).map(item => ({ ...item, status: 'queued' }))].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const active = users.filter(user => user.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < 7 * 86400000).length;
    return `<section class="page admin-page"><div class="page-hero admin-hero"><p class="eyebrow">${tr('admin')}</p><h1>${tr('admin')}</h1><p>${tr('adminLocalNotice')}</p></div><div class="admin-dashboard"><div class="admin-overview"><div class="admin-stat glass"><strong>${fa(users.length)}</strong><span>${tr('adminUsers')}</span></div><div class="admin-stat glass"><strong>${fa(users.filter(user => user.createdAt).length)}</strong><span>${tr('adminRegistrations')}</span></div><div class="admin-stat glass"><strong>${fa(active)}</strong><span>${tr('adminActive')}</span></div></div><section class="admin-section"><div class="section-head"><div><p class="eyebrow">${tr('adminUsers')}</p><h2>${tr('adminUserEdit')}</h2></div></div><div class="admin-users">${users.length ? users.map(user => `<article class="admin-user-row glass" data-admin-user="${escapeHTML(user.key)}"><div class="admin-user-heading"><strong>${escapeHTML(user.username)}</strong><small>${formatDate(user.createdAt)}</small></div><div class="admin-user-fields"><label>${tr('displayName')}<input class="field" data-admin-field="displayName" value="${escapeHTML(user.displayName || user.username)}"></label><label>${tr('email')}<input class="field" data-admin-field="email" type="email" value="${escapeHTML(user.email || '')}"></label><label>${tr('mobile')}<input class="field" data-admin-field="mobile" type="tel" value="${escapeHTML(user.mobile || '')}"></label><label>${tr('birthDate')}<input class="field" data-admin-field="birthDate" type="date" value="${escapeHTML(user.birthDate || '')}"></label></div><button class="button secondary admin-save-user" data-admin-save-user>${tr('adminSaveUser')}</button></article>`).join('') : `<div class="empty">${tr('adminNoUsers')}</div>`}</div></section><section class="admin-section"><div class="section-head"><div><p class="eyebrow">${tr('adminFeedback')}</p><h2>${tr('adminFeedback')}</h2></div><button class="button secondary" data-admin-clear-feedback>${tr('adminFeedbackClear')}</button></div><div class="admin-feedback-list">${feedback.length ? feedback.slice(0, 20).map(item => `<article class="admin-feedback-item glass"><div><strong>${escapeHTML(item.category || 'general')}</strong><small>${formatDate(item.createdAt)} · ${escapeHTML(item.username || item.name || tr('account'))}</small></div><p>${escapeHTML(item.message || '')}</p><span class="feedback-status ${item.status === 'queued' ? 'queued' : ''}">${item.status === 'queued' ? (lang === 'fa' ? 'در صف' : 'Queued') : (lang === 'fa' ? 'ارسال‌شده' : 'Sent')}</span></article>`).join('') : `<div class="empty">${tr('adminNoFeedback')}</div>`}</div></section><div class="admin-actions"><button class="button" data-admin-export>${icon('download')}${tr('adminExportAll')}</button><button class="button secondary" data-logout>${tr('accountLogout')}</button></div></div></section>`;
   };
   const adminWorkspaceView = () => {
     const users = Object.entries(authUsers).map(([key, user]) => ({ ...user, key })).filter(user => user.role !== 'admin').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
     const queue = readJSON('jaryan-feedback-outbox', []);
     const knownFeedback = new Set(feedbackHistory.map(item => `${item.message}|${item.createdAt}`));
     const feedback = [...feedbackHistory, ...queue.filter(item => !knownFeedback.has(`${item.message}|${item.createdAt}`)).map(item => ({ ...item, status: 'queued' }))].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
     const active = users.filter(user => user.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < 7 * 86400000).length;
     const stat = (value, label, note) => `<article class="admin-kpi glass"><strong>${fa(value)}</strong><span>${label}</span><small>${note}</small></article>`;
     const userCards = users.length ? users.map(user => {
       const displayName = user.displayName || user.username;
       const online = user.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < 7 * 86400000;
       return `<article class="admin-user-card glass" data-admin-user="${escapeHTML(user.key)}"><header class="admin-user-card-head"><div class="admin-user-identity"><span class="admin-avatar" aria-hidden="true">${escapeHTML(Array.from(displayName)[0] || '?')}</span><div><strong>${escapeHTML(displayName)}</strong><small dir="ltr">@${escapeHTML(user.username)}</small></div></div><span class="admin-status ${online ? 'is-online' : ''}"><i></i>${online ? (lang === 'fa' ? 'فعال' : 'Active') : (lang === 'fa' ? 'غیرفعال' : 'Away')}</span></header><div class="admin-user-meta"><span>${lang === 'fa' ? 'ثبت‌نام' : 'Joined'} · ${formatDate(user.createdAt)}</span><span>${lang === 'fa' ? 'آخرین حضور' : 'Last seen'} · ${user.lastSeenAt ? formatDate(user.lastSeenAt) : '—'}</span></div><div class="admin-user-fields"><label>${tr('displayName')}<input class="field" data-admin-field="displayName" value="${escapeHTML(displayName)}"></label><label>${tr('email')}<input class="field" data-admin-field="email" type="email" value="${escapeHTML(user.email || '')}"></label><label>${tr('mobile')}<input class="field" data-admin-field="mobile" type="tel" value="${escapeHTML(user.mobile || '')}"></label><label>${tr('birthDate')}<input class="field" data-admin-field="birthDate" type="date" value="${escapeHTML(user.birthDate || '')}"></label></div><footer class="admin-user-card-foot"><span>${lang === 'fa' ? 'اطلاعات محلی حساب' : 'Local account record'}</span><button class="button secondary admin-save-user" data-admin-save-user>${tr('adminSaveUser')}</button></footer></article>`;
     }).join('') : `<div class="empty admin-empty">${tr('adminNoUsers')}</div>`;
     const feedbackCards = feedback.length ? feedback.slice(0, 8).map(item => `<article class="admin-feedback-card"><div class="admin-feedback-meta"><span class="feedback-status ${item.status === 'queued' ? 'queued' : ''}">${item.status === 'queued' ? (lang === 'fa' ? 'در صف ارسال' : 'Queued') : (lang === 'fa' ? 'ثبت‌شده' : 'Recorded')}</span><time>${formatDate(item.createdAt)}</time></div><p>${escapeHTML(item.message)}</p><small>${escapeHTML(item.name || item.username || (lang === 'fa' ? 'کاربر ناشناس' : 'Anonymous'))}${item.category ? ` · ${escapeHTML(item.category)}` : ''}</small></article>`).join('') : `<div class="empty admin-empty">${tr('adminNoFeedback')}</div>`;
     return `<section class="page admin-page"><div class="admin-workspace"><header class="admin-workspace-head"><div><div class="admin-title-row"><span class="admin-live-dot"></span><p class="eyebrow">${tr('admin')}</p><span class="admin-badge">LOCAL ADMIN</span></div><h1>${lang === 'fa' ? 'اتاق کنترل جریان' : 'Jaryan control room'}</h1><p>${tr('adminLocalNotice')}</p></div><div class="admin-head-actions"><button class="button secondary" data-route="home">${lang === 'fa' ? 'بازگشت به خانه' : 'Back home'}</button><button class="button secondary" data-logout>${tr('accountLogout')}</button><button class="button" data-admin-export>${tr('adminExport')}</button></div></header><div class="admin-kpis">${stat(users.length, tr('adminUsers'), lang === 'fa' ? 'حساب محلی' : 'Local accounts')}${stat(users.filter(user => user.createdAt).length, tr('adminRegistrations'), lang === 'fa' ? 'از آغاز برنامه' : 'Since launch')}${stat(active, tr('adminActive'), lang === 'fa' ? 'در هفت روز اخیر' : 'In the last seven days')}${stat(feedback.length, tr('adminFeedback'), queue.length ? `${fa(queue.length)} ${lang === 'fa' ? 'در صف' : 'queued'}` : (lang === 'fa' ? 'صندوق خلوت است' : 'Inbox is clear'))}</div><div class="admin-workspace-grid"><section class="admin-panel-section"><div class="admin-section-head"><div><p class="eyebrow">${tr('adminUsers')}</p><h2>${tr('adminUserEdit')}</h2></div><span class="admin-count">${fa(users.length)}</span></div><div class="admin-user-list">${userCards}</div></section><aside class="admin-side-stack"><section class="admin-panel-section admin-inbox"><div class="admin-section-head"><div><p class="eyebrow">${tr('adminFeedback')}</p><h2>${lang === 'fa' ? 'صندوق بازخورد' : 'Feedback inbox'}</h2></div><button class="text-button" data-admin-clear-feedback>${tr('adminFeedbackClear')}</button></div><div class="admin-feedback-list">${feedbackCards}</div>${queue.length ? `<button class="button secondary admin-queue-button" data-admin-clear-outbox>${tr('adminClearOutbox')}</button>` : ''}</section><section class="admin-panel-section admin-note"><p class="eyebrow">${lang === 'fa' ? 'راهنما' : 'Workspace note'}</p><h2>${lang === 'fa' ? 'محلی و قابل کنترل' : 'Local and in control'}</h2><p>${lang === 'fa' ? 'اطلاعات این پنل در همین مرورگر نگه‌داری می‌شود. برای پشتیبان‌گیری از دکمهٔ خروجی استفاده کن.' : 'This workspace stores data in this browser. Use export to create a backup.'}</p></section></aside></div></div></section>`;
   };
     const legacyAccountViewNext = () => {
     if (!isAuthenticated()) return authView();
         if (isAdminAccount()) return adminServerView();
    const user = currentUserRecord() || account;
     return `<section class="page account-page"><div class="page-hero account-dashboard-hero"><p class="eyebrow">${tr('account')}</p><h1>${tr('accountTitle')}</h1><span class="account-identity">@${escapeHTML(account.username)}</span></div><div class="account-dashboard-grid"><section class="account-card glass"><div class="section-head"><div><p class="eyebrow">${tr('profile')}</p><h2>${tr('displayName')}</h2></div></div><div class="account-form-grid"><label>${tr('displayName')}<input class="field" id="account-display-name" value="${escapeHTML(user.displayName || user.name || profile)}" maxlength="80"></label><label>${tr('email')}<input class="field" id="account-email" type="email" value="${escapeHTML(user.email || '')}" placeholder="${tr('emailPlaceholder')}"></label><label>${tr('mobile')}<input class="field" id="account-mobile" type="tel" value="${escapeHTML(user.mobile || '')}" placeholder="${tr('mobilePlaceholder')}"></label><label>${tr('birthDate')}<input class="field" id="account-birth-date" type="date" value="${escapeHTML(user.birthDate || '')}"></label></div><button class="button" data-save-account>${tr('saveChanges')}</button></section><section class="account-card glass security-card"><div class="section-head"><div><p class="eyebrow">${tr('security')}</p><h2>${tr('changeCredentials')}</h2></div></div><p class="card-copy">${tr('credentialsHint')}</p><div class="account-form-grid"><label>${tr('currentPassword')}<input class="field" id="account-current-password" type="password" autocomplete="current-password"></label><label>${tr('newUsername')}<input class="field" id="account-new-username" minlength="3" maxlength="60" autocomplete="username"></label><label>${tr('newPassword')}<input class="field" id="account-new-password" type="password" minlength="5" maxlength="120" autocomplete="new-password"></label></div><button class="button secondary" data-save-credentials>${tr('changeCredentials')}</button></section></div>${accountLibraryView()}<div class="account-actions"><button class="button secondary" data-logout>${tr('accountLogout')}</button></div></section>`;
    };

    const accountView = () => {
      if (!isAuthenticated()) return authView();
      if (isAdminAccount()) return adminWorkspaceView();
      const user = currentUserRecord() || account;
      return `<section class="page account-page"><div class="account-dashboard-hero account-hero"><div><p class="eyebrow">${tr('account')}</p><h1>${tr('accountTitle')}</h1><p>${tr('accountIntro')}</p></div><span class="account-identity">@${escapeHTML(account.username)}</span></div><div class="account-dashboard-grid"><section class="account-card glass account-profile-card"><div class="section-head"><div><p class="eyebrow">${tr('profile')}</p><h2>${tr('displayName')}</h2></div><span class="account-card-mark">${icon('user')}</span></div><div class="account-form-grid"><label>${tr('displayName')}<input class="field" id="account-display-name" value="${escapeHTML(user.displayName || user.name || profile)}" maxlength="80"></label><label>${tr('email')}<input class="field" id="account-email" type="email" value="${escapeHTML(user.email || '')}" placeholder="${tr('emailPlaceholder')}"></label><label>${tr('mobile')}<input class="field" id="account-mobile" type="tel" value="${escapeHTML(user.mobile || '')}" placeholder="${tr('mobilePlaceholder')}"></label><label>${tr('birthDate')}<input class="field" id="account-birth-date" type="date" value="${escapeHTML(user.birthDate || '')}"></label></div><button class="button" data-save-account>${tr('saveChanges')}</button></section><section class="account-card glass security-card"><div class="section-head"><div><p class="eyebrow">${tr('security')}</p><h2>${tr('changeCredentials')}</h2></div><span class="account-card-mark">${icon('settings')}</span></div><p class="card-copy">${tr('credentialsHint')}</p><div class="account-form-grid"><label>${tr('currentPassword')}<input class="field" id="account-current-password" type="password" autocomplete="current-password"></label><label>${tr('newUsername')}<input class="field" id="account-new-username" minlength="3" maxlength="60" autocomplete="username"></label><label>${tr('newPassword')}<input class="field" id="account-new-password" type="password" minlength="5" maxlength="120" autocomplete="new-password"></label></div><button class="button secondary" data-save-credentials>${tr('changeCredentials')}</button></section></div>${accountLibraryView()}<div class="account-actions"><button class="button secondary" data-logout>${tr('accountLogout')}</button></div>${adminPanelView()}</section>`;
    };

     const notFoundView = () => `<section class="page"><div class="page-hero"><p class="eyebrow">404</p><h1>${tr('notFound')}</h1><p>${tr('notFoundCopy')}</p><button class="button" data-route="home">${tr('home')}</button></div></section>`;
      const flowView = () => {
        const personCard = (person, count, metric, rank, extraClass = '') => `<article class="flow-card flow-person-card ${extraClass}" data-poet="${escapeHTML(person.i)}"><span class="flow-card-rank">${fa(rank)}</span><span class="flow-card-mark" aria-hidden="true">${icon('user')}</span><div class="flow-card-copy"><h3>${escapeHTML(poetName(person))}</h3><p>${fa(person.b.length)} ${lang === 'fa' ? 'مجموعه' : 'collections'}</p></div><span class="flow-card-metric">${fa(count)} ${metric}</span></article>`;
        const poemCard = (poem, count, metric, rank, extraClass = '') => `<article class="flow-card flow-poem-card ${extraClass}" data-poem="${escapeHTML(idOf(poem))}"><span class="flow-card-rank">${fa(rank)}</span><div class="flow-card-copy"><p>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</p><h3>${escapeHTML(poemDisplayTitle(poem))}</h3><span>${fa(poem.coupletCount)} ${lang === 'fa' ? 'بیت' : 'couplets'}</span></div><span class="flow-card-metric">${fa(count)} ${metric}</span></article>`;
        const popularItems = [
          ...state.flowPopularPoets.map(item => ({ kind: 'poet', item, count: item.views })),
          ...state.flowPopular.map(item => ({ kind: 'poem', item, count: item.views }))
        ].sort((a, b) => b.count - a.count);
        const popularCards = popularItems.map(({ kind, item, count }, index) => {
          if (kind === 'poet') {
            const person = peopleById[item.poetId];
            return person ? personCard(person, count, tr('flowViewedCount'), index + 1) : '';
          }
          const poem = poems.find(candidate => idOf(candidate) === item.poemId);
          return poem ? poemCard(poem, count, tr('flowViewedCount'), index + 1) : '';
        }).join('');
        const sharedItems = [
          ...state.flowSharedPoets.map(item => ({ kind: 'poet', item, count: item.shares })),
          ...state.flowSharedPoems.map(item => ({ kind: 'poem', item, count: item.shares })),
          ...state.flowSharedCouplets.map(item => ({ kind: 'couplet', item, count: item.shares }))
        ].sort((a, b) => b.count - a.count);
        const sharedCards = sharedItems.map(({ kind, item, count }, index) => {
          if (kind === 'poet') {
            const person = peopleById[item.poetId];
            return person ? personCard(person, count, tr('flowSharedCount'), index + 1, 'flow-shared-poet-card') : '';
          }
          const poem = poems.find(candidate => idOf(candidate) === item.poemId);
          if (!poem) return '';
          if (kind === 'poem') return poemCard(poem, count, tr('flowSharedCount'), index + 1, 'flow-shared-poem-card');
          const couple = poem.couples[item.coupletIndex];
          if (!couple?.length) return '';
          return `<article class="flow-card flow-couplet-card" data-poem="${escapeHTML(idOf(poem))}"><span class="flow-card-rank">${fa(index + 1)}</span><div class="flow-card-copy"><p>${escapeHTML(poetName(peopleById[poem.poetId]))}</p><blockquote>${couple.filter(Boolean).map(line => `<span>${escapeHTML(line)}</span>`).join('')}</blockquote><h3>${escapeHTML(poemDisplayTitle(poem))}</h3></div><span class="flow-card-metric">${fa(count)} ${tr('flowSharedCount')}</span></article>`;
        }).join('');
        // These five poets were added in the previous archive update.
        const recentPoetIds = ['nima', 'forough', 'sohrab', 'nezami', 'ferdowsi'];
        const recentPoetCards = recentPoetIds.map(id => {
          const person = peopleById[id];
          if (!person) return '';
          const count = `${fa(person.b.length)} ${lang === 'fa' ? 'کتاب در آرشیو' : 'collections in the archive'}`;
          return `<article class="flow-card flow-recent-card" data-poet="${escapeHTML(person.i)}"><div class="flow-card-copy"><h3>${escapeHTML(poetName(person))}</h3><small>${count}</small></div></article>`;
        }).join('');
        const fortuneArt = type => {
          if (type === 'hafez') return `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M27 83 31 62c2-10 9-15 19-15s17 5 19 15l4 21" fill="currentColor" opacity=".13"/><path d="M27 83 31 62c2-10 9-15 19-15s17 5 19 15l4 21M37 39c0-10 5-17 13-17s13 7 13 17-5 17-13 17-13-7-13-17Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M33 34c2-12 9-19 18-19s16 7 18 19c-7-2-13-6-18-13-4 7-10 11-18 13ZM22 83h52M22 83l-1 6h55l-1-6M38 68l10 6 10-6M48 74v10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          if (type === 'moulavi') return `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="51" cy="17" r="7" fill="currentColor" opacity=".22"/><path d="m46 25 10 1 5 17M48 29 29 20M52 30l22-12M53 43c-9 4-15 12-19 23l-9 14c15 4 36 3 55-4-9-6-15-15-17-27M37 62c8 7 18 11 31 12M30 20l-6-4m51-6 6 3" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 80c14 4 32 4 50-3-10-6-17-15-18-26-10 4-17 13-21 24Z" fill="currentColor" opacity=".13"/></svg>`;
          return `<svg viewBox="0 0 96 96" aria-hidden="true"><rect x="27" y="16" width="43" height="63" rx="7" transform="rotate(-10 27 16)" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="36" y="20" width="43" height="63" rx="7" transform="rotate(7 36 20)" fill="currentColor" opacity=".1"/><rect x="36" y="20" width="43" height="63" rx="7" transform="rotate(7 36 20)" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m53 38 4 8 9 1-7 6 2 9-8-5-8 4 2-9-6-6 9-1 3-7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
        };
        const fortuneCard = (poetId, type, label, note) => `<button type="button" class="flow-card flow-fortune-card" data-random="poet" data-random-poet="${poetId}"><span class="flow-fortune-art">${fortuneArt(type)}</span><span class="flow-fortune-copy"><strong>${label}</strong><small>${note}</small></span></button>`;
        const fortuneCards = `${fortuneCard('hafez', 'hafez', tr('flowHafez'), lang === 'fa' ? 'برای یک نیت' : 'For your intention')}${fortuneCard('moulavi', 'moulavi', tr('flowMolana'), lang === 'fa' ? 'برای یک نیت' : 'For your intention')}<button type="button" class="flow-card flow-fortune-card flow-disabled-card" disabled aria-disabled="true"><span class="flow-fortune-art">${fortuneArt('tarot')}</span><span class="flow-fortune-copy"><strong>${tr('flowTarot')}</strong><small>${tr('flowTarotSoon')}</small></span></button>`;
        const slider = (cards, label, empty, extraClass = '') => `<div class="flow-slider ${extraClass}" role="list" aria-label="${escapeHTML(label)}" tabindex="0">${cards || `<div class="flow-empty-card" role="status">${state.flowLoading ? tr('flowLoading') : state.flowError ? tr('flowUnavailable') : empty}</div>`}</div>`;
        const verse = state.flowVerse;
        const verseLines = verse?.couplets?.map(couplet => `<span class="flow-verse-couplet"><span>${escapeHTML(couplet[0])}</span><span>${escapeHTML(couplet[1])}</span></span>`).join('') || '';
        const verseBanner = verse
          ? `<article class="flow-verse-banner" role="button" tabindex="0" data-flow-verse-card aria-label="${tr('flowVerseHint')}"><span class="flow-verse-label">${tr('flowVerse')}</span><blockquote>${verseLines}</blockquote><small class="flow-verse-attribution">${escapeHTML(verse.poetName)} · ${escapeHTML(verse.poemTitle)}</small><small class="flow-verse-instruction">${tr('flowVerseHint')}</small><span class="flow-verse-hold-track" aria-hidden="true"><span></span></span></article>`
          : `<article class="flow-verse-banner flow-verse-loading" role="button" tabindex="0" data-flow-verse-card aria-label="${tr('flowVerseHint')}"><span class="flow-verse-label">${tr('flowVerse')}</span><span>${state.flowVerseLoading || !state.flowVerseRequested ? tr('flowVerseLoading') : tr('flowVerseUnavailable')}</span><small class="flow-verse-instruction">${tr('flowVerseHint')}</small><span class="flow-verse-hold-track" aria-hidden="true"><span></span></span></article>`;
        return `<section class="page flow-page"><header class="flow-page-head">${verseBanner}</header><div class="flow-sections"><section class="flow-section"><header class="flow-section-head"><span>01</span><h2>${tr('flowPopular')}</h2></header>${slider(popularCards, tr('flowPopular'), tr('flowNoPopular'))}</section><section class="flow-section"><header class="flow-section-head"><span>02</span><h2>${tr('flowFortunes')}</h2></header>${slider(fortuneCards, tr('flowFortunes'), '', 'flow-fortune-slider')}</section><section class="flow-section"><header class="flow-section-head"><span>03</span><h2>${tr('flowShared')}</h2></header>${slider(sharedCards, tr('flowShared'), tr('flowNoShared'))}</section><section class="flow-section"><header class="flow-section-head"><span>04</span><h2>${tr('flowRecent')}</h2></header>${slider(recentPoetCards, tr('flowRecent'), tr('flowNoRecent'))}</section></div></section>`;
      };

     const settingsViewNext = () => {
     const setting = (title, copy, content, className = '') => `<div class="setting-card glass ${className}"><div><h3>${title}</h3><p>${copy}</p></div>${content}</div>`;
      const language = `<div class="setting-options"><button class="${lang === 'fa' ? 'active' : ''}" data-lang="fa">${lang === 'fa' ? 'فارسی' : 'Persian'}</button><button class="${lang === 'en' ? 'active' : ''}" data-lang="en">English</button></div>`;
      const themes = `<div class="setting-options theme-options"><button class="${theme === 'dark-mode' ? 'active' : ''}" data-theme="dark-mode">${tr('darkMode')}</button><button class="${theme === 'light-mode' ? 'active' : ''}" data-theme="light-mode">${tr('lightMode')}</button><button class="${theme === 'dark' ? 'active' : ''}" data-theme="dark">${tr('dark')}</button><button class="${theme === 'light' ? 'active' : ''}" data-theme="light">${tr('light')}</button><button class="${theme === 'paper' ? 'active' : ''}" data-theme="paper">${tr('paper')}</button><button class="${theme === 'system' ? 'active' : ''}" data-theme="system">${tr('system')}</button></div>`;
       const appFonts = lang === 'fa'
         ? `<div class="setting-options"><button class="${appFont === 'ravi' ? 'active' : ''}" data-app-font="ravi">Ravi</button><button class="${appFont === 'yekan' ? 'active' : ''}" data-app-font="yekan">Yekan</button></div>`
         : `<div class="setting-options"><button class="${appFont === 'english' ? 'active' : ''}" data-app-font="english">System Sans</button><button class="${appFont === 'english-serif' ? 'active' : ''}" data-app-font="english-serif">Georgia</button><button class="${appFont === 'english-mono' ? 'active' : ''}" data-app-font="english-mono">Mono</button></div>`;
       const poemFonts = `<div class="setting-options poem-font-options"><button class="${poemFont === 'ravi' ? 'active' : ''}" data-poem-font="ravi">Ravi</button><button class="${poemFont === 'iran-nastaliq' ? 'active' : ''}" data-poem-font="iran-nastaliq">${tr('iranNastaliq')}</button><button class="${poemFont === 'shekasteh' ? 'active' : ''}" data-poem-font="shekasteh">${tr('shekastehNastaliq')}</button><button class="${poemFont === 'mir-emad' ? 'active' : ''}" data-poem-font="mir-emad">${tr('mirEmad')}</button></div>`;
       const fonts = `<div class="font-sections"><section class="font-section"><h4>${tr('appFont')}</h4>${appFonts}</section><section class="font-section"><h4>${tr('poemFont')}</h4>${poemFonts}</section></div>`;
       const size = `<div class="setting-options scale-options"><button class="${uiScale === 'smaller' ? 'active' : ''}" data-ui-scale="smaller">${tr('smaller')}</button><button class="${uiScale === 'default' ? 'active' : ''}" data-ui-scale="default">${tr('defaultSize')}</button><button class="${uiScale === 'large' ? 'active' : ''}" data-ui-scale="large">${tr('large')}</button><button class="${uiScale === 'larger' ? 'active' : ''}" data-ui-scale="larger">${tr('larger')}</button></div>`;
          return `<section class="page"><div class="page-hero"><h1>${tr('settings')}</h1></div><div class="settings-grid">${setting(tr('language'), lang === 'fa' ? 'فارسی / English' : 'Persian / English', language)}${setting(tr('theme'), lang === 'fa' ? 'روشن، کاغذی، تیره یا هماهنگ با تنظیمات سیستم.' : 'Light, paper, dark or your system preference.', themes)}${setting(tr('font'), lang === 'fa' ? 'انتخاب فونت رابط و شعر' : 'Choose interface and poem fonts', fonts)}${setting(tr('size'), lang === 'fa' ? 'فقط اندازهٔ نوشته‌ها را تغییر می‌دهد.' : 'Changes text size without scaling the controls.', size)}${setting(tr('appVersion'), lang === 'fa' ? APP_VERSION_FA : APP_VERSION, `<a class="button secondary" href="mailto:feedback@jaryan.app">${lang === 'fa' ? 'ارسال نظر' : 'Send feedback'}</a>`, 'setting-help')}</div></section>`;
    };

    const accountSettingsView = () => {
      const setting = (title, copy, content) => `<section class="account-setting-card glass"><div><h3>${title}</h3><p>${copy}</p></div>${content}</section>`;
      const language = `<div class="setting-options"><button class="${lang === 'fa' ? 'active' : ''}" data-lang="fa">${lang === 'fa' ? 'فارسی' : 'Persian'}</button><button class="${lang === 'en' ? 'active' : ''}" data-lang="en">English</button></div>`;
      const themes = `<div class="setting-options theme-options"><button class="${theme === 'dark-mode' ? 'active' : ''}" data-theme="dark-mode">${tr('darkMode')}</button><button class="${theme === 'light-mode' ? 'active' : ''}" data-theme="light-mode">${tr('lightMode')}</button><button class="${theme === 'dark' ? 'active' : ''}" data-theme="dark">${tr('dark')}</button><button class="${theme === 'light' ? 'active' : ''}" data-theme="light">${tr('light')}</button><button class="${theme === 'paper' ? 'active' : ''}" data-theme="paper">${tr('paper')}</button><button class="${theme === 'system' ? 'active' : ''}" data-theme="system">${tr('system')}</button></div>`;
      const appFonts = lang === 'fa'
        ? `<div class="setting-options"><button class="${appFont === 'ravi' ? 'active' : ''}" data-app-font="ravi">Ravi</button><button class="${appFont === 'yekan' ? 'active' : ''}" data-app-font="yekan">Yekan</button></div>`
        : `<div class="setting-options"><button class="${appFont === 'english' ? 'active' : ''}" data-app-font="english">System Sans</button><button class="${appFont === 'english-serif' ? 'active' : ''}" data-app-font="english-serif">Georgia</button><button class="${appFont === 'english-mono' ? 'active' : ''}" data-app-font="english-mono">Mono</button></div>`;
      const poemFonts = `<div class="setting-options poem-font-options"><button class="${poemFont === 'ravi' ? 'active' : ''}" data-poem-font="ravi">Ravi</button><button class="${poemFont === 'iran-nastaliq' ? 'active' : ''}" data-poem-font="iran-nastaliq">${tr('iranNastaliq')}</button><button class="${poemFont === 'shekasteh' ? 'active' : ''}" data-poem-font="shekasteh">${tr('shekastehNastaliq')}</button><button class="${poemFont === 'mir-emad' ? 'active' : ''}" data-poem-font="mir-emad">${tr('mirEmad')}</button></div>`;
      const size = `<div class="setting-options scale-options"><button class="${uiScale === 'smaller' ? 'active' : ''}" data-ui-scale="smaller">${tr('smaller')}</button><button class="${uiScale === 'default' ? 'active' : ''}" data-ui-scale="default">${tr('defaultSize')}</button><button class="${uiScale === 'large' ? 'active' : ''}" data-ui-scale="large">${tr('large')}</button><button class="${uiScale === 'larger' ? 'active' : ''}" data-ui-scale="larger">${tr('larger')}</button></div>`;
      return `<div class="account-settings-grid">${setting(tr('language'), lang === 'fa' ? 'فارسی / English' : 'Persian / English', language)}${setting(tr('theme'), lang === 'fa' ? 'ظاهر و رنگ‌بندی جریان.' : 'Jaryan appearance and color mode.', themes)}${setting(tr('font'), lang === 'fa' ? 'انتخاب فونت رابط و شعر' : 'Choose interface and poem fonts', `<div class="font-sections"><section class="font-section"><h4>${tr('appFont')}</h4>${appFonts}</section><section class="font-section"><h4>${tr('poemFont')}</h4>${poemFonts}</section></div>`)}${setting(tr('size'), lang === 'fa' ? 'فقط اندازهٔ نوشته‌ها را تغییر می‌دهد.' : 'Changes text size without scaling the controls.', size)}</div>`;
    };

    const accountProfileView = user => `<div class="account-dashboard-grid"><section class="account-card glass account-profile-card"><div class="section-head"><div><p class="eyebrow">${tr('profile')}</p><h2>${tr('displayName')}</h2></div><span class="account-card-mark">${icon('user')}</span></div><div class="account-form-grid"><label>${tr('displayName')}<input class="field" id="account-display-name" value="${escapeHTML(user.displayName || user.name || profile)}" maxlength="80"></label><label>${tr('email')}<input class="field" id="account-email" type="email" value="${escapeHTML(user.email || '')}" placeholder="${tr('emailPlaceholder')}"></label><label>${tr('mobile')}<input class="field" id="account-mobile" type="tel" value="${escapeHTML(user.mobile || '')}" placeholder="${tr('mobilePlaceholder')}"></label><label>${tr('birthDate')}<input class="field" id="account-birth-date" type="date" value="${escapeHTML(user.birthDate || '')}"></label></div><button class="button" data-save-account>${tr('saveChanges')}</button></section><section class="account-card glass security-card"><div class="section-head"><div><p class="eyebrow">${tr('security')}</p><h2>${tr('changeCredentials')}</h2></div><span class="account-card-mark">${icon('settings')}</span></div><p class="card-copy">${tr('credentialsHint')}</p><div class="account-form-grid"><label>${tr('currentPassword')}<input class="field" id="account-current-password" type="password" autocomplete="current-password"></label><label>${tr('newUsername')}<input class="field" id="account-new-username" minlength="3" maxlength="60" autocomplete="username"></label><label>${tr('newPassword')}<input class="field" id="account-new-password" type="password" minlength="5" maxlength="120" autocomplete="new-password"></label></div><button class="button secondary" data-save-credentials>${tr('changeCredentials')}</button></section></div>`;

    const accountOverviewView = () => {
      const recent = readingHistory.slice().sort((a, b) => b.at - a.at).slice(0, 5);
      const recentPoems = recent.map(item => poems.find(poem => idOf(poem) === item.id)).filter(Boolean);
      const selectedPoets = people.filter(person => poetFavorites.has(person.i));
      const poetCards = selectedPoets.map(person => `<article class="dashboard-list-item glass" data-poet="${escapeHTML(person.i)}"><span><strong>${escapeHTML(poetName(person))}</strong><small>${fa(person.b.length)} ${lang === 'fa' ? 'مجموعه' : tr('collections')}</small></span><span>${tr('nextArrow')}</span></article>`).join('');
      const poemCards = recentPoems.map(poem => `<article class="dashboard-list-item glass" data-poem="${escapeHTML(idOf(poem))}"><span><strong>${escapeHTML(poemDisplayTitle(poem))}</strong><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</small></span><span>${tr('nextArrow')}</span></article>`).join('');
      const activity = recent.map(item => { const poem = poems.find(candidate => idOf(candidate) === item.id); return poem ? `<article class="activity-item"><span>${escapeHTML(poemDisplayTitle(poem))}</span><small>${formatDate(item.at)}</small></article>` : ''; }).join('');
      return `<div class="account-stats-grid"><div class="stat-card glass"><strong>${fa(readingHistory.filter(item => new Date(item.at).toDateString() === new Date().toDateString()).length)}</strong><span>${tr('today')}</span></div><div class="stat-card glass"><strong>${fa(readingHistory.length)}</strong><span>${tr('total')}</span></div><div class="stat-card glass"><strong>${fa(offlinePoems.size)}</strong><span>${tr('offlinePoems')}</span></div></div><section class="reading-card glass"><div class="section-head"><div><p class="eyebrow">${tr('readingChart')}</p><h2>${tr('lastSevenDays')}</h2></div></div>${readingChart()}</section><div class="dashboard-columns"><section><div class="section-head"><div><p class="eyebrow">${tr('selectedPoets')}</p><h2>${tr('selectedPoets')}</h2></div></div><div class="dashboard-list">${poetCards || `<div class="empty">${tr('empty')}</div>`}</div></section><section><div class="section-head"><div><p class="eyebrow">${tr('readPoems')}</p><h2>${tr('readPoems')}</h2></div></div><div class="dashboard-list">${poemCards || `<div class="empty">${tr('empty')}</div>`}</div></section></div><section class="activity-card glass"><div class="section-head"><div><p class="eyebrow">${tr('recentActivity')}</p><h2>${tr('recentActivity')}</h2></div></div><div class="activity-list">${activity || `<div class="empty">${tr('empty')}</div>`}</div></section>`;
    };

    const accountLibraryV5 = () => {
      const notesList = Object.entries(notes).map(([key, value]) => { const item = coupletFromKey(key); return item ? `<article class="note-item glass" data-poem="${escapeHTML(idOf(item.poem))}"><strong>${escapeHTML(value)}</strong><small>${escapeHTML(poetName(peopleById[item.poem.poetId] || { i: item.poem.poetId, n: item.poem.poetName }))} · ${escapeHTML(poemDisplayTitle(item.poem))}</small></article>` : ''; }).join('');
      const candidates = [...new Set([...favorites, ...readingHistory.map(item => item.id)])].map(id => poems.find(poem => idOf(poem) === id)).filter(Boolean).slice(0, 12);
      const offlineList = [...offlinePoems].map(id => poems.find(poem => idOf(poem) === id)).filter(Boolean).map(poem => `<article class="offline-item glass" data-poem="${escapeHTML(idOf(poem))}"><span><strong>${escapeHTML(poemDisplayTitle(poem))}</strong><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</small></span><button class="button secondary" data-offline-poem="${escapeHTML(idOf(poem))}">${tr('offlineRemove')}</button></article>`).join('');
      const offlineCandidates = candidates.map(poem => `<article class="offline-item glass"><span><strong>${escapeHTML(poemDisplayTitle(poem))}</strong><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</small></span><button class="button secondary" data-offline-poem="${escapeHTML(idOf(poem))}">${offlinePoems.has(idOf(poem)) ? tr('offlineRemove') : tr('offlineAdd')}</button></article>`).join('');
     return `${accountLibraryView()}<div class="library-v5-grid"><section><div class="section-head"><div><p class="eyebrow">${tr('notesTitle')}</p><h2>${tr('notesTitle')}</h2></div></div><div class="note-list">${notesList || `<div class="empty">${tr('empty')}</div>`}</div></section><section><div class="section-head"><div><p class="eyebrow">${tr('offlinePoems')}</p><h2>${tr('offlinePoems')}</h2></div></div><div class="offline-list">${offlineList || `<p class="empty offline-empty">${tr('offlineEmpty')}</p>`}${offlineCandidates ? `<div class="offline-candidates"><p>${lang === 'fa' ? 'از شعرهای اخیر:' : 'From recent poems:'}</p>${offlineCandidates}</div>` : ''}</div></section></div>`;
    };

      const accountDailyFortuneView = () => {
        const fortune = dailyFortune();
        const person = peopleById[fortune.poetId];
        const book = person?.b.find(item => item.i === fortune.bookId);
         return `<article class="daily-fortune" data-poem="${escapeHTML(idOf(fortune))}" tabindex="0" role="link" aria-label="${escapeHTML(tr('dailyFortune'))}"><div class="daily-fortune-copy"><p class="daily-fortune-label">${tr('dailyFortune')} <span>· ${persianDateLabel()}</span></p><h2>${escapeHTML(poemDisplayTitle(fortune))}</h2><p>${escapeHTML(poetName(person || { i: fortune.poetId, n: fortune.poetName }))} · ${escapeHTML(bookName(book || { i: fortune.bookId, n: fortune.bookTitle }))}</p></div><div class="daily-fortune-action"><span class="daily-fortune-shine" aria-hidden="true">${icon('shine')}</span><span>${tr('dailyFortuneOpen')}</span></div></article>`;
      };
     const accountNotesV6 = () => {
       const notesList = Object.entries(notes).map(([key, value]) => {
         const item = coupletFromKey(key);
         return item ? `<article class="note-item glass" data-poem="${escapeHTML(idOf(item.poem))}"><strong>${escapeHTML(value)}</strong><small>${escapeHTML(poetName(peopleById[item.poem.poetId] || { i: item.poem.poetId, n: item.poem.poetName }))} · ${escapeHTML(poemDisplayTitle(item.poem))} · ${fa(item.index + 1)} ${lang === 'fa' ? 'بیت' : 'verse'}</small></article>` : '';
       }).join('');
        return `<section class="account-section-v6"><div class="section-head"><div class="account-section-heading"><h2><span class="section-icon note-icon">${icon('note')}</span><span>${tr('accountNotes')}</span></h2><p>${fa(Object.keys(notes).length)} ${lang === 'fa' ? 'یادداشت ثبت‌شده' : 'saved notes'}</p></div></div><div class="note-list">${notesList || `<div class="empty account-empty">${tr('noNotes')}</div>`}</div></section>`;
     };
      const accountFavoritesV6 = () => {
        const savedPoems = [...favorites].map(id => poems.find(poem => idOf(poem) === id)).filter(Boolean);
        const savedPoets = people.filter(person => poetFavorites.has(person.i));
        const savedCouplets = [...coupletFavorites].map(coupletFromKey).filter(Boolean);
        const shelfLimit = 6;
        const totalSaved = savedPoems.length + savedCouplets.length + savedPoets.length;
        const shelf = (iconName, title, items, content, key, className = '') => {
          const expanded = Boolean(state.favoriteShelfExpanded[key]);
          const visible = expanded ? items : items.slice(0, shelfLimit);
          const toggle = items.length > shelfLimit ? `<button type="button" class="favorite-more-button" data-expand-favorite-shelf="${key}">${expanded ? tr('closePoets') : tr('more')}</button>` : '';
          return `<section class="favorite-shelf ${className}"><div class="favorite-shelf-head"><h3><span class="shelf-icon">${icon(iconName)}</span><span>${title}</span></h3><small>${fa(visible.length)}${visible.length < items.length ? ` / ${fa(items.length)}` : ''}</small></div>${content(visible)}${toggle}</section>`;
        };
        const poemShelf = shelf('bookmark', tr('favoritePoems'), savedPoems, visible => `<div class="favorite-library-grid">${visible.map((poem, index) => { const person = peopleById[poem.poetId]; const book = person?.b.find(item => item.i === poem.bookId); return `<article class="favorite-library-card glass" data-poem="${escapeHTML(idOf(poem))}"><div class="favorite-library-card-top"><span class="favorite-library-mark">${icon('bookmark')}</span><small>${fa(index + 1)}</small></div><strong>${escapeHTML(poemDisplayTitle(poem))}</strong><span>${escapeHTML(poetName(person || { i: poem.poetId, n: poem.poetName }))}</span><small>${escapeHTML(bookName(book || { i: poem.bookId, n: poem.bookTitle }))}</small><b>${tr('nextArrow')}</b></article>`; }).join('') || `<div class="empty account-empty">${tr('noFavorites')}</div>`}</div>`, 'poems', 'favorite-poem-shelf');
        const verseShelf = savedCouplets.length ? shelf('heart', tr('favoriteVerses'), savedCouplets, visible => `<div class="favorite-library-list">${visible.map(item => `<article class="favorite-library-row glass" data-poem="${escapeHTML(idOf(item.poem))}"><span class="favorite-library-mark">${icon('heart')}</span><span><strong>${escapeHTML(item.text.slice(0, 120))}</strong><small>${escapeHTML(poetName(peopleById[item.poem.poetId] || { i: item.poem.poetId, n: item.poem.poetName }))} · ${escapeHTML(poemDisplayTitle(item.poem))}</small></span><b>${tr('nextArrow')}</b></article>`).join('')}</div>`, 'verses') : '';
        const poetShelf = savedPoets.length ? shelf('user', tr('favoritePoets'), savedPoets, visible => `<div class="favorite-library-list">${visible.map(person => `<article class="favorite-library-row glass" data-poet="${escapeHTML(person.i)}"><span class="favorite-library-mark">${icon('user')}</span><span><strong>${escapeHTML(poetName(person))}</strong><small>${escapeHTML(lang === 'fa' ? blurbs[person.i] || '' : blurbsEn[person.i] || '')}</small></span><b>${tr('nextArrow')}</b></article>`).join('')}</div>`, 'poets') : '';
        return `<section class="account-section-v6 favorites-library-v6"><div class="section-head"><div class="account-section-heading"><h2><span class="section-icon favorite-icon">${icon('heart')}</span><span>${tr('favoriteLibraryTitle')}</span></h2><p>${tr('favoriteLibraryCopy')}</p></div><strong class="favorite-total">${fa(totalSaved)}</strong></div><div class="favorite-library-summary"><div><strong>${fa(savedPoems.length)}</strong><span>${tr('favoritePoemCount')}</span></div><div><strong>${fa(savedCouplets.length)}</strong><span>${tr('favoriteVerseCount')}</span></div><div><strong>${fa(savedPoets.length)}</strong><span>${tr('favoritePoetCount')}</span></div></div>${poemShelf}${verseShelf}${poetShelf}</section>`;
      };
      const accountProfileV6 = user => `<div class="account-profile-v6"><section class="account-section-v6 profile-v6-card"><div class="section-head"><div class="account-section-heading"><h2><span class="section-icon profile-icon">${icon('user')}</span><span>${tr('accountProfileShort')}</span></h2></div></div><div class="account-form-grid account-form-grid-v6"><label>${tr('name')}<input class="field" id="account-display-name" value="${escapeHTML(user.displayName || user.name || profile)}" maxlength="80"></label><label>${tr('username')}<input class="field readonly-field" id="account-username" value="${escapeHTML(account.username)}" readonly aria-describedby="username-help"><small id="username-help" class="field-hint">${tr('usernameReadOnly')}</small></label><label>${tr('email')}<input class="field" id="account-email" type="email" value="${escapeHTML(user.email || '')}" placeholder="${tr('emailPlaceholder')}"></label><label>${tr('mobile')}<input class="field" id="account-mobile" type="tel" value="${escapeHTML(user.mobile || '')}" placeholder="${tr('mobilePlaceholder')}"></label></div><button class="button account-save-button" data-save-account>${tr('saveChanges')}</button></section><section class="account-security-v6 glass"><div class="account-section-heading"><h2><span class="section-icon security-icon">${icon('settings')}</span><span>${tr('accountSecurity')}</span></h2><p>${tr('accountSecurityHint')}</p></div><div class="account-security-actions"><button class="button secondary" data-forgot-password>${tr('forgotPassword')}</button><button class="button danger-button" data-logout>${tr('accountLogout')}</button></div></section></div>`;
      const accountStatsV6 = () => {
        const todayCount = readingHistory.filter(item => new Date(item.at).toDateString() === new Date().toDateString()).length;
        const monthCount = readingHistory.filter(item => { const date = new Date(item.at); const now = new Date(); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }).length;
        const recentAll = readingHistory.slice().sort((a, b) => b.at - a.at).map(item => poems.find(poem => idOf(poem) === item.id)).filter(Boolean);
        const recentLimit = 5;
        const recent = state.recentExpanded ? recentAll : recentAll.slice(0, recentLimit);
        const recentItems = recent.map(poem => `<article class="history-item glass" data-poem="${escapeHTML(idOf(poem))}"><span><strong>${escapeHTML(poemDisplayTitle(poem))}</strong><small>${escapeHTML(poetName(peopleById[poem.poetId] || { i: poem.poetId, n: poem.poetName }))}</small></span><b>${tr('nextArrow')}</b></article>`).join('');
        const recentToggle = recentAll.length > recentLimit ? `<button type="button" class="favorite-more-button" data-toggle-recent>${state.recentExpanded ? tr('closePoets') : tr('more')}</button>` : '';
         return `<section class="account-section-v6"><div class="section-head"><div class="account-section-heading"><h2><span class="section-icon stats-icon">${icon('chart')}</span><span>${tr('accountStats')}</span></h2></div></div><div class="account-stats-v6"><article class="stat-card glass"><strong>${fa(todayCount)}</strong><span>${tr('today')}</span></article><article class="stat-card glass"><strong>${fa(monthCount)}</strong><span>${tr('month')}</span></article><article class="stat-card glass"><strong>${fa(readingHistory.length)}</strong><span>${tr('total')}</span></article><article class="stat-card glass"><strong>${fa(favorites.size + coupletFavorites.size + poetFavorites.size)}</strong><span>${tr('saved')}</span></article></div><section class="reading-card glass"><div class="section-head"><div><h2>${tr('readingChart')} · ${tr('lastSevenDays')}</h2></div></div>${readingChart()}</section><section class="recent-views-v6"><div class="recent-views-head"><div class="account-section-heading"><h2><span class="section-icon recent-icon">${icon('book')}</span><span>${tr('recentViews')}</span></h2><p>${tr('recentViewsCopy')}</p></div>${recentToggle}</div><div class="account-recent-v6">${recentItems || `<div class="empty account-empty">${tr('noStats')}</div>`}</div></section></section>`;
      };
     const accountUpdateV6 = () => {
       const update = state.update;
       const cacheLabel = update.cacheStatus === 'current' ? tr('cacheCurrent') : update.cacheStatus === 'old' ? tr('cacheOld') : tr('cacheUnknown');
       const statusCopy = update.status === 'checking' ? tr('updateChecking') : update.status === 'available' ? tr('updateAvailable') : update.status === 'current' ? tr('updateCurrent') : update.status === 'updating' ? tr('updateUpdating') : update.status === 'error' ? tr('updateError') : tr('updateChecking');
        return `<section class="account-section-v6 update-section-v6"><div class="section-head"><div class="account-section-heading"><h2><span class="section-icon update-icon ${update.status === 'checking' || update.status === 'updating' ? 'is-spinning' : ''}">${icon('refresh')}</span><span>${tr('accountUpdate')}</span></h2><p>${statusCopy}</p></div></div><div class="update-status-v6 ${update.status}"><div class="update-version-row"><span>${tr('installedVersion')}</span><strong dir="ltr">${APP_VERSION_FA}</strong></div><div class="update-version-row"><span>${tr('serverVersion')}</span><strong dir="ltr">${update.remoteVersion ? escapeHTML(update.remoteVersion) : '—'}</strong></div><div class="update-version-row"><span>${tr('cacheVersion')}</span><strong>${cacheLabel}</strong></div></div><div class="update-actions-v6">${update.status === 'available' ? `<button class="button" data-apply-update>${icon('download')}${tr('updateInstall')}</button>` : `<button class="button secondary" data-check-updates>${icon('refresh')}${update.status === 'error' ? tr('updateRetry') : tr('updateRetry')}</button>`}</div></section>`;
     };

       const accountViewV5 = () => {
         if (!isAuthenticated()) return authView();
         if (isAdminAccount()) return adminServerView();
        const user = currentUserRecord() || account;
          const tabs = [['profile', tr('accountProfileShort'), 'user'], ['notes', tr('accountNotes'), 'note'], ['favorites', tr('accountFavorites'), 'heart'], ['stats', tr('accountStats'), 'chart'], ['offline', tr('offlinePoems'), 'download'], ['update', tr('accountUpdate'), 'refresh']];
          const content = state.accountTab === 'profile' ? accountProfileV6(user) : state.accountTab === 'favorites' ? accountFavoritesV6() : state.accountTab === 'stats' ? accountStatsV6() : state.accountTab === 'offline' ? accountOfflineV65() : state.accountTab === 'update' ? accountUpdateV6() : accountNotesV6();
         const displayName = user.displayName || user.name || account.username;
         const greeting = lang === 'fa' ? 'سلام! چطوری' : 'Hi! How are you';
         const punctuation = lang === 'fa' ? '،' : ',';
         const cards = tabs.map(([key, label, iconName]) => `<button type="button" class="account-section-card glass" data-account-card="${key}"><span class="account-section-card-icon">${icon(iconName)}</span><strong>${label}</strong><span class="account-section-card-arrow" aria-hidden="true">${tr('nextArrow')}</span></button>`).join('');
         const accountContent = state.accountTab === 'overview'
           ? `<div class="account-section-cards" aria-label="${escapeHTML(tr('accountOverview'))}">${cards}</div>`
           : `<section class="account-detail-v6 account-section-page" data-account-section="${state.accountTab}" aria-label="${escapeHTML(tabs.find(([key]) => key === state.accountTab)?.[1] || tr('accountOverview'))}"><button type="button" class="account-back-button" data-account-overview>${tr('backArrow')} ${tr('accountOverview')}</button><div class="account-tab-panel">${content}</div></section>`;
         return `<section class="page account-page account-page-v6"><div class="account-dashboard-hero account-hero"><div class="account-hero-copy"><h1><span class="account-display-name">${escapeHTML(displayName)}</span><span class="account-greeting"><span>${punctuation} ${greeting}</span><span class="greeting-smile" aria-hidden="true">${icon('smile')}</span></span></h1><span class="account-identity">@${escapeHTML(account.username)}</span></div></div>${accountDailyFortuneView()}${accountContent}</section>`;
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

  const enhanceNavigationCards = () => {
    document.querySelectorAll('article[data-poet], article[data-book], article[data-poem]').forEach(card => {
      card.tabIndex = 0;
      card.setAttribute('role', 'link');
      if (!card.getAttribute('aria-label')) card.setAttribute('aria-label', card.querySelector('h3, strong')?.textContent.trim() || tr('open'));
    });
  };

  const applyTextScale = () => {
    const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--text-scale')) || 1;
    document.querySelectorAll('#app *,.mobile-nav *').forEach(element => {
      if (element.children.length || !element.textContent.trim() || ['SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(element.tagName)) return;
      if (scale === 1) {
        element.style.removeProperty('font-size');
        delete element.dataset.baseFontSize;
        return;
      }
      const base = Number(element.dataset.baseFontSize) || parseFloat(getComputedStyle(element).fontSize);
      if (!Number.isFinite(base)) return;
      element.dataset.baseFontSize = String(base);
      element.style.fontSize = `${base * scale}px`;
    });
  };

  let renderToken = 0;
  const render = async () => {
    applyPreferences();
    if (state.page !== 'poem') state.lastTrackedPoem = '';
    if (state.page !== 'poem' && document.documentElement.classList.contains('focus-mode')) setFocusMode(false);
    if (state.page === 'flow' && !state.flowVerseRequested) refreshFlowVerse();
    const token = ++renderToken;
    const main = document.getElementById('main');
    if (state.page === 'poem') {
      main.innerHTML = `<section class="page"><div class="loading glass">${lang === 'fa' ? 'در حال بارگذاری شعر...' : 'Loading poem...'}</div></section>`;
      try {
        const poem = poems.find(item => item.poetId === state.poetId && item.bookId === state.bookId && item.id === state.poemId);
        if (poem) await ensurePoemLoaded(poem);
      } catch {
        if (token === renderToken) main.innerHTML = `<section class="page"><div class="loading glass"><h1>${lang === 'fa' ? 'بارگذاری شعر ممکن نشد.' : 'Could not load this poem.'}</h1><p>${lang === 'fa' ? 'فایل شعر در دسترس نیست یا اتصال قطع شده است.' : 'The poem file is unavailable or the connection was interrupted.'}</p><div class="page-actions"><button class="button" data-retry-poem>${tr('retry')}</button><button class="button secondary" data-route="book/${escapeHTML(state.poetId)}/${escapeHTML(state.bookId)}">${tr('backToCollection')}</button></div></div></section>`;
        return;
      }
      if (token !== renderToken) return;
    }
    main.innerHTML = state.page === 'home' || state.page === 'poets' ? homeView()
      : state.page === 'poet' ? poetView()
        : state.page === 'book' ? bookView()
          : state.page === 'poem' ? poemView()
      : state.page === 'archive' ? archiveView()
      : state.page === 'flow' ? flowView()
      : state.page === 'account' ? accountViewV5()
      : state.page === 'not-found' ? notFoundView() : settingsViewNext();
      if (state.page === 'account' && !isAuthenticated() && state.authMode === 'register' && !main.querySelector('#auth-consent')) {
        main.querySelector('.remember-line')?.insertAdjacentHTML('afterend', `<label class="consent-line auth-consent"><input type="checkbox" id="auth-consent"><span>${tr('accountDataConsent')}</span></label>`);
      }
      if (state.page === 'account' && isAuthenticated() && !isAdminAccount()) {
        const user = currentUserRecord() || account;
        const profileGrid = main.querySelector('.profile-v6-card .account-form-grid-v6');
        if (profileGrid && !profileGrid.querySelector('#account-birth-date')) {
          profileGrid.insertAdjacentHTML('beforeend', `<label>${tr('birthDate')}<input class="field jalali-date" id="account-birth-date" type="text" inputmode="numeric" dir="ltr" placeholder="۱۴۰۵/۰۱/۰۱" value="${escapeHTML(jalaliDateValue(user.birthDate || ''))}"><small class="field-hint">${tr('jalaliDateHint')}</small></label>`);
        }
        if (!user.consentAt && !main.querySelector('#profile-consent')) {
          main.querySelector('.profile-v6-card [data-save-account]')?.insertAdjacentHTML('beforebegin', `<label class="consent-line"><input type="checkbox" id="profile-consent"><span>${tr('accountDataConsent')}</span></label>`);
        }
      }
      if (state.page === 'poem' && state.active) {
        const poemTools = main.querySelector('.poem-tools');
        if (poemTools && !poemTools.querySelector('[data-offline-poem]')) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'button secondary offline-poem-action';
          button.dataset.offlinePoem = idOf(state.active);
          button.textContent = offlinePoems.has(idOf(state.active)) ? tr('offlineRemove') : tr('offlineAdd');
          poemTools.append(button);
        }
      }
      if (state.page === 'flow' && !state.flowLoaded && !state.flowLoading) {
        state.flowLoading = true;
        serverRequest('/flow', undefined, 'GET').then(async data => {
          state.flowPopular = Array.isArray(data.popular) ? data.popular : [];
          state.flowPopularPoets = Array.isArray(data.popularPoets) ? data.popularPoets : [];
          state.flowSharedPoets = Array.isArray(data.sharedPoets) ? data.sharedPoets : [];
          state.flowSharedPoems = Array.isArray(data.sharedPoems) ? data.sharedPoems : [];
          state.flowSharedCouplets = Array.isArray(data.sharedCouplets) ? data.sharedCouplets : [];
          const targets = state.flowSharedCouplets.slice(0, 8).map(item => poems.find(poem => idOf(poem) === item.poemId)).filter(Boolean);
          const books = new Map(targets.map(poem => [`${poem.poetId}/${poem.bookId}/${poem.chunk ?? ''}`, poem]));
          await Promise.all([...books.values()].map(poem => ensurePoemLoaded(poem).catch(() => {})));
        }).catch(() => { state.flowError = true; }).finally(() => {
          state.flowLoading = false;
          state.flowLoaded = true;
          if (state.page === 'flow') render();
        });
      }
      if (state.page === 'account' && isAdminAccount() && !state.adminData && !state.adminLoading && !state.adminError) {
        state.adminLoading = true;
        state.adminError = '';
        serverRequest('/admin/data', undefined, 'GET').then(data => { state.adminData = data; })
          .catch(() => { state.adminError = tr('adminSyncError'); }).finally(() => { state.adminLoading = false; render(); });
      }
      document.querySelector('#archive-search')?.setAttribute('aria-label', tr('search'));
      enhanceNavigationCards();
      cleanFooter();
     syncPoemActions();
     updateFocusMode();
     document.querySelectorAll('[data-route]').forEach(element => element.classList.toggle('active', element.dataset.route === state.page));
      const navIndex = state.page === 'flow' ? 1 : state.page === 'archive' ? 2 : state.page === 'account' ? 3 : 0;
     document.documentElement.style.setProperty('--nav-index', String(navIndex));
     applyTextScale();
     animateCounters();
  };

    let searchTimer = 0;
    let searchRun = 0;
    let flowVersePress = null;
    let flowSliderTouch = null;
    let flowSliderClickSuppress = null;
    let suppressFlowVerseClick = false;
    const refreshArchiveResults = () => {
     const results = document.getElementById('archive-results');
     if (results) results.outerHTML = archiveResults();
   };
   const commitSearch = async (value, run) => {
     const matches = await querySearchIndex(value);
     if (run !== searchRun || state.query !== value) return;
     state.searchCommitted = true;
     state.searchError = !matches;
     searchMatches = matches || new Set();
     if (!state.searchError) await prepareSearchResults();
     if (run !== searchRun || state.query !== value) return;
     refreshArchiveResults();
   };
   const handleSearchInput = target => {
    const value = target.value;
    const caret = target.selectionStart ?? value.length;
     state.query = value;
      state.limit = 24;
      state.searchCommitted = false;
      state.searchError = false;
      searchMatches = null;
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
       searchTimer = setTimeout(() => commitSearch(value, run), 160);
     }
  };

   document.addEventListener('input', event => {
    if (event.target.matches('#home-search, #archive-search')) handleSearchInput(event.target);
   });
  document.addEventListener('change', event => {
     if (event.target.id === 'archive-poet') { state.poet = event.target.value; state.book = 'همه'; state.limit = 24; state.searchCommitted = false; state.searchError = false; render().then(() => { if (normalize(state.query)) commitSearch(state.query, ++searchRun); }); }
     if (event.target.id === 'archive-book') { state.book = event.target.value; state.limit = 24; state.searchCommitted = false; state.searchError = false; render().then(() => { if (normalize(state.query)) commitSearch(state.query, ++searchRun); }); }
  });
    document.addEventListener('click', async event => {
     const target = event.target;
     if (flowSliderClickSuppress && event.detail > 0 && target.closest('.flow-slider') === flowSliderClickSuppress.slider && performance.now() <= flowSliderClickSuppress.until) {
       flowSliderClickSuppress = null;
       event.preventDefault();
       return;
     }
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
     if (favorite) { toggleSet(favorites, favorite.dataset.fav, 'jaryan-favorites'); saveUserData(); render(); showToast(favorites.has(favorite.dataset.fav) ? tr('savedToast') : tr('removedToast')); return; }
    const coupletFavorite = target.closest('[data-couplet-fav]');
     if (coupletFavorite) { toggleSet(coupletFavorites, coupletFavorite.dataset.coupletFav, 'jaryan-couplet-favorites'); saveUserData(); render(); showToast(coupletFavorites.has(coupletFavorite.dataset.coupletFav) ? tr('savedToast') : tr('removedToast')); return; }
     const poetFavorite = target.closest('[data-poet-fav]');
     if (poetFavorite) { toggleSet(poetFavorites, poetFavorite.dataset.poetFav, 'jaryan-poet-favorites'); saveUserData(); render(); showToast(poetFavorites.has(poetFavorite.dataset.poetFav) ? tr('poetSavedToast') : tr('removedToast')); return; }
     const bookFavorite = target.closest('[data-book-fav]');
     if (bookFavorite) { toggleSet(bookFavorites, bookFavorite.dataset.bookFav, 'jaryan-book-favorites'); saveUserData(); render(); showToast(bookFavorites.has(bookFavorite.dataset.bookFav) ? tr('bookSavedToast') : tr('removedToast')); return; }
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
       showToast(tr('noteSaved'));
       return;
     }
     const shareMode = target.closest('[data-share-mode]');
     if (shareMode && shareDraft) { shareDraft.mode = shareMode.dataset.shareMode; renderShareModal(); return; }
     const shareFormat = target.closest('[data-share-format]');
     if (shareFormat && shareDraft) { shareDraft.format = shareFormat.dataset.shareFormat; renderShareModal(); return; }
     const shareCouplet = target.closest('[data-share-couplet]');
     if (shareCouplet && shareDraft) { const index = Number(shareCouplet.dataset.shareCouplet); shareDraft.selected.has(index) ? shareDraft.selected.delete(index) : shareDraft.selected.add(index); renderShareModal(); return; }
     if (target.closest('[data-share-confirm]')) { await performShare(); return; }
     const share = target.closest('[data-share]');
     if (share && state.active) { openShareWizard(state.active); return; }
     const coupletShare = target.closest('[data-couplet-share]');
     if (coupletShare) { const item = coupletFromKey(coupletShare.dataset.coupletShare); if (item) openShareWizard(item.poem, item.index); return; }
     const archiveType = target.closest('[data-archive-type]');
     if (archiveType) { state.archiveType = archiveType.dataset.archiveType; state.limit = 24; render(); return; }
      if (target.closest('[data-retry-poem]')) { render(); return; }
     if (target.closest('[data-more-archive]')) { state.limit += 24; state.searchCommitted = false; refreshArchiveResults(); prepareSearchResults().then(() => { state.searchCommitted = true; refreshArchiveResults(); }); return; }
     if (target.closest('[data-more-sections]')) { state.limit += 24; render(); return; }
     if (target.closest('[data-more-poets]')) { state.homePeopleExpanded = !state.homePeopleExpanded; render(); return; }
      if (target.closest('[data-clear-filters]')) { state.poet = 'همه'; state.book = 'همه'; state.genre = 'all'; state.archiveType = 'all'; state.limit = 24; render(); return; }
        if (target.closest('[data-flow-verse-card]')) {
          if (suppressFlowVerseClick && event.detail > 0) { suppressFlowVerseClick = false; return; }
          suppressFlowVerseClick = false;
          if (event.detail === 0) refreshFlowVerse();
          return;
        }
       const accountCard = target.closest('[data-account-card]');
       if (accountCard) { state.accountTab = accountCard.dataset.accountCard; render().then(scrollToPageStart); return; }
       if (target.closest('[data-account-overview]')) { state.accountTab = 'overview'; render().then(scrollToPageStart); return; }
       const favoriteShelfToggle = target.closest('[data-expand-favorite-shelf]');
       if (favoriteShelfToggle) { const key = favoriteShelfToggle.dataset.expandFavoriteShelf; if (key in state.favoriteShelfExpanded) state.favoriteShelfExpanded[key] = !state.favoriteShelfExpanded[key]; render(); return; }
       if (target.closest('[data-toggle-recent]')) { state.recentExpanded = !state.recentExpanded; render(); return; }
       const favoriteTab = target.closest('[data-favorite-tab]');
      if (favoriteTab) { state.favoriteTab = favoriteTab.dataset.favoriteTab; render(); return; }
       const accountTab = target.closest('[data-account-tab]');
       if (accountTab) { state.accountTab = accountTab.dataset.accountTab; render().then(() => { if (state.accountTab === 'update') checkForUpdates(); }); return; }
      if (target.closest('[data-clear-history]')) { readingHistory = []; localStorage.removeItem('jaryan-history'); saveUserData(); render(); showToast(tr('historyCleared')); return; }
      const authMode = target.closest('[data-auth-mode]');
      if (authMode) { state.authMode = authMode.dataset.authMode === 'register' ? 'register' : 'login'; render(); return; }
      const authSubmit = target.closest('[data-auth-submit]');
      if (authSubmit) {
        const username = document.getElementById('auth-username')?.value.trim() || '';
        const password = document.getElementById('auth-password')?.value || '';
        const remember = Boolean(document.getElementById('auth-remember')?.checked);
        const consent = Boolean(document.getElementById('auth-consent')?.checked);
        const mode = state.authMode;
        if (!username) { showToast(tr('usernameRequired')); return; }
        if (Array.from(username).length < 3) { showToast(tr('usernameShort')); return; }
        if (!password) { showToast(tr('passwordRequired')); return; }
        if (Array.from(password).length < 5) { showToast(tr('passwordShort')); return; }
        authSubmit.disabled = true;
        (async () => {
          try {
            const key = usernameKey(username);
            const passwordHash = await hashSecret(password);
            if (mode === 'register') {
              if (!consent) throw new Error(tr('consentRequired'));
              if (key === ADMIN_USERNAME || authUsers[key]) throw new Error(tr('usernameTaken'));
              const now = new Date().toISOString();
              authUsers[key] = { localId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, username, displayName: username, email: '', mobile: '', birthDate: '', consentAt: now, passwordHash, role: 'user', createdAt: now, updatedAt: now, lastSeenAt: now };
              saveAuthUsers();
              account = { name: username, displayName: username, email: '', mobile: '', birthDate: '', username, localId: authUsers[key].localId, consentAt: now, role: 'user', loggedIn: true };
              profile = username;
              await syncAccountToServer(authUsers[key]).catch(() => false);
            } else if (key === ADMIN_USERNAME) {
              const result = await serverRequest('/admin/login', { password });
              if (!result.authenticated) throw new Error(tr('invalidCredentials'));
              adminSession = true;
              state.adminData = null;
              state.adminError = '';
              account = { name: 'ادمین', displayName: 'ادمین', email: '', mobile: '', birthDate: '', username: ADMIN_USERNAME, role: 'admin', loggedIn: true };
              profile = 'ادمین';
            } else {
              const user = authUsers[key];
              if (!user || user.passwordHash !== passwordHash) throw new Error(tr('invalidCredentials'));
              const now = new Date().toISOString();
              const localId = user.localId || (user.consentAt ? globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` : '');
              authUsers[key] = { ...user, localId, lastSeenAt: now, updatedAt: now };
              account = { name: user.displayName || user.username, displayName: user.displayName || user.username, email: user.email || '', mobile: user.mobile || '', birthDate: user.birthDate || '', username: user.username, localId, remoteId: user.remoteId || '', consentAt: user.consentAt || '', role: 'user', loggedIn: true };
              profile = account.name;
              saveAuthUsers();
              await syncAccountToServer(authUsers[key]).catch(() => false);
            }
            if (remember && key !== ADMIN_USERNAME) rememberLogin(username, passwordHash);
            else clearRememberedLogin();
            saveUserData();
            layout();
            render();
            showToast(mode === 'register' ? tr('registerSuccess') : tr('loginSuccess'));
          } catch (error) {
            showToast(error.message || tr('invalidCredentials'));
          } finally {
            authSubmit.disabled = false;
          }
        })();
        return;
      }
       if (target.closest('[data-check-updates]')) { checkForUpdates(); return; }
       if (target.closest('[data-apply-update]')) { applyUpdate(); return; }
       if (target.closest('[data-forgot-password]')) { openInfo(tr('forgotPassword'), tr('forgotPasswordCopy')); return; }
       const accountSave = target.closest('[data-save-account]');
      if (accountSave && !isAdminAccount()) {
        const key = usernameKey(account.username);
        const user = authUsers[key];
        if (!user) return;
         const displayName = document.getElementById('account-display-name')?.value.trim() || user.username;
         const email = document.getElementById('account-email')?.value.trim() || '';
         const mobile = document.getElementById('account-mobile')?.value.trim() || '';
          const enteredBirthDate = document.getElementById('account-birth-date')?.value ?? user.birthDate ?? '';
          if (!validJalaliDate(enteredBirthDate)) { showToast(tr('jalaliDateHint')); return; }
          const birthDate = jalaliDateValue(enteredBirthDate);
         if (!validEmail(email)) { showToast(tr('invalidEmail')); return; }
         if (!validMobile(mobile)) { showToast(tr('invalidMobile')); return; }
          const normalizedMobile = normalizeMobile(mobile);
          const consentAt = user.consentAt || (document.getElementById('profile-consent')?.checked ? new Date().toISOString() : '');
          const localId = user.localId || (consentAt ? globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` : '');
          authUsers[key] = { ...user, localId, consentAt, displayName, email, mobile: normalizedMobile, birthDate, updatedAt: new Date().toISOString() };
          account = { ...account, localId, consentAt, name: displayName, displayName, email, mobile: normalizedMobile, birthDate };
        profile = displayName;
          saveAuthUsers();
          saveUserData();
          syncAccountToServer(authUsers[key]).catch(() => {});
          render();
        showToast(tr('profileSaved'));
        return;
      }
      const credentialsSave = target.closest('[data-save-credentials]');
      if (credentialsSave && !isAdminAccount()) {
        credentialsSave.disabled = true;
        (async () => {
          try {
            const currentPassword = document.getElementById('account-current-password')?.value || '';
            const newUsername = document.getElementById('account-new-username')?.value.trim() || '';
            const newPassword = document.getElementById('account-new-password')?.value || '';
            const oldKey = usernameKey(account.username);
            const user = authUsers[oldKey];
            if (!user || !currentPassword) throw new Error(tr('currentPassword'));
            const currentHash = await hashSecret(currentPassword);
            if (currentHash !== user.passwordHash) throw new Error(tr('invalidCredentials'));
            if (!newUsername && !newPassword) throw new Error(tr('credentialsHint'));
            if (newUsername && Array.from(newUsername).length < 3) throw new Error(tr('usernameShort'));
            if (newPassword && Array.from(newPassword).length < 5) throw new Error(tr('passwordShort'));
            const newKey = usernameKey(newUsername || user.username);
            if (newKey !== oldKey && authUsers[newKey]) throw new Error(tr('usernameTaken'));
            const updatedUser = { ...user, username: newUsername || user.username, passwordHash: newPassword ? await hashSecret(newPassword) : user.passwordHash, updatedAt: new Date().toISOString() };
            delete authUsers[oldKey];
            authUsers[newKey] = updatedUser;
            account = { ...account, username: updatedUser.username };
            saveAuthUsers();
            const remembered = readJSON('jaryan-remembered-login', {});
            if (remembered?.username && usernameKey(remembered.username) === oldKey) rememberLogin(updatedUser.username, updatedUser.passwordHash);
            saveUserData();
            render();
            showToast(tr('credentialsSaved'));
          } catch (error) {
            showToast(error.message || tr('invalidCredentials'));
          } finally {
            credentialsSave.disabled = false;
          }
        })();
        return;
      }
      const adminUserSave = target.closest('[data-admin-save-user]');
      if (adminUserSave && isAdminAccount()) {
        const row = adminUserSave.closest('[data-admin-user]');
       const key = usernameKey(row?.dataset.adminUser);
       const user = authUsers[key];
       if (!row || !user) return;
       const field = name => row.querySelector(`[data-admin-field="${name}"]`)?.value.trim() || '';
         const email = field('email');
         const mobile = field('mobile');
         if (!validEmail(email)) { showToast(tr('invalidEmail')); return; }
         if (!validMobile(mobile)) { showToast(tr('invalidMobile')); return; }
         authUsers[key] = { ...user, displayName: field('displayName') || user.username, email, mobile: normalizeMobile(mobile), birthDate: field('birthDate'), updatedAt: new Date().toISOString() };
        saveAuthUsers();
        render();
         showToast(tr('adminUserSaved'));
         return;
       }
       const serverMemberSave = target.closest('[data-server-member-save]');
       if (serverMemberSave && isAdminAccount()) {
         const row = serverMemberSave.closest('[data-server-member]');
         const field = name => row?.querySelector(`[data-server-field="${name}"]`)?.value.trim() || '';
         const birthDate = jalaliDateValue(field('birthDate'));
         if (!row || !validJalaliDate(field('birthDate'))) { showToast(tr('jalaliDateHint')); return; }
         try {
           await serverRequest('/admin/member/update', { memberId: row.dataset.serverMember, displayName: field('displayName'), email: field('email'), mobile: field('mobile'), birthDate });
           state.adminData = await serverRequest('/admin/data', undefined, 'GET');
           render();
           showToast(tr('adminUserSaved'));
         } catch (error) { showToast(error.message || tr('adminSyncError')); }
         return;
       }
       const adminExport = target.closest('[data-admin-export]');
       if (adminExport && isAdminAccount()) {
         downloadJSON(`jaryan-${APP_VERSION}-server-data.json`, { exportedAt: new Date().toISOString(), ...state.adminData });
        showToast(tr('adminExported'));
        return;
      }
      const adminClearFeedback = target.closest('[data-admin-clear-feedback]');
      if (adminClearFeedback && isAdminAccount()) { feedbackHistory = []; localStorage.removeItem('jaryan-feedback-history'); localStorage.removeItem('jaryan-feedback-outbox'); render(); showToast(tr('adminCleared')); return; }
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
        const createdAt = new Date().toISOString();
        submitFeedback(message, category).then(() => { recordFeedback({ username: account?.username || '', name: account?.name || '', message, category, createdAt, status: 'sent' }); closeModal(); showToast(tr('feedbackSent')); }).catch(() => {
          const queue = readJSON('jaryan-feedback-outbox', []);
          queue.push({ username: account?.username || '', name: account?.name || '', message, category, createdAt });
          localStorage.setItem('jaryan-feedback-outbox', JSON.stringify(queue.slice(-20)));
          recordFeedback({ username: account?.username || '', name: account?.name || '', message, category, createdAt, status: 'queued' });
          closeModal();
          showToast(tr('feedbackOffline'));
        });
        return;
      }
       if (target.closest('[data-logout]')) {
         if (isAdminAccount()) await serverRequest('/admin/logout', {}).catch(() => {});
         adminSession = false;
         state.adminData = null;
         profile = '';
         account = { ...(account || {}), loggedIn: false, role: 'user' };
         state.authMode = 'login';
         saveUserData(); layout(); render(); return;
       }
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
      if (bookInfo) { const [poetId, bookId] = bookInfo.dataset.bookInfo.split('/'); const person = peopleById[poetId]; const book = person?.b.find(item => item.i === bookId); if (person && book) openInfo(`${tr('bookInfo')} · ${bookName(book)}`, bookContext(person, book, poemsByBook[`${poetId}/${bookId}`] || [])); return; }
     const poetInfo = target.closest('[data-poet-info]');
      if (poetInfo) { const person = peopleById[poetInfo.dataset.poetInfo]; if (person) openInfo(`${tr('info')} · ${poetName(person)}`, poetDescription(person)); return; }
      if (target.closest('[data-copy]')) {
        const copyButton = target.closest('[data-copy]');
        if (!state.active) return;
        const copied = await copyText(state.active.couples.map(couple => couple.join('\n')).join('\n\n'));
        if (copied) {
          copyButton.classList.add('copied');
          showToast(lang === 'fa' ? 'کپی شد' : 'Copied');
        } else showToast(tr('copyUnavailable'));
        return;
      }
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
       if (scope === 'hafez') list = poems.filter(poem => poem.poetId === 'hafez');
       if (scope === 'poet') list = list.filter(poem => poem.poetId === (target.closest('[data-random-poet]')?.dataset.randomPoet || state.poetId));
      const poem = list[Math.floor(Math.random() * list.length)];
      if (poem) navigate(`poem/${poem.poetId}/${poem.bookId}/${poem.id}`);
      return;
    }
      const poem = target.closest('[data-poem]');
      const offline = target.closest('[data-offline-poem]');
      if (offline) {
        const id = offline.dataset.offlinePoem;
        if (offlinePoems.has(id)) {
          removeOfflinePoem(id);
          showToast(tr('offlineRemove'));
        } else {
          const item = poems.find(candidate => idOf(candidate) === id);
          try {
            if (!item) throw new Error('Poem not found');
            await ensurePoemLoaded(item);
            toggleSet(offlinePoems, id, 'jaryan-offline-poems');
            showToast(tr('offlineSaved'));
          } catch { showToast(tr('offlineSaveFailed')); }
        }
        render();
        return;
      }
      if (target.closest('[data-offline-clear]')) { clearOfflinePoems(); render(); return; }
      if (target.closest('[data-admin-refresh]')) { state.adminData = null; state.adminError = ''; render(); return; }
     if (poem) { const item = poems.find(candidate => idOf(candidate) === poem.dataset.poem); if (item) navigate(`poem/${item.poetId}/${item.bookId}/${item.id}`); return; }
    const book = target.closest('[data-book]');
    if (book) { const [poetId, bookId] = book.dataset.book.split('/'); navigate(`book/${poetId}/${bookId}`); return; }
    const poet = target.closest('[data-poet]');
    if (poet) { navigate(`poet/${poet.dataset.poet}`); return; }
    if (target.closest('[data-back]')) { goBack(); return; }
     const route = target.closest('[data-route]');
     if (route) { if (route.dataset.route === 'account') state.accountTab = 'overview'; navigate(route.dataset.route); return; }
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
   const finishFlowVersePress = (event, refresh = false) => {
     const press = flowVersePress;
     if (!press || (event && press.pointerId !== event.pointerId)) return;
     clearTimeout(press.timer);
     flowVersePress = null;
     press.target.classList.remove('is-holding');
     if (refresh && !press.completed) refreshFlowVerse();
     if (refresh || press.completed) {
       suppressFlowVerseClick = true;
       setTimeout(() => { suppressFlowVerseClick = false; }, 500);
     }
   };
   document.addEventListener('pointerdown', event => {
     const card = event.target.closest?.('[data-flow-verse-card]');
     if (!card || state.flowVerseLoading || !event.isPrimary || event.button > 0) return;
     const press = { target: card, pointerId: event.pointerId, x: event.clientX, y: event.clientY, completed: false, timer: 0 };
     flowVersePress = press;
     requestAnimationFrame(() => { if (flowVersePress === press && card.isConnected) card.classList.add('is-holding'); });
     press.timer = setTimeout(() => {
       if (flowVersePress !== press) return;
       press.completed = true;
       card.classList.remove('is-holding');
       card.classList.add('is-verse-refreshing');
       refreshFlowVerse();
     }, 3000);
   }, { passive: true });
   document.addEventListener('pointermove', event => {
     if (!flowVersePress || flowVersePress.pointerId !== event.pointerId) return;
     if (Math.hypot(event.clientX - flowVersePress.x, event.clientY - flowVersePress.y) > 12) finishFlowVersePress(event);
   }, { passive: true });
   document.addEventListener('pointerup', event => finishFlowVersePress(event, true), { passive: true });
   document.addEventListener('pointercancel', event => finishFlowVersePress(event), { passive: true });
   document.addEventListener('contextmenu', event => { if (event.target.closest?.('[data-flow-verse-card]')) event.preventDefault(); });
    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#home-search, #archive-search')?.focus(); }
       if (event.target.closest?.('[data-flow-verse-card]') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); if (!event.repeat) refreshFlowVerse(); return; }
       const modal = document.querySelector('#modal-backdrop.open .modal');
      if (modal && event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('button, input, textarea, select, [href], [tabindex]:not([tabindex="-1"])')].filter(item => !item.disabled && item.offsetParent !== null);
        if (!focusable.length) { event.preventDefault(); modal.focus(); }
        else {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          else if (!modal.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        }
        return;
      }
      if (event.key === 'Escape') {
        const wasModalOpen = Boolean(modal);
        closeModal();
        closeFab();
        if (document.documentElement.classList.contains('focus-mode')) setFocusMode(false);
        else if (!wasModalOpen) document.querySelector('[data-poem-fab]')?.focus();
      }
     if (document.documentElement.classList.contains('focus-mode') && (event.key === 'ArrowUp' || event.key === 'PageUp')) { event.preventDefault(); moveFocus(-1); }
      if (document.documentElement.classList.contains('focus-mode') && (event.key === 'ArrowDown' || event.key === 'PageDown')) { event.preventDefault(); moveFocus(1); }
      const card = event.target.closest?.('article[data-poet], article[data-book], article[data-poem]');
      if (card && event.target === card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); card.click(); }
   });
   let touchStart = null;
    document.addEventListener('touchstart', event => {
      if (event.target.closest?.('.flow-slider')) {
        const touch = event.touches[0];
        flowSliderTouch = { x: touch.clientX, y: touch.clientY, moved: false, slider: event.target.closest('.flow-slider') };
        touchStart = null;
        return;
      }
      flowSliderTouch = null;
      if (event.touches.length === 1 && !event.target.closest('input,textarea,select,button,a,[data-flow-verse-card]')) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, target: event.target };
    }, { passive: true });
   document.addEventListener('touchmove', event => {
     if (!flowSliderTouch || !event.touches.length) return;
     const touch = event.touches[0];
     const dx = touch.clientX - flowSliderTouch.x;
     const dy = touch.clientY - flowSliderTouch.y;
     if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) flowSliderTouch.moved = true;
   }, { passive: true });
   document.addEventListener('touchend', event => {
      if (flowSliderTouch) {
        if (flowSliderTouch.moved) {
          const slider = flowSliderTouch.slider;
          const until = performance.now() + 140;
          flowSliderClickSuppress = { slider, until };
          setTimeout(() => { if (flowSliderClickSuppress?.until === until) flowSliderClickSuppress = null; }, 160);
        }
        flowSliderTouch = null;
        return;
      }
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
      if (dx > 80 && Math.abs(dy) < 100 && state.page !== 'home' && !start.target.closest?.('.flow-slider')) goBack();
     }, { passive: true });
   document.addEventListener('touchcancel', () => { flowSliderTouch = null; touchStart = null; }, { passive: true });

  const finishSplash = async () => {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
     const remaining = Math.max(0, 650 - (performance.now() - bootStartedAt));
    if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    splash.classList.add('is-leaving');
    splash.setAttribute('aria-hidden', 'true');
     const leaveDuration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : 360;
    await new Promise(resolve => setTimeout(resolve, leaveDuration));
    splash.remove();
  };

   routeFromHash();
   applyPreferences();
   layout();
   if (document.fonts?.ready) await document.fonts.ready;
   await render();
   await finishSplash();
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js?v=0.6.5-flow-review-2').catch(() => {});
 })();
