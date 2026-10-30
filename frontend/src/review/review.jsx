import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '../styles/index.css';
import './review.css';

import { AppContext } from '../context/AppContext';
import { computeAnalytics } from '../context/analytics';
import api from '../services/api';
import ProductLayer from '../components/ProductLayer';
import WorkspaceShell from '../components/studio/WorkspaceShell';
import Home from '../components/home/Home';
import InterviewReportView from '../components/shared/InterviewReportView';
import ATSResultsView from '../components/pipeline/ATSResultsView';
import { candidates as sampleCandidates, pipeline, report, results, session, statuses } from './fixtures';

/* The design review page (design-review.html), for development only: every
 * product page, the real component, with the sample people and results in
 * fixtures.js, and nothing sent anywhere. Pick a page in the bar at the top.
 * A page is added here once it has come over in the Studio design. */
const PAGES = [
  ['/review/results', 'Screening results'],
  ['/review/report', 'Interview report'],
  ['/', 'Homepage'],
];

function ReviewBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const here = location.pathname + location.search;
  return (
    <div className="review-bar">
      <strong>STUDIO / DESIGN REVIEW</strong>
      <span>Sample people &amp; results · No live changes</span>
      <select aria-label="Review a page" value={here} onChange={e => navigate(e.target.value)}>
        {!PAGES.some(([path]) => path === here) && <option value={here}>Current page</option>}
        {PAGES.map(([path, label]) => <option key={path} value={path}>{label}</option>)}
      </select>
      <a href="/">Open live app ↗</a>
    </div>
  );
}

const reload = () => window.location.reload();

export function Review() {
  const [candidates, setCandidates] = useState(sampleCandidates);
  const [selectedIds, setSelectedIds] = useState([101, 102, 103]);
  const [anonymize, setAnonymize] = useState(false);
  const [candidateSession, setCandidateSession] = useState(session);
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: '**A closer look at your selection.**\n\nMaya brings product design and research experience. Alex adds frontend engineering and accessibility. Jordan contributes product strategy. What would you like to explore?',
  }]);
  const noOp = useCallback(() => {}, []);
  const selectedCandidates = candidates.filter(c => selectedIds.includes(c.id));

  // Everything AppProvider offers, kept in this page.
  const value = {
    candidates, setCandidates, selectedIds, selectedCandidates,
    uploadProgress: {}, loading: false, deleting: false,
    loadCandidates: noOp,
    uploadResume: async () => {
      window.alert('Uploads are disabled in design review. Open the live app to add a résumé.');
    },
    deleteCandidate: (id) => {
      setCandidates(prev => prev.filter(c => c.id !== id));
      setSelectedIds(prev => prev.filter(x => x !== id));
    },
    clearAllCandidates: async () => {
      setCandidates([]);
      setSelectedIds([]);
    },
    toggleSelection: id => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])),
    selectAll: () => setSelectedIds(candidates.map(c => c.id)),
    clearSelection: () => setSelectedIds([]),
    anonymize, setAnonymize,
    analytics: computeAnalytics(selectedCandidates),
    messages,
    suggestions: ['Compare their strengths', 'What should I ask in an interview?'],
    isTyping: false,
    sendMessage: text => setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: 'This is a design preview. In the live workspace, this conversation uses the résumés you select to answer your question.' },
    ]),
    initChat: noOp,
    clearChat: () => setMessages([]),
    getDisplayName: (c, i) => (anonymize ? `Candidate ${i + 1}` : c.name),
    getAvatarGradient: () => '#dce4cc',
    candidateSession, setCandidateSession,
    hiringManager: { name: 'Jamie Parker', company: 'Fieldwork Studio', email: 'jamie@example.com' },
    loginHiringManager: noOp,
    logoutHiringManager: noOp,
  };

  return (
    <AppContext.Provider value={value}>
      <MemoryRouter initialEntries={[PAGES[0][0]]}>
        <ReviewBar />
        <ProductLayer>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/review/results"
              element={(
                <WorkspaceShell
                  active="screening"
                  title={<>A closer look at <em>the fit.</em></>}
                  subtitle="Illustrative screening results for design review."
                >
                  <ATSResultsView embedded pipelineResult={pipeline()} onBack={reload} onRunAgain={reload} />
                </WorkspaceShell>
              )}
            />
            <Route
              path="/review/report"
              element={(
                <WorkspaceShell active="interviews" title={<>The conversation, <em>considered.</em></>}>
                  <InterviewReportView viewer="manager" report={report} candidateId={101} candidateEmail="maya@example.com" />
                </WorkspaceShell>
              )}
            />
            <Route
              path="*"
              element={(
                <div className="review-unavailable">
                  <h1>Back to the studio.</h1>
                  <p>This destination is part of the live app. Choose another page above to continue the design review.</p>
                </div>
              )}
            />
          </Routes>
        </ProductLayer>
      </MemoryRouter>
    </AppContext.Provider>
  );
}

/* What the backend would answer, in its own shapes (fixtures.js), or null for
 * an action the review page doesn't do. */
function respond(path, body = {}) {
  if (path.includes('interview-statuses')) return statuses;
  if (path.includes('get-all-interview-results')) return { results, count: results.length };
  if (path.includes('candidate/me')) {
    return {
      access: true,
      name: session.name,
      candidate_id: session.candidate_id,
      has_interview: session.has_interview,
      interview_config: { ...session.interview_config, status: 'pending' },
      interview_completed: session.interview_completed,
    };
  }
  if (path.includes('candidate/my-report')) return { interview_completed: true, interview_report: report };
  if (path.includes('scan-resume')) {
    return {
      logs: [{ step: 'resume', status: 'success', msg: 'Sample résumé details ready.' }],
      profiles: { github: null, linkedin: null, portfolio: null },
      ai_summary: 'A considered approach to product design, grounded in research and close collaboration with engineering.',
      contact: {},
    };
  }
  if (path.includes('pipeline/run')) return pipeline(body.candidate_ids, body.role);
  if (path.includes('hiring-agent')) {
    return {
      report: '## A thoughtful fit\n\nThe sample candidate brings research, product design, and design system experience.\n\n### What to explore\nAsk about a project that changed after research, and how the team measured its success.',
      ats_score: 98,
    };
  }
  if (path.endsWith('/sourcer/runs')) return { runs: [] };
  if (path.includes('advisor/chat')) {
    return {
      reply: 'In the live app, this conversation uses your résumé and the selected mode. This sample response is here to let you review the layout.',
      mode: body.mode || 'general',
      suggestions: [],
    };
  }
  if (path.includes('/chat/focus')) {
    return {
      response: 'In the live app, this conversation draws on the candidate file. This is a sample response for design review.',
      suggestions: [],
    };
  }
  return null;
}

const readBody = (text) => {
  try { return JSON.parse(text || '{}'); } catch { return {}; } // an upload: not read here
};

export function startReview() {
  if (!import.meta.env.DEV) return;

  // No camera or microphone, no saved sessions of the real app, and no
  // request leaves the page: fetch and the API client both answer from here.
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error('Recording is disabled in design review. Open the live app for an interview.');
    };
  }
  const storage = new Map([['resumate_onboarded', 'true'], ['resumate_candidate', JSON.stringify(session)]]);
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, val) => storage.set(key, String(val)),
      removeItem: key => storage.delete(key),
      clear: () => storage.clear(),
      key: index => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    },
  });
  window.fetch = async (url, options = {}) => {
    const data = respond(String(url), readBody(options.body));
    // Long enough to see a screening run's progress.
    if (String(url).includes('pipeline/run')) await new Promise(resolve => setTimeout(resolve, 1800));
    return new Response(
      JSON.stringify(data ?? { detail: 'This action needs the live app. It is disabled in design review.' }),
      { status: data === null ? 400 : 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  api.defaults.adapter = async (config) => {
    const data = respond(String(config.url), readBody(config.data));
    if (data === null) throw new Error('This action is disabled in design review.');
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };

  createRoot(document.getElementById('root')).render(<Review />);
}
