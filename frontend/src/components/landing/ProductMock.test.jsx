import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ProductMock from './ProductMock';

/* The value of these tests is not layout -- it is honesty. This panel is
 * marketing: it claims to show what the product does. If someone later edits a
 * score or a label and the two stop agreeing, the landing page starts
 * advertising behaviour the backend does not have, and nothing else would
 * catch it.
 *
 * Thresholds mirror backend/app/services/ats_service.py:
 *   >= 75 Strong Fit, >= 55 Good Fit, >= 35 Consider, else No Match
 */
function verdictFor(score) {
  if (score >= 75) return 'Strong Fit';
  if (score >= 55) return 'Good Fit';
  if (score >= 35) return 'Consider';
  return 'No Match';
}

describe('ProductMock', () => {
  it('is hidden from assistive tech, since the prose above says the same thing', () => {
    const { container } = render(<ProductMock />);
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('every score shown sits beside the verdict the backend would give it', () => {
    const { container } = render(<ProductMock />);

    // Find each row by its score ring (the only conic-gradient in the panel),
    // then read the score and the verdict out of that row together. Regexing
    // container.textContent does not work here -- it concatenates with no
    // separators, so "8s92Maya" has no word boundary around the score.
    const rings = [...container.querySelectorAll('[style*="conic-gradient"]')];
    expect(rings.length).toBeGreaterThan(0);

    const known = ['Strong Fit', 'Good Fit', 'Consider', 'No Match'];

    rings.forEach(ring => {
      const score = Number(ring.textContent.trim());
      expect(Number.isFinite(score)).toBe(true);

      const row = ring.parentElement;
      const verdict = known.find(v => row.textContent.includes(v));
      expect(verdict, `row for score ${score} shows no known verdict`).toBeTruthy();
      expect(verdict).toBe(verdictFor(score));
    });
  });

  it('renders a row per candidate with a skills bar scaled to its value', () => {
    const { container } = render(<ProductMock />);
    const bars = [...container.querySelectorAll('[style*="width"]')].map(el => el.style.width);
    // Bars must differ -- a mock where every bar is 100% would reproduce the
    // exact defect the real analytics view has.
    expect(new Set(bars).size).toBeGreaterThan(1);
    bars.forEach(w => expect(w).not.toBe('100%'));
  });

  it('does not invent a verdict label the backend cannot return', () => {
    const { container } = render(<ProductMock />);
    expect(container.textContent).not.toMatch(/Excellent|Perfect Match|Top Pick|A\+/);
  });
});
