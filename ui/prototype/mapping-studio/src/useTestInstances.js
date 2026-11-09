import {useState} from 'react';

const libraryKey = 'flottila-test-instances.v1';

function readLibrary() {
  const items = JSON.parse(localStorage.getItem(libraryKey) || '[]');
  if (!Array.isArray(items)) throw Error('Invalid local instance library.');
  return items;
}

export function useTestInstances(mapId, format) {
  const [items, setItems] = useState(() => {
    try { return readLibrary(); } catch { return []; }
  });
  const belongsHere = item => item.map === mapId && item.format === format;
  const entries = items.filter(belongsHere);
  // Older libraries are in creation order. On a tie the later entry wins.
  const current = entries.reduce((latest, item) =>
    !latest || (item.lastUsed ?? 0) >= (latest.lastUsed ?? 0) ? item : latest, null);

  function write(change) {
    const saved = readLibrary();
    const changed = change(saved);
    localStorage.setItem(libraryKey, JSON.stringify(changed));
    setItems(changed);
  }
  function nextOrder(saved) {
    return saved.reduce((order, item) => Math.max(order, item.lastUsed ?? 0), 0) + 1;
  }
  function create(name, resource) {
    write(saved => {
      if (saved.some(item => belongsHere(item) && item.name === name)) throw Error('This name already exists.');
      return [...saved, {id:crypto.randomUUID(), map:mapId, format, name, text:resource.text,
        values:resource.values ?? {}, lastUsed:nextOrder(saved)}];
    });
  }
  function select(id) {
    write(saved => {
      const lastUsed = nextOrder(saved);
      return saved.map(item => item.id === id && belongsHere(item) ? {...item, lastUsed} : item);
    });
  }
  function save(resource) {
    write(saved => saved.map(item => {
      if (item.id !== current.id) return item;
      if (item.text === resource.text && JSON.stringify(item.values) === JSON.stringify(resource.values)) return item;
      return {...item, text:resource.text, values:resource.values, revision:(item.revision ?? 0) + 1};
    }));
  }
  function remove() {
    write(saved => saved.filter(item => item.id !== current.id));
  }
  return {entries, current, create, select, save, remove};
}
