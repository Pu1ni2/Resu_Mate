import React from 'react';

import { PEOPLE } from './samples';

const twoDigits = n => String(n).padStart(2, '0');

/* The candidate file: a sample résumé on Studio's sun and paper, with a sticky
 * note, showing whoever is chosen below it. Only the sheet and the note are
 * content; the rest is decoration. */
export default function CandidateFile({ person }) {
  const p = PEOPLE[person];
  return (
    <div className="composition" id="candidate-file" role="group" aria-label="A sample candidate file">
      <div className="sun" aria-hidden="true" /><div className="orbit-line" aria-hidden="true" /><div className="paper-back" aria-hidden="true" />
      <div className="stamp" aria-hidden="true"><span>Built around</span><b>people.</b><span>Powered by AI</span></div>
      <article className="resume">
        <div className="sheet-top"><span className="sheet-mark">ResuMate</span><span>THE CANDIDATE EDIT</span></div>
        <div className="candidate-top">
          <div className="avatar" aria-hidden="true" style={{ background: p.color }}>{p.initials}</div>
          <div><h2 className="sheet-name">{p.name}</h2><div className="sheet-role">{p.role}</div></div>
        </div>
        <div className="sheet-label">The person behind the profile</div>
        <p className="sheet-summary">{p.summary}</p>
        <div className="sheet-label">Areas of expertise</div>
        <div className="sheet-skills">
          {p.skills.map(skill => <span key={skill} className="sheet-skill">{skill}</span>)}
        </div>
        <div className="evidence">
          <div className="sheet-label">A closer look</div>
          {p.evidence.map(line => (
            <div key={line} className="evidence-row"><span className="evidence-icon" aria-hidden="true">✓</span><p>{line}</p></div>
          ))}
        </div>
        <div className="sheet-foot"><span>FICTIONAL PROFILE · DEMO ONLY</span><span>{twoDigits(person + 1)} / {twoDigits(PEOPLE.length)}</span></div>
      </article>
      <aside className="annotation">
        <div className="annotation-head"><span aria-hidden="true">✳</span> A conversation starter</div>
        <div className="annotation-title">{p.noteTitle}</div>
        <p>{p.note}</p>
      </aside>
    </div>
  );
}
