"use client";

import { useEffect, useRef } from "react";

/** Modal keyboard behaviour, in one place (KCDX-066).
 *
 *  The dialogs across the app each got some of this and none got all of it.
 *  `join-waitlist-dialog.tsx` has `role="dialog"`, `aria-modal` and a label —
 *  which is more than the finding credits it with — but no focus trap, no focus
 *  restore, and no Escape. `staff-actions-log.tsx` has less.
 *
 *  The three things that matter, and why each is not optional:
 *
 *  **Trap.** `aria-modal="true"` tells a screen reader the rest of the page is
 *  inert. It does not make it so. Without a trap, Tab walks out of the dialog
 *  and into the page behind it, where the user is now operating controls they
 *  cannot see while their screen reader insists they are in a modal.
 *
 *  **Restore.** When a dialog closes, focus goes back to `document.body` unless
 *  something puts it back. For a keyboard user that is not a small annoyance:
 *  they lose their place entirely and start again from the top of the document,
 *  every time they open and close anything.
 *
 *  **Escape.** Expected everywhere, and the only exit that does not require
 *  finding the close button first.
 *
 *  Deliberately a hook rather than a `<Dialog>` component: the dialogs here have
 *  quite different layouts and wrapping them would mean rewriting all of them at
 *  once. A hook can be adopted one at a time, which is how this actually gets
 *  finished rather than half-started.
 */
export function useDialogA11y(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Remember where focus was BEFORE we move it, so closing can put it back.
    restoreTo.current = (document.activeElement as HTMLElement | null) ?? null;

    const node = ref.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Move focus in. The first focusable is usually the close button, which is a
    // reasonable landing place; if there is nothing focusable, focus the dialog
    // itself so the screen reader announces it.
    const first = focusables()[0];
    if (first) first.focus();
    else node?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends. Without this, Tab past the last control leaves the
      // dialog for the page behind it.
      if (e.shiftKey && (active === firstEl || !node?.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Restore on the way out, and only if the element is still in the document
      // — a dialog that closed because its trigger was removed should not throw.
      const target = restoreTo.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [open, onClose]);

  return ref;
}
