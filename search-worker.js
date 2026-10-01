'use strict';

let searchMap = new Map();

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

const loadIndex = async path => {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let decoded = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (!('DecompressionStream' in self)) throw new Error('Gzip is unavailable');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    decoded = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { q } = JSON.parse(new TextDecoder().decode(decoded));
  searchMap = new Map(q.map(row => [`${row[0]}/${row[1]}/${row[2]}`, row[3]]));
  return searchMap.size;
};

self.onmessage = async event => {
  const { type, path, query, requestId } = event.data || {};
  try {
    if (type === 'init') {
      const count = await loadIndex(path);
      self.postMessage({ type: 'ready', count });
      return;
    }
    if (type === 'query') {
      const words = normalize(query).split(' ').filter(Boolean);
      const ids = [];
      if (words.length) {
        for (const [id, text] of searchMap) if (words.every(word => text.includes(word))) ids.push(id);
      }
      self.postMessage({ type: 'result', requestId, ids });
    }
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message || 'Search failed' });
  }
};
