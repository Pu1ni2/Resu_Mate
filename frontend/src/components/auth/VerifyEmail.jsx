import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useApp } from '../../context/AppContext';
import { accountAPI, messageForApiError } from '../../services/api';
import AuthLayout, { FormHeading, SuccessPanel } from './AuthLayout';
import AuthNotice from './AuthNotice';

/* Confirm a manager's address, from the link sign-up emails. It may be opened
 * where they aren't signed in, such as on a phone: the link is enough. */
export default function VerifyEmail() {
  const token = useSearchParams()[0].get('token') || '';
  const { hiringManager, refreshHiringManager } = useApp();
  const [state, setState] = useState(token ? 'checking' : 'no-link');
  const [failure, setFailure] = useState('');
  const asked = useRef(false);

  useEffect(() => {
    // Once, though development runs an effect twice.
    if (!token || asked.current) return;
    asked.current = true;
    accountAPI.verifyEmail(token)
      .then(res => {
        refreshHiringManager(res.data?.user);
        setState('confirmed');
      })
      .catch(err => {
        setFailure(messageForApiError(err, 'We couldn’t confirm your email. Please try again.'));
        setState('failed');
      });
  }, [token, refreshHiringManager]);

  if (state === 'confirmed') {
    return (
      <AuthLayout screen="verify">
        <SuccessPanel
          screen="verify"
          title="Your email is confirmed."
          action={(
            <p className="form-foot">
              {hiringManager
                ? <Link className="text-link" to="/hiring">Go to your workspace</Link>
                : <Link className="text-link" to="/hiring/login">Sign in</Link>}
            </p>
          )}
        >
          <p>You can email candidates from your workspace now.</p>
        </SuccessPanel>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout screen="verify">
      <FormHeading screen="verify" />
      {state === 'checking' && <AuthNotice>Confirming your email…</AuthNotice>}
      {state === 'no-link' && <AuthNotice>This page needs the link from the email we sent when you signed up.</AuthNotice>}
      {state === 'failed' && <AuthNotice kind="error">{failure}</AuthNotice>}
      {state !== 'checking' && (
        <p className="form-foot">
          {hiringManager
            ? <Link className="text-link" to="/hiring">Send a new link from your workspace</Link>
            : <><Link className="text-link" to="/hiring/login">Sign in</Link> to send a new link.</>}
        </p>
      )}
    </AuthLayout>
  );
}
