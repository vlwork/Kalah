export class AppDialogController {
  constructor({
    dialog,
    titleElement,
    messageElement,
    confirmButton,
    cancelButton,
    translate,
    documentRoot = document,
    fallbackFocus,
  }) {
    this.dialog = dialog;
    this.titleElement = titleElement;
    this.messageElement = messageElement;
    this.confirmButton = confirmButton;
    this.cancelButton = cancelButton;
    this.translate = translate;
    this.documentRoot = documentRoot;
    this.fallbackFocus = fallbackFocus;
    this.active = null;

    this.confirmButton.addEventListener('click', () => this.settle(true));
    this.cancelButton.addEventListener('click', () => this.settle(false));
    this.dialog.addEventListener('cancel', (event) => {
      if (!this.active) return;
      event.preventDefault();
      if (this.active.allowEscape) this.settle(this.active.kind === 'info');
    });
    this.dialog.addEventListener('close', () => {
      if (!this.active || this.dialog.open) return;
      this.settle(this.active.kind === 'info', { closeDialog: false });
    });
  }

  ask(options) {
    return this.open({ ...options, kind: 'confirm', variant: options.variant ?? 'confirm' });
  }

  warn(options) {
    return this.open({ ...options, kind: 'confirm', variant: 'warning' });
  }

  async info(options) {
    await this.open({ ...options, kind: 'info', variant: 'info' });
  }

  open(options) {
    const returnFocus = this.active?.returnFocus ?? this.documentRoot.activeElement;
    if (this.active) this.settle(false, { restoreFocus: false });

    let resolve;
    const promise = new Promise((complete) => { resolve = complete; });
    this.active = {
      options,
      kind: options.kind,
      allowEscape: options.allowEscape !== false,
      returnFocus,
      resolve,
    };
    this.renderActive();
    if (!this.dialog.open) this.dialog.showModal();
    const focusTarget = options.variant === 'warning' && options.kind !== 'info'
      ? this.cancelButton
      : this.confirmButton;
    focusTarget.focus();
    return promise;
  }

  renderActive() {
    if (!this.active) return false;
    const { options, kind } = this.active;
    this.dialog.dataset.variant = options.variant;
    this.titleElement.textContent = this.translate(options.titleKey, options.titleParameters);
    this.messageElement.textContent = options.messageKey
      ? this.translate(options.messageKey, options.messageParameters)
      : '';
    this.messageElement.hidden = !options.messageKey;
    this.confirmButton.textContent = this.translate(options.confirmLabelKey, options.confirmLabelParameters);
    this.confirmButton.className = options.variant === 'warning' ? 'danger' : 'primary';
    this.cancelButton.hidden = kind === 'info';
    if (kind !== 'info') {
      this.cancelButton.textContent = this.translate(options.cancelLabelKey, options.cancelLabelParameters);
    }
    return true;
  }

  refresh() {
    return this.renderActive();
  }

  settle(value, { closeDialog = true, restoreFocus = true } = {}) {
    if (!this.active) return false;
    const active = this.active;
    this.active = null;
    if (closeDialog && this.dialog.open) this.dialog.close();
    if (restoreFocus) {
      const canRestore = active.returnFocus?.isConnected && active.returnFocus !== this.documentRoot.body;
      const focusTarget = canRestore ? active.returnFocus : this.fallbackFocus?.();
      focusTarget?.focus?.();
    }
    active.resolve(Boolean(value));
    return true;
  }

  invalidate() {
    return this.settle(false);
  }
}

export async function runConfirmedAction({ request, isCurrent = () => true, action }) {
  const accepted = await request();
  if (!accepted || !isCurrent()) return false;
  await action();
  return true;
}
