import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '../ui/cn';

/* StyleLab — /styles, unlisted.
 *
 * The same hero rendered in four candidate directions, so they can be compared
 * against each other instead of judged one at a time from memory. Two earlier
 * attempts at this page were rejected, and a palette described in prose is
 * clearly not enough to decide from.
 *
 * Throwaway. Once a direction is picked, delete this file, its route in
 * App.jsx, and the .lab-* scopes at the end of theme.css. Nothing in the
 * product imports it.
 *
 * Every variant uses identical markup and the same two already-loaded faces, so
 * the only things varying are palette and structure. That is deliberate: a
 * direction that only works because of an exotic webfont is fragile.
 */

const VARIANTS = [
  {
    id: 'lab-vermillion',
    name: 'Vermillion',
    note: 'Warm charcoal, cream, one hot red. Currently live on /.',
    feels: 'Premium consumer software — Superhuman, Arc',
    hex: ['#141110', '#F7F2EA', '#E03C1F'],
  },
  {
    id: 'lab-cobalt',
    name: 'Cobalt block',
    note: 'The brand colour is the whole page. Acid lime for actions.',
    feels: 'Loud and memorable — Klarna, Monzo, Cal.com',
    hex: ['#1B2ECC', '#FFFDF7', '#D6FF3F'],
  },
  {
    id: 'lab-brutal',
    name: 'Neo-brutalist',
    note: 'Bone paper, ink outlines, hard offset shadows with no blur.',
    feels: 'Playful and human — Gumroad, Figma community',
    hex: ['#FDFBF3', '#0B0B0B', '#FF4D2E'],
    hard: true,
  },
  {
    id: 'lab-signal',
    name: 'Signal',
    note: 'Near-black, one electric green, monospace-forward.',
    feels: 'Engineered, for builders — Railway, Warp',
    hex: ['#08090A', '#E8E8E3', '#00E57A'],
    mono: true,
  },
];

const ROWS = [
  { score: 92, name: 'Maya Rodriguez', verdict: 'Strong fit', bar: 94 },
  { score: 87, name: 'Devan Patel', verdict: 'Strong fit', bar: 88 },
  { score: 64, name: 'Sam Okafor', verdict: 'Good fit', bar: 61 },
];

function Hero({ v }) {
  // The brutalist variant swaps hairlines for 2px ink outlines and square
  // corners; everything else shares one treatment.
  const edge = v.hard ? 'border-2 border-line rounded-none' : 'border border-line rounded-[10px]';

  return (
    <div className={cn(v.id, 'font-text px-6 py-16 sm:px-12 sm:py-20')}>
      <div className="mx-auto max-w-[60rem]">
        <p
          className={cn(
            'mb-7 font-mono text-[11px] uppercase text-ink-faint',
            v.mono ? 'tracking-[0.24em]' : 'tracking-[0.2em]',
          )}
        >
          {v.mono ? '[ 5 agents · online ]' : 'Multi-agent hiring'}
        </p>

        <h2
          className={cn(
            'font-display text-ink',
            v.mono
              ? 'text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.05] tracking-[-0.03em]'
              : 'text-[clamp(2.25rem,6vw,4rem)] font-black leading-[0.93] tracking-[-0.045em]',
            v.hard && 'uppercase',
          )}
        >
          Hire smarter
          <br />
          with <span className="text-accent">AI agents</span>
        </h2>

        <p className="mt-7 max-w-[32rem] text-[17px] leading-[1.6] text-ink-muted">
          Five specialised agents read every resume, score it against the role on
          fixed weights, and run the interview.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <button
            className={cn(
              'inline-flex items-center gap-2 bg-accent px-5 py-3 text-[14px] font-bold text-ink-inverse',
              v.hard ? 'border-2 border-line rounded-none shadow-e2' : 'rounded-[10px]',
              v.mono && 'font-mono uppercase tracking-[0.1em]',
            )}
          >
            {v.mono ? '[ start hiring ]' : 'Start hiring'}
            {!v.mono && <ArrowRight size={15} />}
          </button>
          <button
            className={cn(
              'inline-flex items-center bg-surface px-5 py-3 text-[14px] font-medium text-ink',
              edge,
              v.hard && 'shadow-e1',
            )}
          >
            I&rsquo;m a candidate
          </button>
        </div>

        {/* Product strip. Identical data in every variant, so the palette is the
            only thing being judged. */}
        <div
          className={cn(
            'mt-14 overflow-hidden bg-surface',
            v.hard ? 'border-2 border-line rounded-none shadow-e3' : 'border border-line rounded-[12px] shadow-e2',
          )}
        >
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 text-[12px] text-ink-muted',
              v.hard ? 'border-b-2 border-line' : 'border-b border-line',
            )}
          >
            <span className="font-mono uppercase tracking-[0.14em] text-ink-faint">Screening</span>
            <span className="text-ink-faint">&middot;</span>
            <span>Python Developer</span>
            <span className="ml-auto flex items-center gap-1.5 text-positive">
              <Check size={12} /> 12 screened
            </span>
          </div>

          {ROWS.map((r, i) => (
            <div
              key={r.name}
              className={cn(
                'flex items-center gap-4 px-4 py-3.5',
                i > 0 && (v.hard ? 'border-t-2 border-line' : 'border-t border-line'),
                i === 0 && 'bg-accent-wash',
              )}
            >
              {/* Brutalist gets a boxed number; the others get the ring. */}
              {v.hard ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-line bg-surface font-mono text-[13px] font-bold text-ink">
                  {r.score}
                </span>
              ) : (
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(var(--color-accent) ${r.score * 3.6}deg, var(--color-data-track) 0deg)`,
                  }}
                >
                  <span className="flex h-[31px] w-[31px] items-center justify-center rounded-full bg-surface font-mono text-[13px] font-bold text-ink">
                    {r.score}
                  </span>
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">{r.name}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 w-full max-w-[150px] overflow-hidden rounded-full bg-data-track">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${r.bar}%` }} />
                  </span>
                  <span className="font-mono text-[11px] text-ink-subtle">{r.bar}%</span>
                </span>
              </span>

              <span
                className={cn(
                  'shrink-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wide',
                  v.hard
                    ? 'border-2 border-line bg-accent-wash text-ink'
                    : 'rounded-full border border-line text-ink-muted',
                )}
              >
                {r.verdict}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StyleLab() {
  return (
    <div className="min-h-screen bg-zinc-950 font-sans">
      <header className="border-b border-white/10 px-6 py-6">
        <h1 className="text-[15px] font-semibold text-zinc-100">Style lab</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          Same hero, same content, four directions. Unlisted route — delete once one is chosen.
        </p>
      </header>

      {VARIANTS.map(v => (
        <section key={v.id}>
          {/* The caption sits outside the variant so it never gets restyled by it. */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-white/10 bg-zinc-900 px-6 py-3">
            <span className="text-[13px] font-semibold text-zinc-100">{v.name}</span>
            <span className="text-[12px] text-zinc-400">{v.note}</span>
            <span className="text-[12px] italic text-zinc-500">{v.feels}</span>
            <span className="ml-auto flex items-center gap-2">
              {v.hex.map(h => (
                <span key={h} className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm ring-1 ring-white/20" style={{ background: h }} />
                  <code className="font-mono text-[10px] text-zinc-500">{h}</code>
                </span>
              ))}
            </span>
          </div>
          <Hero v={v} />
        </section>
      ))}
    </div>
  );
}
