import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Field, PasswordField, CodeField, SubmitButton } from './AuthFields';
import AuthNotice from './AuthNotice';

/* The sign-in forms' pieces: a field's help and error are tied to it for screen
 * readers, and an error marks it invalid. */

describe('a field', () => {
  it('is named by its label, and required unless it says it is optional', () => {
    render(<>
      <Field id="email" label="Email address" type="email" value="" onChange={() => {}} />
      <Field id="company" label="Company" optional value="" onChange={() => {}} />
    </>);
    expect(screen.getByLabelText('Email address').required).toBe(true);
    const company = screen.getByLabelText('Company Optional');
    expect(company.required).toBe(false);
  });

  it('ties its help and its error to the input, and is marked invalid with an error', () => {
    render(<Field id="email" label="Email address" help="We never share it." error="Please enter your email address."
      value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Email address');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id).textContent);
    expect(described).toEqual(['Please enter your email address.', 'We never share it.']);
  });

  it('is not marked invalid, and points at no error, when there is none', () => {
    render(<Field id="email" label="Email address" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('Email address');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('a password field', () => {
  it('shows and hides the password, and says which it does', () => {
    render(<PasswordField id="pw" label="Confirm password" value="hunter2" onChange={() => {}} />);
    const input = screen.getByLabelText('Confirm password');
    expect(input.type).toBe('password');
    const toggle = screen.getByRole('button', { name: 'Show confirm password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide confirm password' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('is shut, button and all, while the form is busy', () => {
    render(<PasswordField id="pw" label="Password" value="" onChange={() => {}} disabled />);
    expect(screen.getByLabelText('Password').disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Show password' }).disabled).toBe(true);
  });
});

describe('the access code field', () => {
  it('keeps digits only, and six of them, even from a pasted "123 456"', () => {
    const onCode = vi.fn();
    render(<CodeField id="code" label="Access code" value="" onCode={onCode} />);
    const input = screen.getByLabelText('Access code');
    fireEvent.change(input, { target: { value: '123 456' } });
    expect(onCode).toHaveBeenLastCalledWith('123456');
    fireEvent.change(input, { target: { value: '12a3-4567 89' } });
    expect(onCode).toHaveBeenLastCalledWith('123456');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.hasAttribute('maxlength')).toBe(false);
  });
});

describe('the main button', () => {
  it('is named by its words alone, the arrow being decoration', () => {
    render(<SubmitButton busy={false} busyLabel="Signing in…">Sign in</SubmitButton>);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button.disabled).toBe(false);
    expect(button.type).toBe('submit');
  });

  it('says what is happening while the request is out, and cannot be pressed twice', () => {
    render(<SubmitButton busy busyLabel="Signing in…">Sign in</SubmitButton>);
    const button = screen.getByRole('button', { name: 'Signing in…' });
    expect(button.disabled).toBe(true);
  });
});

describe('a notice', () => {
  it('announces an error at once, and anything else politely', () => {
    render(<>
      <AuthNotice kind="error">We couldn’t sign you in.</AuthNotice>
      <AuthNotice kind="success">Password changed.</AuthNotice>
    </>);
    expect(screen.getByRole('alert').textContent).toContain('We couldn’t sign you in.');
    expect(screen.getByRole('status').textContent).toContain('Password changed.');
  });
});
