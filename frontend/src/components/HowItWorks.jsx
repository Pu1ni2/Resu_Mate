import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, FileText, Search, SlidersHorizontal, Mic, ClipboardCheck, Users, Globe, MessageSquare, CheckCircle2 } from 'lucide-react';
import PageFrame from './auth/PageFrame';
import '../styles/studio-explainer.css';

const steps = [
  {
    label: 'Bring experience', short: 'The résumé', icon: FileText,
    heading: 'A person, beyond the page.',
    description: 'Start with the experience someone brings. Upload résumés to build a candidate library, or use talent search to explore your uploads, GitHub, and public web profiles.',
    points: ['Extract skills, experience, education, and contact details.', 'Keep the candidate’s information together in their own file.', 'Open the extracted résumé text; the original file is available when file storage is enabled.'],
    handoff: 'A candidate file you can work from.',
    paperTitle: 'The candidate file', paperLabel: 'EXPERIENCE, IN CONTEXT',
    paperRows: [['Experience', 'Roles & responsibilities'], ['Capabilities', 'Skills & projects'], ['Background', 'Education & qualifications']],
    note: 'A résumé is a starting point. Review extracted details against the source.',
  },
  {
    label: 'Understand fit', short: 'The brief', icon: SlidersHorizontal,
    heading: 'Give fit a little context.',
    description: 'Tell ResuMate what the role needs. Screen selected candidates against a job description, skills, and experience, then read the reasoning behind the results.',
    points: ['Choose the people you want to screen.', 'Compare candidates against the requirements of this role.', 'Look at the strengths and missing evidence behind a match.'],
    handoff: 'A role-specific comparison to review.',
    paperTitle: 'The role brief', paperLabel: 'WHAT MATTERS HERE',
    paperRows: [['Must-haves', 'Essential for the work'], ['Experience', 'Relevant responsibilities'], ['Nice-to-haves', 'Room to grow']],
    note: 'A match score depends on the brief and available information. It is a guide for review.',
  },
  {
    label: 'Look closer', short: 'The evidence', icon: Search,
    heading: 'Curiosity makes better questions.',
    description: 'Bring the résumé, public research, and evaluation into the same conversation. Explore relevant work, read the sources, and find the questions worth asking next.',
    points: ['Research public profiles and work, when those sources are available.', 'Use résumé intelligence to identify claims to explore in an interview.', 'Generate an evaluation in the context of the role.'],
    handoff: 'More context, and a sharper set of questions.',
    paperTitle: 'Research notes', paperLabel: 'FOLLOW THE EVIDENCE',
    paperRows: [['The source', 'Résumé or public profile'], ['The context', 'Relevant work & projects'], ['The question', 'What would you like to know?']],
    note: 'Public profiles can be incomplete or belong to someone else. Verify the person and the source.',
  },
  {
    label: 'Have a conversation', short: 'The interview', icon: Mic,
    heading: 'Let experience find its voice.',
    description: 'Create an interview around the candidate and the role. Send an invitation, let the candidate review consent and prepare their microphone, then give their answers room to develop.',
    points: ['Choose the role, level, and areas to explore.', 'Invite the candidate to their own interview space.', 'Run a voice interview, with avatar interviews available when enabled.'],
    handoff: 'Answers in the candidate’s own words.',
    paperTitle: 'The conversation', paperLabel: 'LISTEN. THEN LOOK CLOSER.',
    paperRows: [['Before', 'Invitation & consent'], ['During', 'Questions & answers'], ['After', 'Transcript & feedback']],
    note: 'Interview invitations are sent by the server. Outreach emails remain drafts for you to review and send.',
  },
  {
    label: 'Review the picture', short: 'The decision', icon: ClipboardCheck,
    heading: 'Bring the evidence together.',
    description: 'Return to the candidate file with a fuller picture. Read the interview transcript and feedback, explore the available scores, and export the report for your review.',
    points: ['Review the answers alongside the evaluation.', 'Use scores where available; check the reasoning and gaps.', 'Export the report and make the next decision with your team.'],
    handoff: 'An informed next step. The decision stays with you.',
    paperTitle: 'The review', paperLabel: 'THE WHOLE PICTURE',
    paperRows: [['What we heard', 'Interview transcript'], ['What it suggests', 'Evaluation & feedback'], ['What comes next', 'Your judgement']],
    note: 'AI-generated analysis can be wrong. Review important conclusions and use your own judgement.',
  },
];

const tools = [
  { name: 'Résumé analysis', text: 'Turns uploaded experience into a structured candidate file.', icon: FileText, step: 0 },
  { name: 'Talent discovery', text: 'Explores uploads, GitHub, and web profiles against your brief.', icon: Users, step: 0 },
  { name: 'Screening', text: 'Compares the people you select with what the role needs.', icon: SlidersHorizontal, step: 1 },
  { name: 'Research & evaluation', text: 'Brings public sources, role context, and questions into view.', icon: Globe, step: 2 },
  { name: 'Interviewing', text: 'Shapes role-specific questions and a guided conversation.', icon: MessageSquare, step: 3 },
  { name: 'Reporting', text: 'Brings answers and feedback together for a human review.', icon: ClipboardCheck, step: 4 },
];

function WorkflowSculpture({ active }) {
  return (
    <div className="explainer-sculpture" aria-hidden="true">
      <div className="explainer-orbit-floor" />
      <div className="explainer-orbit-line" />
      <div className="explainer-orbit-line explainer-orbit-line-secondary" />
      <div className="explainer-sun"><div className="explainer-sun-groove" /><Users strokeWidth={1} /><span>THE PERSON<br />AT THE CENTRE</span></div>
      {steps.map(({ icon: Icon }, index) => <span key={index} className={`explainer-orbit-node node-${index} ${active === index ? 'is-active' : ''}`}><Icon size={22} strokeWidth={1.4} /></span>)}
      <div className="explainer-sculpture-caption"><span>0{active + 1}</span><div>{steps[active].short}<small>ONE CONNECTED JOURNEY</small></div></div>
    </div>
  );
}

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const current = steps[active];
  const ActiveIcon = current.icon;

  function explore(index) {
    setActive(index);
    document.getElementById('explainer-workflow')?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  return (
    <PageFrame title="How it works · ResuMate" skipTo="how-it-works" skipLabel="Skip to how it works">
      <main className="studio-explainer" id="how-it-works" tabIndex={-1}>
        <section className="explainer-hero" aria-labelledby="explainer-title">
          <div className="explainer-hero-copy">
            <p className="explainer-eyebrow"><span /> A CLOSER LOOK AT RESUMATE</p>
            <h1 id="explainer-title">From a résumé.<br />To a <em>conversation.</em></h1>
            <p className="explainer-lead">Thoughtful hiring is a series of better questions. Bring your candidates, context, and conversations together — with a person at the heart of it all.</p>
            <a className="explainer-text-link" href="#explainer-workflow">Follow the journey <ArrowDown size={16} /></a>
          </div>
          <WorkflowSculpture active={active} />
          <div className="explainer-hero-foot"><span>FIVE STEPS. ONE CONNECTED WORKSPACE.</span><p>Tools that help you look closer.<br /><em>Room for your judgement.</em></p></div>
        </section>

        <section id="explainer-workflow" className="explainer-workflow" aria-label="Explore the hiring workflow">
          <div className="explainer-step-nav" aria-label="Choose a workflow step">
            {steps.map(({ label, icon: Icon }, index) => (
              <button key={label} type="button" aria-pressed={active === index} aria-controls="explainer-step-detail" onClick={() => setActive(index)}>
                <span className="explainer-step-number">0{index + 1}</span><Icon size={18} strokeWidth={1.4} /><span>{label}</span><ArrowUpRight size={14} className="explainer-step-arrow" />
              </button>
            ))}
          </div>
          <div id="explainer-step-detail" className="explainer-step-detail" aria-live="polite" aria-atomic="true">
            <div className="explainer-step-story">
              <p className="explainer-eyebrow">CHAPTER 0{active + 1} <span /> {current.short.toUpperCase()}</p>
              <h2>{current.heading}</h2>
              <p className="explainer-description">{current.description}</p>
              <ul>{current.points.map(point => <li key={point}><Check size={15} strokeWidth={1.5} /><span>{point}</span></li>)}</ul>
              <p className="explainer-handoff"><ArrowRight size={18} />{current.handoff}</p>
            </div>
            <div className={`explainer-evidence-stage stage-${active}`}>
              <span className="explainer-stage-label">THE WORK, MADE VISIBLE</span>
              <article className="explainer-paper" aria-label={`Illustration: ${current.paperTitle}`}>
                <div className="explainer-paper-top"><span>RESUMATE / FIELD NOTES</span><ActiveIcon size={20} strokeWidth={1.2} /></div>
                <p className="explainer-paper-label">{current.paperLabel}</p>
                <h3>{current.paperTitle}</h3>
                <div className="explainer-paper-rule" />
                <dl>{current.paperRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                {active === 3 ? <div className="explainer-wave" aria-hidden="true">{[12, 24, 18, 37, 22, 46, 34, 20, 41, 30, 17, 25, 12, 34, 21, 42, 26, 15].map((height, index) => <i key={index} style={{ height }} />)}</div> : <div className="explainer-paper-end"><span /><CheckCircle2 size={20} strokeWidth={1.1} /><span /></div>}
                <footer><span>0{active + 1} / 05</span><span>THE PROCESS, ILLUSTRATED</span></footer>
              </article>
              <p className="explainer-margin-note">{current.note}</p>
            </div>
          </div>
          <div className="explainer-step-footer"><span>Explore at your own pace.</span><button type="button" onClick={() => setActive((active + 1) % steps.length)}>{active === steps.length - 1 ? 'Back to the beginning' : `Next: ${steps[active + 1].label}`}<ArrowRight size={16} /></button></div>
        </section>

        <section className="explainer-toolkit" aria-labelledby="explainer-toolkit-heading">
          <header><p className="explainer-eyebrow">A LITTLE HELP, AT EVERY STEP</p><h2 id="explainer-toolkit-heading">Different tools.<br /><em>A shared purpose.</em></h2><p>Each agent has a specific job. Together, they help you move from scattered information to a more considered conversation.</p></header>
          <div className="explainer-tool-grid">{tools.map(({ name, text, icon: Icon, step }, index) => <button key={name} type="button" onClick={() => explore(step)}><span className="explainer-tool-top"><Icon size={23} strokeWidth={1.3} /><span>0{index + 1}</span></span><h3>{name}</h3><p>{text}</p><span className="explainer-tool-link">See where it fits <ArrowUpRight size={15} /></span></button>)}</div>
        </section>

        <section className="explainer-principles" aria-labelledby="explainer-principles-heading">
          <div><p className="explainer-eyebrow">THE HUMAN PART MATTERS</p><h2 id="explainer-principles-heading">Helpful perspective.<br /><em>Your judgement.</em></h2></div>
          <div className="explainer-principle-list"><article><span>01</span><div><h3>Go back to the source.</h3><p>Read the résumé, explore the linked research, and listen to the answers. A generated summary is a starting point for review.</p></div></article><article><span>02</span><div><h3>Leave room for what’s missing.</h3><p>A missing skill or a quiet public profile is missing information. Use it to ask a better question.</p></div></article><article><span>03</span><div><h3>Make the decision thoughtfully.</h3><p>AI analysis and scores can be mistaken. They support a conversation; you and your team decide what happens next.</p></div></article></div>
        </section>

        <section className="explainer-cta" aria-labelledby="explainer-cta-heading"><div><p className="explainer-eyebrow">LET’S MEET THE POSSIBILITIES</p><h2 id="explainer-cta-heading">Your next great hire<br />starts with a <em>closer look.</em></h2></div><div><Link className="cta cta-primary" to="/hiring/register">Start hiring <ArrowUpRight size={17} /></Link><Link className="explainer-candidate-link" to="/candidate/login">I’m here as a candidate <ArrowRight size={15} /></Link></div></section>
      </main>
    </PageFrame>
  );
}
