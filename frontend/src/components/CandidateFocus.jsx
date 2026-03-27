import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  User, ArrowLeft, AlertCircle, Briefcase, Award, MapPin,
  ChevronRight, UserCheck, Mail, Github, Calendar, Video, MessageSquare, Globe
} from 'lucide-react';

import useVoice from '../hooks/useVoice';
import useFocusChat from '../hooks/useFocusChat';
import useCandidateCache from '../hooks/useCandidateCache';

import ScannerBar from './focus/ScannerBar';
import ChatPanel from './focus/ChatPanel';
import WebSearchPanel from './focus/WebSearchPanel';
import HiringAgentPanel from './focus/HiringAgentPanel';
import GitHubPanel from './focus/GitHubPanel';
import SchedulePanel from './focus/SchedulePanel';
import EmailComposer from './focus/EmailComposer';
import InterviewCreator from './focus/InterviewCreator';

const API_BASE = import.meta.env.PROD
  ? 'https://resumate-api-74dm.onrender.com'
  : '';

// ─── Full-Screen Matrix Rain ───
const MatrixRain = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const chars = 'アイウエオカキクケコサシスセソタチツテト01234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef{}[]<>/=+*&#';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = Array(columns).fill(1);
    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        ctx.fillStyle = `rgba(34, 197, 94, ${Math.random() * 0.5 + 0.3})`;
        ctx.fillText(char, x, y);
        if (Math.random() > 0.95) {
          ctx.fillStyle = 'rgba(134, 239, 172, 0.9)';
          ctx.fillText(char, x, y);
        }
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    const interval = setInterval(draw, 50);
    return () => { clearInterval(interval); window.removeEventListener('resize', resize); };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }}
    />
  );
};

export default function CandidateFocus() {
  const navigate = useNavigate();
  const { candidates, anonymize, getDisplayName, getAvatarGradient } = useApp();

  // ─── Phase: 'select' | 'matrix' | 'tools' ───
  const [phase, setPhase] = useState('select');
  const [focusCandidate, setFocusCandidate] = useState(null);
  const [activeTool, setActiveTool] = useState('chat');
  const [showWarning, setShowWarning] = useState(false);
  const [warningMsg, setWarningMsg] = useState('');

  // ─── Scanner state ───
  const [scanLogs, setScanLogs] = useState([]);
  const [scanProfiles, setScanProfiles] = useState(null);
  const [scanSummary, setScanSummary] = useState('');
  const [scanContact, setScanContact] = useState(null);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanDone, setScanDone] = useState(false);

  // ─── Hiring Agent state ───
  const [agentStep, setAgentStep] = useState('choose');
  const [jdText, setJdText] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [selectedExperience, setSelectedExperience] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [agentResult, setAgentResult] = useState(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [suggestedRoles, setSuggestedRoles] = useState([]);
  const agentResultRef = useRef(null);

  // ─── Web Search state ───
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);

  // ─── GitHub state ───
  const [ghLoading, setGhLoading] = useState(false);
  const [ghProfile, setGhProfile] = useState(null);
  const [ghError, setGhError] = useState('');
  const [ghUsername, setGhUsername] = useState('');
  const [ghNeedsInput, setGhNeedsInput] = useState(false);

  // ─── Calendly state ───
  const [calLoading, setCalLoading] = useState(false);
  const [calData, setCalData] = useState(null);
  const [calError, setCalError] = useState('');

  const { saveToCache, restoreFromCache } = useCandidateCache();

  const showToast = useCallback((msg) => {
    setWarningMsg(msg);
    setShowWarning(true);
    setTimeout(() => setShowWarning(false), 3000);
  }, []);

  const getCandidatePayload = useCallback(() => {
    if (!focusCandidate) return {};
    return {
      name: focusCandidate.name || '',
      text: focusCandidate.text || focusCandidate.raw_text || '',
      raw_text: focusCandidate.raw_text || '',
      predicted_role: focusCandidate.predicted_role || '',
      skills: focusCandidate.skills || [],
      total_experience_years: focusCandidate.total_experience_years,
      experience_level: focusCandidate.experience_level || '',
      location: focusCandidate.location || '',
      work_experience: focusCandidate.work_experience || [],
      education: focusCandidate.education || [],
      key_strengths: focusCandidate.key_strengths || [],
      summary: focusCandidate.summary || '',
      badges: focusCandidate.badges || [],
    };
  }, [focusCandidate]);

  const voice = useVoice({
    apiBase: API_BASE,
    onTranscribed: (text) => chat.sendMessage(text, { autoSpeak: true }),
  });

  const chat = useFocusChat({
    apiBase: API_BASE,
    focusCandidate,
    scanProfiles,
    scanContact,
    anonymize,
    getCandidatePayload,
    speakText: voice.speakText,
  });

  const getSkills = (c) => {
    if (!c?.skills) return [];
    return Array.isArray(c.skills) ? c.skills : [];
  };

  // ─── Reset agent ───
  const resetAgent = () => {
    setAgentStep('choose');
    setJdText('');
    setSelectedRole('');
    setCustomRole('');
    setSelectedExperience('');
    setSelectedLevel('');
    setAgentResult(null);
    setAgentLoading(false);
    setSuggestedRoles([]);
  };

  // ─── Auto-generate role suggestions ───
  useEffect(() => {
    if (focusCandidate && activeTool === 'agent' && suggestedRoles.length === 0) {
      const role = focusCandidate.predicted_role || '';
      const skills = getSkills(focusCandidate).slice(0, 5).map(s => typeof s === 'string' ? s : s?.name || '');
      const roles = new Set();
      if (role) roles.add(role);
      if (skills.some(s => /react|angular|vue|frontend|css|html/i.test(s))) roles.add('Frontend Developer');
      if (skills.some(s => /node|express|django|fastapi|backend|api/i.test(s))) roles.add('Backend Developer');
      if (skills.some(s => /python|java|javascript|typescript/i.test(s))) roles.add('Software Engineer');
      if (skills.some(s => /ml|ai|machine learning|tensorflow|pytorch/i.test(s))) roles.add('ML Engineer');
      if (skills.some(s => /data|sql|analytics|tableau|pandas/i.test(s))) roles.add('Data Analyst');
      if (skills.some(s => /aws|azure|gcp|docker|kubernetes|devops/i.test(s))) roles.add('DevOps Engineer');
      if (skills.some(s => /react|node|full.?stack/i.test(s))) roles.add('Full Stack Developer');
      setSuggestedRoles([...roles].slice(0, 3));
    }
  }, [focusCandidate, activeTool]);

  useEffect(() => {
    if (agentResult && agentResultRef.current) {
      agentResultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentResult]);

  // ─── Scanner ───
  const runScanner = async (candidateId, candidate) => {
    const c = candidate || focusCandidate;
    setScanRunning(true);
    setScanLogs([]);
    setScanProfiles(null);
    setScanSummary('');
    setScanContact(null);
    setScanDone(false);

    try {
      const resp = await fetch(`${API_BASE}/api/chat/scan-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          candidate_id: candidateId,
          anonymize,
          candidate_data: {
            name: c?.name || '',
            text: c?.text || c?.raw_text || '',
            predicted_role: c?.predicted_role || '',
            skills: c?.skills || [],
          },
        }),
      });
      const data = await resp.json();

      const allLogs = data.logs || [];
      for (let i = 0; i < allLogs.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 400));
        setScanLogs(prev => [...prev, allLogs[i]]);
      }

      const scannedProfiles = data.profiles || null;
      const scannedSummary = data.ai_summary || '';
      const scannedContact = data.contact || null;

      setScanProfiles(scannedProfiles);
      setScanSummary(scannedSummary);
      setScanContact(scannedContact);

      await new Promise(resolve => setTimeout(resolve, 500));
      setScanLogs(prev => [...prev, { step: 'feeding', msg: 'Feeding data into AI Chat...', status: 'success' }]);
      await new Promise(resolve => setTimeout(resolve, 600));

      const name = anonymize ? 'this candidate' : (c?.name || 'this candidate');
      let intro = `**AI Chat Supercharged!** I now have data from multiple sources:\n\n`;
      intro += `**Resume** — skills, experience, education\n`;
      if (scannedProfiles?.github) intro += `**GitHub** (@${scannedProfiles.github.username}) — ${scannedProfiles.github.public_repos} repos\n`;
      if (scannedProfiles?.linkedin) intro += `**LinkedIn** — ${scannedProfiles.linkedin.headline || scannedProfiles.linkedin.name || 'Profile found'}\n`;
      if (scannedContact?.email) intro += `**Contact** — ${scannedContact.email}\n`;
      intro += `\nAsk me anything about **${name}** and I'll use all sources to answer.`;

      chat.setMessages([{ role: 'assistant', content: intro }]);
      chat.setSuggestions([
        `Summarize everything about ${name}`,
        `What are their strongest skills?`,
        `Are they a good fit for a senior role?`,
        `Tell me about their GitHub projects`,
      ]);

    } catch (e) {
      setScanLogs(prev => [...prev, { step: 'error', msg: 'Scanner failed to connect', status: 'error' }]);
    } finally {
      setScanRunning(false);
      setScanDone(true);
    }
  };

  // ─── Candidate selection → matrix rain → tools ───
  const handleCandidateSelect = (candidate) => {
    setFocusCandidate(candidate);
    resetAgent();
    chat.setMessages([]);
    chat.setSuggestions([]);
    setSearchResults([]);
    setSearchHistory([]);
    setScanLogs([]);
    setScanProfiles(null);
    setScanSummary('');
    setScanContact(null);
    setScanDone(false);

    const cached = restoreFromCache(candidate.id);
    if (cached?.scanProfiles) {
      setScanProfiles(cached.scanProfiles);
      setScanSummary(cached.scanSummary || '');
      setScanContact(cached.scanContact || null);
      setScanLogs(cached.scanLogs || []);
      chat.setMessages(cached.messages || []);
      chat.setSuggestions(cached.suggestions || []);
      setSearchResults(cached.searchResults || []);
      setSearchHistory(cached.searchHistory || []);
      setScanDone(true);
      setPhase('matrix');
      setTimeout(() => setPhase('tools'), 2500);
    } else {
      setPhase('matrix');
      setTimeout(() => runScanner(candidate.id, candidate), 300);
      setTimeout(() => setPhase('tools'), 3500);
    }
  };

  const handleBack = () => {
    voice.stopSpeaking();
    if (focusCandidate) {
      saveToCache(focusCandidate.id, {
        scanProfiles, scanSummary, scanContact, scanLogs,
        messages: chat.messages, suggestions: chat.suggestions,
        searchResults, searchHistory,
      });
    }
    setFocusCandidate(null);
    setPhase('select');
  };

  // ─── Web Search ───
  const handleWebSearch = async (query) => {
    const q = query || searchQuery.trim();
    if (!q || searchLoading) return;
    setSearchLoading(true);
    setSearchHistory(prev => [q, ...prev.filter(h => h !== q)].slice(0, 10));
    try {
      const response = await fetch(`${API_BASE}/api/chat/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ query: q, candidate_id: focusCandidate?.id, candidate_name: anonymize ? null : focusCandidate?.name }),
      });
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([{ title: 'Search Error', snippet: 'Could not perform web search.', url: '' }]);
    } finally {
      setSearchLoading(false);
    }
  };

  const getSearchSuggestions = () => {
    if (!focusCandidate) return [];
    const name = focusCandidate.name || '';
    const role = focusCandidate.predicted_role || '';
    const s = [];
    if (name && !anonymize) { s.push(`${name} LinkedIn`); s.push(`${name} GitHub`); }
    if (role) { s.push(`${role} average salary`); s.push(`${role} interview questions`); }
    return s;
  };

  // ─── GitHub ───
  const fetchGitHub = async (username) => {
    setGhLoading(true); setGhError(''); setGhProfile(null); setGhNeedsInput(false);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/github-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ candidate_id: focusCandidate.id, candidate_data: getCandidatePayload(), github_username: username || null, anonymize }),
      });
      const data = await resp.json();
      if (data.error) { setGhError(data.error); if (data.needs_username) setGhNeedsInput(true); }
      else setGhProfile(data.profile);
    } catch { setGhError('Failed to connect to server'); }
    finally { setGhLoading(false); }
  };

  // ─── Calendly ───
  const fetchCalendly = async () => {
    setCalLoading(true); setCalError(''); setCalData(null);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/calendly-link`, { headers: { 'Authorization': 'Bearer demo-token' } });
      const data = await resp.json();
      if (data.error) setCalError(data.error);
      else setCalData(data);
    } catch { setCalError('Failed to connect to server'); }
    finally { setCalLoading(false); }
  };

  // ─── Hiring Agent ───
  const runHiringAgent = async () => {
    const role = selectedRole === 'other' ? customRole : selectedRole;
    if (!role) { showToast('Please select or enter a role'); return; }
    if (!selectedExperience) { showToast('Please select experience level'); return; }
    if (!selectedLevel) { showToast('Please select seniority level'); return; }
    setAgentLoading(true); setAgentStep('loading'); setAgentResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/chat/hiring-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ candidate_id: focusCandidate.id, candidate_data: getCandidatePayload(), role, experience_required: selectedExperience, level: selectedLevel, job_description: jdText || null, anonymize }),
      });
      const data = await response.json();
      setAgentResult(data); setAgentStep('result');
    } catch { setAgentResult({ error: 'Could not reach the server.' }); setAgentStep('result'); }
    finally { setAgentLoading(false); }
  };

  const runJDAnalysis = async () => {
    if (!jdText.trim()) { showToast('Please paste a job description'); return; }
    setAgentLoading(true); setAgentStep('loading');
    try {
      const response = await fetch(`${API_BASE}/api/chat/hiring-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ candidate_id: focusCandidate.id, candidate_data: getCandidatePayload(), job_description: jdText, role: null, experience_required: null, level: null, anonymize }),
      });
      const data = await response.json();
      setAgentResult(data); setAgentStep('result');
    } catch { setAgentResult({ error: 'Could not reach the server.' }); setAgentStep('result'); }
    finally { setAgentLoading(false); }
  };

  // ════════════════════════════════════════════════════
  // RENDER: PHASE — select
  // ════════════════════════════════════════════════════
  if (phase === 'select') {
    return (
      <div className="focus-page">
        {showWarning && <div className="focus-toast"><AlertCircle size={16} /><span>{warningMsg}</span></div>}

        <div className="focus-page-header">
          <button className="focus-back-btn" onClick={() => navigate('/hiring')}>
            <ArrowLeft size={18} /><span>Dashboard</span>
          </button>
          <h1 className="focus-page-title">Candidate Focus</h1>
        </div>

        <div className="focus-select-header">
          <div className="focus-select-icon"><User size={32} /></div>
          <h2 className="focus-select-title">Select a Candidate</h2>
          <p className="focus-select-subtitle">Choose one candidate to unlock AI-powered tools — deep-dive chat, web research, hiring evaluation, and more.</p>
        </div>

        {candidates.length === 0 ? (
          <div className="focus-empty">
            <div className="focus-empty-icon"><User size={48} /></div>
            <h3>No candidates uploaded yet</h3>
            <p>Go to the Upload tab to add resumes first.</p>
          </div>
        ) : (
          <div className="focus-candidates-grid">
            {candidates
              .filter((c, idx, self) => idx === self.findIndex(t => t.id === c.id))
              .map((c, i) => {
                const skills = getSkills(c);
                const name = getDisplayName(c, i);
                const gradient = getAvatarGradient(c.name);
                return (
                  <div key={c.id} className="fc-card" style={{ '--card-gradient': gradient }} onClick={() => handleCandidateSelect(c)}>
                    <div className="fc-card-glow" />
                    <div className="fc-card-top">
                      <div className="fc-avatar" style={{ background: gradient }}>
                        {name[0]?.toUpperCase()}
                      </div>
                      <div className="fc-card-identity">
                        <h3 className="fc-name">{name}</h3>
                        <p className="fc-role">{c.predicted_role || 'Processing...'}</p>
                      </div>
                    </div>

                    <div className="fc-badges">
                      {c.total_experience_years != null && (
                        <span className="fc-badge fc-badge-exp"><Briefcase size={11} /> {c.total_experience_years}y exp</span>
                      )}
                      {c.experience_level && (
                        <span className="fc-badge fc-badge-level"><Award size={11} /> {c.experience_level}</span>
                      )}
                      {c.location && (
                        <span className="fc-badge fc-badge-loc"><MapPin size={11} /> {c.location}</span>
                      )}
                    </div>

                    {skills.length > 0 && (
                      <div className="fc-skills">
                        {skills.slice(0, 5).map((s, j) => (
                          <span key={j} className="fc-skill">{typeof s === 'string' ? s : s?.name || ''}</span>
                        ))}
                        {skills.length > 5 && <span className="fc-skill fc-skill-more">+{skills.length - 5}</span>}
                      </div>
                    )}

                    <div className="fc-card-footer">
                      {c.is_resume === false
                        ? <span className="fc-not-resume"><AlertCircle size={11} /> Not a Resume</span>
                        : <span className="fc-status-ok">Resume verified</span>
                      }
                      <span className="fc-cta">Focus <ChevronRight size={14} /></span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // RENDER: PHASE — matrix rain transition
  // ════════════════════════════════════════════════════
  if (phase === 'matrix') {
    const name = anonymize ? 'Candidate' : (focusCandidate?.name || 'Candidate');
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100 }}>
        <MatrixRain />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', zIndex: 1,
          background: 'rgba(0,0,0,0.45)',
        }}>
          <div style={{ fontFamily: 'monospace', color: '#22c55e', fontSize: '13px', marginBottom: '32px', opacity: 0.7, letterSpacing: '2px' }}>
            RESUMATE SCANNER AGENT
          </div>
          <div style={{
            fontFamily: 'monospace', color: '#86efac', fontSize: '28px', fontWeight: 700,
            letterSpacing: '3px', textShadow: '0 0 20px #22c55e', marginBottom: '16px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            {name}
          </div>
          <div style={{ fontFamily: 'monospace', color: '#4ade80', fontSize: '14px', letterSpacing: '4px', opacity: 0.8 }}>
            SCANNING...
          </div>
          <div style={{ marginTop: '48px', display: 'flex', gap: '8px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e',
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
          @keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-10px); opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  // RENDER: PHASE — tools (sidebar layout)
  // ════════════════════════════════════════════════════
  const sidebarItems = [
    {
      group: 'Analyze', items: [
        { key: 'chat', icon: <MessageSquare size={18} />, label: 'AI Chat' },
        { key: 'websearch', icon: <Globe size={18} />, label: 'Web Search' },
        { key: 'github', icon: <Github size={18} />, label: 'GitHub' },
      ]
    },
    {
      group: 'Evaluate', items: [
        { key: 'agent', icon: <UserCheck size={18} />, label: 'Hiring Agent' },
        ...(agentStep === 'result' && agentResult && !agentResult.error ? [
          { key: 'email', icon: <Mail size={18} />, label: 'Email' },
          { key: 'interview', icon: <Video size={18} />, label: 'Interview' },
        ] : []),
      ]
    },
    {
      group: 'Schedule', items: [
        { key: 'calendly', icon: <Calendar size={18} />, label: 'Schedule' },
      ]
    },
  ];

  return (
    <div className="focus-container">
      {showWarning && <div className="focus-toast"><AlertCircle size={16} /><span>{warningMsg}</span></div>}

      {/* Header */}
      <div className="focus-header">
        <button className="focus-back-btn" onClick={handleBack}>
          <ArrowLeft size={18} /><span>Back</span>
        </button>
        <div className="focus-profile">
          <div className="focus-avatar" style={{ background: getAvatarGradient(focusCandidate.name) }}>
            {getDisplayName(focusCandidate, candidates.indexOf(focusCandidate))[0]?.toUpperCase()}
          </div>
          <div className="focus-profile-info">
            <h2 className="focus-profile-name">{getDisplayName(focusCandidate, candidates.indexOf(focusCandidate))}</h2>
            <p className="focus-profile-role">{focusCandidate.predicted_role || 'Candidate'}</p>
          </div>
        </div>
        <div className="focus-profile-badges">
          {focusCandidate.total_experience_years != null && <span className="badge badge-orange"><Briefcase size={12} /> {focusCandidate.total_experience_years}y</span>}
          {focusCandidate.experience_level && <span className="badge badge-green"><Award size={12} /> {focusCandidate.experience_level}</span>}
          {focusCandidate.location && <span className="badge badge-blue"><MapPin size={12} /> {focusCandidate.location}</span>}
        </div>
      </div>

      {/* Scanner bar (compact, collapsible) */}
      <ScannerBar
        scanLogs={scanLogs} scanProfiles={scanProfiles} scanSummary={scanSummary}
        scanContact={scanContact} scanRunning={scanRunning} scanDone={scanDone}
        onRescan={() => { setScanDone(false); setScanLogs([]); setScanProfiles(null); setScanRunning(false); runScanner(focusCandidate.id); }}
      />

      {/* Workspace: sidebar + panel */}
      <div className="focus-workspace">
        <nav className="focus-sidebar">
          {sidebarItems.map(group => (
            <div key={group.group} className="focus-sidebar-group">
              <span className="focus-sidebar-label">{group.group}</span>
              {group.items.map(item => (
                <button
                  key={item.key}
                  className={`focus-sidebar-btn ${activeTool === item.key ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTool(item.key);
                    if (item.key === 'github' && !ghProfile && !ghLoading && !ghError) fetchGitHub();
                    if (item.key === 'calendly' && !calData && !calLoading && !calError) fetchCalendly();
                  }}
                  title={item.label}
                >
                  {item.icon}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="focus-panel">
          {activeTool === 'chat' && (
            <ChatPanel
              messages={chat.messages} isTyping={chat.isTyping}
              suggestions={chat.suggestions} chatInput={chat.chatInput}
              setChatInput={chat.setChatInput} onSend={chat.sendMessage}
              scanDone={scanDone} candidateName={focusCandidate.name}
              anonymize={anonymize} voice={voice} msgEndRef={chat.msgEndRef}
            />
          )}

          {activeTool === 'websearch' && (
            <WebSearchPanel
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              searchResults={searchResults} searchLoading={searchLoading}
              searchHistory={searchHistory} onSearch={handleWebSearch}
              getSearchSuggestions={getSearchSuggestions}
            />
          )}

          {activeTool === 'agent' && (
            <HiringAgentPanel
              agentStep={agentStep} setAgentStep={setAgentStep}
              jdText={jdText} setJdText={setJdText}
              selectedRole={selectedRole} setSelectedRole={setSelectedRole}
              customRole={customRole} setCustomRole={setCustomRole}
              selectedExperience={selectedExperience} setSelectedExperience={setSelectedExperience}
              selectedLevel={selectedLevel} setSelectedLevel={setSelectedLevel}
              agentResult={agentResult} agentLoading={agentLoading}
              suggestedRoles={suggestedRoles}
              onRunHiringAgent={runHiringAgent} onRunJDAnalysis={runJDAnalysis}
              onReset={resetAgent} onSwitchToChat={() => setActiveTool('chat')}
              agentResultRef={agentResultRef}
            />
          )}

          {activeTool === 'github' && (
            <GitHubPanel
              ghUsername={ghUsername} setGhUsername={setGhUsername}
              ghProfile={ghProfile} ghLoading={ghLoading} ghError={ghError}
              ghNeedsInput={ghNeedsInput} onFetchGitHub={fetchGitHub}
            />
          )}

          {activeTool === 'calendly' && (
            <SchedulePanel
              calData={calData} calLoading={calLoading} calError={calError}
              showToast={showToast} anonymize={anonymize} candidateName={focusCandidate.name}
            />
          )}

          {activeTool === 'email' && (
            <EmailComposer
              focusCandidate={focusCandidate} agentResult={agentResult}
              anonymize={anonymize} getCandidatePayload={getCandidatePayload}
            />
          )}

          {activeTool === 'interview' && (
            <InterviewCreator
              focusCandidate={focusCandidate} selectedRole={selectedRole}
              selectedLevel={selectedLevel} selectedExperience={selectedExperience}
              scanContact={scanContact} showToast={showToast}
            />
          )}
        </main>
      </div>
    </div>
  );
}
