import React from 'react';
import { Link } from 'react-router-dom';

/* Studio's ending, with a quiet way to sign up beside it. */
export default function Closing({ onMeetNext, startHiringTo }) {
  return (
    <section className="wrap closing" aria-labelledby="closing-title">
      <div>
        <div className="eyebrow">Good things start with people</div>
        <h2 id="closing-title">Your next great hire<br />has a <em>story to tell.</em></h2>
      </div>
      <div className="closing-side">
        <p>Take another look. A different perspective might be the beginning of something great.</p>
        <div className="closing-actions">
          {/* The link itself scrolls back up to the file, which now shows the next person. */}
          <a className="primary" href="#candidate-file" onClick={onMeetNext}>
            Meet the next sample candidate <span className="arrow" aria-hidden="true">↗</span>
          </a>
          <Link className="quiet-link" to={startHiringTo}>or start hiring</Link>
        </div>
      </div>
    </section>
  );
}
