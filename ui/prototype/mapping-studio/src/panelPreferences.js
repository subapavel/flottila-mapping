const prefix = 'flottila-mapping-studio.panels.';
const sessionOnly = new Map();

export function readPanelPreference(key, fallback, isValid) {
  if (sessionOnly.has(key)) return sessionOnly.get(key);
  try {
    const value = JSON.parse(localStorage.getItem(prefix + key));
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function savePanelPreference(key, value) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
    sessionOnly.delete(key);
  } catch {
    sessionOnly.set(key, value);
  }
}
