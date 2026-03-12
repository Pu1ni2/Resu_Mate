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
    return <div className="md" style={{ lineHeight: '1.7', color: 'var(--text2)' }} dangerouslySetInnerHTML={{ __html: marked.parse(text) }} />;
  } catch (e) {
    console.error('Markdown parse error:', e);
    return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: 'var(--text2)' }}>{text}</pre>;
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
    candidates, selectedIds, uploadProgress, setCandidates,
    loadCandidates, toggleSelection, selectAll,
    candidateSession, setCandidateSession
  } = useApp();

  const [advisorCandidates, setAdvisorCandidates] = useState([]);

  // Sync with global candidates
  useEffect(() => {
    if (candidates?.length > 0) setAdvisorCandidates(candidates);
  }, [candidates]);

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

  // Redirect if no session — but check localStorage first
  useEffect(() => {
    if (!candidateSession) {
      // Double-check localStorage before redirecting
      try {
        const stored = localStorage.getItem('resumate_candidate');
        if (stored) {
          const parsed = JSON.parse(stored);
          setCandidateSession(parsed);
          return; // Don't redirect, session will be set
        }
      } catch {}
      navigate('/candidate/login');
    }
  }, [candidateSession, navigate, setCandidateSession]);

  // Advisor chat state — messages stored PER MODE so switching tabs doesn't lose them
  const [advisorMode, setAdvisorMode] = useState('general');
  const [advisorChatMap, setAdvisorChatMap] = useState({
    general: [], resume_coach: [], interview_prep: [], career_advisor: []
  });
  const [advisorTyping, setAdvisorTyping] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeData, setResumeData] = useState(null);

  const advisorMessages = advisorChatMap[advisorMode] || [];

  const modeSuggestions = {
    general: ['Review my resume', 'Help me prepare for interviews', 'What career advice do you have?'],
    resume_coach: ['What are the weak spots in my resume?', 'How can I make it ATS-friendly?', 'Suggest better bullet points'],
    interview_prep: ['Generate practice questions for my role', 'Help me with "Tell me about yourself"', 'What behavioral questions should I expect?'],
    career_advisor: ['What are my key strengths?', 'What career paths fit my profile?', 'What skills should I learn next?'],
  };

  // Follow-up suggestions — show initial if empty, otherwise show dynamic from backend
  const [dynamicSuggestions, setDynamicSuggestions] = useState([]);
  const advisorSuggestions = advisorMessages.length === 0 ? modeSuggestions[advisorMode] : dynamicSuggestions;

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [advisorMessages, advisorTyping]);

  // Reset dynamic suggestions when switching modes
  useEffect(() => {
    setDynamicSuggestions([]);
  }, [advisorMode]);

  const handleUpload = async (files) => {
    // Only take the first file — single resume per candidate
    const file = Array.from(files)[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('email', candidateSession?.email || '');
      const resp = await fetch(`${API_BASE}/api/advisor/upload-resume`, { method: 'POST', body: form });
      const data = await resp.json();
      if (data.success) {
        setResumeUploaded(true);
        setResumeData(data.data);
        // Replace — only one resume allowed
        setAdvisorCandidates([data.data]);
      } else {
        alert('Upload failed');
      }
    } catch (err) { alert(`Upload failed: ${err.message}`); }
  };

  const handleAdvisorSend = async (msg) => {
    const m = msg || input.trim();
    if (!m || advisorTyping) return;
    setInput('');
    const mode = advisorMode;
    setAdvisorChatMap(prev => ({ ...prev, [mode]: [...(prev[mode] || []), { role: 'user', content: m }] }));
    setDynamicSuggestions([]); // Clear while loading
    setAdvisorTyping(true);
    try {
      const resp = await fetch(`${API_BASE}/api/advisor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: candidateSession?.email || '', message: m, mode })
      });
      const data = await resp.json();
      setAdvisorChatMap(prev => ({ ...prev, [mode]: [...(prev[mode] || []), { role: 'assistant', content: data.reply || 'No response.' }] }));
      // Set follow-up suggestions from backend
      if (data.suggestions?.length > 0) {
        setDynamicSuggestions(data.suggestions);
      }
    } catch {
      setAdvisorChatMap(prev => ({ ...prev, [mode]: [...(prev[mode] || []), { role: 'assistant', content: 'Sorry, could not connect. Please try again.' }] }));
    }
    setAdvisorTyping(false);
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

  if (!candidateSession) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
        <Loader size={24} className="spin" />
      </div>
    );
  }

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
            { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Advisor' },
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
              {advisorCandidates.length === 0 ? (
                <div className="cd-card cd-upload-zone" onClick={() => document.getElementById('cd-file').click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}>
                  <Upload size={36} className="cd-upload-icon" />
                  <h3>Upload Your Resume</h3>
                  <p>PDF, DOCX, or TXT (max 5MB)</p>
                  <input id="cd-file" type="file" accept=".pdf,.docx,.txt" hidden onChange={e => handleUpload(e.target.files)} />
                </div>
              ) : (
                <div>
                  {/* Show uploaded resume */}
                  <div className="cd-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '20px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={22} style={{ color: '#3B82F6' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>{advisorCandidates[0].name || 'Resume'}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text3)', margin: 0 }}>
                        {advisorCandidates[0].predicted_role || ''} {advisorCandidates[0].experience_level ? `· ${advisorCandidates[0].experience_level}` : ''} {advisorCandidates[0].total_experience_years ? `· ${advisorCandidates[0].total_experience_years}y exp` : ''}
                      </p>
                    </div>
                    <Check size={20} style={{ color: '#22C55E' }} />
                  </div>
                  {/* Replace button */}
                  <button
                    onClick={() => document.getElementById('cd-file-replace').click()}
                    style={{ marginTop: '12px', padding: '10px 18px', fontSize: '13px', background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'var(--text3)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <Upload size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} /> Replace Resume
                  </button>
                  <input id="cd-file-replace" type="file" accept=".pdf,.docx,.txt" hidden onChange={e => handleUpload(e.target.files)} />
                </div>
              )}
            </div>
          )}

          {/* ═══ ANALYSIS ═══ */}
          {tab === 'analysis' && (
            <div className="cd-analysis-section">
              {advisorCandidates.length === 0 ? (
                <div className="cd-empty"><FileText size={40} /><h3>No resume uploaded</h3><p>Upload your resume to see analysis</p></div>
              ) : (
                advisorCandidates.map(c => (
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

          {/* ═══ AI ADVISOR CHAT ═══ */}
          {tab === 'chat' && (
            <div className="cd-chat-section">
              {/* Mode selector tabs */}
              <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--surface-border)', background: 'var(--bg2)' }}>
                {[
                  { id: 'general', icon: '💬', label: 'General' },
                  { id: 'resume_coach', icon: '📄', label: 'Resume Coach' },
                  { id: 'interview_prep', icon: '🎯', label: 'Interview Prep' },
                  { id: 'career_advisor', icon: '🚀', label: 'Career Advisor' },
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setAdvisorMode(mode.id)}
                    style={{
                      padding: '12px 18px', fontSize: '13px', fontWeight: advisorMode === mode.id ? '600' : '500',
                      border: 'none', borderBottom: advisorMode === mode.id ? '2px solid #3B82F6' : '2px solid transparent',
                      background: 'transparent',
                      color: advisorMode === mode.id ? '#3B82F6' : 'var(--text3)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}
                  >
                    <span>{mode.icon}</span> {mode.label}
                    {(advisorChatMap[mode.id]?.length || 0) > 0 && (
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3B82F6' }} />
                    )}
                  </button>
                ))}
              </div>

              <div className="cd-chat-container">
                <div className="cd-chat-messages">
                  {/* Empty state per mode */}
                  {advisorMessages.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Bot size={28} color="#fff" />
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>
                        {advisorMode === 'resume_coach' ? '📄 Resume Coach' : advisorMode === 'interview_prep' ? '🎯 Interview Prep' : advisorMode === 'career_advisor' ? '🚀 Career Advisor' : '💬 AI Career Assistant'}
                      </h3>
                      <p style={{ fontSize: '14px', color: 'var(--text3)', maxWidth: '380px', margin: '0 auto 20px', lineHeight: '1.5' }}>
                        {advisorMode === 'resume_coach' ? "I'll analyze your resume, identify gaps, and suggest specific improvements to make it stand out." : advisorMode === 'interview_prep' ? "I'll generate practice questions, help you craft answers using the STAR method, and give presentation tips." : advisorMode === 'career_advisor' ? "I'll analyze your strengths, suggest career paths, recommend skills to learn, and provide market insights." : "Your personal career assistant — ask about your resume, interviews, or career growth."}
                      </p>
                    </div>
                  )}

                  {/* Messages */}
                  {advisorMessages.map((m, i) => (
                    <div key={i} className={`cd-chat-msg ${m.role}`}>
                      {m.role === 'assistant' && (
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Bot size={16} color="#fff" />
                        </div>
                      )}
                      <div style={{
                        padding: '12px 16px', borderRadius: '14px', maxWidth: '75%', fontSize: '14px', lineHeight: '1.65',
                        ...(m.role === 'user' ? {
                          background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                          color: '#FFFFFF',
                          borderBottomRightRadius: '4px',
                        } : {
                          background: 'var(--bg3)',
                          color: 'var(--text)',
                          borderBottomLeftRadius: '4px',
                          border: '1px solid var(--surface-border)',
                        })
                      }}>
                        {m.role === 'user' ? <p style={{ margin: 0, color: '#FFFFFF' }}>{m.content}</p> : <SafeMarkdown text={m.content} />}
                      </div>
                    </div>
                  ))}
                  {advisorTyping && (
                    <div className="cd-chat-msg assistant">
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Bot size={16} color="#fff" />
                      </div>
                      <div style={{ padding: '14px 18px', borderRadius: '14px', background: 'var(--bg3)', border: '1px solid var(--surface-border)', borderBottomLeftRadius: '4px' }}>
                        <div className="typing"><span /><span /><span /></div>
                      </div>
                    </div>
                  )}
                  <div ref={msgEndRef} />
                </div>

                {/* Suggestions */}
                {advisorSuggestions.length > 0 && !advisorTyping && (
                  <div style={{ display: 'flex', gap: '8px', padding: '10px 16px', flexWrap: 'wrap', borderTop: '1px solid var(--surface-border)' }}>
                    {advisorSuggestions.map((q, i) => (
                      <button key={i} onClick={() => handleAdvisorSend(q)} style={{
                        padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: '500',
                        background: 'var(--bg3)', border: '1px solid var(--surface-border)', color: 'var(--text2)',
                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                      onMouseOver={e => { e.target.style.background = 'rgba(59,130,246,0.1)'; e.target.style.borderColor = '#3B82F6'; e.target.style.color = '#3B82F6'; }}
                      onMouseOut={e => { e.target.style.background = 'var(--bg3)'; e.target.style.borderColor = 'var(--surface-border)'; e.target.style.color = 'var(--text2)'; }}
                      >{q}</button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <div style={{ display: 'flex', gap: '10px', padding: '12px 16px', borderTop: '1px solid var(--surface-border)', background: 'var(--bg2)' }}>
                  <input
                    type="text" value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdvisorSend(); }}
                    placeholder={advisorMode === 'resume_coach' ? 'Ask about your resume...' : advisorMode === 'interview_prep' ? 'Ask about interviews...' : advisorMode === 'career_advisor' ? 'Ask about your career...' : 'Ask me anything...'}
                    disabled={advisorTyping}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: '12px',
                      border: '1px solid var(--surface-border)', background: 'var(--bg3)',
                      fontSize: '14px', color: 'var(--text)', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => handleAdvisorSend()}
                    disabled={!input.trim() || advisorTyping}
                    style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      background: input.trim() ? '#3B82F6' : 'var(--bg3)',
                      color: '#fff', border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: input.trim() ? 1 : 0.4, transition: 'all 0.15s',
                    }}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ INTERVIEW ═══ */}
          {tab === 'interview' && (
            <div className="cd-interview-section" style={{ maxWidth: '780px', margin: '0 auto' }}>

              {/* 1. PREVIOUS REPORT (on top, collapsible) */}
              {interviewReport && (
                <div className="cd-card" style={{ padding: '20px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <CheckCircle size={20} style={{ color: '#22C55E' }} />
                      <div>
                        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>Previous Interview</h3>
                        <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                          Score: {interviewReport.avgScore || '—'}/10 · Eye Contact: {interviewReport.eyeContact || 0}% · Violations: {interviewReport.violations || 0} · {Math.floor((interviewReport.timer || 0) / 60)}:{String((interviewReport.timer || 0) % 60).padStart(2, '0')}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowFullReport(prev => !prev)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                    >
                      {showFullReport ? <EyeOff size={13} /> : <Eye size={13} />}
                      {showFullReport ? 'Hide' : 'View Report'}
                    </button>
                  </div>

                  {/* Expanded report */}
                  {showFullReport && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
                      <InterviewReportView report={interviewReport} />
                    </div>
                  )}
                </div>
              )}

              {/* 2. NEW INTERVIEW (below previous report) */}
              {hasInterview && (
                <div className="cd-card" style={{ padding: '24px', marginBottom: '20px', border: '1px solid #DBEAFE', background: '#EFF6FF' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#3B82F6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={24} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '2px', color: '#1E293B' }}>
                        {interviewReport ? 'New Interview Scheduled' : 'AI Interview Ready'}
                      </h3>
                      <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                        {candidateSession.interview_config?.role || 'General'} · {candidateSession.interview_config?.num_questions || 8} questions · {candidateSession.interview_config?.level || 'Mid-Level'}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px', lineHeight: '1.5' }}>
                    Proctored with camera, mic, face tracking. Tab switching monitored. 3 violations = auto-termination.
                  </p>
                  <button className="cd-start-interview" onClick={() => {
                    setInterviewReport(null);
                    localStorage.removeItem('resumate_interview_report');
                    setShowInterviewRoom(true);
                  }}>
                    <Camera size={18} /> Enter Interview Room
                  </button>
                </div>
              )}

              {/* 3. NOTHING */}
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