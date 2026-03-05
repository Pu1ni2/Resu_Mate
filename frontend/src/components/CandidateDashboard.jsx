import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import {
  Upload, BarChart2, MessageSquare, Video, Home, Send, Bot, Users,
  FileText, AlertCircle, Briefcase, Award, MapPin, Check, Trash2,
  ChevronLeft, ChevronRight, Sparkles, Loader, ArrowLeft, LogOut,
  Mic, MicOff, Volume2, Square
} from 'lucide-react';

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
    messages, suggestions, isTyping, sendMessage, initChat, clearChat,
    getDisplayName, getAvatarGradient
  } = useApp();

  const [tab, setTab] = useState('upload');
  const [input, setInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);
  const msgEndRef = useRef(null);

  // Get candidate session
  const [candidateSession, setCandidateSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('resumate_candidate')) || null; }
    catch { return null; }
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

  return (
    <div className="cd-layout">
      {/* Sidebar */}
      <aside className="cd-sidebar">
        <div className="cd-sidebar-header">
          <div className="cd-sidebar-logo"><Logo size={24} /> ResuMate</div>
        </div>
        <nav className="cd-sidebar-nav">
          <div className="cd-nav-section-title">Dashboard</div>
          {[
            { id: 'upload', icon: <Upload size={18} />, label: 'My Resume' },
            { id: 'analysis', icon: <BarChart2 size={18} />, label: 'Analysis' },
            { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Chat' },
            ...(candidateSession.has_interview ? [{ id: 'interview', icon: <Video size={18} />, label: 'Interview' }] : [])
          ].map(item => (
            <div key={item.id} className={`cd-nav-link ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>
              {item.icon}<span>{item.label}</span>
              {item.id === 'interview' && <span className="cd-nav-badge">New</span>}
            </div>
          ))}
        </nav>
        <div className="cd-sidebar-footer">
          <div className="cd-user-info">
            <div className="cd-user-avatar">{candidateSession.name?.[0]?.toUpperCase() || candidateSession.email?.[0]?.toUpperCase() || '?'}</div>
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
            {tab === 'upload' ? 'My Resume' : tab === 'analysis' ? 'Resume Analysis' : tab === 'chat' ? 'AI Chat' : 'Live Interview'}
          </h1>
          <span className="cd-welcome">Welcome, {candidateSession.name || 'Candidate'}</span>
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
                  <p>PDF, DOCX, TXT • Max 5MB</p>
                </div>
                {Object.entries(uploadProgress).map(([id, p]) => (
                  <div key={id} className="cd-progress">
                    <div className="cd-progress-bar" style={{ width: `${p}%` }} />
                    <span>{p}%</span>
                  </div>
                ))}
              </div>
              {candidates.length > 0 && (
                <div className="cd-resume-list">
                  <h3>Your Resumes</h3>
                  {candidates.map((c, i) => (
                    <div key={c.id} className={`cd-resume-card ${selectedIds.includes(c.id) ? 'selected' : ''}`} onClick={() => toggleSelection(c.id)}>
                      <div className="cd-resume-avatar" style={{ background: getAvatarGradient(c.name) }}>{(c.name || 'U')[0].toUpperCase()}</div>
                      <div className="cd-resume-info">
                        <h4>{c.name || c.file_name}</h4>
                        <p>{c.predicted_role || 'Processing...'}</p>
                      </div>
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
                <div className="cd-empty"><FileText size={40} /><h3>No resume uploaded</h3><p>Upload your resume first to see analysis</p></div>
              ) : (
                <div className="cd-analysis-grid">
                  {candidates.map((c, i) => (
                    <div key={c.id} className="cd-card cd-analysis-card">
                      <div className="cd-analysis-header">
                        <div className="cd-resume-avatar" style={{ background: getAvatarGradient(c.name) }}>{(c.name || 'U')[0].toUpperCase()}</div>
                        <div><h3>{c.name}</h3><p>{c.predicted_role || 'N/A'}</p></div>
                      </div>
                      <div className="cd-analysis-stats">
                        <div className="cd-stat"><Briefcase size={14} /><span>{c.total_experience_years || 0} years exp</span></div>
                        <div className="cd-stat"><Award size={14} /><span>{c.experience_level || 'N/A'}</span></div>
                        {c.location && <div className="cd-stat"><MapPin size={14} /><span>{c.location}</span></div>}
                      </div>
                      {c.summary && <p className="cd-summary">{c.summary}</p>}
                      {c.skills?.length > 0 && (
                        <div className="cd-skills">
                          {(c.skills || []).slice(0, 8).map((s, j) => <span key={j} className="cd-skill">{typeof s === 'string' ? s : s?.name}</span>)}
                        </div>
                      )}
                      {c.key_strengths?.length > 0 && (
                        <div className="cd-strengths"><h4>Key Strengths</h4><ul>{c.key_strengths.map((s, j) => <li key={j}>{s}</li>)}</ul></div>
                      )}
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
                <div className="cd-empty"><Bot size={40} /><h3>Select your resume first</h3><p>Go to My Resume tab and click on your resume to select it</p></div>
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

          {/* INTERVIEW */}
          {tab === 'interview' && (
            <div className="cd-interview-section">
              {!candidateSession.has_interview ? (
                <div className="cd-empty"><Video size={40} /><h3>No interview scheduled</h3><p>Your hiring manager hasn't created an interview yet.</p></div>
              ) : (
                <div className="cd-interview-ready">
                  <div className="cd-card cd-interview-card">
                    <Video size={48} className="cd-interview-icon" />
                    <h2>Your AI Interview is Ready</h2>
                    <p>You'll be interviewed by our AI assistant. Your camera and microphone will be used.</p>
                    <div className="cd-interview-details">
                      {candidateSession.interview_config?.role && <span><Briefcase size={14} /> Role: {candidateSession.interview_config.role}</span>}
                      {candidateSession.interview_config?.num_questions && <span><MessageSquare size={14} /> {candidateSession.interview_config.num_questions} questions</span>}
                    </div>
                    <div className="cd-interview-tips">
                      <h4>Tips:</h4>
                      <ul>
                        <li>Find a quiet, well-lit space</li>
                        <li>Test your camera and microphone</li>
                        <li>Speak clearly and maintain eye contact</li>
                        <li>Take your time to think before answering</li>
                      </ul>
                    </div>
                    <button className="cd-start-interview" onClick={() => alert('Interview feature coming soon!')}>
                      <Video size={20} /> Start Interview
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}