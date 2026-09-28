import React, { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Mail, X } from 'lucide-react';
import Button from '../ui/Button';
import Input, { Label, Textarea } from '../ui/Input';
import { messageForApiError, sourcerAPI } from '../../services/api';
import { toast } from '../../services/notify';
import { safeUrl } from './JudgingNow';

/* A first message to someone the run found. Drafted by the server from what the
 * judge actually saw, editable here, and never sent from here: the manager
 * copies it, or opens it in their own mail client. */
export default function OutreachModal({ person, profileId, onClose }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    sourcerAPI.draftOutreach(profileId)
      .then(({ data }) => { if (!cancelled) setDraft({ subject: data.subject || '', body: data.body || '', to: data.to || '', profileUrl: data.profile_url || '' }); })
      .catch(err => { if (!cancelled) setError(messageForApiError(err, 'Could not draft a message. Please try again.')); });
    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      toast('Draft copied.', 'success');
    } catch {
      toast('Could not copy. Select the text and copy it instead.', 'error');
    }
  }

  const mailto = draft?.to
    ? `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : null;
  const profile = safeUrl(draft?.profileUrl);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outreach-title"
        tabIndex={-1}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        className="relative w-full max-w-xl rounded-[18px] border border-line bg-surface p-5 shadow-e3 outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="outreach-title" className="text-[15px] font-semibold text-ink">Outreach to {person.name}</h2>
            <p className="text-[12px] text-ink-subtle">A draft. Nothing is sent from here.</p>
          </div>
          <Button icon size="sm" variant="ghost" onClick={onClose} aria-label="Close draft"><X size={16} /></Button>
        </div>

        {error && <p role="alert" className="text-[13px] text-critical">{error}</p>}
        {!draft && !error && <p className="py-8 text-center text-[13px] text-ink-subtle">Drafting from what the judge saw…</p>}

        {draft && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="outreach-subject">Subject</Label>
              <Input id="outreach-subject" value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outreach-body">Message</Label>
              <Textarea id="outreach-body" rows={9} value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={copy}><Copy size={14} /> Copy</Button>
              {mailto && (
                <a href={mailto} className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line bg-surface-raised px-3.5 text-[13px] text-ink hover:border-line-strong">
                  <Mail size={14} /> Open in email
                </a>
              )}
              {profile && (
                <a href={profile} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
                  Open profile <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
