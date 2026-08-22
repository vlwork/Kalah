import { translations } from '../i18n/translations.js';

export function createDefaultNameState(key, language = 'ru') {
  return { key, value: translations[language][key], isDefault: true };
}

export function setCustomName(state, value) {
  state.value = value;
  state.isDefault = false;
  return state;
}

export function localizeDefaultName(state, language) {
  if (state.isDefault) state.value = translations[language][state.key];
  return state;
}

/** Used only to hydrate saves created before explicit default-name flags existed. */
export function isKnownDefaultName(value, key) {
  return Object.values(translations).some((dictionary) => dictionary[key] === value);
}
