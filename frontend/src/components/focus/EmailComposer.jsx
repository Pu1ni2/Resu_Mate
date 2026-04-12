import React, { useState } from 'react';
import { Mail, Loader, Check, Clipboard } from 'lucide-react';

const API_BASE = import.meta.env.PROD ? 'https://resumate-api-74dm.onrender.com' : '';

export default function EmailComposer({ focusCandidate, agentResult, anonymize, getCandidatePayload }) {
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [emailType, setEmailType] = useState('');
  const [emailDrafting, setEmailDrafting] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const displayName = anonymize ? 'Candidate' : (focusCandidate?.name?.split(' ')[0] || 'Candidate');

  const draftEmail = async (type) => {
    setEmailType(type);
    setEmailDrafting(true);
    const resumeText = focusCandidate?.raw_text || focusCandidate?.text || '';
    const emailMatch = resumeText.match(/[\w.-]+@[\w.-]+\.\w+/);
    setEmailTo(emailMatch ? emailMatch[0] : '');
    setEmailCc(''); setEmailBcc('');

    try {
      const response = await fetch(`${API_BASE}/api/chat/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}` },
        body: JSON.stringify({
          candidate_id: focusCandidate.id,
          candidate_data: getCandidatePayload(),
          email_type: type,
          evaluation_report: agentResult?.report || null,
          anonymize,
        }),
      });
      const data = await response.json();
      setEmailSubject(data.subject || '');
      setEmailBody(data.body || '');
    } catch {
      setEmailSubject('Regarding Your Application');
      setEmailBody('Hi,\n\nThank you for your interest.\n\nBest regards');
    } finally {
      setEmailDrafting(false);
    }
  };

  const copyEmail = () => {
    const text = `Subject: ${emailSubject}\nTo: ${emailTo}\n${emailCc ? `Cc: ${emailCc}\n` : ''}${emailBcc ? `Bcc: ${emailBcc}\n` : ''}\n${emailBody}`;
    navigator.clipboard.writeText(text);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const openInGmail = () => {
    const params = `to=${encodeURIComponent(emailTo)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}${emailCc ? `&cc=${encodeURIComponent(emailCc)}` : ''}${emailBcc ? `&bcc=${encodeURIComponent(emailBcc)}` : ''}`;
    window.open(`https://mail.google.com/mail/?view=cm&${params}`, '_blank');
  };

  const openInOutlook = () => {
    window.open(`https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(emailTo)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`, '_blank');
  };

  const openMailto = () => {
    const params = `subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}${emailCc ? `&cc=${encodeURIComponent(emailCc)}` : ''}${emailBcc ? `&bcc=${encodeURIComponent(emailBcc)}` : ''}`;
    window.location.href = `mailto:${emailTo}?${params}`;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '640px' }}>
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--surface-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '15px' }}><Mail size={18} /> Email {displayName}</div>
          {emailType && <button className="btn btn-ghost btn-sm" onClick={copyEmail}>{emailCopied ? <Check size={14} /> : <Clipboard size={14} />} {emailCopied ? 'Copied' : 'Copy'}</button>}
        </div>

        {!emailType && !emailDrafting && (
          <div style={{ padding: '24px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '16px' }}>Choose the type of email to draft:</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[['interest', 'Express Interest'], ['interview', 'Interview Invite'], ['offer', 'Job Offer'], ['pass', 'Polite Pass'], ['followup', 'Follow-up']].map(([type, label]) => (
                <button key={type} className="btn btn-secondary" onClick={() => draftEmail(type)} style={{ padding: '10px 16px' }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {emailDrafting && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text3)' }}>
            <Loader size={24} className="spin" /><p style={{ marginTop: '12px' }}>AI is drafting your email...</p>
          </div>
        )}

        {emailType && !emailDrafting && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>To</label>
              <input type="email" className="input" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="candidate@email.com" style={{ padding: '10px 14px' }} />
            </div>
            {!showCcBcc && <button style={{ fontSize: '12px', color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '0' }} onClick={() => setShowCcBcc(true)}>+ Cc / Bcc</button>}
            {showCcBcc && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Cc</label><input type="text" className="input" value={emailCc} onChange={e => setEmailCc(e.target.value)} style={{ padding: '10px 14px' }} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Bcc</label><input type="text" className="input" value={emailBcc} onChange={e => setEmailBcc(e.target.value)} style={{ padding: '10px 14px' }} /></div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Subject</label>
              <input type="text" className="input" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{ padding: '10px 14px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Body</label>
              <textarea className="input" value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={12} style={{ padding: '12px 14px', resize: 'vertical', lineHeight: '1.6' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEmailType(''); setEmailBody(''); setEmailSubject(''); }}>New Draft</button>
              <button className="btn btn-secondary btn-sm" onClick={openInGmail}>Open in Gmail</button>
              <button className="btn btn-secondary btn-sm" onClick={openInOutlook}>Open in Outlook</button>
              <button className="btn btn-secondary btn-sm" onClick={openMailto}>Default Mail</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
