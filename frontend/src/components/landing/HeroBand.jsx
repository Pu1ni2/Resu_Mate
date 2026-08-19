import React from 'react';
import { ArrowRight } from 'lucide-react';
import Button from '../ui/Button';
import ProductMock from './ProductMock';

/* HeroBand — navy page, one full-bleed gold band, and the product panel
 * straddling the edge of it.
 *
 * The point is structural, not chromatic. Five palettes were rejected while the
 * composition stayed the same underneath: label, headline, subhead, two
 * buttons, a centred panel. That skeleton is the template, and repainting it
 * could never fix it.
 *
 * So the band is the idea. A full-bleed block of accent running across the page
 * with the panel crossing its top edge — part of the panel on navy, part on
 * gold. Overlapping a boundary is something a person decides to do; a generator
 * centres things inside containers, because that is what is safe. It also gives
 * the accent a real job: it is a surface holding content, not a tint on a button.
 *
 * Everything is measured off the band, so the layout has one governing line
 * rather than a stack of independent margins.
 */
export default function HeroBand({ navigate }) {
  return (
    <section className="relative z-[1] overflow-hidden">
      {/* ─── Type block, on navy ─── */}
      <div className="px-6 pt-32 sm:px-10 sm:pt-40">
        <div className="mx-auto max-w-[72rem]">
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div>
              <p className="mb-7 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                Multi-agent hiring
              </p>

              <h1 className="font-display text-[clamp(2.75rem,6.6vw,5.25rem)] font-black leading-[0.94] tracking-[-0.04em] text-ink">
                Read every resume.
                <br />
                Interview the
                <br />
                <span className="text-accent">best three.</span>
              </h1>
            </div>

            {/* Right column carries the argument, so the headline does not have
                to be a paragraph. Set against the left edge of its column with a
                gold rule, which is the band's line repeated small. */}
            <div className="lg:pt-4">
              <div className="border-l-2 border-accent pl-5">
                <p className="text-[17px] leading-[1.6] text-ink-muted">
                  Five agents read the pile, score each candidate against the role on
                  fixed weights, and run the interview. Same resumes, same numbers,
                  every time &mdash; so a ranking is something you can explain.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button variant="primary" size="lg" onClick={() => navigate('/hiring')}>
                  Start hiring <ArrowRight size={16} />
                </Button>
                <Button variant="ghost" size="lg" onClick={() => navigate('/candidate/login')}>
                  I&rsquo;m a candidate
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── The band, and the panel across it ─── */}
      <div className="relative mt-20 sm:mt-24">
        {/* Full-bleed gold. Starts below the panel's top edge so the panel
            crosses it: the whole reason the composition exists. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[26%] bottom-0 bg-accent"
        />

        <div className="relative px-6 pb-16 sm:px-10 sm:pb-20">
          <div className="mx-auto max-w-[72rem]">
            <figure className="plate rounded-[6px] shadow-e3">
              <ProductMock framed={false} />
            </figure>

            {/* Caption sits on the gold, in navy — the accent doing the work of
                a surface rather than a highlight. */}
            <figcaption className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-inverse/70">
                Screening
              </span>
              <span className="text-[14px] font-medium text-ink-inverse">
                Twelve resumes, one role, ranked in eight seconds
              </span>
            </figcaption>
          </div>
        </div>
      </div>
    </section>
  );
}
