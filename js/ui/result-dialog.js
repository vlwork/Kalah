import { opponentOf } from '../core/game.js';

export function createResultPresentation({ game, match, text }) {
  const draw = game.winner === 0;
  let title;
  if (draw) title = text('draw');
  else if (match.mode === 'pvp') title = text('playerWins', { name: game.winner === 1 ? match.player1 : match.player2 });
  else title = game.winner === match.humanPlayer ? text('resultVictory') : text('resultDefeat');

  let detail = '';
  if (game.endReason === 'resign' && !draw) {
    const resignedPlayer = opponentOf(game.winner);
    if (match.mode === 'ai' && resignedPlayer === match.aiPlayer) detail = text('computerResigned');
    else if (match.mode === 'ai' && resignedPlayer === match.humanPlayer) detail = text('youResigned');
    else detail = text('playerResigned', { name: resignedPlayer === 1 ? match.player1 : match.player2 });
  }

  return {
    title,
    detail,
    scores: [
      { name: match.player1, score: game.board[6] },
      { name: match.player2, score: game.board[13] },
    ],
    actionLabel: text('ok'),
  };
}

export class ResultDialogController {
  constructor({ dialog, content, actionButton, documentRoot = document, isCurrent, getMatchId, fallbackFocus }) {
    this.dialog = dialog;
    this.content = content;
    this.actionButton = actionButton;
    this.documentRoot = documentRoot;
    this.isCurrent = isCurrent;
    this.getMatchId = getMatchId;
    this.fallbackFocus = fallbackFocus;
    this.active = null;
    this.returnFocus = null;
    this.actionButton.addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', (event) => {
      if (this.active) event.preventDefault();
    });
  }

  prepareStandard(actionLabel) {
    this.active = null;
    this.returnFocus = this.documentRoot.activeElement;
    this.actionButton.textContent = actionLabel;
    this.actionButton.removeAttribute('data-result-action');
  }

  show({ generation, matchId, presentation }) {
    if (!this.isCurrent(generation) || matchId !== this.getMatchId()) return false;
    if (this.active?.generation === generation && this.active?.matchId === matchId && this.dialog.open) return false;
    this.returnFocus = this.documentRoot.activeElement;
    this.content.replaceChildren();
    const title = this.documentRoot.createElement('h2');
    title.textContent = presentation.title;
    this.content.append(title);
    if (presentation.detail) {
      const detail = this.documentRoot.createElement('p');
      detail.className = 'result-detail';
      detail.textContent = presentation.detail;
      this.content.append(detail);
    }
    const scores = this.documentRoot.createElement('dl');
    scores.className = 'result-score';
    for (const item of presentation.scores) {
      const row = this.documentRoot.createElement('div');
      const name = this.documentRoot.createElement('dt'); name.textContent = item.name;
      const score = this.documentRoot.createElement('dd'); score.textContent = String(item.score);
      row.append(name, score); scores.append(row);
    }
    this.content.append(scores);
    this.actionButton.textContent = presentation.actionLabel;
    this.actionButton.setAttribute('data-result-action', 'true');
    this.active = { generation, matchId };
    if (!this.dialog.open) this.dialog.showModal();
    this.actionButton.focus();
    return true;
  }

  close() {
    if (!this.dialog.open) return false;
    this.dialog.close();
    const canRestore = this.returnFocus?.isConnected && this.returnFocus !== this.documentRoot.body;
    const focusTarget = canRestore ? this.returnFocus : this.fallbackFocus?.();
    this.active = null;
    this.returnFocus = null;
    focusTarget?.focus?.();
    return true;
  }

  invalidate() {
    if (this.active && this.dialog.open) this.close();
    this.active = null;
  }
}
