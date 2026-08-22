import { translations } from './translations.js';

export function createI18n(language = 'ru') {
  let current = translations[language] ? language : 'ru';
  return {
    get language() { return current; },
    setLanguage(next) { if (translations[next]) current = next; },
    t(key, parameters = {}) {
      const template = translations[current][key] ?? key;
      return Object.entries(parameters).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), template);
    },
  };
}
