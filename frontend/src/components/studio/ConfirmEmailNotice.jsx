import React, { useEffect, useRef, useState } from 'react';
import { MailCheck } from 'lucide-react';

import { useApp } from '../../context/AppContext';
import { accountAPI, messageForApiError } from '../../services/api';

/* Until a new manager confirms their email they can't email candidates:
 * anyone could sign up with any address and send from ResuMate. This says
 * so above the workspace's pages, with a way to get a new link. Accounts
 * from before count as confirmed, and see nothing. */
export default function ConfirmEmailNotice() {
  const { hiringManager, refreshHiringManager } = useApp();
  const unconfirmed = hiringManager?.email_verified === false;
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState(null);
  const checked = useRef(false);

  // Confirmed in another browser, or on a phone: ask once whether it still
  // needs doing.
  useEffect(() => {
    if (!unconfirmed || checked.current) return;
    checked.current = true;
    accountAPI.me().then(res => refreshHiringManager?.(res.data)).catch(() => {});
  }, [unconfirmed, refreshHiringManager]);

  if (!unconfirmed) return null;

  const sendLink = async () => {
    if (sending) return;
    setSending(true);
    setSaid(null);
    try {
      const res = await accountAPI.sendVerification();
      if (res.data?.user) refreshHiringManager?.(res.data.user);
      setSaid({ text: res.data?.message || `We’ve sent a new link to ${hiringManager.email}.`, link: res.data?.debug_verify_link });
    } catch (err) {
      setSaid({ text: messageForApiError(err, 'We couldn’t send a new link. Please try again.') });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="sw-confirm" aria-label="Confirm your email">
      <MailCheck size={18} aria-hidden="true" />
      <p>
        <strong>Confirm your email to send invitations.</strong>{' '}
        We sent a link to {hiringManager.email} when you signed up.
      </p>
      {/* aria-disabled, not disabled, while it sends: a disabled button drops
          the keyboard's focus. */}
      <button type="button" className="sw-confirm-button" aria-disabled={sending || undefined} onClick={sendLink}>
        {sending ? 'Sending…' : 'Send a new link'}
      </button>
      <p className="sw-confirm-said" role="status">
        {said?.text}
        {said?.link && <> <a className="text-link" href={said.link}>Open the link (development)</a></>}
      </p>
    </section>
  );
}
