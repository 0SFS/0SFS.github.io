export interface SettingsModalHandle {
  show(): void;
  hide(): void;
  setRendererMode(mode: string): void;
  destroy(): void;
}

export function createSettingsModal(modal: HTMLElement): SettingsModalHandle {
  const dismissBtn = modal.querySelector<HTMLButtonElement>("#settingsModalDismiss");
  const rendererLine = modal.querySelector<HTMLElement>("#settingsRendererLine");

  function show(): void {
    modal.hidden = false;
  }

  function hide(): void {
    modal.hidden = true;
  }

  function setRendererMode(mode: string): void {
    if (rendererLine) {
      rendererLine.textContent = `Renderer: ${mode}`;
    }
  }

  function onOverlayClick(e: MouseEvent): void {
    if (e.target === modal) hide();
  }

  modal.addEventListener("click", onOverlayClick);
  dismissBtn?.addEventListener("click", hide);

  function destroy(): void {
    modal.removeEventListener("click", onOverlayClick);
    dismissBtn?.removeEventListener("click", hide);
  }

  return { show, hide, setRendererMode, destroy };
}
