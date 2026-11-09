/**
 * modal.js — Modal dialog management
 * Bikers Portal shared module
 */

// ---------------------------------------------------------------------------
// Modal class — wraps an existing #id element in the DOM
// ---------------------------------------------------------------------------

export class Modal {
  /**
   * @param {string} id — The id of the modal root element (without #).
   */
  constructor(id) {
    this.el = document.getElementById(id);
    if (!this.el) {
      throw new Error(`Modal: element #${id} not found`);
    }

    // The modal body is the first element with [data-modal-body], or the
    // element itself if none is found (allows simple wrappers).
    this._body = this.el.querySelector('[data-modal-body]') || this.el;

    // Close when clicking the overlay backdrop (the root element itself,
    // not any of its children).
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });

    // Close on Escape key — only while this modal is visible.
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
  }

  /** Opens the modal. */
  open() {
    this.el.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this._keyHandler);

    // Move focus into the modal for keyboard/screen-reader users.
    const focusable = this.el.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) focusable.focus();
  }

  /** Closes the modal. */
  close() {
    this.el.setAttribute('hidden', '');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this._keyHandler);
  }

  /**
   * Replaces the content of the modal body.
   * @param {string} html — innerHTML to inject.
   */
  setContent(html) {
    this._body.innerHTML = html;
  }
}

// ---------------------------------------------------------------------------
// createModal — programmatically build a modal overlay and return a controller
// ---------------------------------------------------------------------------

/**
 * Creates a full-screen modal overlay, appends it to <body>, and returns a
 * Modal-compatible controller object with open() / close() / setContent().
 *
 * @param {string} title       — Heading text shown at the top of the modal panel.
 * @param {string} contentHtml — HTML string for the scrollable body area.
 * @param {string} [footerHtml=''] — HTML string for the sticky footer (e.g. action buttons).
 * @returns {{ open: Function, close: Function, setContent: Function, el: HTMLElement }}
 */
export function createModal(title, contentHtml, footerHtml = '') {
  // Build the overlay + inner panel
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('hidden', '');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';

  const heading = document.createElement('h2');
  heading.className = 'modal-title';
  heading.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  // ✕ using an SVG-less inline text so there's zero dependency
  closeBtn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';

  header.appendChild(heading);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'modal-body';
  body.setAttribute('data-modal-body', '');
  body.innerHTML = contentHtml;

  // Footer (optional)
  let footer = null;
  if (footerHtml) {
    footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.innerHTML = footerHtml;
  }

  // Assemble
  panel.appendChild(header);
  panel.appendChild(body);
  if (footer) panel.appendChild(footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Key handler reference for cleanup
  const keyHandler = (e) => {
    if (e.key === 'Escape') controller.close();
  };

  const controller = {
    el: overlay,

    open() {
      overlay.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', keyHandler);
      // Focus close button for keyboard users
      closeBtn.focus();
    },

    close() {
      overlay.setAttribute('hidden', '');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', keyHandler);
    },

    /** Replace the scrollable body content. */
    setContent(html) {
      body.innerHTML = html;
    },

    /** Removes the modal from the DOM entirely. */
    destroy() {
      controller.close();
      overlay.remove();
    },
  };

  // Wire up close button and overlay-backdrop click
  closeBtn.addEventListener('click', () => controller.close());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) controller.close();
  });

  return controller;
}
