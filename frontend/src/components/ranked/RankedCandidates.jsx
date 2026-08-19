import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../ui/cn';
import ScoreRing from './ScoreRing';
import { toneForVerdict } from './adapters';

/* RankedCandidates — the one ranked-results list.
 *
 * Replaces three separate implementations: the AutoHire results screen, the
 * dashboard Rank panel, and the Jarvis action card. They rendered the same
 * concept in three styling systems with two accent hues, and even disagreed on
 * the four verdict colours.
 *
 * Two variants cover all three:
 *   full     expandable rows, optional selection  (AutoHire, Rank panel)
 *   compact  one dense line per candidate         (Jarvis card)
 *
 * Rows arrive pre-normalised through ./adapters, so this file never sees the
 * difference between an ATS payload and an LLM-ranked one.
 */

const verdictTone = {
  positive: 'border-positive/30 bg-positive-wash text-positive',
  accent: 'border-accent-line bg-accent-wash text-accent',
  caution: 'border-caution/30 bg-caution-wash text-caution',
  neutral: 'border-line bg-surface-raised text-ink-muted',
};

function VerdictPill({ verdict, className }) {
  if (!verdict) return null;
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap',
        verdictTone[toneForVerdict(verdict)],
        className,
      )}
    >
      {verdict}
    </span>
  );
}

/* Bars are scaled to the value with the track always visible, so length means
 * something. The analytics view still renders every bar full-width regardless
 * of its data; nothing built on this component will repeat that. */
function MatchBar({ value, label, className }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-data-track">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[11px] text-ink-subtle">
        {pct}% {label}
      </span>
    </div>
  );
}

function CompactRow({ row }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
        style={{ opacity: Math.max(0.35, (Number(row.score) || 0) / 100) }}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{row.name}</span>
      <span className="shrink-0 font-mono text-[13px] text-ink-muted">{row.score}</span>
      <VerdictPill verdict={row.verdict} />
    </div>
  );
}

function FullRow({ row, selected, onToggleSelect, selectable, expandable }) {
  const [open, setOpen] = useState(false);
  const hasDetail = expandable && (row.bars?.length || row.matched?.length || row.missing?.length || row.note);

  return (
    <div className={cn('relative', row.rejected && 'opacity-60')}>
      <div className="flex items-center gap-3.5 px-4 py-3.5 sm:gap-4 sm:px-5">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(row.id)}
            aria-label={`Select ${row.name}`}
            className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
          />
        )}

        <ScoreRing score={row.score} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-ink">{row.name}</span>
            <VerdictPill verdict={row.verdict} />
          </div>
          {row.meta && <div className="mt-0.5 truncate text-[12px] text-ink-subtle">{row.meta}</div>}
          {row.matchValue > 0 && (
            <MatchBar value={row.matchValue} label={row.matchLabel} className="mt-2" />
          )}
        </div>

        {row.matched?.length > 0 && (
          <div className="hidden shrink-0 gap-1.5 lg:flex">
            {row.matched.slice(0, 3).map(s => (
              <span
                key={s}
                className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-muted"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {hasDetail && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? `Hide details for ${row.name}` : `Show details for ${row.name}`}
            className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors duration-[120ms] hover:bg-surface-raised hover:text-ink-muted"
          >
            <ChevronDown size={16} className={cn('transition-transform duration-[160ms]', open && 'rotate-180')} />
          </button>
        )}
      </div>

      {hasDetail && open && (
        <div className="border-t border-line bg-surface-raised/40 px-4 py-4 sm:px-5">
          {row.bars?.length > 0 && (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              {row.bars.map(b => (
                <div key={b.label}>
                  <div className="mb-1 text-[11px] text-ink-subtle">{b.label}</div>
                  <MatchBar value={b.value} label="" />
                </div>
              ))}
            </div>
          )}

          {(row.matched?.length > 0 || row.missing?.length > 0) && (
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              {row.matched?.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-positive">Matched</div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.matched.map(s => (
                      <span key={s} className="rounded-md border border-positive/25 bg-positive-wash px-2 py-1 text-[11px] text-positive">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {row.missing?.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-ink-subtle">Missing</div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.missing.map(s => (
                      <span key={s} className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-muted">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {row.note && <p className="text-[13px] leading-relaxed text-ink-muted">{row.note}</p>}

          {row.rejected && row.rejectionReason && (
            <p className="mt-3 rounded-md border border-caution/30 bg-caution-wash px-3 py-2 text-[12px] text-caution">
              Auto-filtered — {row.rejectionReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Summary strip: what was screened, how it landed, how long it took. */
export function RankedSummary({ screened, strongFits, elapsedMs, className }) {
  if (screened == null) return null;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-[12px] text-ink-subtle sm:px-5',
        className,
      )}
    >
      <span>
        <span className="font-mono text-ink-muted">{screened}</span> resumes screened
      </span>
      {strongFits != null && (
        <span>
          <span className="font-mono text-ink-muted">{strongFits}</span> strong fits
        </span>
      )}
      {/* Only claimed when the API actually measured it. */}
      {elapsedMs != null && (
        <span className="ml-auto flex items-center gap-1.5 text-positive">
          <Check size={12} /> Ranked in {(elapsedMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

export default function RankedCandidates({
  rows = [],
  variant = 'full',
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  expandable = true,
  summary = null,
  emptyMessage = 'No candidates in this category.',
  className,
}) {
  if (variant === 'compact') {
    return (
      <div className={cn('divide-y divide-line', className)}>
        {rows.map(r => <CompactRow key={r.id} row={r} />)}
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-[14px] border border-line bg-surface shadow-e1', className)}>
      {summary}
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-ink-subtle">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map(r => (
            <FullRow
              key={r.id}
              row={r}
              selectable={selectable}
              selected={selectedIds.includes(r.id)}
              onToggleSelect={onToggleSelect}
              expandable={expandable}
            />
          ))}
        </div>
      )}
    </div>
  );
}
