import { KalahGame } from './core/game.js';
import { chooseMove } from './ai/ai.js';
import { createI18n } from './i18n/i18n.js';
import { BrowserAdapter, clearSlot, createSave, getHistory, getSettings, getSlots, loadSlot, recordHistory, saveSettings, saveSlot } from './storage/storage.js';
import { aggregateHistory, createMatchStatistics, finaliseMatch, makeHistoryEntry, recordMove } from './statistics/statistics.js';
import { getBoardOrientation, getBoardView } from './ui/board-view.js';
import { createDefaultNameState, isKnownDefaultName, localizeDefaultName, setCustomName } from './ui/name-state.js';
import { AiTurnController } from './ui/ai-turn-controller.js';
import { AiResignationController, createAiResignationState } from './ui/ai-resignation.js';
import { BoardAnimator, DomBoardAnimationView, getSowPath } from './ui/move-animation.js';
import { createResultPresentation, ResultDialogController } from './ui/result-dialog.js';
import { restoreRuntimeSnapshot, RuntimeLifecycle } from './ui/runtime-session.js';
import { AudioManager, AUDIO_EVENTS } from './audio/audio-manager.js';
import { WebAudioEngine } from './audio/web-audio-engine.js';

const $ = (selector) => document.querySelector(selector);
const i18n = createI18n(localStorage.getItem('kalah:v1:language') || 'ru');
const storage = new BrowserAdapter();
const storedSettings = getSettings(storage);
const audio = new AudioManager(new WebAudioEngine(), { enabled: storedSettings.soundEnabled, volume: storedSettings.volume / 100 });
const animationSettings = {
  animationEnabled: storedSettings.animationEnabled,
  animationSpeed: storedSettings.animationSpeed,
};
const mode = $('#mode');
const modal = $('#modal');
const modalContent = $('#modal-content');
const modalAction = $('#modal-action');
const boardElement = $('.board');
const nameFields = {
  1: createDefaultNameState('player1', i18n.language),
  2: createDefaultNameState('player2', i18n.language),
};
let game = null;
let match = null;
let statistics = null;
let renderedOrientation = null;
let uiAnimating = false;
let animatedOrientation = null;
const lifecycle = new RuntimeLifecycle();
const aiResignation = new AiResignationController({ random: Math.random });
const aiTurns = new AiTurnController({
  getSessionId: () => match?.matchId ?? null,
  canRun: () => Boolean(game && match && !lifecycle.loading && match.mode === 'ai' && !game.gameOver && !uiAnimating && game.currentPlayer === aiPlayer()),
  runTurn: runAiTurn,
});
const boardAnimator = new BoardAnimator({
  view: new DomBoardAnimationView({
    boardElement,
    statusElement: $('#status'),
    resolveTarget: resolveBoardAnimationTarget,
    renderFrame: renderBoardPosition,
  }),
  isGenerationCurrent: (generation) => lifecycle.isCurrent(generation),
  reducedMotion: () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  getAnimationSettings: () => ({ ...animationSettings }),
});
const resultDialog = new ResultDialogController({
  dialog: modal,
  content: modalContent,
  actionButton: modalAction,
  isCurrent: (generation) => lifecycle.isCurrent(generation),
  getMatchId: () => match?.matchId ?? null,
  fallbackFocus: () => $('#new-game'),
});

function text(key, parameters) { return i18n.t(key, parameters); }
function newId() { return globalThis.crypto?.randomUUID?.() || `match-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function humanPlayer() { return match?.humanPlayer ?? 1; }
function aiPlayer() { return match?.aiPlayer ?? 2; }
function isHuman(player) { return match && (match.mode === 'pvp' || player === humanPlayer()); }
function humanTurn() { return game && isHuman(game.currentPlayer); }
function displayName(player) { return player === 1 ? match.player1 : match.player2; }
function difficultyLabel(difficulty) { return text(difficulty === 'random' ? 'randomAI' : difficulty); }
function aiNameFor(difficulty) { return `${text('aiName')} (${difficultyLabel(difficulty)})`; }
function aiDisplayName() { return aiNameFor(match.aiDifficulty); }
function endReasonLabel(reason) { return reason === 'emptySide' ? text('endEmptySide') : reason === 'resign' ? text('endResign') : reason; }
function localizedStoredName(record, player) {
  if (player === 2 && (record.mode === 'ai' || record.player2IsSystemAI)) return aiNameFor(record.aiDifficulty);
  const key = player === 1 ? 'player1' : 'player2';
  const name = record[key];
  const flagName = `${key}IsDefault`;
  const isDefault = typeof record[flagName] === 'boolean' ? record[flagName] : isKnownDefaultName(name, key);
  return isDefault ? text(key) : name;
}

function beginSessionChange() {
  lifecycle.beginReplacement();
  aiTurns.invalidate();
  boardAnimator.cancel();
  resultDialog.invalidate();
  uiAnimating = false;
  animatedOrientation = null;
}

function applyLanguage() {
  document.documentElement.lang = i18n.language;
  boardElement.setAttribute('aria-label', text('boardAria'));
  $('#language').value = i18n.language;
  document.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = text(element.dataset.i18n); });
  for (const player of [1, 2]) {
    localizeDefaultName(nameFields[player], i18n.language);
    $(`#player${player}`).value = nameFields[player].value;
  }
  if (match) {
    if (match.player1IsDefault) match.player1 = text('player1');
    if (match.mode === 'pvp' && match.player2IsDefault) match.player2 = text('player2');
    if (match.mode === 'ai') match.player2 = aiDisplayName();
  }
  render();
}

function toggleMode() {
  const ai = mode.value === 'ai';
  $('#player2-wrap').hidden = ai;
  $('#difficulty-wrap').hidden = !ai;
}

function startGame() {
  if (game && !game.gameOver && !confirm(text('activeGame'))) return;
  beginSessionChange();
  const selected = $('#first').value;
  const first = selected === 'random' ? (Math.random() < .5 ? 1 : 2) : Number(selected);
  const player1Value = $('#player1').value.trim();
  const player2Value = $('#player2').value.trim();
  const player1IsDefault = nameFields[1].isDefault || !player1Value;
  const player2IsDefault = nameFields[2].isDefault || !player2Value;
  match = {
    matchId: newId(),
    mode: mode.value,
    humanPlayer: 1,
    aiPlayer: 2,
    player1: player1IsDefault ? text('player1') : player1Value,
    player2: mode.value === 'ai' ? '' : (player2IsDefault ? text('player2') : player2Value),
    player1IsDefault,
    player2IsDefault: mode.value === 'pvp' && player2IsDefault,
    player2IsSystemAI: mode.value === 'ai',
    aiDifficulty: mode.value === 'ai' ? $('#difficulty').value : null,
    aiResignation: mode.value === 'ai' ? createAiResignationState() : null,
  };
  if (match.mode === 'ai') match.player2 = aiDisplayName();
  game = new KalahGame({ startingPlayer: first, openingRestriction: $('#opening').checked });
  statistics = createMatchStatistics();
  renderedOrientation = null;
  $('#setup').hidden = true;
  $('#game-area').hidden = false;
  lifecycle.finishReplacement();
  render();
  scheduleAiIfNeeded();
}

async function makeMove(pit) {
  if (!game || !humanTurn() || game.gameOver || uiAnimating || lifecycle.loading) return;
  await performMove(pit, lifecycle.capture());
}

async function performMove(pit, moveGeneration) {
  if (!game || game.gameOver || !lifecycle.isCurrent(moveGeneration)) return;
  const actor = game.currentPlayer;
  const moveOrientation = getBoardOrientation({ mode: match.mode, currentPlayer: actor, humanPlayer: humanPlayer() });
  const before = [...game.board];
  const path = getSowPath(pit, before[pit], actor);
  const result = game.makeMove(pit);
  if (!result.success) {
    $('#status').textContent = result.reason === 'OPENING_MOVE_FORBIDDEN' ? text('opening') : result.reason;
    return;
  }
  recordMove(statistics, result);
  aiResignation.observe(match, game);
  uiAnimating = true;
  animatedOrientation = moveOrientation;
  const animation = await boardAnimator.animateMove({
    generation: moveGeneration,
    before,
    source: pit,
    path,
    orientation: moveOrientation,
    result,
    finalBoard: game.board,
    onLanding: (step, details) => audio.playStonePlacement(step, details),
    onCapture: () => audio.play(AUDIO_EVENTS.CAPTURE),
    onCanonicalRender: render,
  });
  if (!animation.completed || !lifecycle.isCurrent(moveGeneration)) return;

  completeIfNeeded();
  animatedOrientation = null;
  if (result.gameOver) {
    render();
    await boardAnimator.animateResult({
      generation: moveGeneration,
      kind: resultAnimationKind(result.winner),
      timing: animation.timing,
      onStart: () => audio.playMoveOutcome({ ...result, captureOccurred: false }, match),
    });
    if (!lifecycle.isCurrent(moveGeneration)) return;
    showResultDialog(moveGeneration, match.matchId);
  } else {
    const transitionType = result.extraTurn ? 'extra-turn' : match.mode === 'pvp' ? 'turn' : 'status';
    await boardAnimator.animatePostMove({
      generation: moveGeneration,
      type: transitionType,
      label: result.extraTurn ? text('extraTurn') : '',
      timing: animation.timing,
      onTransition: render,
    });
  }
  if (!lifecycle.isCurrent(moveGeneration)) return;
  uiAnimating = false;
  render();
  scheduleAiIfNeeded();
}

async function runAiTurn({ sessionId }) {
  if (!game || !match || match.matchId !== sessionId || match.mode !== 'ai' || game.gameOver || game.currentPlayer !== aiPlayer()) return;
  if (aiResignation.shouldResignBeforeMove(match, game)) {
    await resignAi(lifecycle.capture(), sessionId);
    return;
  }
  const pit = chooseMove(game, match.aiDifficulty);
  if (pit === null) return;
  await performMove(pit, lifecycle.capture());
}

async function resignAi(generation, sessionId) {
  if (!lifecycle.isCurrent(generation) || !game || !match || match.matchId !== sessionId || game.gameOver || match.mode !== 'ai') return;
  const result = aiResignation.resign(match, game);
  if (!result.success) return;
  aiTurns.invalidate();
  completeIfNeeded();
  uiAnimating = true;
  render();
  const completed = await boardAnimator.animateResult({
    generation,
    kind: resultAnimationKind(game.winner),
    onStart: () => audio.playResignOutcome(game, match),
  });
  if (!completed || !lifecycle.isCurrent(generation) || match.matchId !== sessionId) return;
  uiAnimating = false;
  render();
  showResultDialog(generation, sessionId);
}

function scheduleAiIfNeeded() {
  aiTurns.schedule();
}

function resultAnimationKind(winner) {
  if (winner === 0) return 'draw';
  if (match.mode === 'pvp') return 'neutral';
  return winner === humanPlayer() ? 'victory' : 'defeat';
}

function completeIfNeeded() {
  if (!game.gameOver || statistics.recorded) return;
  aiTurns.invalidate();
  finaliseMatch(statistics, game);
  recordHistory(storage, makeHistoryEntry(match, game, statistics));
  statistics.recorded = true;
}

function showResultDialog(generation, matchId) {
  if (!game?.gameOver || !match || match.matchId !== matchId) return false;
  return resultDialog.show({
    generation,
    matchId,
    presentation: createResultPresentation({ game, match, text }),
  });
}

function render() {
  if (!game || !match) return;
  const orientation = animatedOrientation ?? getBoardOrientation({ mode: match.mode, currentPlayer: game.currentPlayer, humanPlayer: humanPlayer() });
  renderBoardPosition(game.board, orientation, true);
  const isAi = match.mode === 'ai' && game.currentPlayer === aiPlayer() && !game.gameOver;
  $('#status').textContent = game.gameOver
    ? `${text('gameOver')}: ${game.winner === 0 ? text('draw') : `${text('winner')} — ${displayName(game.winner)}`}`
    : `${text('turn')}: ${displayName(game.currentPlayer)}${isAi ? '…' : ''}`;
  $('#score').textContent = `${displayName(1)} ${game.board[6]} : ${game.board[13]} ${displayName(2)}`;
}

function renderBoardPosition(board, orientation, allowOrientationTransition) {
  const view = getBoardView(orientation);
  renderStore('top', view.topStore, board, orientation);
  renderStore('bottom', view.bottomStore, board, orientation);
  renderPitColumn('#left-pits', view.left, board, orientation);
  renderPitColumn('#right-pits', view.right, board, orientation);
  if (allowOrientationTransition && renderedOrientation !== null && renderedOrientation !== orientation) {
    boardElement.classList.remove('orientation-change');
    void boardElement.offsetWidth;
    boardElement.classList.add('orientation-change');
  }
  if (allowOrientationTransition) renderedOrientation = orientation;
  boardElement.dataset.orientation = String(orientation);
}

function resolveBoardAnimationTarget(index, orientation) {
  const view = getBoardView(orientation);
  if (index === view.topStore) return $('#top-store');
  if (index === view.bottomStore) return $('#bottom-store');
  const leftIndex = view.left.indexOf(index);
  if (leftIndex >= 0) return $('#left-pits').children.item(leftIndex);
  const rightIndex = view.right.indexOf(index);
  return rightIndex >= 0 ? $('#right-pits').children.item(rightIndex) : null;
}

function renderPitColumn(selector, pits, board, orientation) {
  const column = $(selector);
  column.replaceChildren(...pits.map((pit) => makePit(pit, board, orientation)));
}

function makePit(pit, board, orientation) {
  const player = pit <= 5 ? 1 : 2;
  const count = board[pit];
  const button = document.createElement('button');
  button.className = `pit ${player === orientation ? 'view-own' : 'view-opponent'}`;
  const legal = game.getLegalMoves().includes(pit);
  button.disabled = lifecycle.loading || uiAnimating || !legal || !humanTurn();
  if (!lifecycle.loading && !uiAnimating && legal && humanTurn()) button.classList.add('active');
  button.setAttribute('aria-label', text('pitAria', { player: displayName(player), count }));
  const seeds = document.createElement('span');
  seeds.className = 'seed-cloud';
  seeds.setAttribute('aria-hidden', 'true');
  renderSeeds(seeds, count, pit);
  const number = document.createElement('span');
  number.className = 'stones';
  number.textContent = count;
  button.append(seeds, number);
  button.addEventListener('click', () => makeMove(pit));
  return button;
}

function renderStore(position, store, board, orientation) {
  const player = store === 6 ? 1 : 2;
  const count = board[store];
  const storeElement = $(`#${position}-store`);
  storeElement.classList.toggle('view-own', player === orientation);
  storeElement.classList.toggle('view-opponent', player !== orientation);
  $(`#${position}-store-name`).textContent = `${text(player === 1 ? 'kalah1' : 'kalah2')} — ${displayName(player)}`;
  $(`#${position}-store-count`).textContent = count;
  renderSeeds($(`#${position}-store-seeds`), count, store);
  const resign = $(`#${position}-resign`);
  resign.dataset.player = String(player);
  resign.textContent = text('resign');
  resign.setAttribute('aria-label', text('resignPlayer', { name: displayName(player) }));
  resign.hidden = game.gameOver || !isHuman(player);
  resign.disabled = lifecycle.loading || uiAnimating;
}

function renderSeeds(container, count, position) {
  const visible = Math.min(count, 18);
  const size = count <= 4 ? 'large' : count <= 8 ? 'medium' : count <= 14 ? 'small' : 'compact';
  container.classList.remove('seeds-large', 'seeds-medium', 'seeds-small', 'seeds-compact');
  container.classList.add(`seeds-${size}`);
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < visible; index += 1) {
    const seed = document.createElement('span');
    seed.className = `seed tone-${(position * 5 + index * 3) % 6}`;
    fragment.append(seed);
  }
  container.replaceChildren(fragment);
}

async function resignPlayer(player) {
  if (!game || game.gameOver || !isHuman(player)) return;
  if (!confirm(text('resignConfirm', { name: displayName(player) }))) return;
  beginSessionChange();
  game.resign(player);
  lifecycle.finishReplacement();
  const generation = lifecycle.capture();
  completeIfNeeded();
  uiAnimating = true;
  render();
  await boardAnimator.animateResult({
    generation,
    kind: resultAnimationKind(game.winner),
    onStart: () => audio.playResignOutcome(game, match),
  });
  if (!lifecycle.isCurrent(generation)) return;
  uiAnimating = false;
  render();
  showResultDialog(generation, match.matchId);
}

function hydrateLoadedMatch() {
  match.humanPlayer = match.humanPlayer ?? 1;
  match.aiPlayer = match.aiPlayer ?? 2;
  if (typeof match.player1IsDefault !== 'boolean') match.player1IsDefault = isKnownDefaultName(match.player1, 'player1');
  if (match.mode === 'pvp' && typeof match.player2IsDefault !== 'boolean') match.player2IsDefault = isKnownDefaultName(match.player2, 'player2');
  if (match.mode === 'ai') match.player2IsSystemAI = true;
  if (match.player1IsDefault) match.player1 = text('player1');
  if (match.player2IsDefault) match.player2 = text('player2');
  if (match.player2IsSystemAI) match.player2 = aiDisplayName();
}

function openModal(title, renderContent) {
  resultDialog.prepareStandard(text('close'));
  modalContent.replaceChildren();
  const h2 = document.createElement('h2');
  h2.textContent = title;
  modalContent.append(h2);
  renderContent(modalContent);
  if (!modal.open) modal.showModal();
}

function showSlots() {
  openModal(text('slots'), (container) => getSlots(storage).forEach(({ slot, save }) => {
    const row = document.createElement('div'); row.className = 'slot'; const info = document.createElement('div');
    if (!save) info.textContent = `${slot}. ${text('empty')}`;
    else {
      const storedPlayer1 = localizedStoredName(save.match, 1); const storedPlayer2 = localizedStoredName(save.match, 2);
      const title = document.createElement('strong'); title.textContent = `${slot}. ${storedPlayer1} — ${storedPlayer2}`;
      const difficulty = save.match.mode === 'ai' ? ` · ${text('difficulty')}: ${difficultyLabel(save.match.aiDifficulty)}` : '';
      const description = document.createElement('p'); description.textContent = `${new Date(save.savedAt).toLocaleString()} · ${text(save.match.mode)}${difficulty} · ${text('turn')}: ${save.game.currentPlayer === 1 ? storedPlayer1 : storedPlayer2} · ${save.game.board[6]}:${save.game.board[13]}`;
      info.append(title, description);
    }
    const action = document.createElement('button'); action.textContent = save ? text('load') : text('empty'); action.disabled = !save;
    action.addEventListener('click', () => {
      beginSessionChange();
      const payload = loadSlot(storage, slot);
      if (!payload) { lifecycle.finishReplacement(); render(); scheduleAiIfNeeded(); return; }
      const restored = restoreRuntimeSnapshot(payload);
      ({ game, match, statistics } = restored);
      hydrateLoadedMatch(); renderedOrientation = null;
      $('#setup').hidden = true; $('#game-area').hidden = false; modal.close();
      render();
      lifecycle.finishReplacement();
      render();
      scheduleAiIfNeeded();
    });
    const clear = document.createElement('button'); clear.textContent = text('delete'); clear.disabled = !save;
    clear.addEventListener('click', () => { clearSlot(storage, slot); showSlots(); });
    row.append(info, action, clear); container.append(row);
  }));
}

function saveGame() {
  if (!game || game.gameOver || uiAnimating || lifecycle.loading) return;
  openModal(text('slots'), (container) => getSlots(storage).forEach(({ slot, save }) => {
    const row = document.createElement('div'); row.className = 'slot';
    const label = document.createElement('div'); label.textContent = `${slot}. ${save ? `${localizedStoredName(save.match, 1)} — ${localizedStoredName(save.match, 2)}` : text('empty')}`;
    const button = document.createElement('button'); button.textContent = save ? text('overwrite') : text('save');
    button.addEventListener('click', () => { if (!save || confirm(`${text('overwrite')}?`)) { saveSlot(storage, slot, createSave(match, game, statistics)); modal.close(); $('#status').textContent = text('saved'); } });
    row.append(label, button); container.append(row);
  }));
}

function showRules() { openModal(text('rules'), (container) => { const p = document.createElement('p'); p.textContent = text('helpText'); container.append(p); }); }
function persistApplicationSettings() {
  const settings = audio.getSettings();
  saveSettings(storage, {
    soundEnabled: settings.enabled,
    volume: Math.round(settings.volume * 100),
    ...animationSettings,
  });
}
function showSettings() {
  openModal(text('settings'), (container) => {
    const heading = document.createElement('h3'); heading.textContent = text('sound');
    const enableLabel = document.createElement('label'); enableLabel.className = 'settings-check';
    const enable = document.createElement('input'); enable.type = 'checkbox'; enable.checked = audio.enabled;
    const enableText = document.createElement('span'); enableText.textContent = text('enableSound');
    enableLabel.append(enable, enableText);
    const volumeLabel = document.createElement('label'); volumeLabel.className = 'settings-volume';
    const volumeText = document.createElement('span'); volumeText.textContent = text('volume');
    const volume = document.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '100'; volume.step = '1'; volume.value = String(Math.round(audio.volume * 100));
    const output = document.createElement('output'); output.value = `${volume.value}%`; output.textContent = `${volume.value}%`;
    volume.setAttribute('aria-label', text('volume'));
    volumeLabel.append(volumeText, volume, output);
    const animationHeading = document.createElement('h3'); animationHeading.textContent = text('animation');
    const animationLabel = document.createElement('label'); animationLabel.className = 'settings-check settings-toggle';
    const animationEnabled = document.createElement('input'); animationEnabled.type = 'checkbox'; animationEnabled.checked = animationSettings.animationEnabled;
    const animationText = document.createElement('span'); animationText.textContent = text('animation');
    const animationState = document.createElement('output'); animationState.className = 'settings-state';
    const speedLabel = document.createElement('label'); speedLabel.className = 'settings-volume';
    const speedText = document.createElement('span'); speedText.textContent = text('animationSpeed');
    const speed = document.createElement('input'); speed.type = 'range'; speed.min = '25'; speed.max = '200'; speed.step = '5'; speed.value = String(Math.round(animationSettings.animationSpeed * 100));
    const speedOutput = document.createElement('output'); speedOutput.value = `${speed.value}%`; speedOutput.textContent = `${speed.value}%`;
    speed.setAttribute('aria-label', text('animationSpeed'));
    const syncAnimationControls = () => {
      animationState.value = animationEnabled.checked ? text('on') : text('off');
      animationState.textContent = animationState.value;
      speed.disabled = !animationEnabled.checked;
    };
    animationLabel.append(animationEnabled, animationText, animationState);
    speedLabel.append(speedText, speed, speedOutput);
    syncAnimationControls();
    enable.addEventListener('change', () => { audio.setEnabled(enable.checked); persistApplicationSettings(); if (enable.checked) { audio.unlock(); audio.play(AUDIO_EVENTS.BUTTON_CLICK); } });
    volume.addEventListener('input', () => { audio.setVolume(Number(volume.value) / 100); output.value = `${volume.value}%`; output.textContent = `${volume.value}%`; persistApplicationSettings(); });
    animationEnabled.addEventListener('change', () => {
      animationSettings.animationEnabled = animationEnabled.checked;
      syncAnimationControls();
      persistApplicationSettings();
    });
    speed.addEventListener('input', () => {
      animationSettings.animationSpeed = Number(speed.value) / 100;
      speedOutput.value = `${speed.value}%`;
      speedOutput.textContent = `${speed.value}%`;
      persistApplicationSettings();
    });
    container.append(heading, enableLabel, volumeLabel, animationHeading, animationLabel, speedLabel);
  });
}
function showStatistics() {
  const history = getHistory(storage); const totals = aggregateHistory(history);
  openModal(text('statistics'), (container) => {
    const grid = document.createElement('div'); grid.className = 'stats-grid';
    for (const [key, value] of [[text('totalGames'), totals.games], [text('wins'), totals.wins], [text('losses'), totals.losses], [text('draws'), totals.draws], [text('winRate'), `${totals.winRate}%`], [text('avgMoves'), totals.averageMoves], [text('avgCaptures'), totals.averageCaptures], [text('avgCaptured'), totals.averageCapturedStones], [text('avgStore'), totals.averageStoreFinishes], [text('maxCapture'), totals.largestCapture], [text('maxExtra'), totals.maxExtraTurnStreak]]) {
      const item = document.createElement('div'); item.className = 'stat'; const b = document.createElement('b'); b.textContent = value; const label = document.createElement('span'); label.textContent = key; item.append(b, label); grid.append(item);
    }
    container.append(grid); const h = document.createElement('h3'); h.textContent = text('history'); container.append(h); const list = document.createElement('ul'); list.className = 'history';
    if (!history.length) { const li = document.createElement('li'); li.textContent = text('noHistory'); list.append(li); }
    history.forEach((entry) => { const li = document.createElement('li'); const p1 = entry.players[1]; const p2 = entry.players[2]; li.textContent = `${new Date(entry.completedAt).toLocaleString()} — ${localizedStoredName(entry, 1)} / ${localizedStoredName(entry, 2)}: ${entry.stores[0]}:${entry.stores[1]} (${endReasonLabel(entry.endReason)}). ${text('moves')}: ${p1.moves}/${p2.moves}; ${text('captures')}: ${p1.captures}/${p2.captures}; ${text('capturedStones')}: ${p1.capturedStones}/${p2.capturedStones}.`; list.append(li); });
    container.append(list);
    const difficulties = Object.entries(totals.byDifficulty);
    if (difficulties.length) {
      const hDifficulty = document.createElement('h3'); hDifficulty.textContent = text('difficultyStats'); container.append(hDifficulty);
      const difficultyList = document.createElement('ul'); difficultyList.className = 'history';
      difficulties.forEach(([difficulty, value]) => { const li = document.createElement('li'); li.textContent = `${difficultyLabel(difficulty)}: ${value.games}; ${text('wins')}: ${value.wins}; ${text('losses')}: ${value.losses}; ${text('draws')}: ${value.draws}.`; difficultyList.append(li); });
      container.append(difficultyList);
    }
  });
}

$('#player1').addEventListener('input', (event) => setCustomName(nameFields[1], event.target.value));
$('#player2').addEventListener('input', (event) => setCustomName(nameFields[2], event.target.value));
$('#language').addEventListener('change', (event) => { i18n.setLanguage(event.target.value); localStorage.setItem('kalah:v1:language', i18n.language); applyLanguage(); });
mode.addEventListener('change', toggleMode);
$('#start').addEventListener('click', startGame);
$('#save').addEventListener('click', saveGame);
$('#load').addEventListener('click', showSlots);
$('#rules').addEventListener('click', showRules);
$('#statistics').addEventListener('click', showStatistics);
$('#settings').addEventListener('click', showSettings);
$('#new-game').addEventListener('click', () => { if (!game || game.gameOver || confirm(text('activeGame'))) { beginSessionChange(); $('#game-area').hidden = true; $('#setup').hidden = false; lifecycle.finishReplacement(); } });
$('#top-resign').addEventListener('click', (event) => resignPlayer(Number(event.currentTarget.dataset.player)));
$('#bottom-resign').addEventListener('click', (event) => resignPlayer(Number(event.currentTarget.dataset.player)));
document.addEventListener('pointerdown', () => { audio.unlock(); }, { passive: true });
document.addEventListener('click', (event) => {
  audio.unlock();
  const button = event.target.closest?.('button');
  if (!button || button.disabled || button.matches('.pit, .resign-button')) return;
  audio.play(AUDIO_EVENTS.BUTTON_CLICK);
});
if ('serviceWorker' in navigator) {
  let reloadingForServiceWorkerUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForServiceWorkerUpdate) return;
    reloadingForServiceWorkerUpdate = true;
    window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((registration) => registration.update()).catch(() => {});
}
toggleMode();
applyLanguage();
