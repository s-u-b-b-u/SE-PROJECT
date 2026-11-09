/**
 * toast.js — Toast notification system
 * Bikers Portal shared module
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGION_CLASS = 'toast-region';
const TOAST_CLASS = 'toast';
const LEAVING_CLASS = 'leaving';
const LEAVE_TRANSITION_MS = 150; // matches CSS transition duration

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns (and lazily creates) the ARIA live region that holds all toasts. */
function getRegion() {
  let region = document.querySelector(`.${REGION_CLASS}`);
  if (!region) {
    region = document.createElement('div');
    region.className = REGION_CLASS;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'false');
    document.body.appendChild(region);
  }
  return region;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Displays a toast notification.
 *
 * @param {string} message   — The text to display.
 * @param {number} [duration=3500] — How long (ms) to show the toast before it fades out.
 */
export function showToast(message, duration = 3500) {
  const region = getRegion();

  // Create toast element
  const toast = document.createElement('div');
  toast.className = TOAST_CLASS;
  toast.textContent = message;
  region.appendChild(toast);

  // Force a reflow so the initial state is painted before we start any
  // enter-animation (if CSS handles it via e.g. opacity transition).
  void toast.offsetHeight;

  // Schedule removal: add .leaving LEAVE_TRANSITION_MS before the DOM removal
  // so CSS can animate the exit transition.
  const removeTimer = setTimeout(() => {
    toast.classList.add(LEAVING_CLASS);

    setTimeout(() => {
      toast.remove();
    }, LEAVE_TRANSITION_MS);
  }, duration - LEAVE_TRANSITION_MS);

  // Allow the toast to be dismissed early by clicking it.
  toast.addEventListener('click', () => {
    clearTimeout(removeTimer);
    toast.classList.add(LEAVING_CLASS);
    setTimeout(() => toast.remove(), LEAVE_TRANSITION_MS);
  });
}
