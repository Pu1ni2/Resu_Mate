import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import {
  Upload, BarChart2, MessageSquare, Video, Send, Bot,
  FileText, AlertCircle, Briefcase, Award, MapPin, Check, Loader,
  LogOut, Camera, Clock, ChevronRight, X, CheckCircle,
  EyeOff, XCircle, Shield, Eye, Brain
} from 'lucide-react';
import InterviewRoom from './InterviewRoom';

const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs><linearGradient id="lg-cd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#3B82F6"/><stop offset="100%" stopColor="#2563EB"/></linearGradient></defs>
    <rect width="32" height="32" rx="8" fill="url(#lg-cd)"/>
    <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#fff" strokeWidth="1.5" fill="none"/>
    <circle cx="16" cy="16" r="3" fill="#fff"/>
  </svg>
);

const AIAvatar = () => (<div className="cd-avatar-ai"><Bot size={18} /></div>);

const API_BASE = import.meta.env.PROD ? 'https://resumate-2vad.onrender.com' : '';

// ═══════ SAFE MARKDOWN RENDERER ═══════
function SafeMarkdown({ text }) {
  if (!text || typeof text !== 'string') return null;
  try {
    return <div className="md" style={{ lineHeight: '1.7', color: '#475569' }} dangerouslySetInnerHTML={{ __html: marked.parse(text) }} />;
  } catch (e) {
    console.error('Markdown parse error:', e);
    return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: '#475569' }}>{text}</pre>;
  }
}

// ═══════ INTERVIEW REPORT COMPONENT ═══════
function InterviewReportView({ report }) {
  if (!report) return <p style={{ color: '#94A3B8', textAlign: 'center', padding: '40px' }}>No report data available.</p>;

  const r = report;
  const avgScore = r.avgScore || (r.scores?.length > 0 ? (r.scores.reduce((a, s) => a + (s?.score || 0), 0) / r.scores.length).toFixed(1) : '—');
  const eyeContact = r.eyeContact || 0;
  const violations = r.violations || 0;
  const timerVal = r.timer || 0;
  const mins = Math.floor(timerVal / 60);
  const secs = String(timerVal % 60).padStart(2, '0');
  const scores = Array.isArray(r.scores) ? r.scores : [];
  const reportText = typeof r.report === 'string' ? r.report : '';

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      {/* Header */}
      <div className="cd-card" style={{ padding: '28px', textAlign: 'center', marginBottom: '16px' }}>
        {r.terminated
          ? <AlertCircle size={40} style={{ color: '#EF4444', marginBottom: '12px' }} />
          : <CheckCircle size={40} style={{ color: '#22C55E', marginBottom: '12px' }} />
        }
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '6px' }}>
          {r.terminated ? 'Interview Terminated' : 'Interview Completed'}
        </h2>
        <p style={{ color: '#64748B', fontSize: '14px' }}>
          {scores.length} questions answered · {mins}:{secs} duration
        </p>
        {r.terminated && (
          <div style={{ marginTop: '12px', padding: '10px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#DC2626', fontSize: '13px', fontWeight: '600' }}>
            Terminated: exceeded proctoring violations limit
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { val: avgScore, label: 'Avg Score' },
          { val: `${eyeContact}%`, label: 'Eye Contact' },
          { val: violations, label: 'Violations', color: violations > 0 ? '#EF4444' : '#22C55E' },
          { val: `${mins}:${secs}`, label: 'Duration' },
        ].map((s, i) => (
          <div key={i} className="cd-card" style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'monospace', color: s.color || '#1E293B' }}>{s.val}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Score Breakdown */}
      {scores.length > 0 && (
        <div className="cd-card" style={{ padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '14px' }}>Score Breakdown</h3>
          {scores.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', width: '28px' }}>Q{i + 1}</span>
              <div style={{ flex: 1, maxWidth: '180px', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${(s?.score || 0) * 10}%`, height: '100%', borderRadius: '3px', transition: 'width 0.5s',
                  background: (s?.score || 0) >= 7 ? '#22C55E' : (s?.score || 0) >= 4 ? '#F59E0B' : '#EF4444' }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '700', width: '36px' }}>{s?.score || 0}/10</span>
              {s?.feedback && <span style={{ fontSize: '12px', color: '#94A3B8', flex: 1 }}>{s.feedback}</span>}
            </div>
          ))}
        </div>
      )}

      {/* AI Report */}
      {reportText.length > 5 && (
        <div className="cd-card" style={{ padding: '24px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Brain size={16} style={{ color: '#3B82F6' }} /> AI Evaluation
          </h3>
          <SafeMarkdown text={reportText} />
        </div>
      )}

      {/* Proctoring */}
      {(violations > 0 || (r.lookAwayCount || 0) > 10) && (
        <div className="cd-card" style={{ padding: '20px', marginBottom: '16px', borderColor: 'rgba(239,68,68,0.2)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={14} /> Proctoring Summary
          </h3>
          {violations > 0 && (
            <p style={{ fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <XCircle size={13} style={{ color: '#F59E0B' }} /> {violations} violation{violations > 1 ? 's' : ''} detected
            </p>
          )}
          {(r.lookAwayCount || 0) > 10 && (
            <p style={{ fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <EyeOff size={13} style={{ color: '#F59E0B' }} /> Gaze aversion: {r.lookAwayCount} times
            </p>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════ MAIN COMPONENT ═══════
export default function CandidateDashboard() {
  const navigate = useNavigate();
  const {
    candidates, selectedIds, uploadProgress,
    loadCandidates, uploadResume, toggleSelection, selectAll,
    messages, suggestions, isTyping, sendMessage, initChat,
    candidateSession, setCandidateSession
  } = useApp();

  const [tab, setTab] = useState('upload');
  const [input, setInput] = useState('');
  const msgEndRef = useRef(null);

  // Interview state
  const [showInterviewRoom, setShowInterviewRoom] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);
  const [interviewReport, setInterviewReport] = useState(() => {
    try {
      const stored = localStorage.getItem('resumate_interview_report');
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('Loaded interview report from storage:', parsed);
        return parsed;
      }
    } catch (e) { console.error('Failed to load report:', e); }
    return null;
  });

  // Redirect if no session
  useEffect(() => {
    if (!candidateSession) navigate('/candidate/login');
  }, [candidateSession, navigate]);

  useEffect(() => {
    if (tab === 'chat' && selectedIds.length > 0) initChat();
  }, [tab, initChat, selectedIds.length]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleUpload = async (files) => {
    for (const file of Array.from(files)) {
      try { await uploadResume(file); } catch (err) { alert(`Failed: ${err.message}`); }
    }
  };

  const handleSend = (msg) => {
    const m = msg || input.trim();
    if (m) { sendMessage(m); setInput(''); }
  };

  const handleLogout = () => {
    localStorage.removeItem('resumate_candidate');
    localStorage.removeItem('resumate_interview_report');
    setCandidateSession(null);
    navigate('/candidate/login');
  };

  const handleInterviewComplete = (reportData) => {
    console.log('Interview complete, report data:', reportData);
    setShowInterviewRoom(false);
    setInterviewReport(reportData);
    localStorage.setItem('resumate_interview_report', JSON.stringify(reportData));

    // Also save to backend so hiring manager can see it
    try {
      fetch(`${API_BASE}/api/chat/save-interview-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          candidate_email: candidateSession?.email,
          candidate_name: candidateSession?.name,
          report: reportData
        })
      }).catch(e => console.warn('Failed to save report to backend:', e));
    } catch {}

    // Auto switch to interview tab to show report
    setTab('interview');
  };

  if (!candidateSession) return null;

  // Fullscreen interview room
  if (showInterviewRoom) {
    console.log('🎬 Showing InterviewRoom. Config:', candidateSession.interview_config);
    return (
      <InterviewRoom
        config={candidateSession.interview_config}
        candidateName={candidateSession.name || 'Candidate'}
        candidateEmail={candidateSession.email}
        onComplete={handleInterviewComplete}
        onExit={() => setShowInterviewRoom(false)}
      />
    );
  }

  const hasInterview = candidateSession.has_interview;
  const showInterviewTab = hasInterview || interviewReport;

  return (
    <div className="cd-layout">
      {/* Sidebar */}
      <aside className="cd-sidebar">
        <div className="cd-sidebar-header"><div className="cd-sidebar-logo"><Logo size={24} /> ResuMate</div></div>
        <nav className="cd-sidebar-nav">
          <div className="cd-nav-section-title">Dashboard</div>
          {[
            { id: 'upload', icon: <Upload size={18} />, label: 'My Resume' },
            { id: 'analysis', icon: <BarChart2 size={18} />, label: 'Analysis' },
            { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Chat' },
            ...(showInterviewTab ? [{
              id: 'interview', icon: <Video size={18} />,
              label: interviewReport ? 'Interview Report' : 'Interview'
            }] : [])
          ].map(item => (
            <div key={item.id} className={`cd-nav-link ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>
              {item.icon}<span>{item.label}</span>
              {item.id === 'interview' && !interviewReport && <span className="cd-nav-badge">New</span>}
              {item.id === 'interview' && interviewReport && <span className="cd-nav-badge" style={{ background: '#22C55E' }}>Done</span>}
            </div>
          ))}
        </nav>
        <div className="cd-sidebar-footer">
          <button className="cd-logout" onClick={handleLogout}><LogOut size={16} /> Logout</button>
        </div>
      </aside>

      {/* Main */}
      <main className="cd-main">
        <header className="cd-header">
          <span className="cd-welcome">Welcome, {candidateSession.name || 'Candidate'}</span>
        </header>

        <div className="cd-body">
          {/* ═══ UPLOAD ═══ */}
          {tab === 'upload' && (
            <div className="cd-upload-section">
              <div className="cd-card cd-upload-zone" onClick={() => document.getElementById('cd-file').click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}>
                <Upload size={36} className="cd-upload-icon" />
                <h3>Upload Your Resume</h3>
                <p>PDF, DOCX, or TXT (max 5MB)</p>
                <input id="cd-file" type="file" accept=".pdf,.docx,.txt" multiple hidden onChange={e => handleUpload(e.target.files)} />
              </div>
              {candidates.length > 0 && (
                <div className="cd-uploaded-list">
                  {candidates.map((c, i) => (
                    <div key={c.id} className={`cd-card cd-uploaded-item ${selectedIds.includes(c.id) ? 'selected' : ''}`} onClick={() => toggleSelection(c.id)}>
                      <FileText size={18} /><span>{c.name || `Resume ${i + 1}`}</span>
                      {selectedIds.includes(c.id) && <Check size={16} style={{ color: '#22C55E' }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ ANALYSIS ═══ */}
          {tab === 'analysis' && (
            <div className="cd-analysis-section">
              {candidates.length === 0 ? (
                <div className="cd-empty"><FileText size={40} /><h3>No resume uploaded</h3><p>Upload your resume to see analysis</p></div>
              ) : (
                candidates.map(c => (
                  <div key={c.id} className="cd-card cd-analysis-card">
                    <h3>{c.name}</h3>
                    <p style={{ color: '#64748B' }}>{c.predicted_role} · {c.experience_level} · {c.total_experience_years || 0}y experience</p>
                    {c.skills?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                        {c.skills.slice(0, 12).map(s => <span key={s} className="skill">{s}</span>)}
                      </div>
                    )}
                    {c.summary && <p style={{ marginTop: '12px', fontSize: '13px', color: '#94A3B8', lineHeight: '1.6' }}>{c.summary}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ═══ CHAT ═══ */}
          {tab === 'chat' && (
            <div className="cd-chat-section">
              {selectedIds.length === 0 ? (
                <div className="cd-empty"><MessageSquare size={40} /><h3>Select a resume first</h3><p>Go to My Resume tab and select a resume to chat about</p></div>
              ) : (
                <div className="cd-chat-container">
                  <div className="cd-chat-messages">
                    {messages.map((m, i) => (
                      <div key={i} className={`cd-chat-msg ${m.role}`}>
                        {m.role === 'assistant' && <AIAvatar />}
                        <div className={`cd-chat-bubble ${m.role}`}>
                          {m.role === 'user' ? <p>{m.content}</p> : <SafeMarkdown text={m.content} />}
                        </div>
                      </div>
                    ))}
                    {isTyping && <div className="cd-chat-msg assistant"><AIAvatar /><div className="cd-chat-bubble assistant"><div className="typing"><span /><span /><span /></div></div></div>}
                    <div ref={msgEndRef} />
                  </div>
                  {suggestions.length > 0 && !isTyping && (
                    <div className="cd-suggestions">{suggestions.map((q, i) => <button key={i} className="cd-suggestion" onClick={() => handleSend(q)}>{q}</button>)}</div>
                  )}
                  <div className="cd-chat-input">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSend(); }} placeholder="Ask about your resume..." disabled={isTyping} />
                    <button onClick={() => handleSend()} disabled={!input.trim() || isTyping}><Send size={18} /></button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ INTERVIEW ═══ */}
          {tab === 'interview' && (
            <div className="cd-interview-section" style={{ maxWidth: '780px', margin: '0 auto' }}>

              {/* CURRENT STATE: Just completed OR has report from before */}
              {interviewReport && (
                <div className="cd-card" style={{ padding: '24px', marginBottom: '20px', textAlign: 'center' }}>
                  <CheckCircle size={36} style={{ color: '#22C55E', marginBottom: '10px' }} />
                  <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>Interview Completed</h2>
                  <p style={{ color: '#64748B', fontSize: '14px', marginBottom: '16px' }}>
                    Score: {interviewReport.avgScore || '—'}/10 · Eye Contact: {interviewReport.eyeContact || 0}% · Violations: {interviewReport.violations || 0}
                  </p>

                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                    {[
                      { val: interviewReport.avgScore || '—', label: 'Score' },
                      { val: `${interviewReport.eyeContact || 0}%`, label: 'Eye Contact' },
                      { val: interviewReport.violations || 0, label: 'Violations', color: (interviewReport.violations || 0) > 0 ? '#EF4444' : '#22C55E' },
                      { val: `${Math.floor((interviewReport.timer || 0) / 60)}:${String((interviewReport.timer || 0) % 60).padStart(2, '0')}`, label: 'Duration' },
                    ].map((s, i) => (
                      <div key={i} style={{ padding: '12px 8px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '20px', fontWeight: '800', fontFamily: 'monospace', color: s.color || '#1E293B' }}>{s.val}</div>
                        <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Expandable report */}
                  <button
                    onClick={() => setShowFullReport(prev => !prev)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '10px', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {showFullReport ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showFullReport ? 'Hide Full Report' : 'View Full Report'}
                  </button>
                </div>
              )}

              {/* EXPANDED REPORT */}
              {interviewReport && showFullReport && (
                <div style={{ marginBottom: '20px' }}>
                  <InterviewReportView report={interviewReport} />
                </div>
              )}

              {/* NEW INTERVIEW: Only show if has_interview AND no report yet (or new interview after completion) */}
              {hasInterview && !interviewReport && (
                <div className="cd-card" style={{ padding: '24px', marginBottom: '20px', border: '1px solid #DBEAFE', background: '#EFF6FF' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#3B82F6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={24} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '2px', color: '#1E293B' }}>AI Interview Ready</h3>
                      <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                        {candidateSession.interview_config?.role || 'General'} · {candidateSession.interview_config?.num_questions || 8} questions · {candidateSession.interview_config?.level || 'Mid-Level'}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px', lineHeight: '1.5' }}>
                    Proctored with camera, mic, face tracking. Tab switching monitored. 3 violations = auto-termination.
                  </p>
                  <button className="cd-start-interview" onClick={() => setShowInterviewRoom(true)}>
                    <Camera size={18} /> Enter Interview Room
                  </button>
                </div>
              )}

              {/* NOTHING */}
              {!hasInterview && !interviewReport && (
                <div className="cd-empty"><Video size={40} /><h3>No interview scheduled</h3><p>Your hiring manager hasn't created an interview yet.</p></div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}