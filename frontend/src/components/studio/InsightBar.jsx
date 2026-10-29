import { useEffect, useRef, useState } from 'react';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';

export default function InsightBar({ percent, detail, color, index = 0 }) {
  const element = useRef(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (visible) return;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [reducedMotion, visible]);

  const width = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div
      ref={element}
      className="sd-insight-bar"
      role="img"
      aria-label={detail}
      tabIndex={0}
      data-revealed={visible || reducedMotion}
      data-dismissed={dismissed}
      style={{ '--bar-delay': `${Math.min(index, 5) * 55}ms` }}
      onKeyDown={event => { if (event.key === 'Escape') setDismissed(true); }}
      onBlur={() => setDismissed(false)}
      onMouseLeave={() => setDismissed(false)}
    >
      <div className="clean-bar-track" aria-hidden="true">
        <div className="clean-bar-fill" style={{ width: `${width}%`, ...(color ? { background: color } : {}) }} />
      </div>
      <span className="sd-chart-tooltip" aria-hidden="true">{detail}</span>
    </div>
  );
}
