export interface HelpModalHandle {
  show(): void;
  hide(): void;
  destroy(): void;
}

export function createHelpModal(modal: HTMLElement): HelpModalHandle {
  const dismissBtn = modal.querySelector<HTMLButtonElement>("#helpModalDismiss");

  function show(): void {
    modal.hidden = false;
  }

  function hide(): void {
    modal.hidden = true;
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

  return { show, hide, destroy };
}
