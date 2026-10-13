import React, { useId } from 'react';

/* ResuMate's mark, drawn once, for the product's pages. Each part of the app
 * keeps its own colours: the hiring side is amber and the candidate portal is
 * blue. (The homepage draws Studio's own mark, in styles/studio.css.)
 *
 * Colours are set through `style` rather than the stopColor, stroke and fill
 * attributes, so a CSS variable would work there too: in the XML attribute
 * form it is not honoured across engines, but the inline style form is a
 * plain CSS property and is.
 *
 * It always sits next to the name, so screen readers skip it.
 */
const TONES = {
  hiring: { from: '#F59E0B', to: '#D97706', mark: '#000' },
  candidate: { from: '#3B82F6', to: '#2563EB', mark: '#fff' },
};

export default function Logo({ size = 32, tone = 'hiring' }) {
  // Its own gradient id, so two marks on one page don't share one.
  const gradient = `logo${useId().replace(/:/g, '')}`;
  const { from, to, mark } = TONES[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: from }} />
          <stop offset="100%" style={{ stopColor: to }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradient})`} />
      <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" strokeWidth="1.5" fill="none" style={{ stroke: mark }} />
      <circle cx="16" cy="16" r="3" style={{ fill: mark }} />
    </svg>
  );
}
