import React, { useState } from 'react';

/* The sign-in forms' pieces, in the Studio design (styles/studio-auth.css).
 * A field's help and its error are tied to it for screen readers, and an
 * error marks it invalid. */

export function Field({ id, label, optional = false, help, error, inputClassName, children, ...input }) {
  const describedBy = [error ? `${id}-error` : null, help ? `${id}-help` : null].filter(Boolean).join(' ');
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>
        {label}{optional && <> <span className="optional">Optional</span></>}
      </label>
      <div className="field-wrap">
        <input
          id={id}
          className={inputClassName ? `field-input ${inputClassName}` : 'field-input'}
          required={!optional}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          {...input}
        />
        {children}
      </div>
      {help && <p className="field-help" id={`${id}-help`}>{help}</p>}
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

/* A password field with Show / Hide. The button says which password it shows,
 * and whether it is pressed. */
export function PasswordField({ label, disabled, ...field }) {
  const [shown, setShown] = useState(false);
  const what = label.toLowerCase();
  return (
    <Field {...field} label={label} type={shown ? 'text' : 'password'} disabled={disabled}>
      <button
        className="password-toggle"
        type="button"
        aria-label={`${shown ? 'Hide' : 'Show'} ${what}`}
        aria-pressed={shown}
        disabled={disabled}
        onClick={() => setShown(s => !s)}
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </Field>
  );
}

/* The 6-digit access code. Anything but digits is dropped as it is typed or
 * pasted, and only then cut to six, so a pasted "123 456" still fits. */
export function CodeField({ onCode, ...field }) {
  return (
    <Field
      {...field}
      inputClassName="code-input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]{6}"
      autoComplete="one-time-code"
      onChange={e => onCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
    />
  );
}

/* The form's main button. While the request is out it says what is happening,
 * and can't be pressed twice. `disabled` shuts it otherwise, as on a reset
 * page opened without its link. */
export function SubmitButton({ busy, busyLabel, disabled = false, children }) {
  return (
    <button className="cta cta-primary full-width" type="submit" disabled={busy || disabled}>
      {busy && <span className="loading-spinner" aria-hidden="true" />}
      <span>{busy ? busyLabel : children}</span>
      {!busy && <span aria-hidden="true">→</span>}
    </button>
  );
}
