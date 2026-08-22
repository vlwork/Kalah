import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultNameState, localizeDefaultName, setCustomName } from '../js/ui/name-state.js';
import { translations } from '../js/i18n/translations.js';

test('both default player names follow RU to EN and back to RU', () => {
  const one = createDefaultNameState('player1', 'ru');
  const two = createDefaultNameState('player2', 'ru');
  localizeDefaultName(one, 'en'); localizeDefaultName(two, 'en');
  assert.equal(one.value, 'Player 1'); assert.equal(two.value, 'Player 2');
  localizeDefaultName(one, 'ru'); localizeDefaultName(two, 'ru');
  assert.equal(one.value, 'Игрок 1'); assert.equal(two.value, 'Игрок 2');
});

test('custom Russian and English names survive language changes', () => {
  const one = setCustomName(createDefaultNameState('player1', 'ru'), 'Иван');
  const two = setCustomName(createDefaultNameState('player2', 'en'), 'John');
  localizeDefaultName(one, 'en'); localizeDefaultName(two, 'ru');
  assert.equal(one.value, 'Иван'); assert.equal(two.value, 'John');
});

test('localized Kalah labels exist in RU and EN', () => {
  assert.equal(translations.ru.kalah1, 'Калах 1'); assert.equal(translations.ru.kalah2, 'Калах 2');
  assert.equal(translations.en.kalah1, 'Kalah 1'); assert.equal(translations.en.kalah2, 'Kalah 2');
});
