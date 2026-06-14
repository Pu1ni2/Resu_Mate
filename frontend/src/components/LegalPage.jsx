import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Terms of Service / Privacy Policy pages.
 *
 * PLACEHOLDER COPY — replace the body text with real legal language (from a
 * lawyer or a generator like Termly/iubenda) before going to production with
 * paying customers. The structure, routes, and footer links are wired; only
 * the wording is a stand-in.
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
  ['Retention', 'Candidate data may be removed after a period of inactivity under our retention policy. [TODO: state the exact window.]'],
  ['Sub-processors', 'We use OpenAI (AI processing), and optionally LiveKit/Simli (interviews), SendGrid (email), and S3-compatible storage (files). [TODO: confirm and link DPAs.]'],
  ['Contact', 'For privacy requests, contact [TODO: privacy@yourdomain]. '],
];

function LegalPage({ title, sections }) {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#0B0B12', color: '#E4E4E7', padding: '40px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24,
            background: 'transparent', border: 'none', color: '#A1A1AA', cursor: 'pointer', fontSize: 14,
          }}
        >
          <ArrowLeft size={16} /> Back to home
        </button>
        <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>{title}</h1>
        <p style={{ color: '#71717A', fontSize: 13, marginBottom: 32 }}>Last updated: {LAST_UPDATED}</p>

        <div style={{
          marginBottom: 28, padding: '12px 16px', borderRadius: 8,
          background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
          color: '#FCD34D', fontSize: 13,
        }}>
          Placeholder text — replace with reviewed legal copy before launch.
        </div>

        {sections.map(([heading, body]) => (
          <section key={heading} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: '#F1F5F9' }}>{heading}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: '#A1A1AA' }}>{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

export function TermsPage() {
  return <LegalPage title="Terms of Service" sections={TERMS_SECTIONS} />;
}

export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}
