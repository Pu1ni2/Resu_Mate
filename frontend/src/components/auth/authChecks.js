/* The sign-in forms' own checks, with the design's words for each. They run
 * before anything is sent; the server checks again. Each returns '' when the
 * value is fine. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(value) {
  if (!value.trim()) return 'Please enter your email address.';
  if (!EMAIL.test(value.trim())) return 'Enter a valid email address, such as you@example.com.';
  return '';
}

export const passwordError = value => (value ? '' : 'Please enter your password.');

/* A new password: the server's minimum is 8 characters. */
export function newPasswordError(value) {
  if (!value) return 'Please enter your password.';
  if (value.length < 8) return 'Use at least 8 characters.';
  return '';
}

export function confirmError(confirm, password) {
  if (!confirm) return 'Please confirm your password.';
  if (confirm !== password) return 'The passwords do not match.';
  return '';
}

export const nameError = value => (value.trim() ? '' : 'Please enter your full name.');

export const termsError = agreed => (agreed ? '' : 'Please agree to the Terms and Privacy Policy to continue.');

/* `name` is what the code is called where it is asked for. */
export const codeError = (value, name = 'access code') => (/^\d{6}$/.test(value) ? '' : `Enter the complete 6-digit ${name}.`);

/* What the box above the form says about the fields: the one problem, or a
 * pointer to the highlighted fields when there are several. */
export function errorSummary(errors) {
  const found = Object.values(errors).filter(Boolean);
  if (found.length > 1) return 'Please check the highlighted fields before continuing.';
  return found[0] || '';
}

/* The first field with a problem, for the keyboard to go to. */
export const firstError = errors => Object.keys(errors).find(name => errors[name]);
