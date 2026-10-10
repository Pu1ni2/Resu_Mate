import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Markdown from './ui/Markdown';
import ConfirmDialog from './ui/ConfirmDialog';
import {
  Upload, BarChart2, MessageSquare, Video, Send, Bot,
  FileText, AlertCircle, Briefcase, Award, MapPin, Check, Loader,
  LogOut, Camera, ChevronRight, CheckCircle,
  EyeOff, Shield, Eye, GraduationCap,
  Code, Star, TrendingUp, Target,
  Mic, Volume2, Trash2
} from 'lucide-react';
import InterviewReportView from './shared/InterviewReportView';
import { toast } from '../services/notify';
import { clearCandidateSession } from '../services/session';
import { API_BASE, candidateFetch, responseError } from '../services/authFetch';
import { pressable } from './ui/pressable';
import Logo from './ui/Logo';

// Loaded when the interview starts: the video room brings LiveKit with it.
const InterviewRoom = lazy(() => import('./InterviewRoom'));
const ConversationalInterviewRoom = lazy(() => import('./ConversationalInterviewRoom'));

// One empty list, so an effect that watches the messages doesn't re-run on every render.
const NO_MESSAGES = [];

// Candidate-portal calls go through candidateFetch, with the session token
// minted at OTP login. The server derives the candidate's identity from this
// token, so any email in a request body is ignored — that is what stops one
// candidate reading another's resume or report. A 401 there means the sign-in
// expired, and App.jsx sends them to sign in again.

// Advisor replies are built from the candidate's resume, so they are rendered
// through the sanitising Markdown component.
const ADVISOR_TEXT = { lineHeight: '1.7', color: 'var(--text2)' };

export default function CandidateDashboard() {
  const navigate = useNavigate();
  const { candidates, candidateSession, setCandidateSession } = useApp();

  const [advisorCandidates, setAdvisorCandidates] = useState([]);
  useEffect(() => { if (candidates?.length > 0) setAdvisorCandidates(candidates); }, [candidates]);

  const [tab, setTab] = useState('upload');
  const [input, setInput] = useState('');
  const msgEndRef = useRef(null);

  // "Delete my data": asking first, then erasing.
  const [confirmingErase, setConfirmingErase] = useState(false);
  const [erasing, setErasing] = useState(false);

  // Interview state
  const [showInterviewRoom, setShowInterviewRoom] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);
  // The report comes from the server (verify-otp at sign-in, then
  // /candidate/my-report). A copy cached separately in localStorage is no
  // longer read: it could be stale, or the placeholder the room used to make up.
  const [interviewReport, setInterviewReport] = useState(() => {
    try {
      const stored = localStorage.getItem('resumate_candidate');
      if (stored) {
        const session = JSON.parse(stored);
        if (session.interview_completed && session.interview_report) return session.interview_report;
      }
    } catch { /* an unreadable saved session: no report yet */ }
    return null;
  });
  // While waiting for the server to finish writing the report.
  const [reportPending, setReportPending] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // Redirect if no session
  useEffect(() => {
    if (!candidateSession) {
      try {
        const stored = localStorage.getItem('resumate_candidate');
        if (stored) { setCandidateSession(JSON.parse(stored)); return; }
      } catch { /* unreadable: sign in again */ }
      navigate('/candidate/login');
    }
  }, [candidateSession, navigate, setCandidateSession]);

  // The saved session can be a day old: check the sign-in, which sends an
  // expired one back to sign in (candidateFetch), and refresh the interview,
  // which the manager may have set up or changed since.
  useEffect(() => {
    if (!candidateSession?.email) return;
    (async () => {
      try {
        const resp = await candidateFetch(`${API_BASE}/api/chat/candidate/me`);
        if (!resp.ok) return;
        const me = await resp.json();
        if (!me?.access || !aliveRef.current) return;
        setCandidateSession(prev => {
          if (!prev) return prev;
          const updated = {
            ...prev, name: me.name || prev.name, has_interview: me.has_interview,
            interview_config: me.interview_config, interview_completed: me.interview_completed,
          };
          try { localStorage.setItem('resumate_candidate', JSON.stringify(updated)); } catch { /* storage unavailable */ }
          return updated;
        });
      } catch { /* offline: keep the saved session */ }
    })();
    // Once per signed-in candidate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateSession?.email]);

  // Advisor chat
  const [advisorMode, setAdvisorMode] = useState('general');
  const [advisorChatMap, setAdvisorChatMap] = useState({
    general: [], resume_coach: [], interview_prep: [], career_advisor: []
  });
  const [advisorTyping, setAdvisorTyping] = useState(false);
  const [dynamicSuggestions, setDynamicSuggestions] = useState([]);

  const advisorMessages = advisorChatMap[advisorMode] || NO_MESSAGES;
  const modeSuggestions = {
    general: ['Review my resume', 'Help me prepare for interviews', 'What career advice do you have?'],
    resume_coach: ['What are the weak spots in my resume?', 'How can I make it ATS-friendly?', 'Suggest better bullet points'],
    interview_prep: ['Generate practice questions for my role', 'Help me with "Tell me about yourself"', 'What behavioral questions should I expect?'],
    career_advisor: ['What are my key strengths?', 'What career paths fit my profile?', 'What skills should I learn next?'],
  };
  const advisorSuggestions = advisorMessages.length === 0 ? modeSuggestions[advisorMode] : dynamicSuggestions;

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [advisorMessages, advisorTyping]);
  useEffect(() => { setDynamicSuggestions([]); }, [advisorMode]);

  const uploadFile = async (file) => {
    try {
      const form = new FormData();
      form.append('file', file);
      // The server takes the email from the session token, not this field.
      form.append('email', candidateSession?.email || '');
      const resp = await candidateFetch(`${API_BASE}/api/advisor/upload-resume`, {
        method: 'POST',
        body: form,
      });
      if (resp.status === 401) return; // signed out; the sign-in page says why
      const data = await resp.json();
      if (data.success) {
        setAdvisorCandidates([data.data]);
      } else { toast('Upload failed', 'error'); }
    } catch (err) { toast(`Upload failed: ${err.message}`, 'error'); }
  };

  const handleUpload = async (files) => {
    const file = Array.from(files)[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleAdvisorSend = async (msg) => {
    const m = msg || input.trim();
    if (!m || advisorTyping) return;
    setInput('');
    const mode = advisorMode;
    setAdvisorChatMap(prev => ({ ...prev, [mode]: [...(prev[mode] || []), { role: 'user', content: m }] }));
    setDynamicSuggestions([]);
    setAdvisorTyping(true);
    try {
      const resp = await candidateFetch(`${API_BASE}/api/advisor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: m, mode })
      });
      if (resp.status === 401) return; // signed out; the sign-in page says why
      // The server's message, not the exception text it used to send as the
      // advisor's answer.
      const data = resp.ok ? await resp.json() : { reply: await responseError(resp, "Sorry, I couldn't answer that just now. Please try again.") };
      setAdvisorChatMap(prev => ({ ...prev, [mode]: [...(prev[mode] || []), { role: 'assistant', content: data.reply || 'No response.' }] }));
      if (data.suggestions?.length > 0) setDynamicSuggestions(data.suggestions);
    } catch {
      setAdvisorChatMap(prev => ({ ...prev, [mode]: [...(prev[mode] || []), { role: 'assistant', content: 'Sorry, could not connect. Please try again.' }] }));
    } finally {
      setAdvisorTyping(false);
    }
  };

  const handleLogout = () => {
    // Token included: it used to survive logout, and outranked a manager's
    // token on interview requests from the same browser.
    clearCandidateSession();
    setCandidateSession(null);
    navigate('/candidate/login');
  };

  const handleDeleteMyData = async () => {
    // GDPR erasure — wipes this candidate's resume, interviews, and stored
    // files. Calls the backend endpoint authenticated by the candidate token.
    // Runs from the confirm dialog, not window.confirm.
    setErasing(true);
    try {
      const resp = await candidateFetch(`${API_BASE}/api/chat/candidate/delete-my-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (resp.status === 401) return; // signed out; the sign-in page says why
      if (!resp.ok) {
        toast('Could not delete your data. Please try again or contact the hiring team.', 'error');
        return;
      }
      toast('Your data has been deleted.', 'success');
      handleLogout();
    } catch {
      toast('Could not reach the server. Please try again.', 'error');
    } finally {
      setErasing(false);
      setConfirmingErase(false);
    }
  };

  // The candidate's report, from the server. Null while there isn't one yet
  // (404), or when it can't be reached.
  const fetchMyReport = async () => {
    try {
      const resp = await candidateFetch(`${API_BASE}/api/chat/candidate/my-report`);
      if (!resp.ok) return null;
      return (await resp.json()).interview_report || null;
    } catch {
      return null;
    }
  };

  const showReport = (report) => {
    setInterviewReport(report);
    setCandidateSession(prev => {
      if (!prev) return prev;
      const updated = { ...prev, interview_completed: true, interview_report: report };
      try { localStorage.setItem('resumate_candidate', JSON.stringify(updated)); } catch { /* storage unavailable */ }
      return updated;
    });
  };

  // The server writes the report after the interview: straight away for a
  // voice interview, and within a minute or so for an avatar one (once the
  // interviewer leaves the room). So keep asking for a while.
  const waitForReport = async (attempts = 20, delayMs = 4000) => {
    setReportPending(true);
    for (let i = 0; i < attempts && aliveRef.current; i++) {
      const report = await fetchMyReport();
      if (report) {
        if (aliveRef.current) showReport(report);
        break;
      }
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
    if (aliveRef.current) setReportPending(false);
  };

  // Signed in after the interview finished, with no report yet: ask once.
  useEffect(() => {
    if (candidateSession?.interview_completed && !interviewReport) waitForReport(1);
    // Only when the session first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateSession?.email]);

  const handleInterviewComplete = async (measured) => {
    setShowInterviewRoom(false);
    setTab('interview');
    setInterviewReport(null);
    if (candidateSession) {
      const updated = { ...candidateSession, has_interview: false, interview_completed: true, interview_report: null };
      localStorage.setItem('resumate_candidate', JSON.stringify(updated));
      setCandidateSession(updated);
    }
    // What the avatar room measured (violations, face reading, time). The
    // server keeps only those numbers from this, and writes the report itself.
    try {
      await candidateFetch(`${API_BASE}/api/chat/save-interview-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_email: candidateSession?.email, candidate_name: candidateSession?.name, report: measured })
      });
    } catch { /* offline: the report request below shows it */ }
    await waitForReport();
  };

  if (!candidateSession) {
    return <div className="cd-loading"><Loader size={24} className="spin" /></div>;
  }

  if (showInterviewRoom) {
    // Route by interview.mode — "conversational" launches the audio-only
    // OpenAI Realtime room, anything else (default "avatar") uses the existing
    // LiveKit + Simli flow.
    const mode = (candidateSession.interview_config?.mode || 'avatar').toLowerCase();
    const interviewId = candidateSession.interview_config?.interview_id;
    const loadingRoom = <div className="cd-loading"><Loader size={24} className="spin" /></div>;
    if (mode === 'conversational') {
      return (
        <Suspense fallback={loadingRoom}>
          <ConversationalInterviewRoom
            interviewId={interviewId}
            candidateName={candidateSession.name || 'Candidate'}
            candidateEmail={candidateSession.email}
            onComplete={handleInterviewComplete}
            onExit={() => setShowInterviewRoom(false)}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={loadingRoom}>
        <InterviewRoom
          config={candidateSession.interview_config}
          candidateName={candidateSession.name || 'Candidate'}
          candidateEmail={candidateSession.email}
          onComplete={handleInterviewComplete}
          onExit={() => setShowInterviewRoom(false)}
        />
      </Suspense>
    );
  }

  const interviewCompleted = candidateSession.interview_completed || !!interviewReport;
  const hasInterview = candidateSession.has_interview && !interviewCompleted;
  const showInterviewTab = hasInterview || interviewCompleted;
  const c = advisorCandidates[0]; // Current resume data
  const getSkills = (cand) => Array.isArray(cand?.skills) ? cand.skills : [];

  return (
    <div className="cd-layout">
      {/* ═══ SIDEBAR ═══ */}
      <aside className="cd-sidebar">
        <div className="cd-sidebar-header">
          <div className="cd-sidebar-logo"><Logo size={24} tone="candidate" /> ResuMate</div>
        </div>
        <nav className="cd-sidebar-nav">
          <div className="cd-nav-section-title">Dashboard</div>
          {[
            { id: 'upload', icon: <Upload size={18} />, label: 'My Resume' },
            { id: 'analysis', icon: <BarChart2 size={18} />, label: 'Analysis' },
            { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Advisor' },
            ...(showInterviewTab ? [{
              id: 'interview', icon: <Video size={18} />,
              label: interviewCompleted ? 'Interview Report' : 'Interview'
            }] : [])
          ].map(item => (
            <div key={item.id} className={`cd-nav-link ${tab === item.id ? 'active' : ''}`} {...pressable(() => setTab(item.id))}
              aria-current={tab === item.id ? 'page' : undefined}>
              {item.icon}<span>{item.label}</span>
              {item.id === 'interview' && hasInterview && !interviewCompleted && <span className="cd-nav-badge cd-badge-new">New</span>}
              {item.id === 'interview' && interviewCompleted && <span className="cd-nav-badge cd-badge-done">Done</span>}
            </div>
          ))}
        </nav>
        <div className="cd-sidebar-footer">
          <button className="cd-logout" onClick={handleLogout}><LogOut size={16} /> Logout</button>
          <button
            className="cd-logout"
            onClick={() => setConfirmingErase(true)}
            style={{ marginTop: 8, color: '#F87171' }}
            title="Permanently delete all your data"
          >
            <Trash2 size={16} /> Delete my data
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmingErase}
        title="Delete all your data?"
        confirmLabel="Delete my data"
        busy={erasing}
        onConfirm={handleDeleteMyData}
        onCancel={() => setConfirmingErase(false)}
      >
        Your résumé, interviews, reports and advisor chats are deleted for good, and you
        will be signed out. This can't be undone.
      </ConfirmDialog>

      {/* ═══ MAIN ═══ */}
      <main className="cd-main">
        <header className="cd-header">
          <span className="cd-welcome">Welcome, {candidateSession.name || 'Candidate'}</span>
          {hasInterview && (
            <div className="cd-header-alert" {...pressable(() => setTab('interview'))}>
              <Camera size={14} /> Interview Ready
            </div>
          )}
        </header>

        <div className="cd-body">

          {/* ═══ UPLOAD TAB ═══ */}
          {tab === 'upload' && (
            <div className="cd-tab-content">
              {!c ? (
                <div className="cd-upload-hero">
                  <div className="cd-upload-zone" {...pressable(() => document.getElementById('cd-file').click())}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                    onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                    onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); handleUpload(e.dataTransfer.files); }}
                  >
                    <div className="cd-upload-icon-wrap"><Upload size={28} /></div>
                    <h3>Upload Your Resume</h3>
                    <p>Drag & drop or click to browse</p>
                    <span className="cd-upload-formats">PDF, DOCX, or TXT (max 5MB)</span>
                    <input id="cd-file" type="file" accept=".pdf,.docx,.txt" hidden onChange={e => handleUpload(e.target.files)} />
                  </div>
                </div>
              ) : (
                <div className="cd-resume-overview">
                  {/* Resume card */}
                  <div className="cd-card cd-resume-card">
                    <div className="cd-resume-card-top">
                      <div className="cd-resume-file-icon"><FileText size={24} /></div>
                      <div className="cd-resume-card-info">
                        <h3>{c.name || 'Your Resume'}</h3>
                        {/* Re-uploading replaces it, so that is the retry. */}
                        <p>{c.analysis_failed
                          ? "We couldn't analyse your résumé. Upload it again to retry."
                          : [c.predicted_role, c.experience_level, c.total_experience_years ? `${c.total_experience_years}y exp` : null].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="cd-resume-check"><Check size={18} /></div>
                    </div>

                    {/* Quick stats */}
                    <div className="cd-resume-stats">
                      {c.total_experience_years != null && (
                        <div className="cd-stat"><Briefcase size={14} /><span>{c.total_experience_years}y</span><label>Experience</label></div>
                      )}
                      {c.experience_level && (
                        <div className="cd-stat"><Award size={14} /><span>{c.experience_level}</span><label>Level</label></div>
                      )}
                      {c.predicted_role && (
                        <div className="cd-stat"><Target size={14} /><span>{c.predicted_role}</span><label>Role</label></div>
                      )}
                      {getSkills(c).length > 0 && (
                        <div className="cd-stat"><Code size={14} /><span>{getSkills(c).length}</span><label>Skills</label></div>
                      )}
                    </div>

                    {/* Skills */}
                    {getSkills(c).length > 0 && (
                      <div className="cd-resume-skills">
                        {getSkills(c).slice(0, 10).map((s, i) => (
                          <span key={i} className="cd-skill-tag">{typeof s === 'string' ? s : s?.name || ''}</span>
                        ))}
                        {getSkills(c).length > 10 && <span className="cd-skill-tag cd-skill-more">+{getSkills(c).length - 10}</span>}
                      </div>
                    )}
                  </div>

                  {/* Replace button */}
                  <button className="cd-replace-btn" onClick={() => document.getElementById('cd-file-replace').click()}>
                    <Upload size={14} /> Replace Resume
                  </button>
                  <input id="cd-file-replace" type="file" accept=".pdf,.docx,.txt" hidden onChange={e => handleUpload(e.target.files)} />

                  {/* Quick actions */}
                  <div className="cd-quick-actions">
                    <div className="cd-quick-action" {...pressable(() => setTab('analysis'))}>
                      <BarChart2 size={20} /><span>View Analysis</span><ChevronRight size={16} />
                    </div>
                    <div className="cd-quick-action" {...pressable(() => setTab('chat'))}>
                      <MessageSquare size={20} /><span>Ask AI Advisor</span><ChevronRight size={16} />
                    </div>
                    {hasInterview && (
                      <div className="cd-quick-action cd-quick-action-highlight" {...pressable(() => setTab('interview'))}>
                        <Camera size={20} /><span>Take Interview</span><ChevronRight size={16} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ ANALYSIS TAB ═══ */}
          {tab === 'analysis' && (
            <div className="cd-tab-content">
              {!c ? (
                <div className="cd-empty"><FileText size={40} /><h3>No resume uploaded</h3><p>Upload your resume to see analysis</p></div>
              ) : (
                <div className="cd-analysis-layout">
                  {/* Header card */}
                  <div className="cd-card cd-analysis-header-card">
                    <div className="cd-analysis-avatar">
                      {(c.name || 'C')[0].toUpperCase()}
                    </div>
                    <h2>{c.name || 'Candidate'}</h2>
                    <p className="cd-analysis-subtitle">{c.predicted_role || 'Role'} · {c.experience_level || 'Level'} · {c.total_experience_years || 0}y experience</p>
                    {c.location && <p className="cd-analysis-location"><MapPin size={13} /> {c.location}</p>}
                  </div>

                  {/* Stats grid */}
                  <div className="cd-analysis-stats-grid">
                    <div className="cd-card cd-mini-stat">
                      <Briefcase size={18} className="cd-mini-stat-icon" />
                      <div className="cd-mini-stat-value">{c.total_experience_years || 0}y</div>
                      <div className="cd-mini-stat-label">Experience</div>
                    </div>
                    <div className="cd-card cd-mini-stat">
                      <Code size={18} className="cd-mini-stat-icon" />
                      <div className="cd-mini-stat-value">{getSkills(c).length}</div>
                      <div className="cd-mini-stat-label">Skills</div>
                    </div>
                    <div className="cd-card cd-mini-stat">
                      <Award size={18} className="cd-mini-stat-icon" />
                      <div className="cd-mini-stat-value">{c.experience_level || '—'}</div>
                      <div className="cd-mini-stat-label">Level</div>
                    </div>
                    <div className="cd-card cd-mini-stat">
                      <GraduationCap size={18} className="cd-mini-stat-icon" />
                      <div className="cd-mini-stat-value">{c.education?.length || 0}</div>
                      <div className="cd-mini-stat-label">Education</div>
                    </div>
                  </div>

                  {/* Skills section */}
                  {getSkills(c).length > 0 && (
                    <div className="cd-card cd-analysis-section">
                      <h3 className="cd-section-title"><Code size={16} /> Skills</h3>
                      <div className="cd-skills-grid">
                        {getSkills(c).map((s, i) => (
                          <span key={i} className="cd-skill-tag">{typeof s === 'string' ? s : s?.name || ''}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Strengths */}
                  {c.key_strengths?.length > 0 && (
                    <div className="cd-card cd-analysis-section">
                      <h3 className="cd-section-title"><Star size={16} /> Key Strengths</h3>
                      <div className="cd-strengths-list">
                        {c.key_strengths.map((s, i) => (
                          <div key={i} className="cd-strength-item">
                            <CheckCircle size={14} className="cd-strength-icon" />
                            <span>{typeof s === 'string' ? s : s?.name || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {c.summary && (
                    <div className="cd-card cd-analysis-section">
                      <h3 className="cd-section-title"><FileText size={16} /> Summary</h3>
                      <p className="cd-summary-text">{c.summary}</p>
                    </div>
                  )}

                  {/* Work Experience */}
                  {c.work_experience?.length > 0 && (
                    <div className="cd-card cd-analysis-section">
                      <h3 className="cd-section-title"><Briefcase size={16} /> Work Experience</h3>
                      <div className="cd-experience-list">
                        {c.work_experience.map((w, i) => (
                          <div key={i} className="cd-experience-item">
                            <div className="cd-exp-dot" />
                            <div>
                              <h4>{w.title || w.role || 'Position'}</h4>
                              <p className="cd-exp-company">{w.company || ''} {w.duration ? `· ${w.duration}` : ''}</p>
                              {w.description && <p className="cd-exp-desc">{w.description}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {c.education?.length > 0 && (
                    <div className="cd-card cd-analysis-section">
                      <h3 className="cd-section-title"><GraduationCap size={16} /> Education</h3>
                      <div className="cd-experience-list">
                        {c.education.map((e, i) => (
                          <div key={i} className="cd-experience-item">
                            <div className="cd-exp-dot cd-exp-dot-blue" />
                            <div>
                              <h4>{e.degree || e.field || 'Degree'}</h4>
                              <p className="cd-exp-company">{e.institution || e.school || ''} {e.year ? `· ${e.year}` : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ AI ADVISOR CHAT ═══ */}
          {tab === 'chat' && (
            <div className="cd-chat-section">
              {/* Mode tabs */}
              <div className="cd-chat-mode-tabs">
                {[
                  { id: 'general', icon: <MessageSquare size={14} />, label: 'General' },
                  { id: 'resume_coach', icon: <FileText size={14} />, label: 'Resume Coach' },
                  { id: 'interview_prep', icon: <Target size={14} />, label: 'Interview Prep' },
                  { id: 'career_advisor', icon: <TrendingUp size={14} />, label: 'Career Advisor' },
                ].map(mode => (
                  <button key={mode.id} className={`cd-mode-tab ${advisorMode === mode.id ? 'active' : ''}`} onClick={() => setAdvisorMode(mode.id)}>
                    {mode.icon} {mode.label}
                    {(advisorChatMap[mode.id]?.length || 0) > 0 && <span className="cd-mode-dot" />}
                  </button>
                ))}
              </div>

              <div className="cd-chat-container">
                <div className="cd-chat-messages">
                  {/* Empty state */}
                  {advisorMessages.length === 0 && (
                    <div className="cd-chat-empty">
                      <div className="cd-chat-empty-icon"><Bot size={28} /></div>
                      <h3>{advisorMode === 'resume_coach' ? 'Resume Coach' : advisorMode === 'interview_prep' ? 'Interview Prep' : advisorMode === 'career_advisor' ? 'Career Advisor' : 'AI Career Assistant'}</h3>
                      <p>
                        {advisorMode === 'resume_coach' ? "I'll analyze your resume and suggest specific improvements." :
                         advisorMode === 'interview_prep' ? "I'll help you prepare with practice questions and tips." :
                         advisorMode === 'career_advisor' ? "I'll analyze your strengths and suggest career paths." :
                         "Your personal career assistant for resume, interviews, and growth."}
                      </p>
                    </div>
                  )}

                  {/* Messages */}
                  {advisorMessages.map((m, i) => (
                    <div key={i} className={`cd-chat-msg ${m.role}`}>
                      {m.role === 'assistant' && <div className="cd-msg-avatar"><Bot size={16} /></div>}
                      <div className={`cd-msg-bubble ${m.role}`}>
                        {m.role === 'user' ? <p>{m.content}</p> : <Markdown text={m.content} style={ADVISOR_TEXT} />}
                      </div>
                    </div>
                  ))}

                  {advisorTyping && (
                    <div className="cd-chat-msg assistant">
                      <div className="cd-msg-avatar"><Bot size={16} /></div>
                      <div className="cd-msg-bubble assistant"><div className="typing"><span /><span /><span /></div></div>
                    </div>
                  )}
                  <div ref={msgEndRef} />
                </div>

                {/* Suggestions */}
                {advisorSuggestions.length > 0 && !advisorTyping && (
                  <div className="cd-chat-suggestions">
                    {advisorSuggestions.map((q, i) => (
                      <button key={i} className="cd-suggestion-btn" onClick={() => handleAdvisorSend(q)}>{q}</button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <div className="cd-chat-input-bar">
                  <input
                    type="text" value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdvisorSend(); }}
                    placeholder={advisorMode === 'resume_coach' ? 'Ask about your resume...' : advisorMode === 'interview_prep' ? 'Ask about interviews...' : advisorMode === 'career_advisor' ? 'Ask about your career...' : 'Ask me anything...'}
                    disabled={advisorTyping}
                    className="cd-chat-input"
                    aria-label="Message the advisor"
                  />
                  <button className="cd-chat-send" onClick={() => handleAdvisorSend()} disabled={!input.trim() || advisorTyping} aria-label="Send">
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ INTERVIEW TAB ═══ */}
          {tab === 'interview' && (
            <div className="cd-tab-content cd-interview-tab">

              {/* Completed — Report */}
              {interviewCompleted && interviewReport && (
                <div className="cd-interview-done">
                  <div className="cd-card cd-interview-done-header">
                    <div className="cd-interview-done-top">
                      <div className="cd-interview-done-badge"><CheckCircle size={20} /></div>
                      <div className="cd-interview-done-info">
                        <h3>Interview Completed</h3>
                        <p>
                          Score: {interviewReport.avgScore ?? '—'}/10 · Face in view: {interviewReport.eyeContact || 0}% · Violations: {interviewReport.violations || 0} · {Math.floor((interviewReport.timer || 0) / 60)}:{String((interviewReport.timer || 0) % 60).padStart(2, '0')}
                        </p>
                      </div>
                      <button className="cd-report-toggle" onClick={() => setShowFullReport(prev => !prev)}>
                        {showFullReport ? <EyeOff size={13} /> : <Eye size={13} />}
                        {showFullReport ? 'Hide Details' : 'View Full Report'}
                      </button>
                    </div>
                    {showFullReport && (
                      <div className="cd-report-detail">
                        <InterviewReportView report={interviewReport} candidateId={candidateSession?.candidate_id} candidateEmail={candidateSession?.email} />
                      </div>
                    )}
                  </div>
                  <p className="cd-interview-footer-text">Your hiring manager has been notified of your interview results.</p>
                </div>
              )}

              {/* Completed, report not written yet */}
              {interviewCompleted && !interviewReport && (
                <div className="cd-card cd-interview-done-header" role="status">
                  <div className="cd-interview-done-top">
                    <div className="cd-interview-done-badge">
                      {reportPending ? <Loader size={20} className="spin" /> : <CheckCircle size={20} />}
                    </div>
                    <div className="cd-interview-done-info">
                      <h3>Interview Completed</h3>
                      <p>
                        {reportPending
                          ? 'Preparing your report…'
                          : 'Your report is still being prepared. Check back in a few minutes.'}
                      </p>
                    </div>
                    {!reportPending && (
                      <button className="cd-report-toggle" onClick={() => waitForReport(1)}>Refresh</button>
                    )}
                  </div>
                </div>
              )}

              {/* Pending — Enter room */}
              {hasInterview && (
                <div className="cd-interview-pending">
                  <div className="cd-card cd-interview-ready-card">
                    {(() => {
                      const ivMode = (candidateSession.interview_config?.mode || 'avatar').toLowerCase();
                      const isVoice = ivMode === 'conversational';
                      return (
                        <>
                          <div className="cd-interview-ready-icon">
                            {isVoice ? <Mic size={28} /> : <Camera size={28} />}
                          </div>
                          <h3>
                            AI Interview Ready
                            <span
                              style={{
                                marginLeft: 10, fontSize: 11, fontWeight: 600,
                                padding: '3px 9px', borderRadius: 999,
                                background: isVoice ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)',
                                color: isVoice ? '#22C55E' : '#8B5CF6',
                                border: `1px solid ${isVoice ? 'rgba(34,197,94,0.4)' : 'rgba(139,92,246,0.4)'}`,
                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                verticalAlign: 'middle',
                              }}
                            >
                              {isVoice ? 'Voice' : 'Avatar'}
                            </span>
                          </h3>
                          <p className="cd-interview-meta">
                            {candidateSession.interview_config?.role || 'General'} · {candidateSession.interview_config?.num_questions || 8} questions · {candidateSession.interview_config?.level || 'Mid-Level'}
                          </p>
                          <div className="cd-interview-rules">
                            {isVoice ? (
                              <>
                                <div className="cd-rule"><Mic size={14} /> Microphone required (no camera)</div>
                                <div className="cd-rule"><Volume2 size={14} /> You can interrupt the interviewer anytime</div>
                                <div className="cd-rule"><Shield size={14} /> Find a quiet space</div>
                              </>
                            ) : (
                              <>
                                <div className="cd-rule"><Camera size={14} /> Camera & mic required</div>
                                <div className="cd-rule"><Eye size={14} /> Face tracking enabled</div>
                                <div className="cd-rule"><Shield size={14} /> Tab switching monitored</div>
                                <div className="cd-rule"><AlertCircle size={14} /> 3 violations = auto-termination</div>
                              </>
                            )}
                          </div>
                          <button className="cd-start-interview" onClick={() => setShowInterviewRoom(true)}>
                            {isVoice ? <Mic size={18} /> : <Camera size={18} />}
                            {isVoice ? ' Start Voice Interview' : ' Enter Interview Room'}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* No interview */}
              {!hasInterview && !interviewCompleted && (
                <div className="cd-empty">
                  <Video size={40} />
                  <h3>No interview scheduled</h3>
                  <p>Your hiring manager hasn't created an interview for you yet.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
