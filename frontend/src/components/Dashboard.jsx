import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import CandidateFocus from './CandidateFocus';
import PipelineWizard from './pipeline/PipelineWizard';
import ATSResultsView from './pipeline/ATSResultsView';
import JarvisAgent from './pipeline/JarvisAgent';
import { 
  Users, BarChart2, MessageSquare, Upload, Check, Home, Sparkles,
  Eye, EyeOff, Briefcase, MapPin, Award, Trash2, User,
  ChevronLeft, ChevronRight, TrendingUp, Send, Bot, FileText, AlertCircle,
  Mic, MicOff, Volume2, VolumeX, Loader, Square, Video, Clock, Zap, Crown, Target, ArrowRight, X
} from 'lucide-react';

const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs><linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs>
    <rect width="32" height="32" rx="8" fill="url(#lg2)"/>
    <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#000" strokeWidth="1.5" fill="none"/>
    <circle cx="16" cy="16" r="3" fill="#000"/>
  </svg>
);

const AIAvatar = () => (
  <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
    <Bot size={18} />
  </div>
);

function AutomatePanel({ candidates, onClose, navigate }) {
  const [role, setRole] = useState('');
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(false);
  const API = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';

  const runRanking = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/chat/automate-ranking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}` },
        body: JSON.stringify({ role: role.trim(), candidate_ids: candidates.map(c => c.id) }),
      });
      if (!resp.ok) throw new Error('Ranking failed');
      const data = await resp.json();
      setRanking(data.ranking);
    } catch (e) { alert('Ranking failed: ' + e.message); }
    finally { setLoading(false); }
  };

  const verdictColor = (v) => {
    if (v?.includes('Strong')) return '#22C55E';
    if (v?.includes('Good')) return '#3B82F6';
    if (v?.includes('Potential')) return '#F59E0B';
    return '#94A3B8';
  };

  const priorityColor = (p) => {
    if (p === 'High') return '#22C55E';
    if (p === 'Medium') return '#F59E0B';
    return '#94A3B8';
  };

  if (!ranking) {
    return (
      <div className="glass-card" style={{ padding: '32px', marginBottom: '20px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={18} /></button>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <Zap size={32} style={{ color: '#F59E0B', marginBottom: '8px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Automate Candidate Ranking</h3>
          <p style={{ color: 'var(--text3)', fontSize: '13px' }}>AI will analyze {candidates.length} candidates, compare them, and tell you who to interview first</p>
        </div>
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>Target Role (optional — AI will auto-detect if blank)</label>
          <input type="text" className="input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior ML Engineer, Full Stack Developer..." style={{ padding: '11px 14px', marginBottom: '14px', width: '100%' }} />
          <button className="btn btn-primary" onClick={runRanking} disabled={loading} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #F59E0B, #D97706)', justifyContent: 'center' }}>
            {loading ? <><Loader size={16} className="spin" /> <span>Analyzing {candidates.length} candidates...</span></> : <><Zap size={16} /> <span>Rank Candidates</span></>}
          </button>
        </div>
      </div>
    );
  }

  const r = ranking;
  const best = r.best_candidate || {};

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Header */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '12px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={18} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <Zap size={24} style={{ color: '#F59E0B' }} />
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Automated Ranking Complete</h3>
            <p style={{ fontSize: '12px', color: 'var(--text3)', margin: 0 }}>Role: {r.target_role} · {r.rankings?.length || 0} candidates analyzed</p>
          </div>
        </div>
        {r.comparison_summary && <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.6', margin: 0 }}>{r.comparison_summary}</p>}
      </div>

      {/* Best Candidate Highlight */}
      {best.name && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '12px', borderColor: 'rgba(34,197,94,0.3)', background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Crown size={20} style={{ color: '#22C55E' }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#22C55E' }}>Best Candidate</span>
          </div>
          <h4 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '4px' }}>{best.name}</h4>
          <p style={{ fontSize: '13px', color: 'var(--text2)', margin: 0 }}>{best.reason}</p>
        </div>
      )}

      {/* Rankings */}
      {(r.rankings || []).map((c, i) => (
        <div key={i} className="glass-card" style={{ padding: '18px', marginBottom: '10px', borderLeft: `3px solid ${verdictColor(c.verdict)}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: verdictColor(c.verdict), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: '800' }}>
                #{c.rank}
              </div>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: '700', margin: 0 }}>{c.name}</h4>
                <span style={{ fontSize: '11px', color: verdictColor(c.verdict), fontWeight: '600' }}>{c.verdict}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'monospace', color: c.score >= 75 ? '#22C55E' : c.score >= 50 ? '#F59E0B' : '#EF4444' }}>{c.score}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>/ 100</div>
            </div>
          </div>

          {c.standout && <p style={{ fontSize: '12px', color: 'var(--text)', fontStyle: 'italic', padding: '8px 10px', borderRadius: '8px', background: 'var(--bg3, rgba(255,255,255,0.04))', marginBottom: '10px' }}>{c.standout}</p>}

          <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#22C55E', display: 'block', marginBottom: '3px' }}>STRENGTHS</span>
              {(c.strengths || []).map((s, j) => <p key={j} style={{ fontSize: '11px', color: 'var(--text2)', margin: '2px 0', paddingLeft: '8px', borderLeft: '2px solid #22C55E30' }}>{s}</p>)}
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#F59E0B', display: 'block', marginBottom: '3px' }}>GAPS</span>
              {(c.gaps || []).map((g, j) => <p key={j} style={{ fontSize: '11px', color: 'var(--text2)', margin: '2px 0', paddingLeft: '8px', borderLeft: '2px solid #F59E0B30' }}>{g}</p>)}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--surface-border, rgba(255,255,255,0.06))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Target size={12} style={{ color: priorityColor(c.interview_priority) }} />
              <span style={{ fontSize: '11px', fontWeight: '600', color: priorityColor(c.interview_priority) }}>Interview Priority: {c.interview_priority}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(c.suggested_focus_areas || []).slice(0, 3).map((f, j) => (
                <span key={j} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'var(--bg3, rgba(255,255,255,0.06))', color: 'var(--text3)' }}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Interview Order */}
      {(r.interview_order || []).length > 0 && (
        <div className="glass-card" style={{ padding: '16px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowRight size={14} style={{ color: '#3B82F6' }} /> Suggested Interview Order
          </h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {r.interview_order.map((name, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'var(--bg3, rgba(255,255,255,0.04))', fontSize: '12px', fontWeight: '600' }}>
                <span style={{ color: '#3B82F6', fontWeight: '800' }}>{i + 1}.</span> {name}
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => { setRanking(null); setRole(''); }} style={{ marginTop: '10px', background: 'none', border: 'none', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>Re-rank with different role</button>
    </div>
  );
}

function InterviewAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const API = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';

  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API}/api/chat/get-all-interview-results`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}` },
      });
      const json = await resp.json();
      setData(json.results || []);
    } catch { setData([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return (
    <div className="clean-section" style={{ textAlign: 'center', padding: '48px' }}>
      <Loader size={18} className="spin" style={{ color: 'var(--text3)' }} />
      <p style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '10px' }}>Loading interview data...</p>
    </div>
  );

  if (!data || data.length === 0) return (
    <div className="clean-section">
      <h3 className="clean-section-title">Interview Analytics</h3>
      <div className="clean-card" style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>No completed interviews yet</p>
      </div>
    </div>
  );

  const total = data.length;
  const scores = data.map(d => {
    const r = typeof d.report === 'object' ? d.report : {};
    const s = r.scores || d.scores || [];
    if (s.length === 0) return 0;
    return s.reduce((a, x) => a + ((x?.score || 0)), 0) / s.length;
  }).filter(s => s > 0);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
  const highPerformers = scores.filter(s => s >= 7).length;
  const lowPerformers = scores.filter(s => s < 4).length;

  const roleMap = {};
  data.forEach(d => {
    const role = d.role || 'General';
    roleMap[role] = (roleMap[role] || 0) + 1;
  });
  const roles = Object.entries(roleMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const dist = [0, 0, 0, 0, 0];
  scores.forEach(s => {
    if (s < 2) dist[0]++;
    else if (s < 4) dist[1]++;
    else if (s < 6) dist[2]++;
    else if (s < 8) dist[3]++;
    else dist[4]++;
  });
  const maxDist = Math.max(...dist, 1);

  const distColors = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#10B981'];

  return (
    <>
      <div className="clean-section" style={{ marginTop: '32px' }}>
        <h3 className="clean-section-title">Interview Analytics</h3>
        <div className="clean-stat-grid clean-stat-grid--4">
          {[
            { label: 'Total Interviews', value: total, sub: 'completed', icon: <Video size={18} /> },
            { label: 'Avg Score', value: avgScore, sub: 'out of 10', icon: <TrendingUp size={18} /> },
            { label: 'High Performers', value: highPerformers, sub: 'scored 7+', icon: <Award size={18} /> },
            { label: 'Needs Improvement', value: lowPerformers, sub: 'scored below 4', icon: <AlertCircle size={18} /> },
          ].map((stat, i) => (
            <div key={i} className="clean-stat-card">
              <div className="clean-stat-icon">{stat.icon}</div>
              <div className="clean-stat-value">{stat.value}</div>
              <div className="clean-stat-label">{stat.label}</div>
              <div className="clean-stat-sub">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="clean-section">
        <h3 className="clean-section-title">Score Distribution</h3>
        <div className="clean-card clean-card--padded">
          <div className="clean-bar-chart">
            {['0–2', '2–4', '4–6', '6–8', '8–10'].map((range, i) => (
              <div key={i} className="clean-bar-row">
                <span className="clean-bar-label">{range}</span>
                <div className="clean-bar-track">
                  <div className="clean-bar-fill" style={{
                    width: `${(dist[i] / maxDist) * 100}%`,
                    background: distColors[i]
                  }} />
                </div>
                <span className="clean-bar-count">{dist[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="clean-two-col">
        {roles.length > 0 && (
          <div className="clean-section">
            <h3 className="clean-section-title">By Role</h3>
            <div className="clean-card">
              {roles.map(([role, count], i) => (
                <div key={i} className="clean-list-row">
                  <span className="clean-list-label">{role}</span>
                  <span className="clean-pill">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="clean-section">
          <h3 className="clean-section-title">Recent Interviews</h3>
          <div className="clean-card">
            {data.slice(0, 6).map((d, i) => {
              const r = typeof d.report === 'object' ? d.report : {};
              const s = r.scores || d.scores || [];
              const avg = s.length > 0 ? (s.reduce((a, x) => a + (x?.score || 0), 0) / s.length).toFixed(1) : '—';
              const scoreColor = avg >= 7 ? 'var(--success)' : avg >= 4 ? 'var(--warning)' : 'var(--error)';
              return (
                <div key={i} className="clean-list-row">
                  <div>
                    <div className="clean-list-primary">{d.email}</div>
                    <div className="clean-list-secondary">{d.role || 'General'} · {d.timestamp ? new Date(d.timestamp).toLocaleDateString() : '—'}</div>
                  </div>
                  <span className="clean-score" style={{ color: scoreColor }}>{avg}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    candidates, selectedIds, selectedCandidates, uploadProgress, loading,
    loadCandidates, uploadResume, deleteCandidate, clearAllCandidates, toggleSelection, selectAll, clearSelection,
    anonymize, setAnonymize, analytics,
    messages, suggestions, isTyping, sendMessage, initChat, clearChat,
    getDisplayName, getAvatarGradient,
    hiringManager, logoutHiringManager,
  } = useApp();

  const [tab, setTab] = useState('upload');
  const [input, setInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(null);
  const [lastInputWasVoice, setLastInputWasVoice] = useState(false);
  const [pendingAutoSpeak, setPendingAutoSpeak] = useState(false);
  
  const fileRef = useRef(null);
  const msgEndRef = useRef(null);
  const sliderRef = useRef(null);
  const cursorRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  useEffect(() => {
    if (tab === 'chat') initChat();
  }, [tab, initChat]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (cursorRef.current) {
        cursorRef.current.style.left = e.clientX + 'px';
        cursorRef.current.style.top = e.clientY + 'px';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (pendingAutoSpeak && messages.length > 0 && !isTyping) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        speakText(lastMsg.content, messages.length - 1);
        setPendingAutoSpeak(false);
      }
    }
  }, [messages, isTyping, pendingAutoSpeak]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const handleUpload = async (files) => {
    for (const file of Array.from(files)) {
      try {
        await uploadResume(file);
      } catch (err) {
        alert(`Failed: ${err.response?.data?.detail || err.message}`);
      }
    }
  };

  const [sampleLoading, setSampleLoading] = useState(false);
  const [showAutomate, setShowAutomate] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null);
  const handleLoadSample = async () => {
    setSampleLoading(true);
    try {
      const resp = await fetch('/sample-resume.pdf');
      if (!resp.ok) throw new Error('Sample not found');
      const blob = await resp.blob();
      const file = new File([blob], 'Sai-Punith-Kolla-Resume.pdf', { type: 'application/pdf' });
      await uploadResume(file);
    } catch (err) {
      alert(`Could not load sample: ${err.message}`);
    } finally {
      setSampleLoading(false);
    }
  };

  const handleSend = (msg) => {
    const m = msg || input.trim();
    if (m) { 
      setLastInputWasVoice(false);
      setPendingAutoSpeak(false);
      sendMessage(m); 
      setInput(''); 
    }
  };

  const handleVoiceSend = (text) => {
    if (text && text.trim()) {
      setLastInputWasVoice(true);
      setPendingAutoSpeak(true);
      sendMessage(text.trim());
    }
  };

  const scrollSlider = (dir) => {
    sliderRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });
  };

  const getSkills = (c) => {
    if (!c.skills) return [];
    if (Array.isArray(c.skills)) return c.skills.slice(0, 6);
    return [];
  };

  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Please allow microphone access to use voice input.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }; 

  const transcribeAudio = async (audioBlob) => {
  setIsTranscribing(true);
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    const STT_API = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';
    const response = await fetch(`${STT_API}/api/chat/speech-to-text`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}` },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('STT Response error:', errorText);
      throw new Error(`Server error: ${response.status}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error('Invalid response from server');
    }

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.text && data.text.trim()) {
      handleVoiceSend(data.text);
    } else {
      alert('No speech detected. Please try again.');
    }
  } catch (err) {
    console.error('Transcription error:', err);
    alert('Voice transcription failed: ' + err.message);
  } finally {
    setIsTranscribing(false);
  }
};

 
  const stopSpeaking = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      if (currentAudioRef.current.src) {
        URL.revokeObjectURL(currentAudioRef.current.src);
      }
      currentAudioRef.current = null;
    }
    
    setSpeakingMsgIndex(null);
    setLoadingMsgIndex(null);
  }, []);

  const speakText = useCallback(async (text, msgIndex) => {
    if (speakingMsgIndex === msgIndex) {
      stopSpeaking();
      return;
    }
    
    stopSpeaking();
    setLoadingMsgIndex(msgIndex);
    
    try {
      abortControllerRef.current = new AbortController();
      
      let cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/`/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/•/g, ',')
        .replace(/\n+/g, '. ')
        .trim();
      
      if (cleanText.length > 4000) {
        cleanText = cleanText.substring(0, 4000) + '...';
      }
      
      const TTS_API = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || 'https://resumate-api-74dm.onrender.com') : '';
      const response = await fetch(`${TTS_API}/api/chat/text-to-speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('resumate_hm_token') || 'demo-token'}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: cleanText, voice: 'nova' }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error('TTS failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setSpeakingMsgIndex(null);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setSpeakingMsgIndex(null);
      };

      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(msgIndex);
      
      await audio.play();
      
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Speech request cancelled');
      } else {
        console.error('TTS error:', err);
      }
      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(null);
    }
  }, [speakingMsgIndex, stopSpeaking]);

  const handleClearChat = () => {
    stopSpeaking();
    clearChat();
    setLastInputWasVoice(false);
    setPendingAutoSpeak(false);
  };

  return (
    <div className="dashboard-layout">
      <div ref={cursorRef} className="cursor-glow" />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="sidebar-logo" onClick={() => navigate('/')}>
            <Logo /> ResuMate
          </button>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Navigation</div>
            <div className="sidebar-link" onClick={() => navigate('/')}>
              <Home size={18} /><span>Home</span>
            </div>
            {[
              { id: 'upload', icon: <Upload size={18} />, label: 'Upload' },
              // Screening was previously reachable only by opening the voice
              // agent, which rendered the results inside a full-screen overlay.
              // It is the core of the product and now has its own section.
              { id: 'screening', icon: <Zap size={18} />, label: 'Screening' },
              { id: 'analytics', icon: <BarChart2 size={18} />, label: 'Analytics' },
              { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Chat' },
              { id: 'focus', icon: <User size={18} />, label: 'Candidate Focus' }
            ].map(item => (
              <div
                key={item.id}
                className={`sidebar-link ${tab === item.id ? 'active' : ''}`}
                onClick={() => item.id === 'focus' ? navigate('/hiring/focus') : setTab(item.id)}
              >
                {item.icon}<span>{item.label}</span>
              </div>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-stats">
            <div className="sidebar-stat">
              <span className="sidebar-stat-value">{candidates.length}</span>
              <span className="sidebar-stat-label">Uploaded</span>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat-value">{selectedIds.length}</span>
              <span className="sidebar-stat-label">Selected</span>
            </div>
          </div>

          {/* Signed-in user */}
          {hiringManager && (
            <div style={{
              marginTop: 14, padding: '10px 12px',
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.18)',
              borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#F59E0B,#D97706)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#000', flexShrink: 0,
                }}>
                  {(hiringManager.name || 'U')[0].toUpperCase()}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {hiringManager.name}
                  </div>
                  {hiringManager.company && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hiringManager.company}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => { logoutHiringManager(); navigate('/hiring/login'); }}
                style={{
                  width: '100%', padding: '6px 0',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 7, color: '#F87171', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="main-header">
          <div className="header-left">
            <h1 className="main-title">
              {tab === 'upload' ? 'Upload Resumes'
                : tab === 'screening' ? 'Screening'
                : tab === 'analytics' ? 'Analytics'
                : tab === 'chat' ? 'AI Chat' : 'Candidate Focus'}
            </h1>
            {candidates.length > 0 && <span className="badge badge-orange">{candidates.length}</span>}
            {selectedIds.length > 0 && <span className="badge badge-green">{selectedIds.length} selected</span>}
          </div>
          <div className="header-right">
            <div className="toggle-wrapper">
              <span className="toggle-label">
                {anonymize ? <EyeOff size={16} /> : <Eye size={16} />} Anonymize
              </span>
              <div className={`toggle ${anonymize ? 'active' : ''}`} onClick={() => setAnonymize(!anonymize)}>
                <div className="toggle-knob" />
              </div>
            </div>
            {hiringManager && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 12px 5px 8px',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 20,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#F59E0B,#D97706)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#000',
                }}>
                  {(hiringManager.name || 'U')[0].toUpperCase()}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {hiringManager.name}
                </span>
              </div>
            )}
          </div>
        </header>

        <div className="main-body">
          {/* UPLOAD TAB */}
          {tab === 'upload' && (
            <div className="upload-tab">
              <div className="card upload-card">
                <div className="card-body">
                  <div
                    className={`upload-zone ${dragActive ? 'active' : ''}`}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={e => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
                  >
                    <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
                    <div className="upload-icon"><Upload size={36} /></div>
                    <h3>Drop resumes here or click to upload</h3>
                    <p>PDF, DOCX, TXT • Max 5MB each • No duplicates</p>
                  </div>

                  {Object.entries(uploadProgress).map(([id, p]) => (
                    <div key={id} className="upload-progress">
                      <div className="progress-header">
                        <span>Analyzing...</span>
                        <span className="progress-value">{p}%</span>
                      </div>
                      <div className="progress"><div className="progress-fill" style={{ width: `${p}%` }} /></div>
                    </div>
                  ))}

                </div>
              </div>

              {candidates.length > 0 && (
                <div className="candidates-section">
                  <div className="candidates-header">
                    <h2>Candidates ({candidates.length})</h2>
                    <div className="candidates-actions">
                      {/* One screening action. There used to be two buttons here,
                          side by side, both with a Zap icon: "AutoHire" opened the
                          voice agent, "Rank" ran a different and weaker ranking
                          endpoint. Nothing in either label told you which was which. */}
                      {candidates.filter(c => c.is_resume !== false).length >= 1 && (
                        <button onClick={() => setTab('screening')} className="btn btn-primary btn-sm">
                          <Zap size={14} /> Screen candidates
                        </button>
                      )}
                      {/* Jarvis keeps an entry point until it is docked as a
                          persistent copilot; it is the only route to several
                          capabilities, so it cannot be stranded in the meantime.
                          Named for what it opens rather than for what it does. */}
                      {candidates.filter(c => c.is_resume !== false).length >= 1 && (
                        <button onClick={() => setShowPipeline(true)} className="btn btn-secondary btn-sm">
                          <Sparkles size={14} /> Ask Jarvis
                        </button>
                      )}
                      <button onClick={selectAll} className="btn btn-secondary btn-sm">Select All</button>
                      <button onClick={clearSelection} className="btn btn-ghost btn-sm">Clear</button>
                    <button
                     onClick={async () => {
            if (window.confirm('Delete ALL candidates? This cannot be undone.')) {
              await clearAllCandidates();
            }
          }} 
          className="btn btn-danger btn-sm"
        >
          Delete All
        </button>

                    </div>
                  </div>

                  {showAutomate && (
                    <AutomatePanel candidates={candidates.filter(c => c.is_resume !== false)} onClose={() => setShowAutomate(false)} navigate={navigate} />
                  )}

                  {showPipeline && (
                    <JarvisAgent
                      candidatesSummary={candidates
                        .filter(c => c.is_resume !== false)
                        .map(c => ({
                          id: c.id,
                          name: c.name || 'Unknown',
                          predicted_role: c.predicted_role || '',
                          total_experience_years: c.total_experience_years || 0,
                          experience_level: c.experience_level || '',
                          location: c.location || '',
                          email: c.email || c.embedded_links?.email || '',
                          skills: c.skills || [],
                          github_url: c.embedded_links?.github_url || '',
                          linkedin_url: c.embedded_links?.linkedin_url || '',
                        }))}
                      onClose={() => setShowPipeline(false)}
                      onComplete={(result) => {
                        setPipelineResult(result);
                      }}
                    />
                  )}

                  <div className="candidates-slider">
                    <button className="slider-btn slider-btn-left" onClick={() => scrollSlider(-1)}>
                      <ChevronLeft size={20} />
                    </button>
                    <div className="slider-track" ref={sliderRef}>
                      {candidates.map((c, i) => (
                        <div
                          key={c.id}
                          className={`candidate-card glass-card ${selectedIds.includes(c.id) ? 'selected' : ''} ${!c.is_resume ? 'not-resume' : ''}`}
                          onClick={() => toggleSelection(c.id)}
                        >
                          {!c.is_resume && (
                            <div className="not-resume-banner">
                              <AlertCircle size={14} /> Not a Resume
                            </div>
                          )}
                          <div className="candidate-header">
                            <div className="candidate-avatar" style={{ background: getAvatarGradient(c.name) }}>
                              {getDisplayName(c, i)[0]?.toUpperCase()}
                            </div>
                            {selectedIds.includes(c.id) && (
                              <div className="selected-check"><Check size={14} /></div>
                            )}
                            <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteCandidate(c.id); }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <h3 className="candidate-name">{getDisplayName(c, i)}</h3>
                          <p className="candidate-role">{c.predicted_role || 'Processing...'}</p>
                          
                          <div className="candidate-badges">
                            {c.badges?.slice(0, 3).map((b, j) => (
                              <span key={j} className={`badge badge-${b.color || 'blue'}`}>{b.label}</span>
                            ))}
                          </div>

                          <div className="candidate-stats">
                            <span><Briefcase size={12} /> {c.total_experience_years || 0}y</span>
                            <span><Award size={12} /> {c.experience_level || 'N/A'}</span>
                          </div>

                          {c.location && (
                            <div className="candidate-location">
                              <MapPin size={12} /> {c.location}
                            </div>
                          )}

                          <div className="candidate-skills">
                            {getSkills(c).slice(0, 4).map((s, j) => (
                              <span key={j} className="skill">{typeof s === 'string' ? s : s?.name}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="slider-btn slider-btn-right" onClick={() => scrollSlider(1)}>
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}

              {candidates.length === 0 && !loading && (
                <div className="empty-state" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
                  <div className="empty-icon"><FileText size={40} /></div>
                  <h3>Welcome to ResuMate 👋</h3>
                  <p style={{ marginBottom: 20 }}>Three steps to your first AI-ranked shortlist:</p>
                  <ol style={{
                    textAlign: 'left', display: 'inline-block', margin: '0 auto 24px',
                    color: 'var(--text2)', fontSize: 14, lineHeight: 1.9, paddingLeft: 20,
                  }}>
                    <li><strong>Upload resumes</strong> — drag-drop PDFs or DOCX above.</li>
                    <li><strong>Run the pipeline</strong> — AI scores everyone against your role.</li>
                    <li><strong>Interview the top picks</strong> — invite candidates with one click.</li>
                  </ol>
                  <div>
                    <button
                      className="btn btn-primary"
                      onClick={() => fileRef.current?.click()}
                      style={{ padding: '11px 24px', fontSize: 14, fontWeight: 600 }}
                    >
                      <Upload size={16} /> Upload your first resume
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCREENING TAB
              Configure a run, then show the shortlist. Both were previously
              trapped inside the voice agent's full-screen overlay: PipelineWizard
              was imported but never rendered, and ATSResultsView could only be
              opened by Jarvis. */}
          {tab === 'screening' && (
            <div className="analytics-tab">
              {!pipelineResult ? (
                candidates.filter(c => c.is_resume !== false).length === 0 ? (
                  <div className="clean-empty">
                    <Zap size={32} style={{ color: 'var(--color-ink-faint)', marginBottom: 12 }} />
                    <h3>Nothing to screen yet</h3>
                    <p>Upload at least one resume and come back — screening ranks every candidate against a role.</p>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => setTab('upload')}>
                      Upload resumes
                    </button>
                  </div>
                ) : (
                  <PipelineWizard
                    inline
                    candidateCount={candidates.filter(c => c.is_resume !== false).length}
                    onClose={() => setTab('upload')}
                    onComplete={data => setPipelineResult(data)}
                  />
                )
              ) : (
                <ATSResultsView
                  embedded
                  pipelineResult={pipelineResult}
                  onBack={() => setPipelineResult(null)}
                  onRunAgain={() => setPipelineResult(null)}
                />
              )}
            </div>
          )}

          {/* ANALYTICS TAB */}
          {tab === 'analytics' && (
            <div className="analytics-tab">

              {selectedCandidates.length === 0 ? (
                <div className="clean-empty">
                  <BarChart2 size={32} strokeWidth={1.5} />
                  <h3>No candidates selected</h3>
                  <p>Select candidates in Upload tab to see analytics</p>
                </div>
              ) : (
                <>
                  {/* Overview Stats */}
                  <div className="clean-stat-grid">
                    {[
                      { label: 'Candidates', value: analytics.total, sub: 'selected', icon: <Users size={18} /> },
                      { label: 'Avg Experience', value: `${analytics.avgExperience}y`, sub: 'years average', icon: <Briefcase size={18} /> },
                      { label: 'Unique Skills', value: analytics.totalSkills, sub: 'across pool', icon: <Sparkles size={18} /> }
                    ].map((stat, i) => (
                      <div key={i} className="clean-stat-card">
                        <div className="clean-stat-icon">{stat.icon}</div>
                        <div className="clean-stat-value">{stat.value}</div>
                        <div className="clean-stat-label">{stat.label}</div>
                        <div className="clean-stat-sub">{stat.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Experience Comparison */}
                  <div className="clean-section">
                    <h3 className="clean-section-title">Experience Comparison</h3>
                    <div className="clean-card clean-card--padded">
                      {selectedCandidates.filter(c => c.is_resume !== false).map((c, i) => {
                        const maxExp = Math.max(...selectedCandidates.map(x => x.total_experience_years || 0), 1);
                        const pct = ((c.total_experience_years || 0) / maxExp) * 100;
                        return (
                          <div key={c.id} className="clean-exp-row">
                            <div className="clean-exp-info">
                              <div className="avatar-sm" style={{ background: getAvatarGradient(c.name) }}>
                                {getDisplayName(c, i)[0]}
                              </div>
                              <div>
                                <div className="clean-exp-name">{getDisplayName(c, i)}</div>
                                <div className="clean-exp-role">{c.predicted_role}</div>
                              </div>
                            </div>
                            <div className="clean-exp-bar-area">
                              <div className="clean-bar-track">
                                <div className="clean-bar-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                              </div>
                            </div>
                            <div className="clean-exp-years">{c.total_experience_years || 0}y</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top Skills */}
                  <div className="clean-section">
                    <h3 className="clean-section-title">Top Skills</h3>
                    <div className="clean-card clean-card--padded">
                      {analytics.topSkills.length === 0 ? (
                        <p style={{ color: 'var(--text3)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No skills data</p>
                      ) : (
                        <div className="clean-bar-chart">
                          {analytics.topSkills.map((s, i) => (
                            <div key={i} className="clean-bar-row">
                              <span className="clean-bar-label">{s.name}</span>
                              <div className="clean-bar-track">
                                <div className="clean-bar-fill" style={{ width: `${s.percentage}%` }} />
                              </div>
                              <span className="clean-bar-count">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Distributions */}
                  <div className="clean-two-col">
                    <div className="clean-section">
                      <h3 className="clean-section-title">Roles</h3>
                      <div className="clean-card">
                        {analytics.roleDistribution.map((r, i) => (
                          <div key={i} className="clean-list-row">
                            <span className="clean-list-label">{r.name}</span>
                            <span className="clean-pill">{r.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="clean-section">
                      <h3 className="clean-section-title">Levels</h3>
                      <div className="clean-card">
                        {analytics.levelDistribution.map((l, i) => (
                          <div key={i} className="clean-list-row">
                            <span className="clean-list-label">{l.name}</span>
                            <span className="clean-pill clean-pill--green">{l.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <InterviewAnalytics />
            </div>
          )}

          {/* AI CHAT TAB */}
          {tab === 'chat' && (
            <div className="chat-tab">
              {selectedCandidates.length === 0 ? (
                <div className="empty-state glass-card" style={{ padding: '60px' }}>
                  <div className="empty-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                    <Bot size={40} />
                  </div>
                  <h3>Select candidates to chat</h3>
                  <p>Go to Upload tab and select candidates</p>
                </div>
              ) : (
                <div className="chat-container">
                  <div className="chat-card glass-card">
                    {/* Chat Header */}
                    <div className="chat-header">
                      <div className="chat-header-left">
                        <AIAvatar />
                        <div>
                          <div className="chat-ai-name">ResuMate AI</div>
                          <div className="chat-ai-status">
                            {selectedCandidates.filter(c => c.is_resume !== false).length} candidates • GPT-5.2
                            {anonymize && ' • 🔒 Anonymized'}
                          </div>
                        </div>
                      </div>
                      <div className="chat-header-actions">
                        {/* Stop speaking button */}
                        {speakingMsgIndex !== null && (
                          <button 
                            className="btn-icon stop-btn"
                            onClick={stopSpeaking}
                            title="Stop speaking"
                          >
                            <Square size={16} />
                          </button>
                        )}
                        
                        {/* Clear chat */}
                        <button 
                          className="btn-icon"
                          onClick={handleClearChat}
                          title="Clear chat"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="chat-messages">
                      {messages.map((m, i) => (
                        <div key={i} className={`chat-message ${m.role}`}>
                          {m.role === 'assistant' && <AIAvatar />}
                          <div className={`chat-bubble ${m.role}`}>
                            {m.role === 'user' ? (
                              <p>{m.content}</p>
                            ) : (
                              <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />
                            )}
                          </div>
                          
                          {m.role === 'user' && (
                            <div className="avatar-sm" style={{ background: 'var(--bg3)' }}>
                              <Users size={16} />
                            </div>
                          )}
                          
                          {/* Speak button for AI messages */}
                          {m.role === 'assistant' && (
                            <button 
                              className={`msg-speak-btn ${speakingMsgIndex === i ? 'speaking' : ''} ${loadingMsgIndex === i ? 'loading' : ''}`}
                              onClick={() => speakText(m.content, i)}
                              title={speakingMsgIndex === i ? 'Stop' : 'Read aloud'}
                              disabled={loadingMsgIndex !== null && loadingMsgIndex !== i}
                            >
                              {loadingMsgIndex === i ? (
                                <Loader size={16} className="spin" />
                              ) : speakingMsgIndex === i ? (
                                <Square size={14} />
                              ) : (
                                <Volume2 size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {isTyping && (
                        <div className="chat-message assistant">
                          <AIAvatar />
                          <div className="chat-bubble assistant">
                            <div className="typing"><span /><span /><span /></div>
                          </div>
                        </div>
                      )}
                      <div ref={msgEndRef} />
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && !isTyping && (
                      <div className="chat-suggestions">
                        {suggestions.map((q, i) => (
                          <button key={i} className="chat-suggestion" onClick={() => handleSend(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Input Area */}
                    <div className="chat-input-area">
                      <button
                        className={`btn-icon voice-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isTranscribing || isTyping}
                        title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input (auto-speaks response)'}
                      >
                        {isTranscribing ? (
                          <Loader size={20} className="spin" />
                        ) : isRecording ? (
                          <MicOff size={20} />
                        ) : (
                          <Mic size={20} />
                        )}
                      </button>
                      
                      <input
                        type="text"
                        className="input chat-input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                        placeholder={isRecording ? '🎤 Listening...' : isTranscribing ? '⏳ Transcribing...' : "Type or use 🎤 for voice..."}
                        disabled={isTyping || isRecording || isTranscribing}
                      />
                      
                      <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isTyping}
                        className="btn btn-primary send-btn"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CANDIDATE FOCUS TAB */}
          {tab === 'focus' && (
            <CandidateFocus />
          )}
        </div>
      </main>
    </div>
  );
}

