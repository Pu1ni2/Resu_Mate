import React from 'react';

const ICONS = { success: '✓', error: '!', info: 'i' };

/* An info, success or error box above a sign-in form. An error is announced
 * at once; the others politely. */
export default function AuthNotice({ kind = 'info', children }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon" aria-hidden="true">{ICONS[kind]}</span>
      <div className="notice-body">{children}</div>
    </div>
  );
}
