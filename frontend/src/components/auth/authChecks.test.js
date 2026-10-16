import { describe, it, expect } from 'vitest';

import {
  emailError, passwordError, newPasswordError, confirmError, nameError, termsError, codeError,
  errorSummary, firstError,
} from './authChecks';

/* The sign-in forms' own checks, in the design's words. */

describe('the checks', () => {
  it('want an email that looks like one', () => {
    expect(emailError('')).toBe('Please enter your email address.');
    expect(emailError('   ')).toBe('Please enter your email address.');
    expect(emailError('jane@co')).toBe('Enter a valid email address, such as you@example.com.');
    expect(emailError('jane co@x.com')).toBe('Enter a valid email address, such as you@example.com.');
    expect(emailError(' jane@co.com ')).toBe('');
  });

  it('want a password, and a new one of at least 8 characters', () => {
    expect(passwordError('')).toBe('Please enter your password.');
    expect(passwordError('x')).toBe('');
    expect(newPasswordError('')).toBe('Please enter your password.');
    expect(newPasswordError('1234567')).toBe('Use at least 8 characters.');
    expect(newPasswordError('12345678')).toBe('');
  });

  it('want the password confirmed, the same', () => {
    expect(confirmError('', 'hunter22')).toBe('Please confirm your password.');
    expect(confirmError('hunter23', 'hunter22')).toBe('The passwords do not match.');
    expect(confirmError('hunter22', 'hunter22')).toBe('');
  });

  it('want a name, the agreement, and all six digits of a code', () => {
    expect(nameError(' ')).toBe('Please enter your full name.');
    expect(nameError('Jane Smith')).toBe('');
    expect(termsError(false)).toBe('Please agree to the Terms and Privacy Policy to continue.');
    expect(termsError(true)).toBe('');
    expect(codeError('12345')).toBe('Enter the complete 6-digit access code.');
    expect(codeError('123456')).toBe('');
  });

  it('name the code as the page asking for it does', () => {
    expect(codeError('', 'code')).toBe('Enter the complete 6-digit code.');
    expect(codeError('12a456', 'code')).toBe('Enter the complete 6-digit code.');
    expect(codeError('123456', 'code')).toBe('');
  });
});

describe('what the form says about them', () => {
  it('repeats a single problem, and points at the fields when there are several', () => {
    expect(errorSummary({ email: '', password: '' })).toBe('');
    expect(errorSummary({ email: 'Please enter your email address.', password: '' })).toBe('Please enter your email address.');
    expect(errorSummary({ email: 'a', password: 'b' })).toBe('Please check the highlighted fields before continuing.');
  });

  it('sends the keyboard to the first field with a problem', () => {
    expect(firstError({ name: '', email: 'x', password: 'y' })).toBe('email');
    expect(firstError({ email: '' })).toBeUndefined();
  });
});
