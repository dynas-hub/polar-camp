// Languages: English (default), French, Spanish. Texts live in src/locales/<lang>.json.
// t('key', { var }) returns the text in the current language, falls back to English, then to the key.
// In HTML: data-i18n="key" sets textContent, data-i18n-html="key" sets innerHTML,
// data-i18n-aria="key" sets aria-label. setLang() re-applies them and tells the listeners.
export const LANGS = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'es', name: 'Español' },
];
const LANG_KEY = 'polarcamp-lang';
const dicts = {};
const listeners = [];
let lang = 'en';

async function load(l) {
  if (!dicts[l]) dicts[l] = await fetch(new URL(`./locales/${l}.json`, import.meta.url)).then((r) => r.json());
  return dicts[l];
}

// the player's saved choice, or null on the very first launch
export function savedLang() {
  try { const l = localStorage.getItem(LANG_KEY); return LANGS.some((x) => x.id === l) ? l : null; } catch { return null; }
}

export function getLang() { return lang; }

export function t(key, vars) {
  let s = dicts[lang]?.[key] ?? dicts.en?.[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// names of buildings, upgrades and bosses: they stay in English in src/config.js,
// the locale translates them under "name.<ENGLISH NAME>" (missing = English name)
export function tName(name) {
  return dicts[lang]?.['name.' + name] ?? name;
}

export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.documentElement.lang = lang;
}

// save = false for autopilot/tests (never touch the player's preference)
export async function setLang(l, { save = true } = {}) {
  if (!LANGS.some((x) => x.id === l)) l = 'en';
  await load(l);
  lang = l;
  if (save) { try { localStorage.setItem(LANG_KEY, l); } catch { /* private mode: ignore */ } }
  applyDom();
  listeners.forEach((fn) => fn(l));
}

export function onLangChange(fn) { listeners.push(fn); }

// English is always loaded (fallback), then the saved language (English on first launch)
export async function initI18n(forced) {
  await load('en');
  await setLang(forced || savedLang() || 'en', { save: false });
}
