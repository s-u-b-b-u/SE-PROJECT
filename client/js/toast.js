/**
 * toast.js — Toast notification system
 * Bikers Portal shared module
 *
 * Exports:
 *   showToast(message, duration)        — raw function
 *   toast.success(msg) / .error(msg) / .info(msg) / .show(msg, dur)
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
  const toastEl = document.createElement('div');
  toastEl.className = TOAST_CLASS;
  toastEl.textContent = message;
  region.appendChild(toastEl);

  // Force a reflow so the initial state is painted before any enter-animation
  void toastEl.offsetHeight;

  // Schedule removal: add .leaving LEAVE_TRANSITION_MS before the DOM removal
  const removeTimer = setTimeout(() => {
    toastEl.classList.add(LEAVING_CLASS);
    setTimeout(() => {
      toastEl.remove();
    }, LEAVE_TRANSITION_MS);
  }, duration - LEAVE_TRANSITION_MS);

  // Allow the toast to be dismissed early by clicking it.
  toastEl.addEventListener('click', () => {
    clearTimeout(removeTimer);
    toastEl.classList.add(LEAVING_CLASS);
    setTimeout(() => toastEl.remove(), LEAVE_TRANSITION_MS);
  });
}

/**
 * Convenience object for semantic toast calls:
 *   toast.success('Ride published!')
 *   toast.error('Something went wrong.')
 *   toast.info('Trip closed.')
 *   toast.show('Any message', 5000)
 */
export const toast = {
  success(message, duration = 3500) {
    showToast(message, duration);
  },
  error(message, duration = 4500) {
    showToast(message, duration);
  },
  info(message, duration = 3500) {
    showToast(message, duration);
  },
  show(message, duration = 3500) {
    showToast(message, duration);
  },
};

export default toast;
