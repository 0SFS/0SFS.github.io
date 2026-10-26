let helpCount = 0;
const openHelpByDocument = new WeakMap();
/** A collapsing/removing panel closes its own explanation without affecting another panel. */
export function closeHelpTooltipWithin(container) {
    const document = container.ownerDocument ?? container;
    const opened = openHelpByDocument.get(document);
    if (opened && container.contains(opened.button))
        opened.close();
}
/**
 * A click/keyboard explanation that uses the top layer where available. The
 * fallback leaves the panel while open, so clipping never hides its text. A
 * caller may move button and content into separate row locations before opening;
 * closing restores the content to that exact home without reflowing the panel.
 */
export function createHelpTooltip(options) {
    const document = options.content.ownerDocument;
    // A report built in a document without a view is still complete; it opens once shown in one.
    const window = document.defaultView;
    const element = document.createElement("span");
    element.className = "foss-earth-help-tooltip";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "foss-earth-choice foss-earth-parameter__action foss-earth-parameter__icon-action foss-earth-parameter__help-button";
    button.textContent = "?";
    button.setAttribute("aria-label", options.label);
    button.setAttribute("aria-expanded", "false");
    button.title = options.label;
    const content = options.content;
    content.classList.add("foss-earth-parameter__help");
    content.id = `foss-earth-parameter-help-${++helpCount}`;
    content.setAttribute("role", "tooltip");
    content.hidden = true;
    const nativePopover = typeof content.showPopover === "function" && typeof content.hidePopover === "function";
    if (nativePopover)
        content.setAttribute("popover", "manual");
    button.setAttribute("aria-controls", content.id);
    element.append(button, content);
    let home = null;
    let destroyed = false;
    let opened = false;
    const position = () => {
        if (!opened || !window)
            return;
        const anchor = button.getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft ?? 0;
        const top = viewport?.offsetTop ?? 0;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        content.style.maxWidth = `${Math.max(0, width - 16)}px`;
        content.style.maxHeight = `${Math.max(0, height - 16)}px`;
        const box = content.getBoundingClientRect();
        content.style.left = `${Math.max(left + 8, Math.min(anchor.left, left + width - box.width - 8))}px`;
        content.style.top = `${Math.max(top + 8, Math.min(anchor.bottom + 6, top + height - box.height - 8))}px`;
    };
    const close = () => {
        if (!opened)
            return;
        opened = false;
        if (nativePopover && content.isConnected && content.matches(":popover-open"))
            content.hidePopover();
        content.hidden = true;
        if (home?.parentNode)
            home.after(content);
        home?.remove();
        home = null;
        button.setAttribute("aria-expanded", "false");
        button.removeAttribute("aria-describedby");
        document.removeEventListener("pointerdown", onOutside);
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("scroll", position, true);
        window?.removeEventListener("resize", position);
        window?.visualViewport?.removeEventListener("resize", position);
        window?.visualViewport?.removeEventListener("scroll", position);
        if (openHelpByDocument.get(document)?.close === close)
            openHelpByDocument.delete(document);
    };
    const open = () => {
        if (destroyed || opened || !window)
            return;
        openHelpByDocument.get(document)?.close();
        options.onOpen?.();
        // Capture the caller's current home, including a relocated settings row.
        home = document.createComment("help content home");
        content.before(home);
        if (!nativePopover || !content.isConnected)
            document.body.append(content);
        content.hidden = false;
        if (nativePopover)
            content.showPopover();
        opened = true;
        button.setAttribute("aria-expanded", "true");
        button.setAttribute("aria-describedby", content.id);
        openHelpByDocument.set(document, { close, button });
        position();
        document.addEventListener("pointerdown", onOutside);
        document.addEventListener("keydown", onKey, true);
        document.addEventListener("scroll", position, true);
        window.addEventListener("resize", position);
        window.visualViewport?.addEventListener("resize", position);
        window.visualViewport?.addEventListener("scroll", position);
    };
    const onHelp = () => { if (opened)
        close();
    else
        open(); };
    const onOutside = (event) => {
        const target = event.target;
        if (target?.nodeType && !button.contains(target) && !content.contains(target))
            close();
    };
    const onKey = (event) => {
        if (event.key === "Escape") {
            close();
            event.preventDefault();
            event.stopPropagation();
        }
    };
    const onPopoverToggle = () => {
        if (nativePopover && opened && !content.matches(":popover-open"))
            close();
    };
    button.addEventListener("click", onHelp);
    content.addEventListener("toggle", onPopoverToggle);
    return {
        element, button, content, open, close,
        destroy() {
            if (destroyed)
                return;
            close();
            destroyed = true;
            button.removeEventListener("click", onHelp);
            content.removeEventListener("toggle", onPopoverToggle);
            button.remove();
            content.remove();
            element.remove();
        },
    };
}
