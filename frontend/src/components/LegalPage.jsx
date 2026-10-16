import React from 'react';
import { Link } from 'react-router-dom';

import PageFrame from './auth/PageFrame';
import useHeadingFocus from '../hooks/useHeadingFocus';

/**
 * Terms of Service / Privacy Policy pages.
 *
 * PLACEHOLDER COPY — replace the body text with real legal language (from a
 * lawyer or a generator like Termly/iubenda) before going to production with
 * paying customers. The structure, routes, and footer links are wired; only
 * the wording is a stand-in.
 *
 * In the sign-in pages' design (styles/studio-auth.css): the title on the left,
 * staying in view, and the sections on the right, numbered.
 */

const LAST_UPDATED = 'June 2026';

const TERMS_SECTIONS = [
  ['Acceptance of terms', 'By using ResuMate AI you agree to these terms. [TODO: replace with reviewed legal copy.]'],
  ['Use of the service', 'ResuMate provides AI-assisted hiring tools. You are responsible for how you use candidate data and for complying with applicable employment and privacy law. [TODO]'],
  ['Accounts', 'You must provide accurate information and keep your credentials secure. You are responsible for activity under your account. [TODO]'],
  ['Acceptable use', 'Do not use the service to discriminate unlawfully, scrape third-party data without consent, or upload content you lack rights to. [TODO]'],
  ['AI-generated content', 'Evaluations, rankings, and interview reports are AI-assisted aids, not hiring decisions. You remain responsible for all hiring decisions. [TODO]'],
  ['Limitation of liability', 'The service is provided "as is" without warranties. [TODO: replace with reviewed liability language.]'],
  ['Changes', 'We may update these terms; continued use means acceptance. [TODO]'],
];

const PRIVACY_SECTIONS = [
  ['What we collect', 'Hiring-manager account details (name, email, company) and candidate data you upload (resumes, contact info, interview transcripts). [TODO]'],
  ['How we use it', 'To parse resumes, rank candidates, conduct AI interviews, and generate reports for the hiring manager who uploaded the data. [TODO]'],
  ['Data isolation', 'Each hiring manager can only access their own candidates and interviews; data is partitioned per account.'],
  ['Candidate rights', 'Candidates may request erasure of their own data at any time through the candidate portal ("Delete my data"). We honour deletion across our database, search index, and file storage.'],
  ['Public profiles (Find candidates)', 'When a hiring manager runs Find candidates, we read public GitHub profiles and public web search results about people who may fit the role. We keep a short written judgement, the score and a link to the public profile, never a copy of the page. Hiring managers can delete a search, with everyone it found, at any time.'],
  ['Retention', 'Candidate data may be removed after a period of inactivity under our retention policy. [TODO: state the exact window.]'],
  ['Sub-processors', 'We use OpenAI (AI processing), and optionally LiveKit/Simli (interviews), SendGrid (email), S3-compatible storage (files), and the GitHub API and Tavily (public profile search for Find candidates). [TODO: confirm and link DPAs.]'],
  ['Contact', 'For privacy requests, contact [TODO: privacy@yourdomain]. '],
];

function LegalPage({ title, sections }) {
  const heading = useHeadingFocus();
  return (
    <PageFrame title={`${title} — ResuMate`} skipTo="page-content" skipLabel="Skip to content">
      <main className="legal-layout" id="page-content" tabIndex={-1}>
        <div className="legal-head">
          <p className="eyebrow issue">LEGAL</p>
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          <p className="legal-updated">Last updated: {LAST_UPDATED}</p>
          <div className="notice notice-info">
            <span className="notice-icon" aria-hidden="true">i</span>
            <p className="notice-body">Placeholder text — replace with reviewed legal copy before launch.</p>
          </div>
        </div>
        <div className="legal-body">
          {sections.map(([name, text], i) => (
            <section key={name} className="legal-section">
              <span className="legal-number" aria-hidden="true">{`${String(i + 1).padStart(2, '0')} /`}</span>
              <h2>{name}</h2>
              <p>{text}</p>
            </section>
          ))}
        </div>
      </main>
    </PageFrame>
  );
}

export function TermsPage() {
  return <LegalPage title="Terms of Service" sections={TERMS_SECTIONS} />;
}

/* Not part of the placeholder text: the way to have data deleted. */
const DELETING = ['Deleting your data', (
  <>
    Anyone can have everything we hold about their email address deleted, whether or not they were
    invited to an interview: <Link className="text-link" to="/privacy/delete">request deletion</Link>.
  </>
)];

export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" sections={[...PRIVACY_SECTIONS, DELETING]} />;
}
