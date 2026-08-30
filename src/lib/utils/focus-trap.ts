/**
 * Svelte action that traps keyboard focus within a container element.
 * Implements the WAI-ARIA dialog focus trapping pattern.
 *
 * Usage:
 *   <div use:focusTrap={{ onEscape: onClose }}>
 *     <!-- dialog content -->
 *   </div>
 */

interface FocusTrapOptions {
  /** Called when Escape is pressed inside the trap */
  onEscape?: () => void;
  /** Element to focus when trap activates. Defaults to first focusable element. */
  initialFocus?: HTMLElement;
  /** Whether to restore focus to the previously focused element on destroy */
  restoreFocus?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.closest('[aria-hidden="true"]'),
  ) as HTMLElement[];
}

export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
  let { onEscape, initialFocus, restoreFocus = true } = options;
  let previousFocus: HTMLElement | null = null;

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape?.();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(node);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first || document.activeElement === node) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function activate() {
    previousFocus = document.activeElement as HTMLElement;

    node.addEventListener('keydown', handleKeydown);

    // Set initial focus
    if (initialFocus) {
      initialFocus.focus();
    } else {
      const focusable = getFocusableElements(node);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        node.focus();
      }
    }
  }

  function deactivate() {
    node.removeEventListener('keydown', handleKeydown);

    if (restoreFocus && previousFocus) {
      previousFocus.focus();
      previousFocus = null;
    }
  }

  // Activate on mount
  activate();

  return {
    update(newOptions: FocusTrapOptions) {
      onEscape = newOptions.onEscape;
      initialFocus = newOptions.initialFocus;
      restoreFocus = newOptions.restoreFocus ?? true;
    },
    destroy() {
      deactivate();
    },
  };
}
