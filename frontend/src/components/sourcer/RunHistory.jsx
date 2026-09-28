import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { cn } from '../ui/cn';
import { formatCount } from './format';

/* The server stores naive UTC timestamps; without a zone the browser would read
 * them as local time. */
export function whenOf(iso) {
  if (!iso) return '';
  const zoned = /[zZ]$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(zoned);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/* Past searches, newest first. Opening one shows it as it ended; deleting asks
 * once more in place rather than through a browser confirm dialog. */
export default function RunHistory({ runs, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(null);
  if (!runs.length) return null;
  return (
    <Card as="section" aria-label="Past searches" className="divide-y divide-line">
      <h2 className="px-4 py-3 text-[12px] font-semibold text-ink-subtle">Past searches</h2>
      <ul className="m-0 list-none divide-y divide-line p-0">
        {runs.map(run => (
          <li key={run.id} className="flex items-center gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={() => onOpen(run.id)}
              // Without preflight a bare <button> is drawn with the browser's
              // grey fill and border; this one is a text link.
              className="m-0 min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit]"
            >
              <span className="block truncate text-[13px] text-ink hover:text-accent">{run.description}</span>
              <span className="block text-[11px] text-ink-subtle">
                {whenOf(run.created_at)}
                {' · '}
                <span className="font-mono">{formatCount(run.judged)}</span> read
                {' · '}
                <span className="font-mono">{formatCount(run.shortlisted)}</span> shortlisted
                {run.status === 'stopped' && ' · stopped'}
              </span>
            </button>
            <Button
              size="sm"
              variant={confirming === run.id ? 'danger' : 'ghost'}
              aria-label={confirming === run.id ? `Confirm deleting "${run.description}"` : `Delete "${run.description}"`}
              onBlur={() => setConfirming(c => (c === run.id ? null : c))}
              onClick={() => {
                if (confirming === run.id) {
                  setConfirming(null);
                  onDelete(run.id);
                } else {
                  setConfirming(run.id);
                }
              }}
              className={cn(confirming !== run.id && 'text-ink-faint')}
            >
              <Trash2 size={13} /> {confirming === run.id ? 'Confirm delete' : 'Delete'}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
