import React from 'react';

/* The conversation sculpture (styles/studio-conversation.css): eleven rust
 * columns on a plinth, the picture of a conversation on the Interviews view
 * and in the voice interview. It is decorative, so screen readers skip it.
 * In a live interview the columns follow the candidate's microphone, while
 * the microphone is on and the interviewer is quiet; while the interviewer
 * speaks they brighten instead. */
const CONTOURS = [28, 47, 73, 104, 139, 164, 132, 95, 66, 42, 25];

export default function ConversationSculpture({ variant = 'feature', live = false, level = 0, speaking = false, muted = false }) {
  const signal = live && !speaking && !muted && Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  return (
    <div
      className="sc-conversation"
      data-variant={variant}
      data-live={live}
      data-speaking={live && speaking}
      data-muted={live && muted}
      aria-hidden="true"
    >
      <div className="sc-wave-stage">
        <div className="sc-wave-orbit" />
        <div className="sc-wave-plinth" />
        <div className="sc-wave-body">
          {CONTOURS.map((height, index) => (
            <i
              key={index}
              className="sc-wave-column"
              style={{ '--column-height': `${height}px`, '--signal-scale': 1 + signal * (0.1 + (index % 3) * 0.08) }}
            />
          ))}
        </div>
        <span className="sc-wave-pebble" />
      </div>
      {variant === 'feature' && (
        <div className="sc-wave-caption">
          <span>A little space to listen.</span>
          <small>GOOD QUESTIONS. BETTER CONVERSATIONS.</small>
        </div>
      )}
    </div>
  );
}
