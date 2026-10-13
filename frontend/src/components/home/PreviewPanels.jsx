import React from 'react';

import { PEOPLE, WAVE_BARS } from './samples';
import { questionsFor } from './homeModel';

/* The preview's four panels. All four stay on the page and only the open one
 * shows, as the tabs point at each by id. */

function Face({ person }) {
  const p = PEOPLE[person];
  return <span className="face" aria-hidden="true" style={{ background: p.color }}>{p.initials}</span>;
}

function Person({ person, detail, children }) {
  const p = PEOPLE[person];
  return (
    <div className="person">
      <Face person={person} />
      <div><strong>{p.name}</strong><small>{detail || p.title}</small></div>
      {children}
    </div>
  );
}

const Chips = ({ items }) => <div className="chips">{items.map(item => <span key={item}>{item}</span>)}</div>;

function Trust({ children }) {
  return <div className="trust"><span className="tick" aria-hidden="true">✓</span><div>{children}</div></div>;
}

function Panel({ id, open, top, status, title, children }) {
  return (
    <section className="panel" id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} tabIndex={0} hidden={!open}>
      <div className="panel-top"><span>{top}</span><span className="panel-status">{status}</span></div>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function PreviewPanels({ state, onView, onInterview, onNextQuestion, onPreviewInterview }) {
  const p = PEOPLE[state.person];
  const questions = questionsFor(state.person);

  return (
    <>
      <Panel id="screen" open={state.tab === 'screen'} top="Shortlist · Sample roles" status="Sample" title="Your next great hire.">
        <div className="table-label"><span>Candidate</span><span>Explore profile</span></div>
        {PEOPLE.map((candidate, i) => (
          <div key={candidate.name} className="row">
            <Person person={i} />
            <Chips items={candidate.skills.slice(0, 2)} />
            <button className="row-action" type="button" aria-label={`View ${candidate.name}'s sample profile`} onClick={() => onView(i)}>
              View <span aria-hidden="true">↗</span>
            </button>
          </div>
        ))}
        <Trust>A résumé is a starting point. Explore the evidence behind it.</Trust>
      </Panel>

      <Panel id="interview" open={state.tab === 'interview'} top="Voice interview" status="Sample question" title="A conversation with context.">
        <div className="interview">
          <div className="conversation">
            <div className="wave" aria-hidden="true">
              {WAVE_BARS.map((height, i) => <i key={i} style={{ height }} />)}
            </div>
            <div className="q-number">Question {state.question + 1} of {questions.length}</div>
            <p className="question">“{questions[state.question]}”</p>
            <button className="row-action" type="button" onClick={onNextQuestion}>
              Next sample question <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="aside">
            <Person person={state.person} />
            <p>Questions shaped around the role and the candidate's experience.</p>
            <div className="mini-label">Focus areas</div>
            <Chips items={p.skills.slice(0, 2)} />
          </div>
        </div>
        <Trust>Consent before the conversation. Clear expectations throughout.</Trust>
      </Panel>

      <Panel id="evaluate" open={state.tab === 'evaluate'} top="Candidate evaluation" status="Illustrative" title="Context for your next decision.">
        <Person person={state.person}>
          <button className="row-action push" type="button" onClick={onInterview}>Interview <span aria-hidden="true">↗</span></button>
        </Person>
        <div className="report">
          <div className="cell"><h4>Experience to explore</h4><p>{p.evidence.join(' ')}</p></div>
          <div className="cell"><h4>A useful follow-up</h4><p>{p.note}</p></div>
        </div>
        <Trust>AI supports the evaluation. The hiring decision stays with you.</Trust>
      </Panel>

      <Panel id="candidate" open={state.tab === 'candidate'} top="Candidate portal" status="Sample experience" title="Your experience matters.">
        <div className="portal">
          <Person person={state.person} detail="Your career workspace" />
          <h4>A little preparation. A better conversation.</h4>
          <p>Explore résumé feedback, prepare with your AI advisor, and get ready for your interview.</p>
          <a className="primary" href="#platform" onClick={(event) => { event.preventDefault(); onPreviewInterview(); }}>
            Preview the interview <span className="arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </Panel>
    </>
  );
}
