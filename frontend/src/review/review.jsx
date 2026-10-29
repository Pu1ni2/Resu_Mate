import '../styles/index.css';
import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { computeAnalytics } from '../context/analytics';
import api from '../services/api';
import Dashboard from '../components/Dashboard';
import CandidateFocus from '../components/CandidateFocus';
import CandidateDashboard from '../components/CandidateDashboard';
import SourcerPage from '../components/sourcer/SourcerPage';
import HowItWorks from '../components/HowItWorks';
import ConversationalInterviewRoom from '../components/ConversationalInterviewRoom';
import InterviewRoom from '../components/InterviewRoom';
import InterviewReportView from '../components/shared/InterviewReportView';
import ATSResultsView from '../components/pipeline/ATSResultsView';
import WorkspaceShell from '../components/studio/WorkspaceShell';
import Home from '../components/home/Home';
import ProductLayer from '../components/ProductLayer';
import { candidates as sampleCandidates, pipeline, report, results, session } from './fixtures';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import './review.css';

const pages = [
  ['/hiring?view=upload', 'Candidates'], ['/hiring/focus?candidate=101', 'Candidate file'],
  ['/hiring?view=screening', 'Screening brief'], ['/review/results', 'Screening results'],
  ['/hiring?view=interviews', 'Interviews'], ['/review/report', 'Interview report'],
  ['/hiring?view=analytics', 'Insights'], ['/hiring?view=chat', 'Candidate chat'],
  ['/hiring/sourcer', 'Find candidates'], ['/candidate/dashboard', 'Candidate portal'],
  ['/review/consent', 'Voice interview welcome'], ['/review/avatar', 'Avatar interview welcome'], ['/how-it-works', 'How it works'], ['/', 'Homepage'],
];
function ReviewBar() {
  const navigate = useNavigate();
  const location = useLocation();
  return <div className="review-bar"><strong>STUDIO / DESIGN REVIEW</strong><span>Sample people & results · No live changes</span><select aria-label="Review a page" value={location.pathname + location.search} onChange={e => navigate(e.target.value)}>{!pages.some(([path]) => path === location.pathname + location.search) && <option value={location.pathname + location.search}>Current page</option>}{pages.map(([path, label]) => <option key={path} value={path}>{label}</option>)}</select><a href="/">Open live app ↗</a></div>;
}
export function Review() {
  const [candidates, setCandidates] = useState(sampleCandidates);
  const [selectedIds, setSelectedIds] = useState([101, 102, 103]);
  const [anonymize, setAnonymize] = useState(false);
  const [candidateSession, setCandidateSession] = useState(session);
  const [messages, setMessages] = useState([{ role: 'assistant', content: '**A closer look at your selection.**\n\nMaya brings product design and research experience. Alex adds frontend engineering and accessibility. Jordan contributes product strategy. What would you like to explore?' }]);
  const noOp = useCallback(() => {}, []);
  const selectedCandidates = candidates.filter(c => selectedIds.includes(c.id));
  const value = {
    candidates, selectedIds, selectedCandidates, loading: false, uploadProgress: {}, analytics: computeAnalytics(selectedCandidates),
    hiringManager: { name: 'Jamie Parker', company: 'Fieldwork Studio', email: 'jamie@example.com' }, logoutHiringManager: noOp,
    anonymize, setAnonymize, candidateSession, setCandidateSession,
    loadCandidates: noOp, uploadResume: async () => { window.alert('Uploads are disabled in design review. Open the live app to add a résumé.'); },
    toggleSelection: id => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]),
    selectAll: () => setSelectedIds(candidates.map(c => c.id)), clearSelection: () => setSelectedIds([]),
    deleteCandidate: id => { setCandidates(prev => prev.filter(c => c.id !== id)); setSelectedIds(prev => prev.filter(x => x !== id)); }, clearAllCandidates: async () => { setCandidates([]); setSelectedIds([]); },
    getDisplayName: (c, i) => anonymize ? `Candidate ${i + 1}` : c.name, getAvatarGradient: () => '#dce4cc',
    messages, suggestions: ['Compare their strengths', 'What should I ask in an interview?'], isTyping: false,
    initChat: noOp, clearChat: () => setMessages([]), sendMessage: text => setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: 'This is a design preview. In the live workspace, this conversation uses the résumés you select to answer your question.' }]),
  };
  return <AppContext.Provider value={value}><MemoryRouter initialEntries={['/hiring?view=upload']}><ReviewBar /><ProductLayer><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/hiring" element={<Dashboard />} />
    <Route path="/hiring/focus" element={<CandidateFocus />} />
    <Route path="/hiring/sourcer" element={<SourcerPage />} />
    <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
    <Route path="/how-it-works" element={<HowItWorks />} />
    <Route path="/review/results" element={<WorkspaceShell active="screening" title={<>A closer look at <em>the fit.</em></>} subtitle="Illustrative screening results for design review."><ATSResultsView embedded pipelineResult={pipeline()} onBack={() => window.location.reload()} onRunAgain={() => window.location.reload()} /></WorkspaceShell>} />
    <Route path="/review/report" element={<WorkspaceShell active="interviews" title={<>The conversation, <em>considered.</em></>}><InterviewReportView viewer="manager" report={report} candidateId={101} candidateEmail="maya@example.com" /></WorkspaceShell>} />
    <Route path="/review/consent" element={<ConversationalInterviewRoom interviewId={41} candidateName="Maya Chen" candidateEmail="maya@example.com" onExit={() => window.location.reload()} onComplete={() => {}} />} />
    <Route path="/review/avatar" element={<InterviewRoom config={session.interview_config} candidateName="Maya Chen" candidateEmail="maya@example.com" onExit={() => window.location.reload()} onComplete={() => {}} />} />
    <Route path="*" element={<div className="review-unavailable"><h1>Back to the studio.</h1><p>This destination is part of the live app. Choose another page above to continue the design review.</p></div>} />
  </Routes></ProductLayer></MemoryRouter></AppContext.Provider>;
}

function respond(path, body = {}) {
  if (path.includes('interview-statuses')) return { statuses: { 'maya@example.com': { id: 41, status: 'completed', mode: 'conversational' }, 'alex@example.com': { id: 42, status: 'in_progress', mode: 'conversational' }, 'jordan@example.com': { id: 43, status: 'pending', mode: 'avatar' } } };
  if (path.includes('get-all-interview-results')) return { results };
  if (path.includes('candidate/me')) return { access: false };
  if (path.includes('candidate/my-report')) return { interview_report: report };
  if (path.includes('scan-resume')) return { profiles: {}, logs: [{ step: 'resume', status: 'success', msg: 'Sample résumé details ready.' }], ai_summary: 'A considered approach to product design, grounded in research and close collaboration with engineering.', contact: {} };
  if (path.includes('pipeline/run')) return pipeline(body.candidate_ids, body.role);
  if (path.includes('hiring-agent')) return { report: '## A thoughtful fit\n\nThe sample candidate brings research, product design, and design system experience.\n\n### What to explore\nAsk about a project that changed after research, and how the team measured its success.' };
  if (path.endsWith('/sourcer/runs')) return { runs: [] };
  if (path.includes('advisor/chat') || path.includes('/chat/focus')) return { reply: 'In the live app, this conversation uses your résumé and the selected mode. This sample response is here to let you review the layout.', response: 'In the live app, this conversation draws on the candidate file. This is a sample response for design review.' };
  return null;
}

export function startReview() {
  if (!import.meta.env.DEV) return;
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new Error('Recording is disabled in design review. Open the live app for an interview.'); };
  const storage = new Map([['resumate_onboarded', 'true'], ['resumate_candidate', JSON.stringify(session)]]);
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, val) => storage.set(key, String(val)), removeItem: key => storage.delete(key), clear: () => storage.clear(), key: index => [...storage.keys()][index] ?? null, get length() { return storage.size; } } });
  window.fetch = async (url, options = {}) => {
    let body = {};
    try { body = JSON.parse(options.body || '{}'); } catch { /* Preview does not process uploads. */ }
    const data = respond(String(url), body);
    if (String(url).includes('pipeline/run')) await new Promise(resolve => setTimeout(resolve, 1800));
    return new Response(JSON.stringify(data ?? { detail: 'This action needs the live app. It is disabled in design review.' }), { status: data === null ? 400 : 200, headers: { 'Content-Type': 'application/json' } });
  };
  api.defaults.adapter = async config => {
    let body = {};
    try { body = JSON.parse(config.data || '{}'); } catch { /* Preview does not process uploads. */ }
    const data = respond(String(config.url), body);
    if (data === null) throw new Error('This action is disabled in design review.');
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  createRoot(document.getElementById('root')).render(<Review />);
}
