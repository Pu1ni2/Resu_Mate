import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import {
  User, MessageSquare, Globe, Search, Send, ArrowLeft, Check,
  AlertCircle, Briefcase, Award, MapPin, ExternalLink, Loader,
  ChevronRight, Sparkles, X, Volume2, Mic, MicOff, Square, Bot, Users,
  ClipboardList, Target, ChevronDown, FileText, UserCheck, Mail, Copy, Clipboard
} from 'lucide-react';

const AIAvatar = () => (
  <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
    <Bot size={18} />
  </div>
);

const API_BASE = import.meta.env.PROD
  ? 'https://resumate-2vad.onrender.com'
  : '';

export default function CandidateFocus() {
  const {
    candidates, anonymize, getDisplayName, getAvatarGradient
  } = useApp();

  // State
  const [focusCandidate, setFocusCandidate] = useState(null);
  const [activeTool, setActiveTool] = useState('chat');
  const [showWarning, setShowWarning] = useState(false);
  const [warningMsg, setWarningMsg] = useState('');

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [focusMessages, setFocusMessages] = useState([]);
  const [focusTyping, setFocusTyping] = useState(false);
  const [focusSuggestions, setFocusSuggestions] = useState([]);
  const msgEndRef = useRef(null);

  // Web search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(null);
  const [pendingAutoSpeak, setPendingAutoSpeak] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const abortControllerRef = useRef(null);

  // ═══════ HIRING AGENT STATE ═══════
  const [agentStep, setAgentStep] = useState('choose'); // 'choose' | 'jd' | 'quick' | 'review' | 'loading' | 'result'
  const [agentInputMode, setAgentInputMode] = useState(null); // 'jd' | 'quick'
  const [jdText, setJdText] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [selectedExperience, setSelectedExperience] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [agentResult, setAgentResult] = useState(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [suggestedRoles, setSuggestedRoles] = useState([]);
  const agentResultRef = useRef(null);

  // ═══════ EMAIL COMPOSER STATE ═══════
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [emailType, setEmailType] = useState('');
  const [emailDrafting, setEmailDrafting] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  // Helpers
  const getSkills = (c) => {
    if (!c?.skills) return [];
    if (Array.isArray(c.skills)) return c.skills;
    return [];
  };

  const showToast = useCallback((msg) => {
    setWarningMsg(msg);
    setShowWarning(true);
    setTimeout(() => setShowWarning(false), 3000);
  }, []);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [focusMessages, focusTyping]);

  useEffect(() => {
    if (pendingAutoSpeak && focusMessages.length > 0 && !focusTyping) {
      const lastMsg = focusMessages[focusMessages.length - 1];
      if (lastMsg.role === 'assistant') {
        speakText(lastMsg.content, focusMessages.length - 1);
        setPendingAutoSpeak(false);
      }
    }
  }, [focusMessages, focusTyping, pendingAutoSpeak]);

  useEffect(() => {
    return () => { stopSpeaking(); };
  }, []);

  // Scroll to agent result
  useEffect(() => {
    if (agentResult && agentResultRef.current) {
      agentResultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentResult]);

  // Generate role suggestions when candidate is selected and agent tab opens
  useEffect(() => {
    if (focusCandidate && activeTool === 'agent' && suggestedRoles.length === 0) {
      const role = focusCandidate.predicted_role || '';
      const skills = getSkills(focusCandidate).slice(0, 5).map(s => typeof s === 'string' ? s : s?.name || '');
      const roles = new Set();
      if (role) roles.add(role);
      // Generate related roles based on skills
      if (skills.some(s => /react|angular|vue|frontend|css|html/i.test(s))) roles.add('Frontend Developer');
      if (skills.some(s => /node|express|django|fastapi|backend|api/i.test(s))) roles.add('Backend Developer');
      if (skills.some(s => /python|java|javascript|typescript/i.test(s))) roles.add('Software Engineer');
      if (skills.some(s => /ml|ai|machine learning|tensorflow|pytorch/i.test(s))) roles.add('ML Engineer');
      if (skills.some(s => /data|sql|analytics|tableau|pandas/i.test(s))) roles.add('Data Analyst');
      if (skills.some(s => /aws|azure|gcp|docker|kubernetes|devops/i.test(s))) roles.add('DevOps Engineer');
      if (skills.some(s => /react|node|full.?stack/i.test(s))) roles.add('Full Stack Developer');
      if (skills.some(s => /figma|ui|ux|design/i.test(s))) roles.add('UI/UX Designer');
      if (skills.some(s => /project|agile|scrum|manage/i.test(s))) roles.add('Project Manager');
      setSuggestedRoles([...roles].slice(0, 3));
    }
  }, [focusCandidate, activeTool]);

  // ─── Candidate Selection ───
  const handleCandidateSelect = useCallback((candidate) => {
    if (focusCandidate && focusCandidate.id === candidate.id) {
      setFocusCandidate(null);
      setFocusMessages([]);
      setFocusSuggestions([]);
      setSearchResults([]);
      setSearchHistory([]);
      resetAgent();
      return;
    }

    setFocusMessages([]);
    setFocusSuggestions([]);
    setSearchResults([]);
    setSearchHistory([]);
    resetAgent();
    setFocusCandidate(candidate);

    const name = anonymize ? 'this candidate' : (candidate.name || 'this candidate');
    setFocusMessages([{
      role: 'assistant',
      content: `**Welcome to Candidate Focus!** 👋\n\nI'm ready to discuss **${name}**'s resume in detail. I can also **search the web** for more info when needed.\n\nYou can ask me about:\n• Their skills, experience & qualifications\n• Online presence (LinkedIn, GitHub, portfolio)\n• Role fit analysis & market insights\n\nWhat would you like to know?`
    }]);
    setFocusSuggestions([
      `What are ${name}'s top strengths?`,
      `Summarize ${name}'s experience`,
      `Search for ${name} online`,
      `What roles would ${name} be best for?`
    ]);

    if (candidate.name && !anonymize) {
      setSearchQuery(candidate.name);
    }
  }, [focusCandidate, anonymize]);

  // ─── Reset Hiring Agent ───
  const resetAgent = () => {
    setAgentStep('choose');
    setAgentInputMode(null);
    setJdText('');
    setSelectedRole('');
    setCustomRole('');
    setSelectedExperience('');
    setSelectedLevel('');
    setAgentResult(null);
    setAgentLoading(false);
    setSuggestedRoles([]);
    setShowEmailComposer(false);
  };

  // ═══════ EMAIL FUNCTIONS ═══════
  const draftEmail = async (type) => {
    if (!focusCandidate) return;
    setEmailType(type);
    setEmailDrafting(true);
    setShowEmailComposer(true);

    // Extract email from resume if available
    const resumeText = focusCandidate.raw_text || focusCandidate.text || '';
    const emailMatch = resumeText.match(/[\w.-]+@[\w.-]+\.\w+/);
    setEmailTo(emailMatch ? emailMatch[0] : '');
    setEmailCc('');
    setEmailBcc('');

    try {
      const response = await fetch(`${API_BASE}/api/chat/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          candidate_id: focusCandidate.id,
          email_type: type,
          evaluation_report: agentResult?.report || null,
          anonymize
        })
      });
      const data = await response.json();
      setEmailSubject(data.subject || '');
      setEmailBody(data.body || '');
    } catch (err) {
      setEmailSubject('Regarding Your Application');
      setEmailBody('Hi,\n\nThank you for your interest.\n\nBest regards');
    } finally {
      setEmailDrafting(false);
    }
  };

  const openInGmail = () => {
    const to = encodeURIComponent(emailTo);
    const subject = encodeURIComponent(emailSubject);
    const body = encodeURIComponent(emailBody);
    const cc = emailCc ? `&cc=${encodeURIComponent(emailCc)}` : '';
    const bcc = emailBcc ? `&bcc=${encodeURIComponent(emailBcc)}` : '';
    window.open(`https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}${cc}${bcc}`, '_blank');
  };

  const openInOutlook = () => {
    const to = encodeURIComponent(emailTo);
    const subject = encodeURIComponent(emailSubject);
    const body = encodeURIComponent(emailBody);
    window.open(`https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${subject}&body=${body}`, '_blank');
  };

  const openMailto = () => {
    const subject = encodeURIComponent(emailSubject);
    const body = encodeURIComponent(emailBody);
    const cc = emailCc ? `&cc=${encodeURIComponent(emailCc)}` : '';
    const bcc = emailBcc ? `&bcc=${encodeURIComponent(emailBcc)}` : '';
    window.location.href = `mailto:${emailTo}?subject=${subject}&body=${body}${cc}${bcc}`;
  };

  const copyEmail = () => {
    const text = `Subject: ${emailSubject}\nTo: ${emailTo}\n${emailCc ? `Cc: ${emailCc}\n` : ''}${emailBcc ? `Bcc: ${emailBcc}\n` : ''}\n${emailBody}`;
    navigator.clipboard.writeText(text);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  // ─── Chat Send (typed) ───
  const handleChatSend = async (msg) => {
    const text = msg || chatInput.trim();
    if (!text || !focusCandidate || focusTyping) return;

    setChatInput('');
    setPendingAutoSpeak(false);
    setFocusMessages(prev => [...prev, { role: 'user', content: text }]);
    setFocusSuggestions([]);
    setFocusTyping(true);

    try {
      const response = await fetch(`${API_BASE}/api/chat/focus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          message: text,
          candidate_id: focusCandidate.id,
          conversation_history: focusMessages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          anonymize
        })
      });
      const data = await response.json();
      setFocusMessages(prev => [...prev, { role: 'assistant', content: data.response || 'Sorry, I could not generate a response.' }]);
      if (data.suggestions?.length) setFocusSuggestions(data.suggestions);
    } catch (err) {
      setFocusMessages(prev => [...prev, { role: 'assistant', content: '**Error:** Could not reach the server. Please check your backend is running.' }]);
    } finally {
      setFocusTyping(false);
    }
  };

  // ─── Voice Send ───
  const handleVoiceSend = (text) => {
    if (!text || !text.trim() || !focusCandidate || focusTyping) return;
    setPendingAutoSpeak(true);
    setChatInput('');
    setFocusMessages(prev => [...prev, { role: 'user', content: text.trim() }]);
    setFocusSuggestions([]);
    setFocusTyping(true);

    fetch(`${API_BASE}/api/chat/focus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
      body: JSON.stringify({ message: text.trim(), candidate_id: focusCandidate.id, conversation_history: focusMessages.slice(-20).map(m => ({ role: m.role, content: m.content })), anonymize })
    })
      .then(res => res.json())
      .then(data => {
        setFocusMessages(prev => [...prev, { role: 'assistant', content: data.response || 'Sorry, could not generate a response.' }]);
        if (data.suggestions?.length) setFocusSuggestions(data.suggestions);
      })
      .catch(() => { setFocusMessages(prev => [...prev, { role: 'assistant', content: '**Error:** Could not reach the server.' }]); })
      .finally(() => { setFocusTyping(false); });
  };

  // ─── Voice Recording ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) { alert('Please allow microphone access.'); }
  };

  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };

  const transcribeAudio = async (audioBlob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      const response = await fetch(`${API_BASE}/api/chat/speech-to-text`, { method: 'POST', headers: { 'Authorization': 'Bearer demo-token' }, body: formData });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.text && data.text.trim()) handleVoiceSend(data.text);
      else alert('No speech detected.');
    } catch (err) { alert('Voice transcription failed: ' + err.message); }
    finally { setIsTranscribing(false); }
  };

  // ─── TTS ───
  const stopSpeaking = useCallback(() => {
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current.currentTime = 0; if (currentAudioRef.current.src) URL.revokeObjectURL(currentAudioRef.current.src); currentAudioRef.current = null; }
    setSpeakingMsgIndex(null); setLoadingMsgIndex(null);
  }, []);

  const speakText = useCallback(async (text, msgIndex) => {
    if (speakingMsgIndex === msgIndex) { stopSpeaking(); return; }
    stopSpeaking(); setLoadingMsgIndex(msgIndex);
    try {
      abortControllerRef.current = new AbortController();
      let cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/•/g, ',').replace(/\n+/g, '. ').trim();
      if (cleanText.length > 4000) cleanText = cleanText.substring(0, 4000) + '...';
      const response = await fetch(`${API_BASE}/api/chat/text-to-speech`, { method: 'POST', headers: { 'Authorization': 'Bearer demo-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: cleanText, voice: 'nova' }), signal: abortControllerRef.current.signal });
      if (!response.ok) throw new Error('TTS failed');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(audioUrl); currentAudioRef.current = null; setSpeakingMsgIndex(null); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); currentAudioRef.current = null; setSpeakingMsgIndex(null); };
      setLoadingMsgIndex(null); setSpeakingMsgIndex(msgIndex); await audio.play();
    } catch (err) { if (err.name !== 'AbortError') console.error('TTS error:', err); setLoadingMsgIndex(null); setSpeakingMsgIndex(null); }
  }, [speakingMsgIndex, stopSpeaking]);

  // ─── Web Search ───
  const handleWebSearch = async (query) => {
    const q = query || searchQuery.trim();
    if (!q || searchLoading) return;
    setSearchLoading(true);
    setSearchHistory(prev => [q, ...prev.filter(h => h !== q)].slice(0, 10));
    try {
      const response = await fetch(`${API_BASE}/api/chat/web-search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' }, body: JSON.stringify({ query: q, candidate_id: focusCandidate?.id, candidate_name: anonymize ? null : focusCandidate?.name }) });
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (err) { setSearchResults([{ title: 'Search Error', snippet: 'Could not perform web search.', url: '' }]); }
    finally { setSearchLoading(false); }
  };

  const getSearchSuggestions = () => {
    if (!focusCandidate) return [];
    const name = focusCandidate.name || '';
    const role = focusCandidate.predicted_role || '';
    const s = [];
    if (name && !anonymize) { s.push(`${name} LinkedIn`); s.push(`${name} GitHub`); s.push(`${name} portfolio`); }
    if (role) { s.push(`${role} average salary`); s.push(`${role} interview questions`); }
    return s;
  };

  // ═══════ HIRING AGENT: Run Evaluation ═══════
  const runHiringAgent = async () => {
    const role = selectedRole === 'other' ? customRole : selectedRole;
    if (!role) { showToast('Please select or enter a role'); return; }
    if (!selectedExperience) { showToast('Please select experience level'); return; }
    if (!selectedLevel) { showToast('Please select seniority level'); return; }

    setAgentLoading(true);
    setAgentStep('loading');
    setAgentResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/chat/hiring-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          candidate_id: focusCandidate.id,
          role: role,
          experience_required: selectedExperience,
          level: selectedLevel,
          job_description: jdText || null,
          anonymize
        })
      });
      const data = await response.json();
      setAgentResult(data);
      setAgentStep('result');
    } catch (err) {
      setAgentResult({ error: 'Could not reach the server. Please try again.' });
      setAgentStep('result');
    } finally {
      setAgentLoading(false);
    }
  };

  const runJDAnalysis = async () => {
    if (!jdText.trim()) { showToast('Please paste a job description'); return; }
    setAgentLoading(true);
    setAgentStep('loading');

    try {
      const response = await fetch(`${API_BASE}/api/chat/hiring-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          candidate_id: focusCandidate.id,
          job_description: jdText,
          role: null,
          experience_required: null,
          level: null,
          anonymize
        })
      });
      const data = await response.json();
      setAgentResult(data);
      setAgentStep('result');
    } catch (err) {
      setAgentResult({ error: 'Could not reach the server.' });
      setAgentStep('result');
    } finally {
      setAgentLoading(false);
    }
  };

  // ─── RENDER: Selection View ───
  if (!focusCandidate) {
    return (
      <div className="focus-container">
        {showWarning && <div className="focus-toast"><AlertCircle size={16} /><span>{warningMsg}</span></div>}
        <div className="focus-select-header">
          <div className="focus-select-icon"><User size={32} /></div>
          <h2 className="focus-select-title">Candidate Focus</h2>
          <p className="focus-select-subtitle">Select <strong>one candidate</strong> to unlock personalized AI tools — deep-dive chat, web research, and hiring evaluation.</p>
        </div>
        {candidates.length === 0 ? (
          <div className="focus-empty"><div className="focus-empty-icon"><User size={48} /></div><h3>No candidates uploaded yet</h3><p>Go to the Upload tab to add resumes first.</p></div>
        ) : (
          <div className="focus-candidates-grid">
            {candidates.map((c, i) => (
              <div key={c.id} className="focus-candidate-card glass-card" onClick={() => handleCandidateSelect(c)}>
                <div className="focus-card-header">
                  <div className="candidate-avatar" style={{ background: getAvatarGradient(c.name) }}>{getDisplayName(c, i)[0]?.toUpperCase()}</div>
                  <div className="focus-card-info">
                    <h3 className="focus-card-name">{getDisplayName(c, i)}</h3>
                    <p className="focus-card-role">{c.predicted_role || 'Processing...'}</p>
                  </div>
                  <ChevronRight size={18} className="focus-card-arrow" />
                </div>
                <div className="focus-card-meta">
                  {c.total_experience_years != null && <span className="focus-meta-item"><Briefcase size={12} /> {c.total_experience_years}y exp</span>}
                  {c.experience_level && <span className="focus-meta-item"><Award size={12} /> {c.experience_level}</span>}
                  {c.location && <span className="focus-meta-item"><MapPin size={12} /> {c.location}</span>}
                </div>
                <div className="focus-card-skills">
                  {getSkills(c).slice(0, 4).map((s, j) => <span key={j} className="skill">{typeof s === 'string' ? s : s?.name || ''}</span>)}
                  {getSkills(c).length > 4 && <span className="skill" style={{ opacity: 0.6 }}>+{getSkills(c).length - 4}</span>}
                </div>
                {c.is_resume === false && <div className="focus-not-resume"><AlertCircle size={12} /> Not a Resume</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── RENDER: Tools View ───
  return (
    <div className="focus-container">
      {showWarning && <div className="focus-toast"><AlertCircle size={16} /><span>{warningMsg}</span></div>}

      {/* Header */}
      <div className="focus-header">
        <button className="focus-back-btn" onClick={() => { stopSpeaking(); setFocusCandidate(null); }}><ArrowLeft size={18} /><span>Back</span></button>
        <div className="focus-profile">
          <div className="focus-avatar" style={{ background: getAvatarGradient(focusCandidate.name) }}>{getDisplayName(focusCandidate, candidates.indexOf(focusCandidate))[0]?.toUpperCase()}</div>
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

      {/* Tabs */}
      <div className="focus-tabs">
        <button className={`focus-tab ${activeTool === 'chat' ? 'active' : ''}`} onClick={() => setActiveTool('chat')}><MessageSquare size={16} /><span>AI Chat</span></button>
        <button className={`focus-tab ${activeTool === 'websearch' ? 'active' : ''}`} onClick={() => setActiveTool('websearch')}><Globe size={16} /><span>Web Search</span></button>
        <button className={`focus-tab ${activeTool === 'agent' ? 'active' : ''}`} onClick={() => setActiveTool('agent')}><UserCheck size={16} /><span>Hiring Agent</span></button>
      </div>

      {/* ════════ AI CHAT ════════ */}
      {activeTool === 'chat' && (
        <div className="focus-chat-container">
          <div className="focus-chat-messages">
            {focusMessages.map((m, i) => (
              <div key={i} className={`chat-message ${m.role}`}>
                {m.role === 'assistant' && <AIAvatar />}
                <div className={`chat-bubble ${m.role}`}>
                  {m.role === 'user' ? <p>{m.content}</p> : <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />}
                </div>
                {m.role === 'user' && <div className="avatar-sm" style={{ background: 'var(--bg3)' }}><Users size={16} /></div>}
                {m.role === 'assistant' && (
                  <button className={`msg-speak-btn ${speakingMsgIndex === i ? 'speaking' : ''} ${loadingMsgIndex === i ? 'loading' : ''}`} onClick={() => speakText(m.content, i)} title={speakingMsgIndex === i ? 'Stop' : 'Read aloud'} disabled={loadingMsgIndex !== null && loadingMsgIndex !== i}>
                    {loadingMsgIndex === i ? <Loader size={16} className="spin" /> : speakingMsgIndex === i ? <Square size={14} /> : <Volume2 size={16} />}
                  </button>
                )}
              </div>
            ))}
            {focusTyping && <div className="chat-message assistant"><AIAvatar /><div className="chat-bubble assistant"><div className="typing"><span /><span /><span /></div></div></div>}
            <div ref={msgEndRef} />
          </div>
          {focusSuggestions.length > 0 && !focusTyping && (
            <div className="chat-suggestions">{focusSuggestions.map((q, i) => <button key={i} className="chat-suggestion" onClick={() => handleChatSend(q)}>{q}</button>)}</div>
          )}
          <div className="chat-input-area">
            <button className={`btn-icon voice-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`} onClick={isRecording ? stopRecording : startRecording} disabled={isTranscribing || focusTyping} title={isRecording ? 'Stop recording' : 'Voice input'}>
              {isTranscribing ? <Loader size={20} className="spin" /> : isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <input type="text" className="input chat-input" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }} placeholder={isRecording ? '🎤 Listening...' : isTranscribing ? '⏳ Transcribing...' : `Ask about ${anonymize ? 'this candidate' : (focusCandidate.name || 'this candidate')}...`} disabled={focusTyping || isRecording || isTranscribing} />
            <button onClick={() => handleChatSend()} disabled={!chatInput.trim() || focusTyping} className="btn btn-primary send-btn"><Send size={18} /></button>
          </div>
        </div>
      )}

      {/* ════════ WEB SEARCH ════════ */}
      {activeTool === 'websearch' && (
        <div className="focus-websearch-container">
          <div className="focus-search-bar">
            <div className="focus-search-input-wrap">
              <Search size={18} className="focus-search-icon" />
              <input type="text" className="input focus-search-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleWebSearch(); }} placeholder={`Search the web...`} />
              {searchQuery && <button className="focus-search-clear" onClick={() => setSearchQuery('')}><X size={14} /></button>}
            </div>
            <button onClick={() => handleWebSearch()} disabled={!searchQuery.trim() || searchLoading} className="btn btn-primary">
              {searchLoading ? <Loader size={18} className="spin" /> : <Search size={18} />}<span>Search</span>
            </button>
          </div>
          {searchResults.length === 0 && !searchLoading && (
            <div className="focus-search-suggestions">
              <p className="focus-search-suggestions-label">Quick searches:</p>
              <div className="focus-search-chips">{getSearchSuggestions().map((s, i) => <button key={i} className="focus-search-chip" onClick={() => { setSearchQuery(s); handleWebSearch(s); }}><Search size={12} /> {s}</button>)}</div>
            </div>
          )}
          {searchLoading && <div className="focus-search-loading"><Loader size={24} className="spin" /><p>Searching the web...</p></div>}
          {searchResults.length > 0 && !searchLoading && (
            <div className="focus-search-results">
              <p className="focus-search-results-count">Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
              {searchResults.map((result, i) => (
                <div key={i} className="focus-search-result glass-card">
                  <div className="focus-result-header">
                    <h3 className="focus-result-title">{result.url ? <a href={result.url} target="_blank" rel="noopener noreferrer">{result.title} <ExternalLink size={14} /></a> : result.title}</h3>
                    {result.url && <span className="focus-result-url">{result.url}</span>}
                  </div>
                  <p className="focus-result-snippet">{result.snippet}</p>
                </div>
              ))}
            </div>
          )}
          {searchHistory.length > 0 && (
            <div className="focus-search-history">
              <p className="focus-search-history-label">Recent searches:</p>
              <div className="focus-search-chips">{searchHistory.map((h, i) => <button key={i} className="focus-search-chip history" onClick={() => { setSearchQuery(h); handleWebSearch(h); }}>{h}</button>)}</div>
            </div>
          )}
        </div>
      )}

      {/* ════════ HIRING AGENT ════════ */}
      {activeTool === 'agent' && (
        <div className="agent-container">
          {/* Agent Header */}
          <div className="agent-intro">
            <div className="agent-intro-icon"><UserCheck size={28} /></div>
            <div>
              <h3 className="agent-intro-title">Hiring Manager Agent</h3>
              <p className="agent-intro-desc">I'll evaluate this candidate's fit for your position using resume data, online research, and hiring best practices.</p>
            </div>
          </div>

          {/* Step: Choose Input Mode */}
          {agentStep === 'choose' && (
            <div className="agent-choose">
              <div className="agent-option glass-card" onClick={() => { setAgentInputMode('jd'); setAgentStep('jd'); }}>
                <div className="agent-option-icon"><FileText size={24} /></div>
                <div>
                  <h4>Paste Job Description</h4>
                  <p>I'll extract the role, requirements, and evaluate the candidate against it</p>
                </div>
                <ChevronRight size={18} />
              </div>
              <div className="agent-option glass-card" onClick={() => { setAgentInputMode('quick'); setAgentStep('quick'); }}>
                <div className="agent-option-icon"><Target size={24} /></div>
                <div>
                  <h4>Quick Setup</h4>
                  <p>Select role, experience, and level — I'll do the rest</p>
                </div>
                <ChevronRight size={18} />
              </div>
            </div>
          )}

          {/* Step: Job Description Input */}
          {agentStep === 'jd' && (
            <div className="agent-jd">
              <label className="agent-label">Paste the full Job Description:</label>
              <textarea className="agent-textarea input" value={jdText} onChange={e => setJdText(e.target.value)} rows={10} placeholder="Paste the complete job description here... Include role title, requirements, qualifications, responsibilities, etc." />
              <div className="agent-actions">
                <button className="btn btn-ghost" onClick={() => setAgentStep('choose')}>← Back</button>
                <button className="btn btn-primary" onClick={runJDAnalysis} disabled={!jdText.trim() || agentLoading}>
                  {agentLoading ? <Loader size={16} className="spin" /> : <Sparkles size={16} />}
                  <span>Evaluate Candidate</span>
                </button>
              </div>
            </div>
          )}

          {/* Step: Quick Setup */}
          {agentStep === 'quick' && (
            <div className="agent-quick">
              {/* Role Selection */}
              <div className="agent-section">
                <label className="agent-label"><Target size={14} /> What role are you hiring for?</label>
                <div className="agent-chips">
                  {suggestedRoles.map((r, i) => (
                    <button key={i} className={`agent-chip ${selectedRole === r ? 'active' : ''}`} onClick={() => { setSelectedRole(r); setCustomRole(''); }}>
                      {r}
                    </button>
                  ))}
                  <button className={`agent-chip ${selectedRole === 'other' ? 'active' : ''}`} onClick={() => setSelectedRole('other')}>
                    Other...
                  </button>
                </div>
                {selectedRole === 'other' && (
                  <input type="text" className="input agent-input" value={customRole} onChange={e => setCustomRole(e.target.value)} placeholder="Enter the role title..." />
                )}
              </div>

              {/* Experience */}
              <div className="agent-section">
                <label className="agent-label"><Briefcase size={14} /> Required experience:</label>
                <div className="agent-chips">
                  {['0-1 years', '1-3 years', '3-5 years', '5-8 years', '8+ years'].map((exp) => (
                    <button key={exp} className={`agent-chip ${selectedExperience === exp ? 'active' : ''}`} onClick={() => setSelectedExperience(exp)}>
                      {exp}
                    </button>
                  ))}
                </div>
              </div>

              {/* Level */}
              <div className="agent-section">
                <label className="agent-label"><Award size={14} /> Seniority level:</label>
                <div className="agent-chips">
                  {['Intern', 'Junior', 'Mid-Level', 'Senior', 'Lead / Principal'].map((lvl) => (
                    <button key={lvl} className={`agent-chip ${selectedLevel === lvl ? 'active' : ''}`} onClick={() => setSelectedLevel(lvl)}>
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="agent-actions">
                <button className="btn btn-ghost" onClick={() => setAgentStep('choose')}>← Back</button>
                <button className="btn btn-primary" onClick={runHiringAgent} disabled={agentLoading}>
                  {agentLoading ? <Loader size={16} className="spin" /> : <Sparkles size={16} />}
                  <span>Evaluate Candidate</span>
                </button>
              </div>
            </div>
          )}

          {/* Step: Loading */}
          {agentStep === 'loading' && (
            <div className="agent-loading">
              <Loader size={36} className="spin" />
              <h3>Evaluating candidate...</h3>
              <div className="agent-loading-steps">
                <p className="agent-step-item active">📄 Analyzing resume data...</p>
                <p className="agent-step-item">🔍 Searching online presence...</p>
                <p className="agent-step-item">🎯 Matching against requirements...</p>
                <p className="agent-step-item">📊 Generating fit report...</p>
              </div>
            </div>
          )}

          {/* Step: Result */}
          {agentStep === 'result' && agentResult && (
            <div className="agent-result" ref={agentResultRef}>
              {agentResult.error ? (
                <div className="agent-error glass-card">
                  <AlertCircle size={24} />
                  <p>{agentResult.error}</p>
                </div>
              ) : (
                <div className="agent-report">
                  <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(agentResult.report || '') }} />
                </div>
              )}
              <div className="agent-actions">
                <button className="btn btn-ghost" onClick={resetAgent}>← Start Over</button>
                <button className="btn btn-secondary" onClick={() => setActiveTool('chat')}>
                  <MessageSquare size={16} /> Discuss in Chat
                </button>
                {!agentResult.error && !showEmailComposer && (
                  <button className="btn btn-primary" onClick={() => setShowEmailComposer(true)}>
                    <Mail size={16} /> Mail to {anonymize ? 'Candidate' : (focusCandidate.name?.split(' ')[0] || 'Candidate')}
                  </button>
                )}
              </div>

              {/* ═══════ EMAIL COMPOSER ═══════ */}
              {showEmailComposer && (
                <div className="email-composer glass-card">
                  <div className="email-composer-header">
                    <div className="email-composer-title">
                      <Mail size={18} />
                      <span>Email</span>
                    </div>
                    <div className="email-composer-actions">
                      <button className="email-action-btn" onClick={copyEmail} title="Copy to clipboard">
                        {emailCopied ? <Check size={16} /> : <Clipboard size={16} />}
                      </button>
                      <button className="email-action-btn" onClick={() => setShowEmailComposer(false)} title="Close">
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Email Type Selector */}
                  {!emailType && !emailDrafting && (
                    <div className="email-type-select">
                      <p className="email-type-label">What type of email?</p>
                      <div className="email-type-chips">
                        <button className="agent-chip" onClick={() => draftEmail('interest')}>📩 Interest / Invitation</button>
                        <button className="agent-chip" onClick={() => draftEmail('interview')}>📅 Interview Scheduling</button>
                        <button className="agent-chip" onClick={() => draftEmail('offer')}>🎉 Offer Discussion</button>
                        <button className="agent-chip" onClick={() => draftEmail('pass')}>🙏 Polite Pass</button>
                        <button className="agent-chip" onClick={() => draftEmail('followup')}>🔄 Follow-up</button>
                      </div>
                    </div>
                  )}

                  {/* Drafting Loader */}
                  {emailDrafting && (
                    <div className="email-drafting">
                      <Loader size={20} className="spin" />
                      <span>Drafting email...</span>
                    </div>
                  )}

                  {/* Email Form */}
                  {emailType && !emailDrafting && (
                    <>
                      <div className="email-fields">
                        <div className="email-field">
                          <label>To</label>
                          <input type="email" className="email-input" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="candidate@email.com" />
                        </div>

                        {!showCcBcc && (
                          <button className="email-ccbcc-toggle" onClick={() => setShowCcBcc(true)}>+ Cc / Bcc</button>
                        )}

                        {showCcBcc && (
                          <>
                            <div className="email-field">
                              <label>Cc</label>
                              <input type="text" className="email-input" value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="cc@email.com" />
                            </div>
                            <div className="email-field">
                              <label>Bcc</label>
                              <input type="text" className="email-input" value={emailBcc} onChange={e => setEmailBcc(e.target.value)} placeholder="bcc@email.com" />
                            </div>
                          </>
                        )}

                        <div className="email-field">
                          <label>Subject</label>
                          <input type="text" className="email-input" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email subject..." />
                        </div>
                      </div>

                      <div className="email-divider" />

                      <textarea
                        className="email-body"
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        rows={12}
                        placeholder="Email body..."
                      />

                      <div className="email-send-actions">
                        <button className="email-send-btn gmail" onClick={openInGmail}>
                          <span>Open in Gmail</span>
                        </button>
                        <button className="email-send-btn outlook" onClick={openInOutlook}>
                          <span>Open in Outlook</span>
                        </button>
                        <button className="email-send-btn default" onClick={openMailto}>
                          <Mail size={16} />
                          <span>Default Mail</span>
                        </button>
                        <button className="email-send-btn copy" onClick={copyEmail}>
                          {emailCopied ? <Check size={16} /> : <Clipboard size={16} />}
                          <span>{emailCopied ? 'Copied!' : 'Copy All'}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}