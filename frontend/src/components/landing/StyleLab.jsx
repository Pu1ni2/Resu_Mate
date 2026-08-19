import React, { Suspense, lazy } from 'react';
import { ArrowRight, Check, Mic, Video, Sparkles } from 'lucide-react';
import { cn } from '../ui/cn';

/* StyleLab — /styles, unlisted.
 *
 * Two axes, compared on one page: PALETTE and DEPTH TREATMENT. Every cell uses
 * the same copy and the same data, so nothing varies except the thing being
 * judged. Two earlier directions were rejected off a written description of a
 * palette, which is not enough to decide from.
 *
 * Throwaway by construction. Delete this file, its route in App.jsx, and the
 * .lab-* scopes at the end of theme.css; nothing in the product imports it.
 *
 * The three CSS treatments cost nothing — transforms and shadows. The Three.js
 * one is lazy-loaded so it never lands in the product bundle, and its real
 * weight is reported in the caption rather than hidden.
 */

// Loaded only when a visitor reaches /styles, and only for that one cell.
const ThreeScene = lazy(() => import('./ThreeScene'));

const PALETTES = [
  { id: 'lab-vermillion', name: 'Vermillion', hex: ['#141110', '#F7F2EA', '#E03C1F'] },
  { id: 'lab-cobalt', name: 'Cobalt', hex: ['#1B2ECC', '#FFFDF7', '#D6FF3F'] },
];

const FLAT_ONLY = [
  { id: 'lab-brutal', name: 'Neo-brutalist', hex: ['#FDFBF3', '#0B0B0B', '#FF4D2E'], hard: true },
  { id: 'lab-signal', name: 'Signal', hex: ['#08090A', '#E8E8E3', '#00E57A'], mono: true },
];

const TREATMENTS = [
  { id: 'flat', name: 'Flat', note: 'Panel square to the viewer. The baseline.' },
  {
    id: 'perspective',
    name: 'Perspective plate',
    note: 'rotateX(13deg) rotateY(-8deg) at 1400px, with a cast shadow and a lit top edge. CSS only.',
  },
  {
    id: 'stack',
    name: 'Layered stack',
    note: 'Three panels at receding depths, one light source. CSS only.',
  },
  {
    id: 'bento',
    name: 'Bento, elevated',
    note: 'Tiles at different elevations, one of them tilted. CSS only.',
  },
  {
    id: 'three',
    name: 'Real 3D (Three.js)',
    note: 'An actual lit, rotating mesh. Lazy-loaded — see the measured cost below.',
  },
];

const ROWS = [
  { score: 92, name: 'Maya Rodriguez', verdict: 'Strong fit', bar: 94 },
  { score: 87, name: 'Devan Patel', verdict: 'Strong fit', bar: 88 },
  { score: 64, name: 'Sam Okafor', verdict: 'Good fit', bar: 61 },
];

/* The product panel. Identical in every cell — the treatment wraps it, it never
 * changes itself, which is what keeps the comparison honest. */
function Panel({ hard, compact = false }) {
  return (
    <div
      className={cn(
        'overflow-hidden bg-surface',
        hard ? 'rounded-none border-2 border-line shadow-e3' : 'rounded-[12px] border border-line shadow-e2',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-ink-muted',
          hard ? 'border-b-2 border-line' : 'border-b border-line',
        )}
      >
        <Sparkles size={12} className="shrink-0 text-accent" />
        <span className="font-mono uppercase tracking-[0.14em] text-ink-faint">Screening</span>
        <span className="text-ink-faint">&middot;</span>
        <span className="truncate">Python Developer</span>
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-positive sm:flex">
          <Check size={12} /> 12 screened
        </span>
      </div>

      {(compact ? ROWS.slice(0, 2) : ROWS).map((r, i) => (
        <div
          key={r.name}
          className={cn(
            'flex items-center gap-3.5 px-4 py-3',
            i > 0 && (hard ? 'border-t-2 border-line' : 'border-t border-line'),
            i === 0 && 'bg-accent-wash',
          )}
        >
          {hard ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-line bg-surface font-mono text-[12px] font-bold text-ink">
              {r.score}
            </span>
          ) : (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--color-accent) ${r.score * 3.6}deg, var(--color-data-track) 0deg)`,
              }}
            >
              <span className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-surface font-mono text-[12px] font-bold text-ink">
                {r.score}
              </span>
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{r.name}</span>
            <span className="mt-1.5 flex items-center gap-2">
              <span className="h-1 w-full max-w-[130px] overflow-hidden rounded-full bg-data-track">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${r.bar}%` }} />
              </span>
              <span className="font-mono text-[10px] text-ink-subtle">{r.bar}%</span>
            </span>
          </span>

          <span
            className={cn(
              'shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              hard ? 'border-2 border-line bg-accent-wash text-ink' : 'rounded-full border border-line text-ink-muted',
            )}
          >
            {r.verdict}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Depth treatments ─── */

function Perspective({ hard }) {
  return (
    // perspective on the parent, transform on the child — the standard pairing.
    // Putting perspective on the transformed element itself flattens the effect.
    <div className="[perspective:1400px] [perspective-origin:50%_0%]">
      <div className="relative [transform:rotateX(13deg)_rotateY(-8deg)] [transform-style:preserve-3d]">
        {/* Cast shadow: a separate blurred plane below the panel, because a
            box-shadow rotates with its element and stops reading as ground. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-[8%] bottom-[-6%] h-[22%] rounded-[50%] blur-2xl"
          style={{ background: 'rgb(0 0 0 / 0.5)', transform: 'translateZ(-60px)' }}
        />
        <div className="relative">
          <Panel hard={hard} />
          {/* Lit top edge — the plane catching the light it is tilted toward. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, var(--color-highlight-strong) 50%, transparent)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Stack({ hard }) {
  return (
    <div className="relative pt-8">
      {/* Two receding ghosts behind the real panel. Scaled and offset up, so
          they read as further away rather than merely smaller. */}
      {[2, 1].map(z => (
        <div
          key={z}
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 mx-auto bg-surface',
            hard ? 'rounded-none border-2 border-line' : 'rounded-[12px] border border-line',
          )}
          style={{
            top: `${(3 - z) * 14}px`,
            height: '72px',
            width: `${100 - z * 5}%`,
            opacity: z === 2 ? 0.35 : 0.6,
            boxShadow: 'var(--shadow-e1)',
          }}
        />
      ))}
      <div className="relative" style={{ boxShadow: 'var(--shadow-e3)' }}>
        <Panel hard={hard} />
      </div>
    </div>
  );
}

function Bento({ hard }) {
  const tile = hard
    ? 'rounded-none border-2 border-line bg-surface shadow-e2'
    : 'rounded-[12px] border border-line bg-surface shadow-e1';
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2 sm:row-span-2">
        <Panel hard={hard} />
      </div>
      <div className={cn(tile, 'flex flex-col justify-center p-4')}>
        <div className="font-mono text-[28px] font-bold leading-none text-accent">92</div>
        <div className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-faint">Top score</div>
      </div>
      <div className={cn(tile, 'flex flex-col justify-center p-4')}>
        <div className="flex items-center gap-2 text-ink">
          <Video size={14} /> <Mic size={14} />
        </div>
        <div className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          Avatar or voice
        </div>
      </div>
      {/* The one tilted tile — depth as an accent, not applied to everything. */}
      <div className="sm:col-span-3 [perspective:1000px]">
        <div
          className={cn(tile, 'flex items-center gap-3 p-4 [transform:rotateX(8deg)]')}
          style={{ boxShadow: 'var(--shadow-e3)' }}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
            5 agents
          </span>
          <span className="text-[13px] text-ink-muted">
            read, score, interview &mdash; on fixed weights
          </span>
        </div>
      </div>
    </div>
  );
}

function Treatment({ id, hard }) {
  if (id === 'perspective') return <Perspective hard={hard} />;
  if (id === 'stack') return <Stack hard={hard} />;
  if (id === 'bento') return <Bento hard={hard} />;
  if (id === 'three') {
    return (
      <Suspense
        fallback={
          <div className="flex h-[260px] items-center justify-center rounded-[12px] border border-line bg-surface text-[12px] text-ink-subtle">
            loading three.js&hellip;
          </div>
        }
      >
        <ThreeScene />
      </Suspense>
    );
  }
  return <Panel hard={hard} />;
}

function Cell({ palette, treatment }) {
  return (
    <div className={cn(palette.id, 'font-text px-6 py-14 sm:px-10')}>
      <div className="mx-auto max-w-[54rem]">
        <p
          className={cn(
            'mb-5 font-mono text-[11px] uppercase text-ink-faint',
            palette.mono ? 'tracking-[0.24em]' : 'tracking-[0.2em]',
          )}
        >
          {palette.mono ? '[ 5 agents · online ]' : 'Multi-agent hiring'}
        </p>

        <h2
          className={cn(
            'font-display text-ink',
            palette.mono
              ? 'text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.03em]'
              : 'text-[clamp(1.875rem,4.5vw,3rem)] font-black leading-[0.95] tracking-[-0.04em]',
            palette.hard && 'uppercase',
          )}
        >
          Hire smarter with <span className="text-accent">AI agents</span>
        </h2>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            className={cn(
              'inline-flex items-center gap-2 bg-accent px-4 py-2.5 text-[13px] font-bold text-ink-inverse',
              palette.hard ? 'rounded-none border-2 border-line shadow-e2' : 'rounded-[10px]',
              palette.mono && 'font-mono uppercase tracking-[0.1em]',
            )}
          >
            {palette.mono ? '[ start hiring ]' : 'Start hiring'}
            {!palette.mono && <ArrowRight size={14} />}
          </button>
        </div>

        <div className="mt-12">
          <Treatment id={treatment.id} hard={palette.hard} />
        </div>
      </div>
    </div>
  );
}

function Caption({ label, note, hex }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-white/10 bg-zinc-900 px-6 py-3">
      <span className="text-[13px] font-semibold text-zinc-100">{label}</span>
      {note && <span className="text-[12px] text-zinc-400">{note}</span>}
      {hex && (
        <span className="ml-auto flex items-center gap-2">
          {hex.map(h => (
            <span key={h} className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm ring-1 ring-white/20" style={{ background: h }} />
              <code className="font-mono text-[10px] text-zinc-500">{h}</code>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export default function StyleLab() {
  return (
    <div className="min-h-screen bg-zinc-950 font-sans">
      <header className="border-b border-white/10 px-6 py-6">
        <h1 className="text-[15px] font-semibold text-zinc-100">Style lab</h1>
        <p className="mt-1 max-w-[52rem] text-[13px] leading-relaxed text-zinc-400">
          Same copy, same data everywhere. Two palettes &times; five depth treatments, then two
          palettes shown flat for reference. Unlisted route &mdash; delete once a direction is chosen.
        </p>
      </header>

      {TREATMENTS.map(t => (
        <React.Fragment key={t.id}>
          <div className="border-y border-white/10 bg-zinc-800 px-6 py-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
              {t.name}
            </span>
            <span className="ml-3 text-[12px] text-zinc-400">{t.note}</span>
          </div>
          {PALETTES.map(p => (
            <section key={`${t.id}-${p.id}`}>
              <Caption label={`${t.name} · ${p.name}`} hex={p.hex} />
              <Cell palette={p} treatment={t} />
            </section>
          ))}
        </React.Fragment>
      ))}

      <div className="border-y border-white/10 bg-zinc-800 px-6 py-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
          Other palettes, flat
        </span>
        <span className="ml-3 text-[12px] text-zinc-400">
          For reference &mdash; these two were shown earlier
        </span>
      </div>
      {FLAT_ONLY.map(p => (
        <section key={p.id}>
          <Caption label={p.name} hex={p.hex} />
          <Cell palette={p} treatment={{ id: 'flat' }} />
        </section>
      ))}
    </div>
  );
}
