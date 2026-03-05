import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import {
  Upload, BarChart2, MessageSquare, Video, Send, Bot,
  FileText, AlertCircle, Briefcase, Award, MapPin, Check, Loader,
  LogOut, Mic, MicOff, Volume2, Square, Camera, CameraOff,
  Clock, ChevronRight, Sparkles, X, StopCircle
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
  const [interviewPhase, setInterviewPhase] = useState('ready'); // ready | countdown | live | finished
  const [currentQ, setCurrentQ] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [scores, setScores] = useState([]);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [interviewTimer, setInterviewTimer] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [interviewReport, setInterviewReport] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const currentAudioRef = useRef(null);

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

  // Interview timer
  useEffect(() => {
    if (interviewPhase === 'live') {
      timerRef.current = setInterval(() => setInterviewTimer(t => t + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [interviewPhase]);

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

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
    stopInterview();
    localStorage.removeItem('resumate_candidate');
    navigate('/candidate/login');
  };

  // ═══════ INTERVIEW FUNCTIONS ═══════

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720, facingMode: 'user' }, 
        audio: true 
      });
      streamRef.current = stream;
      // Set video source immediately and also in useEffect
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      return true;
    } catch (err) {
      alert('Please allow camera and microphone access to start the interview.');
      return false;
    }
  };

  // Keep video element synced with stream
  useEffect(() => {
    if (videoRef.current && streamRef.current && interviewPhase === 'live') {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [interviewPhase]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const stopInterview = () => {
    stopCamera();
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsListening(false);
    setAiSpeaking(false);
  };

  const speakQuestion = async (text) => {
    setAiSpeaking(true);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/text-to-speech`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer demo-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'nova' })
      });
      if (!resp.ok) throw new Error('TTS failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      
      return new Promise((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; setAiSpeaking(false); resolve(); };
        audio.onerror = () => { setAiSpeaking(false); resolve(); };
        audio.play();
      });
    } catch (e) {
      console.error('TTS error:', e);
      setAiSpeaking(false);
    }
  };

  const recordAnswer = async () => {
    if (!streamRef.current) return '';
    setIsListening(true);
    setCurrentTranscript('');
    audioChunksRef.current = [];

    // Create audio-only stream for recording (Whisper needs audio only)
    const audioTracks = streamRef.current.getAudioTracks();
    if (audioTracks.length === 0) { setIsListening(false); return ''; }
    const audioStream = new MediaStream(audioTracks);
    
    const mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'answer.webm');
          const resp = await fetch(`${API_BASE}/api/chat/speech-to-text`, {
            method: 'POST', headers: { 'Authorization': 'Bearer demo-token' }, body: formData
          });
          const data = await resp.json();
          const text = data.text || '';
          setCurrentTranscript(text);
          setIsTranscribing(false);
          resolve(text);
        } catch (e) {
          setIsTranscribing(false);
          resolve('');
        }
      };
      mediaRecorder.start();
    });
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const scoreAnswer = async (question, answer) => {
    try {
      const resp = await fetch(`${API_BASE}/api/chat/score-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          question, answer,
          role: candidateSession.interview_config?.role || 'General',
          candidate_name: candidateSession.name || 'Candidate'
        })
      });
      return await resp.json();
    } catch (e) {
      return { score: 5, feedback: 'Could not score this answer.' };
    }
  };

  const generateQuestions = async () => {
    try {
      const config = candidateSession.interview_config || {};
      const resp = await fetch(`${API_BASE}/api/chat/generate-interview-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          role: config.role || 'General',
          level: config.level || 'Mid-Level',
          num_questions: config.num_questions || 8,
          focus_areas: config.focus_areas || [],
          candidate_name: candidateSession.name || 'Candidate'
        })
      });
      const data = await resp.json();
      return data.questions || [];
    } catch (e) {
      return ['Tell me about yourself.', 'What are your strengths?', 'Why are you interested in this role?'];
    }
  };

  const startInterview = async () => {
    const cameraOk = await startCamera();
    if (!cameraOk) return;

    // Countdown
    setInterviewPhase('countdown');
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }

    // Generate questions
    setInterviewPhase('live');
    setInterviewTimer(0);
    const qs = await generateQuestions();
    setQuestions(qs);
    setCurrentQ(0);
    setAnswers([]);
    setScores([]);

    // Start with first question
    if (qs.length > 0) {
      await speakQuestion(qs[0]);
    }
  };

  const submitAnswer = async () => {
    stopRecording();
    // Wait for transcription
    await new Promise(r => setTimeout(r, 1500));
    
    const answer = currentTranscript;
    const question = questions[currentQ];
    
    setAnswers(prev => [...prev, answer]);
    setCurrentTranscript('');

    // Score the answer
    const scoreData = await scoreAnswer(question, answer);
    setScores(prev => [...prev, scoreData]);

    // Move to next question or finish
    if (currentQ + 1 < questions.length) {
      setCurrentQ(prev => prev + 1);
      await speakQuestion(questions[currentQ + 1]);
    } else {
      // Interview complete
      await finishInterview();
    }
  };

  const finishInterview = async () => {
    stopCamera();
    if (timerRef.current) clearInterval(timerRef.current);
    setInterviewPhase('finished');
    setGeneratingReport(true);

    // Generate final report
    try {
      const resp = await fetch(`${API_BASE}/api/chat/interview-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          candidate_name: candidateSession.name || 'Candidate',
          candidate_email: candidateSession.email,
          role: candidateSession.interview_config?.role || 'General',
          questions, answers, scores,
          duration: interviewTimer
        })
      });
      const data = await resp.json();
      setInterviewReport(data.report || 'Report generation failed.');
    } catch (e) {
      setInterviewReport('Could not generate report. Please contact support.');
    } finally {
      setGeneratingReport(false);
    }
  };

  if (!candidateSession) return null;

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
            ...(candidateSession.has_interview ? [{ id: 'interview', icon: <Video size={18} />, label: 'Interview' }] : [])
          ].map(item => (
            <div key={item.id} className={`cd-nav-link ${tab === item.id ? 'active' : ''}`} onClick={() => { if (interviewPhase === 'live') return; setTab(item.id); }}>
              {item.icon}<span>{item.label}</span>
              {item.id === 'interview' && <span className="cd-nav-badge">New</span>}
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
          {tab === 'interview' && interviewPhase === 'live' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="cd-live-badge">● LIVE</span>
              <span style={{ fontSize: '14px', color: '#64748B', fontFamily: 'monospace' }}>{formatTime(interviewTimer)}</span>
            </div>
          )}
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

          {/* ═══════ LIVE AI INTERVIEW ═══════ */}
          {tab === 'interview' && (
            <div className="cd-interview-section">

              {/* READY STATE */}
              {interviewPhase === 'ready' && (
                <div className="cd-interview-ready">
                  <div className="cd-card cd-interview-card">
                    <Video size={48} className="cd-interview-icon" />
                    <h2>Your AI Interview is Ready</h2>
                    <p>You'll have a live video interview with our AI assistant.</p>
                    <div className="cd-interview-details">
                      {candidateSession.interview_config?.role && <span><Briefcase size={14} /> {candidateSession.interview_config.role}</span>}
                      {candidateSession.interview_config?.num_questions && <span><MessageSquare size={14} /> {candidateSession.interview_config.num_questions} questions</span>}
                      {candidateSession.interview_config?.level && <span><Award size={14} /> {candidateSession.interview_config.level}</span>}
                    </div>
                    <div className="cd-interview-tips">
                      <h4>Before you start:</h4>
                      <ul>
                        <li>Allow camera & microphone access</li>
                        <li>Find a quiet, well-lit space</li>
                        <li>Speak clearly — AI will transcribe your answers</li>
                        <li>Click the mic button when you're done answering</li>
                      </ul>
                    </div>
                    <button className="cd-start-interview" onClick={startInterview}>
                      <Camera size={20} /> Start Live Interview
                    </button>
                  </div>
                </div>
              )}

              {/* COUNTDOWN */}
              {interviewPhase === 'countdown' && (
                <div className="iv-countdown">
                  <div className="iv-countdown-number">{countdown}</div>
                  <p>Get ready...</p>
                </div>
              )}

              {/* LIVE INTERVIEW - Full screen Zoom-like layout */}
              {interviewPhase === 'live' && (
                <div className="iv-live">
                  {/* Main area - your video takes most of the screen */}
                  <div className="iv-main-area">
                    <div className="iv-video-container">
                      <video ref={videoRef} autoPlay muted playsInline className="iv-video" />
                      
                      {/* Overlays on video */}
                      <div className="iv-video-overlay">
                        <div className="iv-video-top">
                          <span className="iv-live-dot">● LIVE</span>
                          <span className="iv-question-count">Question {currentQ + 1} of {questions.length}</span>
                          <span className="iv-timer">{formatTime(interviewTimer)}</span>
                        </div>
                      </div>

                      {/* AI Avatar floating in corner (like Zoom participant) */}
                      <div className="iv-ai-pip">
                        <div className="iv-ai-pip-inner">
                          <Bot size={28} />
                          {aiSpeaking && <div className="iv-ai-pip-ring" />}
                        </div>
                        <span>AI Interviewer</span>
                      </div>
                    </div>

                    {/* Bottom control bar */}
                    <div className="iv-control-bar">
                      <div className="iv-control-left">
                        {scores.length > 0 && (
                          <div className="iv-mini-scores">
                            {scores.map((s, i) => (
                              <span key={i} className={`iv-mini-score ${s.score >= 7 ? 'good' : s.score >= 4 ? 'ok' : 'low'}`}>Q{i + 1}: {s.score}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="iv-control-center">
                        {!isListening && !isTranscribing && !aiSpeaking && (
                          <button className="iv-ctrl-btn record" onClick={() => { setCurrentTranscript(''); recordAnswer(); }}>
                            <Mic size={22} />
                          </button>
                        )}
                        {isListening && (
                          <button className="iv-ctrl-btn stop" onClick={submitAnswer}>
                            <StopCircle size={22} />
                          </button>
                        )}
                        {isTranscribing && (
                          <button className="iv-ctrl-btn" disabled><Loader size={22} className="spin" /></button>
                        )}
                        {aiSpeaking && (
                          <button className="iv-ctrl-btn" disabled><Volume2 size={22} /></button>
                        )}
                      </div>
                      <div className="iv-control-right">
                        <button className="iv-ctrl-btn end" onClick={finishInterview}><X size={18} /> End</button>
                      </div>
                    </div>
                  </div>

                  {/* Side panel - question + status */}
                  <div className="iv-side-panel">
                    <div className="iv-side-header">
                      <Bot size={20} />
                      <span>AI Interviewer</span>
                    </div>

                    {/* Current Question */}
                    <div className="iv-current-q">
                      <span className="iv-q-label">Question {currentQ + 1}</span>
                      <p className="iv-q-text">{questions[currentQ] || 'Preparing...'}</p>
                      {aiSpeaking && <span className="iv-speaking-badge">🔊 Speaking...</span>}
                    </div>

                    {/* Status */}
                    {isListening && (
                      <div className="iv-side-status listening">
                        <div className="iv-wave"><span /><span /><span /><span /><span /></div>
                        <span>Listening to your answer...</span>
                      </div>
                    )}
                    {isTranscribing && (
                      <div className="iv-side-status"><Loader size={14} className="spin" /><span>Transcribing...</span></div>
                    )}
                    {currentTranscript && (
                      <div className="iv-side-transcript">
                        <span className="iv-q-label">Your Answer</span>
                        <p>"{currentTranscript}"</p>
                      </div>
                    )}
                    {!isListening && !isTranscribing && !aiSpeaking && !currentTranscript && (
                      <div className="iv-side-hint">
                        <Mic size={16} />
                        <span>Click the microphone button to start answering</span>
                      </div>
                    )}

                    {/* Previous Q&A scores */}
                    {scores.length > 0 && (
                      <div className="iv-side-history">
                        <span className="iv-q-label">Scores</span>
                        {scores.map((s, i) => (
                          <div key={i} className="iv-history-item">
                            <span>Q{i + 1}</span>
                            <div className="iv-breakdown-bar"><div style={{ width: `${s.score * 10}%` }} className={s.score >= 7 ? 'good' : s.score >= 4 ? 'ok' : 'low'} /></div>
                            <span className={`iv-score-val ${s.score >= 7 ? 'good' : s.score >= 4 ? 'ok' : 'low'}`}>{s.score}/10</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* FINISHED */}
              {interviewPhase === 'finished' && (
                <div className="iv-finished">
                  <div className="cd-card" style={{ maxWidth: '700px', margin: '0 auto' }}>
                    {generatingReport ? (
                      <div className="iv-generating"><Loader size={32} className="spin" /><h3>Generating your interview report...</h3><p>AI is analyzing your responses</p></div>
                    ) : (
                      <>
                        <div className="iv-report-header">
                          <Sparkles size={24} />
                          <h2>Interview Complete!</h2>
                          <p>Duration: {formatTime(interviewTimer)} | Questions: {questions.length}</p>
                        </div>
                        <div className="iv-final-scores">
                          <div className="iv-avg-score">
                            <span className="iv-avg-num">{scores.length > 0 ? (scores.reduce((a, s) => a + s.score, 0) / scores.length).toFixed(1) : '—'}</span>
                            <span className="iv-avg-label">Average Score</span>
                          </div>
                          <div className="iv-score-breakdown">
                            {scores.map((s, i) => (
                              <div key={i} className="iv-breakdown-item">
                                <span className="iv-breakdown-q">Q{i + 1}</span>
                                <div className="iv-breakdown-bar"><div style={{ width: `${s.score * 10}%` }} className={s.score >= 7 ? 'good' : s.score >= 4 ? 'ok' : 'low'} /></div>
                                <span className="iv-breakdown-num">{s.score}/10</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {interviewReport && (
                          <div className="iv-report-body">
                            <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(interviewReport) }} />
                          </div>
                        )}
                        <button className="cd-start-interview" onClick={() => { setInterviewPhase('ready'); setQuestions([]); setAnswers([]); setScores([]); setInterviewReport(null); setInterviewTimer(0); }} style={{ marginTop: '20px' }}>
                          Back to Interview Info
                        </button>
                      </>
                    )}
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