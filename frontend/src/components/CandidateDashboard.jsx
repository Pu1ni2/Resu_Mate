import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import {
  Upload, BarChart2, MessageSquare, Video, Send, Bot,
  FileText, AlertCircle, Briefcase, Award, MapPin, Check, Loader,
  LogOut, Mic, MicOff, Volume2, Square, Camera, CameraOff,
  Clock, ChevronRight, X, StopCircle, CheckCircle,
  EyeOff, XCircle, Shield, Eye
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

const AIAvatar = () => (
  <div className="cd-avatar-ai"><Bot size={18} /></div>
);

const API_BASE = import.meta.env.PROD ? 'https://resumate-2vad.onrender.com' : '';

export default function CandidateDashboard() {
  const navigate = useNavigate();
  const {
    candidates, selectedIds, uploadProgress,
    uploadResume, deleteCandidate, toggleSelection,
    messages, suggestions, isTyping, sendMessage, initChat,
    getDisplayName, getAvatarGradient
  } = useApp();

  const [tab, setTab] = useState('upload');
  const [input, setInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);
  const msgEndRef = useRef(null);

  // Candidate session
  const [candidateSession, setCandidateSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('resumate_candidate')) || null; }
    catch { return null; }
  });

  // ═══════ INTERVIEW STATE ═══════
  const [showInterviewRoom, setShowInterviewRoom] = useState(false);
  const [interviewReport, setInterviewReport] = useState(() => {
    try { return JSON.parse(localStorage.getItem('resumate_interview_report')) || null; }
    catch { return null; }
  });

  const handleInterviewComplete = (reportData) => {
    setShowInterviewRoom(false);
    setInterviewReport(reportData);
    // Save report to localStorage
    localStorage.setItem('resumate_interview_report', JSON.stringify(reportData));
    // Update session to mark interview as completed
    const session = { ...candidateSession, interview_completed: true };
    localStorage.setItem('resumate_candidate', JSON.stringify(session));
    setCandidateSession(session);
  };

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
      try { await uploadResume(file); } catch (err) { alert(`Failed: ${err.response?.data?.detail || err.message}`); }
    }
  };

  const handleSend = (msg) => {
    const m = msg || input.trim();
    if (m) { sendMessage(m); setInput(''); }
  };

  const handleLogout = () => {
    localStorage.removeItem('resumate_candidate');
    navigate('/candidate/login');
  };

  if (!candidateSession) return null;

  // If interview room is active, show it fullscreen
  if (showInterviewRoom) {
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
            ...(candidateSession.has_interview || interviewReport ? [{
              id: 'interview',
              icon: <Video size={18} />,
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
          <div className="cd-user-info">
            <div className="cd-user-avatar">{candidateSession.name?.[0]?.toUpperCase() || '?'}</div>
            <div className="cd-user-details">
              <div className="cd-user-name">{candidateSession.name || 'Candidate'}</div>
              <div className="cd-user-email">{candidateSession.email}</div>
            </div>
          </div>
          <button className="cd-logout" onClick={handleLogout}><LogOut size={16} /> Logout</button>
        </div>
      </aside>

      {/* Main */}
      <main className="cd-main">
        <header className="cd-header">
          <h1 className="cd-title">
            {tab === 'upload' ? 'My Resume' : tab === 'analysis' ? 'Resume Analysis' : tab === 'chat' ? 'AI Chat' : 'Live AI Interview'}
          </h1>
          {tab !== 'interview' && <span className="cd-welcome">Welcome, {candidateSession.name || 'Candidate'}</span>}
        </header>

        <div className="cd-body">
          {/* UPLOAD */}
          {tab === 'upload' && (
            <div className="cd-upload-section">
              <div className="cd-card">
                <div className={`cd-upload-zone ${dragActive ? 'active' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={e => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
                >
                  <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
                  <Upload size={36} className="cd-upload-icon" />
                  <h3>Upload your resume</h3>
                  <p>PDF, DOCX, TXT</p>
                </div>
              </div>
              {candidates.length > 0 && (
                <div className="cd-resume-list">
                  <h3>Your Resumes</h3>
                  {candidates.map((c, i) => (
                    <div key={c.id} className={`cd-resume-card ${selectedIds.includes(c.id) ? 'selected' : ''}`} onClick={() => toggleSelection(c.id)}>
                      <div className="cd-resume-avatar" style={{ background: getAvatarGradient(c.name) }}>{(c.name || 'U')[0].toUpperCase()}</div>
                      <div className="cd-resume-info"><h4>{c.name || c.file_name}</h4><p>{c.predicted_role || 'Processing...'}</p></div>
                      {selectedIds.includes(c.id) && <Check size={18} className="cd-check" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ANALYSIS */}
          {tab === 'analysis' && (
            <div className="cd-analysis-section">
              {candidates.length === 0 ? (
                <div className="cd-empty"><FileText size={40} /><h3>No resume uploaded</h3><p>Upload your resume first</p></div>
              ) : (
                <div className="cd-analysis-grid">
                  {candidates.map((c) => (
                    <div key={c.id} className="cd-card cd-analysis-card">
                      <div className="cd-analysis-header">
                        <div className="cd-resume-avatar" style={{ background: getAvatarGradient(c.name) }}>{(c.name || 'U')[0].toUpperCase()}</div>
                        <div><h3>{c.name}</h3><p>{c.predicted_role || 'N/A'}</p></div>
                      </div>
                      <div className="cd-analysis-stats">
                        <div className="cd-stat"><Briefcase size={14} /><span>{c.total_experience_years || 0}y exp</span></div>
                        <div className="cd-stat"><Award size={14} /><span>{c.experience_level || 'N/A'}</span></div>
                        {c.location && <div className="cd-stat"><MapPin size={14} /><span>{c.location}</span></div>}
                      </div>
                      {c.summary && <p className="cd-summary">{c.summary}</p>}
                      {c.skills?.length > 0 && (<div className="cd-skills">{(c.skills || []).slice(0, 8).map((s, j) => <span key={j} className="cd-skill">{typeof s === 'string' ? s : s?.name}</span>)}</div>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI CHAT */}
          {tab === 'chat' && (
            <div className="cd-chat-section">
              {selectedIds.length === 0 ? (
                <div className="cd-empty"><Bot size={40} /><h3>Select your resume first</h3><p>Go to My Resume tab and click on your resume</p></div>
              ) : (
                <div className="cd-chat-container">
                  <div className="cd-chat-messages">
                    {messages.map((m, i) => (
                      <div key={i} className={`cd-chat-msg ${m.role}`}>
                        {m.role === 'assistant' && <AIAvatar />}
                        <div className={`cd-chat-bubble ${m.role}`}>
                          {m.role === 'user' ? <p>{m.content}</p> : <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />}
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

          {/* ═══════ INTERVIEW ═══════ */}
          {tab === 'interview' && (
            <div className="cd-interview-section">
              {/* Priority 1: Show report if exists */}
              {interviewReport ? (
                /* ─── INTERVIEW REPORT VIEW ─── */
                <div style={{ maxWidth: '780px', margin: '0 auto' }}>
                  {/* Header */}
                  <div className="cd-card" style={{ padding: '28px', textAlign: 'center', marginBottom: '16px' }}>
                    {interviewReport.terminated
                      ? <AlertCircle size={40} style={{ color: '#EF4444', marginBottom: '12px' }} />
                      : <CheckCircle size={40} style={{ color: '#22C55E', marginBottom: '12px' }} />
                    }
                    <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '6px' }}>
                      {interviewReport.terminated ? 'Interview Terminated' : 'Interview Completed'}
                    </h2>
                    <p style={{ color: '#64748B', fontSize: '14px' }}>
                      {candidateSession.interview_config?.role || 'General'} · {interviewReport.scores?.length || 0} questions answered
                    </p>
                    {interviewReport.terminated && (
                      <div style={{ marginTop: '12px', padding: '10px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', color: '#DC2626', fontSize: '13px', fontWeight: '600' }}>
                        Terminated: exceeded 3 proctoring violations
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                    {[
                      { val: interviewReport.avgScore || '—', label: 'Score', color: null },
                      { val: `${interviewReport.eyeContact || 0}%`, label: 'Eye Contact', color: null },
                      { val: interviewReport.violations || 0, label: 'Violations', color: interviewReport.violations > 0 ? '#EF4444' : '#22C55E' },
                      { val: `${Math.floor((interviewReport.timer || 0) / 60)}:${String((interviewReport.timer || 0) % 60).padStart(2, '0')}`, label: 'Duration', color: null },
                    ].map((s, i) => (
                      <div key={i} className="cd-card" style={{ textAlign: 'center', padding: '16px' }}>
                        <div style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'monospace', color: s.color || '#1E293B' }}>{s.val}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Score Breakdown */}
                  {interviewReport.scores?.length > 0 && (
                    <div className="cd-card" style={{ padding: '20px', marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '14px' }}>Score Breakdown</h3>
                      {interviewReport.scores.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#94A3B8', width: '28px' }}>Q{i + 1}</span>
                          <div style={{ flex: 1, maxWidth: '180px', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${(s.score || 0) * 10}%`, height: '100%', borderRadius: '3px', background: s.score >= 7 ? '#22C55E' : s.score >= 4 ? '#F59E0B' : '#EF4444', transition: 'width 0.5s' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '700', width: '36px' }}>{s.score}/10</span>
                          <span style={{ fontSize: '12px', color: '#94A3B8', flex: 1 }}>{s.feedback}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI Report */}
                  {interviewReport.report && typeof interviewReport.report === 'string' && interviewReport.report.length > 5 && (
                    <div className="cd-card" style={{ padding: '24px', marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Brain size={16} style={{ color: "#3B82F6" }} /> AI Evaluation
                      </h3>
                      <div className="md" style={{ lineHeight: '1.7', color: '#475569' }} dangerouslySetInnerHTML={{ __html: marked.parse(String(interviewReport.report)) }} />
                    </div>
                  )}

                  {/* Proctoring */}
                  {(interviewReport.violations > 0 || interviewReport.lookAwayCount > 10) && (
                    <div className="cd-card" style={{ padding: '20px', marginBottom: '16px', borderColor: 'rgba(239,68,68,0.2)' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={14} /> Proctoring Summary
                      </h3>
                      {interviewReport.violations > 0 && (
                        <p style={{ fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <XCircle size={13} style={{ color: '#F59E0B' }} /> {interviewReport.violations} violation{interviewReport.violations > 1 ? 's' : ''} detected
                        </p>
                      )}
                      {interviewReport.lookAwayCount > 10 && (
                        <p style={{ fontSize: '13px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <EyeOff size={13} style={{ color: '#F59E0B' }} /> Gaze aversion: {interviewReport.lookAwayCount} times
                        </p>
                      )}
                    </div>
                  )}
                </div>

              ) : candidateSession.has_interview ? (
                /* ─── INTERVIEW NOT YET TAKEN ─── */
                <div className="cd-interview-ready">
                  <div className="cd-card cd-interview-card">
                    <Camera size={48} className="cd-interview-icon" />
                    <h2>AI Interview Room</h2>
                    <p>Proctored interview with face tracking and real-time AI scoring.</p>
                    <div className="cd-interview-details">
                      {candidateSession.interview_config?.role && <span><Briefcase size={14} /> {candidateSession.interview_config.role}</span>}
                      {candidateSession.interview_config?.num_questions && <span><MessageSquare size={14} /> {candidateSession.interview_config.num_questions} questions</span>}
                      {candidateSession.interview_config?.level && <span><Award size={14} /> {candidateSession.interview_config.level}</span>}
                    </div>
                    <div className="cd-interview-tips">
                      <h4>⚠️ Strict Proctoring — 3 violations = auto-termination</h4>
                      <ul>
                        <li>Camera + mic active throughout</li>
                        <li>Face detection + eye tracking enabled</li>
                        <li>Tab/window switching = violation</li>
                        <li>Fullscreen mode required</li>
                      </ul>
                    </div>
                    <button className="cd-start-interview" onClick={() => setShowInterviewRoom(true)}>
                      <Camera size={20} /> Enter Interview Room
                    </button>
                  </div>
                </div>
              ) : (
                /* ─── NO INTERVIEW SCHEDULED ─── */
                <div className="cd-empty"><Video size={40} /><h3>No interview scheduled</h3><p>Your hiring manager hasn't created an interview yet.</p></div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}