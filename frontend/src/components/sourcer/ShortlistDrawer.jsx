import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Button from '../ui/Button';
import RankedCandidates from '../ranked/RankedCandidates';
import { fromSourcedProfile } from '../ranked/adapters';
import { shortlistOf } from './talentMapModel';

/* Save, dismiss and (when offered) draft for one person. They act on the saved
 * profile, so they wait until the run has been saved and has ids. */
function RowActions({ person, profileId, onStatus, onDraft }) {
  const ready = Boolean(profileId);
  const saved = person.status === 'saved';
  const dismissed = person.status === 'dismissed';
  const why = ready ? undefined : 'Available once the run is saved';
  return (
    <>
      <Button
        size="sm" variant={saved ? 'accentGhost' : 'ghost'} disabled={!ready} title={why}
        aria-pressed={saved} aria-label={`${saved ? 'Unsave' : 'Save'} ${person.name}`}
        onClick={() => onStatus(person.pid, saved ? 'new' : 'saved')}
      >
        {saved ? 'Saved' : 'Save'}
      </Button>
      <Button
        size="sm" variant="ghost" disabled={!ready} title={why}
        aria-pressed={dismissed} aria-label={`${dismissed ? 'Restore' : 'Dismiss'} ${person.name}`}
        onClick={() => onStatus(person.pid, dismissed ? 'new' : 'dismissed')}
      >
        {dismissed ? 'Undo' : 'Dismiss'}
      </Button>
      {onDraft && (
        <Button
          size="sm" variant="ghost" disabled={!ready} title={why}
          aria-label={`Draft outreach to ${person.name}`}
          onClick={() => onDraft(person.pid)}
        >
          Draft outreach
        </Button>
      )}
    </>
  );
}

/* Everyone shortlisted, best first, in a side panel over the map. A modal
 * dialog: focus moves in when it opens and back when it closes, and Escape or
 * the backdrop closes it. */
export default function ShortlistDrawer({ open, onClose, state, onStatus, onDraft }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    panelRef.current?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const people = shortlistOf(state);
  const byPid = Object.fromEntries(people.map(p => [p.pid, p]));
  const rows = people.map(p => fromSourcedProfile(p, state.plan));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sourcer-shortlist-title"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-line bg-canvas shadow-e3 outline-none"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="sourcer-shortlist-title" className="text-[15px] font-semibold text-ink">
            Shortlist <span className="font-mono text-ink-subtle">{rows.length}</span>
          </h2>
          <Button icon size="sm" variant="ghost" onClick={onClose} aria-label="Close shortlist">
            <X size={16} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!state.runId && (
            <p className="mb-3 text-[12px] text-ink-subtle">Save, dismiss and outreach are available once the run is saved.</p>
          )}
          <RankedCandidates
            rows={rows}
            emptyMessage="No one has cleared the shortlist line yet."
            renderActions={row => (
              <RowActions person={byPid[row.id]} profileId={state.profileIds[row.id]} onStatus={onStatus} onDraft={onDraft} />
            )}
          />
        </div>
      </div>
    </div>
  );
}
