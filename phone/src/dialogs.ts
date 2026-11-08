import { useEffect } from "react";

// One focus boundary for every product modal, including a nested rename sheet.
export function useDialogFocus(): void {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let invoked: HTMLElement | null = null;
    const previous = new Map<HTMLElement, HTMLElement | null>();
    const top = (): HTMLElement | null =>
      Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).at(
        -1,
      ) || null;
    const focusable = (dialog: HTMLElement): HTMLElement[] =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ).filter((node) => node.getClientRects().length > 0);
    const update = (): void => {
      const next = top();
      if (next === current) return;
      if (current && !current.isConnected) {
        previous.get(current)?.focus({ preventScroll: true });
        previous.delete(current);
      }
      current = next;
      if (current && !previous.has(current)) {
        previous.set(
          current,
          invoked?.isConnected
            ? invoked
            : document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null,
        );
        if (!current.contains(document.activeElement))
          (
            current.querySelector<HTMLElement>("[autofocus]") ||
            focusable(current)[0]
          )?.focus({ preventScroll: true });
      }
    };
    const key = (event: KeyboardEvent): void => {
      const dialog = top();
      if (!dialog) {
        if (event.key === "Escape")
          document.querySelectorAll<HTMLDetailsElement>(".conversation-menu[open],.retry-menu[open]").forEach((menu) => { menu.open = false; });
        return;
      }
      const nodes = focusable(dialog),
        first = nodes[0],
        last = nodes.at(-1);
      if (event.key === "Escape") {
        const close = nodes.find((node) =>
          /^(关闭|取消)/.test(
            node.getAttribute("aria-label") || node.textContent || "",
          ),
        );
        if (close) {
          event.preventDefault();
          event.stopPropagation();
          close.click();
        }
      }
      if (
        event.key === "Tab" &&
        first &&
        last &&
        (event.shiftKey
          ? document.activeElement === first ||
            !dialog.contains(document.activeElement)
          : document.activeElement === last ||
            !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const invoke = (event: MouseEvent): void => {
      invoked =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("button,a,summary")
          : null;
      for (const menu of document.querySelectorAll<HTMLDetailsElement>(".conversation-menu[open],.retry-menu[open]"))
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", key, true);
    document.addEventListener("click", invoke, true);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("click", invoke, true);
    };
  }, []);
}
