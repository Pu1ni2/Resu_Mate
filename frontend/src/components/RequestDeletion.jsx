import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import api, { messageForApiError } from '../services/api';
import PageFrame from './auth/PageFrame';
import { StepHeading, SuccessPanel } from './auth/AuthLayout';
import { Field, CodeField, SubmitButton } from './auth/AuthFields';
import AuthNotice from './auth/AuthNotice';
import { emailError, codeError } from './auth/authChecks';

/* Ask for everything held about you to be deleted. For anyone, including people
 * who were never invited: someone a sourcing run found, or whose résumé a
 * manager uploaded, never gets a portal sign-in to delete it from.
 *
 * An address, then the code it is emailed, then the deletion. The server's
 * answer is the same whether or not it holds anything, so neither is this.
 * In the sign-in pages' design (styles/studio-auth.css). */

const EYEBROW = 'Privacy';
const FOR_GOOD = 'This can’t be undone. Hiring teams that invited you will no longer see your interview.';

export default function RequestDeletion() {
  const [step, setStep] = useState('email'); // email | code | done
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');

  const askForCode = async () => {
    setLoading(true);
    try {
      const res = await api.post('/privacy/erasure-code', { email: email.trim() });
      setSent(res.data);
      setStep('code');
    } catch (err) {
      setError(messageForApiError(err, 'Could not send the code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const erase = async () => {
    setLoading(true);
    try {
      await api.post('/privacy/erase', { email: email.trim(), code });
      setStep('done');
    } catch (err) {
      setError(messageForApiError(err, 'Could not delete the data. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const found = step === 'email' ? emailError(email) : codeError(code, 'code');
    setFieldError(found);
    if (found) {
      document.getElementById(step === 'email' ? 'erasure-email' : 'erasure-code')?.focus();
      return;
    }
    if (step === 'email') askForCode();
    else erase();
  };

  const differentAddress = () => {
    setStep('email');
    setCode('');
    setFieldError('');
    setError('');
  };

  const problem = error || fieldError;
  let content;
  if (step === 'done') {
    content = (
      <SuccessPanel
        level={1}
        eyebrow={EYEBROW}
        title="Your data is deleted."
        action={<Link className="cta cta-primary full-width" to="/">Back to ResuMate <span aria-hidden="true">→</span></Link>}
      >
        <p>
          Everything ResuMate held about <strong>{email.trim()}</strong> is deleted: résumés, interviews,
          sign-ins and anything a search found.
        </p>
      </SuccessPanel>
    );
  } else {
    content = (
      <>
        <StepHeading
          level={1}
          eyebrow={EYEBROW}
          title="Delete your data."
          intro="Ask us to delete everything we hold about your email address."
          focusKey={step}
        />
        {problem && <AuthNotice kind="error">{problem}</AuthNotice>}
        {step === 'code' && !problem && <AuthNotice kind="success">{sent?.message} The code works for 15 minutes.</AuthNotice>}
        <form className="auth-form" noValidate aria-busy={loading} onSubmit={handleSubmit}>
          {step === 'email' ? (
            <div className="form-fields">
              <Field
                id="erasure-email" name="email" label="Your email address" type="email" autoComplete="email"
                autoCapitalize="none" spellCheck={false} placeholder="you@example.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setFieldError(''); setError(''); }}
                error={fieldError} disabled={loading}
              />
              <p className="form-note">{FOR_GOOD}</p>
            </div>
          ) : (
            <div className="form-fields">
              {/* Only from a development server without email. */}
              {sent?.debug_code && <p className="form-note">Development code: <strong>{sent.debug_code}</strong></p>}
              <CodeField
                id="erasure-code" name="code" label="Code" placeholder="000000"
                value={code} onCode={(digits) => { setCode(digits); setFieldError(''); setError(''); }}
                error={fieldError} disabled={loading}
              />
              <p className="form-note">{FOR_GOOD}</p>
            </div>
          )}
          {step === 'email'
            ? <SubmitButton busy={loading} busyLabel="Sending…">Email me a code</SubmitButton>
            : <SubmitButton busy={loading} busyLabel="Deleting…">Delete everything about me</SubmitButton>}
        </form>
        {step === 'code' && (
          <p className="form-foot">
            <button type="button" className="text-link" onClick={differentAddress}>
              <span aria-hidden="true">←</span> Use a different address
            </button>
          </p>
        )}
      </>
    );
  }

  return (
    <PageFrame title="Delete your data — ResuMate" skipTo="page-content" skipLabel="Skip to content">
      <main className="solo-layout" id="page-content" tabIndex={-1}>
        <div className="solo-card">{content}</div>
      </main>
    </PageFrame>
  );
}
