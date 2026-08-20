/* Toasts and notifications, callable from anywhere.
 *
 * ProductLayer has had a toast container and a notification centre since the
 * beginning — styled, positioned, with role="status" and aria-live="polite"
 * already on the container. Both were unreachable: the only way in was
 * useProduct(), and nothing in the codebase called it. So the bell opened a
 * panel that could only ever say "No notifications yet", and every error in the
 * product went through a blocking window.alert() instead.
 *
 * These dispatch window events rather than exposing the hook, for three
 * reasons: non-component code can call them (the axios interceptor, the hooks),
 * components importing them stay renderable in isolation without a provider,
 * and it is one import line per file instead of a hook call in every component.
 *
 * toast   transient, disappears on its own. For the outcome of something the
 *         user just did — they are looking at the screen.
 * notify  persists in the bell until read. For something that finished while
 *         they were elsewhere.
 */

export const TOAST_EVENT = 'resumate:toast';
export const NOTIFY_EVENT = 'resumate:notify';

function dispatch(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // No CustomEvent, or no window at all under a non-DOM test runner. A
    // missing toast must never be what breaks the operation it was reporting on.
  }
}

export function toast(message, type = 'info') {
  dispatch(TOAST_EVENT, { message, type });
}

export function notify(title, body, type = 'info') {
  dispatch(NOTIFY_EVENT, { title, body, type });
}
