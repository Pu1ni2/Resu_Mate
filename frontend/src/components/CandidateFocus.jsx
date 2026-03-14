import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import {
  User, MessageSquare, Globe, Search, Send, ArrowLeft, Check,
  AlertCircle, Briefcase, Award, MapPin, ExternalLink, Loader,
  ChevronRight, X, Volume2, Mic, MicOff, Square, Bot, Users,
  ClipboardList, Target, ChevronDown, FileText, UserCheck, Mail, Copy, Clipboard,
  Github, Calendar, Video, Zap, Brain
} from 'lucide-react';

const AIAvatar = () => (
  <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
    <Bot size={18} />
  </div>
);

// ─── Matrix Rain Background ───
const MatrixRain = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = canvas.parentElement?.offsetWidth || window.innerWidth; canvas.height = canvas.parentElement?.offsetHeight || 500; };
    resize(); window.addEventListener('resize', resize);
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
        const x = i * fontSize; const y = drops[i] * fontSize;
        ctx.fillStyle = `rgba(34, 197, 94, ${Math.random() * 0.5 + 0.3})`;
        ctx.fillText(char, x, y);
        if (Math.random() > 0.95) { ctx.fillStyle = 'rgba(134, 239, 172, 0.9)'; ctx.fillText(char, x, y); }
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    const interval = setInterval(draw, 50);
    return () => { clearInterval(interval); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="matrix-canvas" />;
};

const API_BASE = import.meta.env.PROD
  ? 'https://resumate-api-74dm.onrender.com'
  : '';

export default function CandidateFocus() {
  const {
    candidates, selectedIds, anonymize, getDisplayName, getAvatarGradient
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

  // ═══════ CREATE INTERVIEW STATE ═══════
  const [showInterviewCreator, setShowInterviewCreator] = useState(false);
  const [interviewRole, setInterviewRole] = useState('');
  const [interviewNumQuestions, setInterviewNumQuestions] = useState('8');
  const [interviewFocusAreas, setInterviewFocusAreas] = useState('');
  const [interviewCreating, setInterviewCreating] = useState(false);
  const [interviewCreated, setInterviewCreated] = useState(false);
  const [interviewEmail, setInterviewEmail] = useState('');

  // ═══════ GITHUB STATE ═══════
  const [ghLoading, setGhLoading] = useState(false);
  const [ghProfile, setGhProfile] = useState(null);
  const [ghError, setGhError] = useState('');
  const [ghUsername, setGhUsername] = useState('');
  const [ghNeedsInput, setGhNeedsInput] = useState(false);

  // ═══════ CALENDLY STATE ═══════
  const [calLoading, setCalLoading] = useState(false);
  const [calData, setCalData] = useState(null);
  const [calError, setCalError] = useState('');

  // ═══════ SCANNER AGENT STATE ═══════
  const [scanLogs, setScanLogs] = useState([]);
  const [scanProfiles, setScanProfiles] = useState(null);
  const [scanSummary, setScanSummary] = useState('');
  const [scanContact, setScanContact] = useState(null);
  const [scanRunning, setScanRunning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const scanRef = useRef(null);
  const [toolsReady, setToolsReady] = useState(false);
  const [toolsRevealing, setToolsRevealing] = useState(false);

  // ═══════ CACHE: Store scan results + chat per candidate ═══════
  const candidateCache = useRef({});

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

  // Helper: build candidate data payload for backend API calls
  const getCandidatePayload = () => {
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
      badges: focusCandidate.badges || []
    };
  };

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
      // Deselect - save current state to cache first
      if (focusCandidate) {
        candidateCache.current[focusCandidate.id] = {
          scanProfiles, scanSummary, scanContact, scanLogs,
          messages: focusMessages, suggestions: focusSuggestions,
          searchResults, searchHistory
        };
      }
      setFocusCandidate(null);
      return;
    }

    // Save previous candidate's state to cache
    if (focusCandidate) {
      candidateCache.current[focusCandidate.id] = {
        scanProfiles, scanSummary, scanContact, scanLogs,
        messages: focusMessages, suggestions: focusSuggestions,
        searchResults, searchHistory
      };
    }

    // Set new focus candidate
    setFocusCandidate({ ...candidate });
    resetAgent();

    // Check if we have cached data for this candidate
    const cached = candidateCache.current[candidate.id];
    if (cached && cached.scanProfiles) {
      // ─── RESTORE FROM CACHE (instant, no scanning) ───
      setScanProfiles(cached.scanProfiles);
      setScanSummary(cached.scanSummary || '');
      setScanContact(cached.scanContact || null);
      setScanLogs(cached.scanLogs || []);
      setFocusMessages(cached.messages || []);
      setFocusSuggestions(cached.suggestions || []);
      setSearchResults(cached.searchResults || []);
      setSearchHistory(cached.searchHistory || []);
      setScanRunning(false);
      setScanDone(true);
      setToolsRevealing(false);
      setToolsReady(true);
    } else {
      // ─── FRESH SCAN (first time for this candidate) ───
      setFocusMessages([]);
      setFocusSuggestions([]);
      setSearchResults([]);
      setSearchHistory([]);
      setScanLogs([]);
      setScanProfiles(null);
      setScanSummary('');
      setScanContact(null);
      setScanRunning(false);
      setScanDone(false);
      setToolsReady(false);
      setToolsRevealing(false);

      // Auto-run scanner
      setTimeout(() => runScanner(candidate.id), 500);

      const name = anonymize ? 'this candidate' : (candidate.name || 'this candidate');
      setFocusMessages([{
        role: 'assistant',
        content: `**Welcome to Candidate Focus!** 👋\n\nScanning **${name}**'s resume and online profiles...\n\nPlease wait while I gather data from all sources.`
      }]);

      if (candidate.name && !anonymize) {
        setSearchQuery(candidate.name);
      }
    }
  }, [focusCandidate, anonymize, scanProfiles, scanSummary, scanContact, scanLogs, focusMessages, focusSuggestions, searchResults, searchHistory]);

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
          candidate_data: getCandidatePayload(),
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

  // ═══════ CREATE INTERVIEW ═══════
  const createInterview = async () => {
    if (!focusCandidate || !interviewEmail.trim()) { showToast('Please enter candidate email'); return; }
    console.log('Creating interview for:', interviewEmail, 'candidate:', focusCandidate.name);
    setInterviewCreating(true);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/create-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({
          candidate_id: focusCandidate.id,
          candidate_email: interviewEmail.trim(),
          candidate_name: focusCandidate.name || '',
          role: interviewRole || selectedRole || focusCandidate.predicted_role || 'General',
          level: selectedLevel || focusCandidate.experience_level || 'Mid-Level',
          experience_required: selectedExperience || '',
          num_questions: parseInt(interviewNumQuestions) || 8,
          focus_areas: interviewFocusAreas ? interviewFocusAreas.split(',').map(s => s.trim()) : []
        })
      });
      const data = await resp.json();
      if (data.message) {
        setInterviewCreated(true);
        showToast('Interview created! Candidate can now login.');
      }
    } catch (e) {
      showToast('Failed to create interview');
    } finally {
      setInterviewCreating(false);
    }
  };

  // Auto-fill interview email from scanner contact
  useEffect(() => {
    if (scanContact?.email && !interviewEmail) {
      setInterviewEmail(scanContact.email);
    }
  }, [scanContact]);

  // ═══════ GITHUB FUNCTIONS ═══════
  const fetchGitHub = async (username) => {
    setGhLoading(true); setGhError(''); setGhProfile(null); setGhNeedsInput(false);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/github-analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token' },
        body: JSON.stringify({ candidate_id: focusCandidate.id, candidate_data: getCandidatePayload(), github_username: username || null, anonymize })
      });
      const data = await resp.json();
      if (data.error) { setGhError(data.error); if (data.needs_username) setGhNeedsInput(true); }
      else setGhProfile(data.profile);
    } catch (e) { setGhError('Failed to connect to server'); }
    finally { setGhLoading(false); }
  };

  // ═══════ CALENDLY FUNCTIONS ═══════
  const fetchCalendly = async () => {
    setCalLoading(true); setCalError(''); setCalData(null);
    try {
      const resp = await fetch(`${API_BASE}/api/chat/calendly-link`, { headers: { 'Authorization': 'Bearer demo-token' } });
      const data = await resp.json();
      if (data.error) setCalError(data.error);
      else setCalData(data);
    } catch (e) { setCalError('Failed to connect to server'); }
    finally { setCalLoading(false); }
  };

  // ═══════ SCANNER AGENT ═══════
  const runScanner = async (candidateId) => {
    if (scanRunning || scanDone) return;
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
            name: focusCandidate?.name || '',
            text: focusCandidate?.text || focusCandidate?.raw_text || '',
            predicted_role: focusCandidate?.predicted_role || '',
            skills: focusCandidate?.skills || []
          }
        })
      });
      const data = await resp.json();

      // Animate logs one by one
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

      // ═══ FEED INTO AI CHAT ═══
      // Show feeding animation
      await new Promise(resolve => setTimeout(resolve, 500));
      setScanLogs(prev => [...prev, { step: 'feeding', msg: 'Feeding collected data into AI Chat...', status: 'success' }]);
      await new Promise(resolve => setTimeout(resolve, 800));

      // Build enriched intro message with scan findings
      const name = anonymize ? 'this candidate' : (focusCandidate?.name || 'this candidate');
      let enrichedIntro = `**🧠 AI Chat Supercharged!** I now have data from multiple sources:\n\n`;
      enrichedIntro += `📄 **Resume** — skills, experience, education\n`;
      
      if (scannedProfiles?.github) {
        const gh = scannedProfiles.github;
        enrichedIntro += `🐙 **GitHub** (@${gh.username}) — ${gh.public_repos} repos, ${gh.followers} followers\n`;
      }
      if (scannedProfiles?.linkedin) {
        const li = scannedProfiles.linkedin;
        enrichedIntro += `💼 **LinkedIn** — ${li.headline || li.name || 'Profile found'}\n`;
      }
      if (scannedContact?.email) {
        enrichedIntro += `📧 **Contact** — ${scannedContact.email}\n`;
      }
      
      enrichedIntro += `\n---\nAsk me anything about **${name}** — I'll use **all sources** to give you the most complete answer.\n\n`;
      enrichedIntro += `Try asking:\n• "Tell me about their GitHub projects"\n• "What's their career trajectory?"\n• "Are they a good fit for a senior role?"`;

      setFocusMessages([{ role: 'assistant', content: enrichedIntro }]);
      setFocusSuggestions([
        `What are ${name}'s GitHub projects about?`,
        `Compare resume vs LinkedIn profile`,
        `Summarize everything you know about ${name}`,
        `Is ${name} a strong candidate?`
      ]);

      setScanLogs(prev => [...prev, { step: 'fed', msg: 'AI Chat is now powered with all collected data!', status: 'success' }]);

      // Trigger tools reveal animation
      await new Promise(resolve => setTimeout(resolve, 600));
      setToolsRevealing(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      setToolsReady(true);

    } catch (e) {
      setScanLogs(prev => [...prev, { step: 'error', msg: 'Scanner failed to connect to server', status: 'error' }]);
    } finally {
      setScanRunning(false);
      setScanDone(true);
    }
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
          candidate_data: getCandidatePayload(),
          scan_data: scanProfiles || null,
          scan_contact: scanContact || null,
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
      body: JSON.stringify({ message: text.trim(), candidate_id: focusCandidate.id, candidate_data: getCandidatePayload(), scan_data: scanProfiles || null, scan_contact: scanContact || null, conversation_history: focusMessages.slice(-20).map(m => ({ role: m.role, content: m.content })), anonymize })
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
          candidate_data: getCandidatePayload(),
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
          candidate_data: getCandidatePayload(),
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

        {/* Warning if multiple selected in Upload tab */}
        {selectedIds.length > 1 && (
          <div className="focus-multi-warning glass-card">
            <AlertCircle size={18} />
            <span>You have <strong>{selectedIds.length} candidates selected</strong> in the Upload tab. Candidate Focus works with <strong>one candidate at a time</strong>. Select one below.</span>
          </div>
        )}

        <div className="focus-select-header">
          <div className="focus-select-icon"><User size={32} /></div>
          <h2 className="focus-select-title">Candidate Focus</h2>
          <p className="focus-select-subtitle">Select <strong>one candidate</strong> to unlock personalized AI tools — deep-dive chat, web research, and hiring evaluation.</p>
        </div>
        {candidates.length === 0 ? (
          <div className="focus-empty"><div className="focus-empty-icon"><User size={48} /></div><h3>No candidates uploaded yet</h3><p>Go to the Upload tab to add resumes first.</p></div>
        ) : (
          <div className="focus-candidates-grid">
            {/* Deduplicate candidates by ID */}
            {candidates.filter((c, index, self) => index === self.findIndex(t => t.id === c.id)).map((c, i) => (
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

      {/* Header - always visible */}
      <div className="focus-header">
        <button className="focus-back-btn" onClick={() => {
          stopSpeaking();
          // Save to cache before leaving
          if (focusCandidate) {
            candidateCache.current[focusCandidate.id] = {
              scanProfiles, scanSummary, scanContact, scanLogs,
              messages: focusMessages, suggestions: focusSuggestions,
              searchResults, searchHistory
            };
          }
          setFocusCandidate(null);
        }}><ArrowLeft size={18} /><span>Back</span></button>
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

      {/* ═══════ PHASE 1: SCANNER (Full screen when tools not ready) ═══════ */}
      {!toolsReady && (
        <div className="scanner-fullscreen">
          {(scanRunning || (scanDone && !toolsRevealing)) && <MatrixRain />}
          <div className="scanner-terminal" ref={scanRef}>
            <div className="scanner-header">
              <div className="scanner-title"><span className="scanner-dot green" /><span>ResuMate Scanner Agent</span></div>
              <div className="scanner-actions">
                {scanDone && !toolsRevealing && <button className="scanner-btn" onClick={() => { setScanDone(false); setScanLogs([]); setScanProfiles(null); setScanRunning(false); setToolsReady(false); setToolsRevealing(false); runScanner(focusCandidate.id); }}>↻ Re-scan</button>}
              </div>
            </div>
            <div className="scanner-body">
              {scanLogs.map((log, i) => (
                <div key={i} className={`scanner-log ${log.status || ''}`}>
                  <span className="scanner-prefix">{log.status === 'success' ? '✓' : log.status === 'error' ? '✗' : log.status === 'warning' ? '⚠' : '›'}</span>
                  <span>{log.msg}</span>
                </div>
              ))}
              {scanRunning && <div className="scanner-log blink"><span className="scanner-prefix">›</span><span>Processing...</span></div>}
            </div>
            {scanDone && scanProfiles && (
              <div className="scanner-results">
                {scanProfiles.github && (<div className="scanner-result-card"><Github size={16} /><div><strong>{scanProfiles.github.name || scanProfiles.github.username}</strong><span>{scanProfiles.github.public_repos} repos · {scanProfiles.github.followers} followers</span></div><a href={scanProfiles.github.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a></div>)}
                {scanProfiles.linkedin && (<div className="scanner-result-card"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg><div><strong>{scanProfiles.linkedin.name || scanProfiles.linkedin.username}</strong><span>{scanProfiles.linkedin.headline || scanProfiles.linkedin.note || ''}</span></div><a href={scanProfiles.linkedin.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a></div>)}
                {scanProfiles.portfolio && (<div className="scanner-result-card"><Globe size={16} /><div><strong>{scanProfiles.portfolio.title || 'Portfolio'}</strong><span>{scanProfiles.portfolio.description || scanProfiles.portfolio.url}</span></div><a href={scanProfiles.portfolio.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a></div>)}
                {scanContact && (scanContact.email || scanContact.phone) && (<div className="scanner-result-card"><Mail size={16} /><div><strong>Contact</strong><span>{[scanContact.email, scanContact.phone].filter(Boolean).join(' · ')}</span></div></div>)}
              </div>
            )}
            {scanSummary && (<div className="scanner-ai-summary"><Brain size={14} /><div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(scanSummary) }} /></div>)}
          </div>
          {toolsRevealing && (<div className="tools-reveal-overlay"><div className="tools-reveal-text"><Zap size={24} /><span>Tools Unlocked</span></div></div>)}
        </div>
      )}

      {/* ═══════ PHASE 2: TOOLS (after scan complete) ═══════ */}
      {toolsReady && (
        <div className="tools-container tools-visible">
          {/* Tabs */}
          <div className="focus-tabs">
            <button className={`focus-tab ${activeTool === 'chat' ? 'active' : ''}`} onClick={() => setActiveTool('chat')}><MessageSquare size={16} /><span>AI Chat</span></button>
            <button className={`focus-tab ${activeTool === 'websearch' ? 'active' : ''}`} onClick={() => setActiveTool('websearch')}><Globe size={16} /><span>Web Search</span></button>
            <button className={`focus-tab ${activeTool === 'agent' ? 'active' : ''}`} onClick={() => setActiveTool('agent')}><UserCheck size={16} /><span>Hiring Agent</span></button>
            <button className={`focus-tab ${activeTool === 'github' ? 'active' : ''}`} onClick={() => { setActiveTool('github'); if (!ghProfile && !ghLoading && !ghError) fetchGitHub(); }}><Github size={16} /><span>GitHub</span></button>
            <button className={`focus-tab ${activeTool === 'calendly' ? 'active' : ''}`} onClick={() => { setActiveTool('calendly'); if (!calData && !calLoading && !calError) fetchCalendly(); }}><Calendar size={16} /><span>Schedule</span></button>
            {agentStep === 'result' && agentResult && !agentResult.error && (
              <>
                <button className={`focus-tab ${activeTool === 'email' ? 'active' : ''}`} onClick={() => setActiveTool('email')}><Mail size={16} /><span>Email</span></button>
                <button className={`focus-tab ${activeTool === 'interview' ? 'active' : ''}`} onClick={() => setActiveTool('interview')} style={interviewCreated ? { color: '#22C55E' } : {}}><Video size={16} /><span>{interviewCreated ? 'Interview ✓' : 'Interview'}</span></button>
              </>
            )}
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
                  <input type="text" className="input focus-search-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleWebSearch(); }} placeholder="Search the web..." />
                  {searchQuery && <button className="focus-search-clear" onClick={() => setSearchQuery('')}><X size={14} /></button>}
                </div>
                <button onClick={() => handleWebSearch()} disabled={!searchQuery.trim() || searchLoading} className="btn btn-primary">
                  {searchLoading ? <Loader size={18} className="spin" /> : <Search size={18} />}<span>Search</span>
                </button>
              </div>
              {searchResults.length === 0 && !searchLoading && (
                <div className="focus-search-suggestions"><p className="focus-search-suggestions-label">Quick searches:</p><div className="focus-search-chips">{getSearchSuggestions().map((s, i) => <button key={i} className="focus-search-chip" onClick={() => { setSearchQuery(s); handleWebSearch(s); }}><Search size={12} /> {s}</button>)}</div></div>
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
              {searchHistory.length > 0 && (<div className="focus-search-history"><p className="focus-search-history-label">Recent searches:</p><div className="focus-search-chips">{searchHistory.map((h, i) => <button key={i} className="focus-search-chip history" onClick={() => { setSearchQuery(h); handleWebSearch(h); }}>{h}</button>)}</div></div>)}
            </div>
          )}

          {/* ════════ HIRING AGENT ════════ */}
          {activeTool === 'agent' && (
            <div className="agent-container">
              <div className="agent-intro"><div className="agent-intro-icon"><UserCheck size={28} /></div><div><h3 className="agent-intro-title">Hiring Manager Agent</h3><p className="agent-intro-desc">I'll evaluate this candidate's fit for your position using resume data, online research, and hiring best practices.</p></div></div>
              {agentStep === 'choose' && (
                <div className="agent-choose">
                  <div className="agent-option glass-card" onClick={() => { setAgentInputMode('jd'); setAgentStep('jd'); }}><div className="agent-option-icon"><FileText size={24} /></div><div><h4>Paste Job Description</h4><p>I'll extract the role, requirements, and evaluate the candidate against it</p></div><ChevronRight size={18} /></div>
                  <div className="agent-option glass-card" onClick={() => { setAgentInputMode('quick'); setAgentStep('quick'); }}><div className="agent-option-icon"><Target size={24} /></div><div><h4>Quick Setup</h4><p>Select role, experience, and level — I'll do the rest</p></div><ChevronRight size={18} /></div>
                </div>
              )}
              {agentStep === 'jd' && (
                <div className="agent-jd">
                  <label className="agent-label">Paste the full Job Description:</label>
                  <textarea className="agent-textarea input" value={jdText} onChange={e => setJdText(e.target.value)} rows={10} placeholder="Paste the complete job description here..." />
                  <div className="agent-actions"><button className="btn btn-ghost" onClick={() => setAgentStep('choose')}>← Back</button><button className="btn btn-primary" onClick={runJDAnalysis} disabled={!jdText.trim() || agentLoading}>{agentLoading ? <Loader size={16} className="spin" /> : <Target size={16} />}<span>Evaluate Candidate</span></button></div>
                </div>
              )}
              {agentStep === 'quick' && (
                <div className="agent-quick">
                  <div className="agent-section"><label className="agent-label"><Target size={14} /> What role are you hiring for?</label><div className="agent-chips">{suggestedRoles.map((r, i) => <button key={i} className={`agent-chip ${selectedRole === r ? 'active' : ''}`} onClick={() => { setSelectedRole(r); setCustomRole(''); }}>{r}</button>)}<button className={`agent-chip ${selectedRole === 'other' ? 'active' : ''}`} onClick={() => setSelectedRole('other')}>Other...</button></div>{selectedRole === 'other' && <input type="text" className="input agent-input" value={customRole} onChange={e => setCustomRole(e.target.value)} placeholder="Enter the role title..." />}</div>
                  <div className="agent-section"><label className="agent-label"><Briefcase size={14} /> Required experience:</label><div className="agent-chips">{['0-1 years', '1-3 years', '3-5 years', '5-8 years', '8+ years'].map(exp => <button key={exp} className={`agent-chip ${selectedExperience === exp ? 'active' : ''}`} onClick={() => setSelectedExperience(exp)}>{exp}</button>)}</div></div>
                  <div className="agent-section"><label className="agent-label"><Award size={14} /> Seniority level:</label><div className="agent-chips">{['Intern', 'Junior', 'Mid-Level', 'Senior', 'Lead / Principal'].map(lvl => <button key={lvl} className={`agent-chip ${selectedLevel === lvl ? 'active' : ''}`} onClick={() => setSelectedLevel(lvl)}>{lvl}</button>)}</div></div>
                  <div className="agent-actions"><button className="btn btn-ghost" onClick={() => setAgentStep('choose')}>← Back</button><button className="btn btn-primary" onClick={runHiringAgent} disabled={agentLoading}>{agentLoading ? <Loader size={16} className="spin" /> : <Target size={16} />}<span>Evaluate Candidate</span></button></div>
                </div>
              )}
              {agentStep === 'loading' && (<div className="agent-loading"><Loader size={36} className="spin" /><h3>Evaluating candidate...</h3><div className="agent-loading-steps"><p className="agent-step-item active">📄 Analyzing resume data...</p><p className="agent-step-item">🔍 Searching online presence...</p><p className="agent-step-item">🎯 Matching against requirements...</p><p className="agent-step-item">📊 Generating fit report...</p></div></div>)}
              {agentStep === 'result' && agentResult && (
                <div className="agent-result" ref={agentResultRef}>
                  {agentResult.error ? (<div className="agent-error glass-card"><AlertCircle size={24} /><p>{agentResult.error}</p></div>) : (
                    <>
                      <div className="agent-report"><div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(agentResult.report || '') }} /></div>
                      <div className="agent-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={resetAgent}>← Start Over</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setActiveTool('chat')}><MessageSquare size={14} /> Discuss</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════ EMAIL (separate page) ════════ */}
          {activeTool === 'email' && (
            <div style={{ padding: '20px', maxWidth: '640px' }}>
              <div className="glass-card" style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--surface-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '15px' }}><Mail size={18} /> Email {anonymize ? 'Candidate' : (focusCandidate?.name?.split(' ')[0] || 'Candidate')}</div>
                  {emailType && <button className="btn btn-ghost btn-sm" onClick={copyEmail}>{emailCopied ? <Check size={14} /> : <Clipboard size={14} />} {emailCopied ? 'Copied' : 'Copy'}</button>}
                </div>

                {!emailType && !emailDrafting && (
                  <div style={{ padding: '24px' }}>
                    <p style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '16px' }}>Choose the type of email to draft:</p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {[['interest', '📩 Express Interest'], ['interview', '📅 Interview Invite'], ['offer', '🎉 Job Offer'], ['pass', '🙏 Polite Pass'], ['followup', '🔄 Follow-up']].map(([type, label]) => (
                        <button key={type} className="btn btn-secondary" onClick={() => draftEmail(type)} style={{ padding: '10px 16px' }}>{label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {emailDrafting && (
                  <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text3)' }}>
                    <Loader size={24} className="spin" />
                    <p style={{ marginTop: '12px' }}>AI is drafting your email...</p>
                  </div>
                )}

                {emailType && !emailDrafting && (
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>To</label>
                      <input type="email" className="input" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="candidate@email.com" style={{ padding: '10px 14px' }} />
                    </div>
                    {!showCcBcc && <button style={{ fontSize: '12px', color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '0' }} onClick={() => setShowCcBcc(true)}>+ Cc / Bcc</button>}
                    {showCcBcc && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Cc</label><input type="text" className="input" value={emailCc} onChange={e => setEmailCc(e.target.value)} style={{ padding: '10px 14px' }} /></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Bcc</label><input type="text" className="input" value={emailBcc} onChange={e => setEmailBcc(e.target.value)} style={{ padding: '10px 14px' }} /></div>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Subject</label>
                      <input type="text" className="input" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{ padding: '10px 14px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Body</label>
                      <textarea className="input" value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={12} style={{ padding: '12px 14px', resize: 'vertical', lineHeight: '1.6' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEmailType(''); setEmailBody(''); setEmailSubject(''); }}>New Draft</button>
                      <button className="btn btn-secondary btn-sm" onClick={openInGmail}>Open in Gmail</button>
                      <button className="btn btn-secondary btn-sm" onClick={openInOutlook}>Open in Outlook</button>
                      <button className="btn btn-secondary btn-sm" onClick={openMailto}>Default Mail</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ INTERVIEW CREATOR (separate page) ════════ */}
          {activeTool === 'interview' && (
            <div style={{ padding: '20px', maxWidth: '540px' }}>
              {interviewCreated ? (
                <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                  <Check size={40} style={{ color: '#22C55E', marginBottom: '14px' }} />
                  <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Interview Created!</h3>
                  <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '4px' }}>Candidate can now login with:</p>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--info)', marginBottom: '12px' }}>{interviewEmail}</p>
                  <p style={{ color: 'var(--text3)', fontSize: '13px' }}>{interviewRole || focusCandidate?.predicted_role || 'General'} · {interviewNumQuestions} questions</p>
                  {interviewFocusAreas && <p style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '4px' }}>Focus: {interviewFocusAreas}</p>}
                </div>
              ) : (
                <div className="glass-card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '15px' }}>
                    <Video size={18} /> Create AI Interview
                  </div>
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Candidate Email *</label>
                      <input type="email" className="input" value={interviewEmail} onChange={e => setInterviewEmail(e.target.value)} placeholder="candidate@email.com" style={{ padding: '11px 14px' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Role</label>
                        <input type="text" className="input" value={interviewRole || selectedRole || focusCandidate?.predicted_role || ''} onChange={e => setInterviewRole(e.target.value)} placeholder="ML Engineer" style={{ padding: '11px 14px' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Number of Questions</label>
                        <select className="input" value={interviewNumQuestions} onChange={e => setInterviewNumQuestions(e.target.value)} style={{ padding: '11px 14px' }}>
                          <option value="5">5 questions</option><option value="8">8 questions</option><option value="10">10 questions</option><option value="15">15 questions</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text3)' }}>Focus Areas</label>
                      <input type="text" className="input" value={interviewFocusAreas} onChange={e => setInterviewFocusAreas(e.target.value)} placeholder="System Design, Python, Leadership (comma-separated)" style={{ padding: '11px 14px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                      <button className="btn btn-primary" onClick={createInterview} disabled={!interviewEmail.trim() || interviewCreating} style={{ background: 'rgba(139,92,246,0.9)', padding: '12px 24px' }}>
                        {interviewCreating ? <Loader size={16} className="spin" /> : <Video size={16} />}
                        <span>{interviewCreating ? 'Creating...' : 'Create Interview & Grant Access'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════ GITHUB ════════ */}
          {activeTool === 'github' && (
            <div className="tool-panel">
              <div className="gh-search-bar glass-card"><Github size={18} /><input type="text" className="input gh-search-input" value={ghUsername} onChange={e => setGhUsername(e.target.value)} placeholder="Enter GitHub username..." onKeyDown={e => { if (e.key === 'Enter' && ghUsername.trim()) fetchGitHub(ghUsername.trim()); }} /><button className="btn btn-primary btn-sm" onClick={() => fetchGitHub(ghUsername.trim())} disabled={!ghUsername.trim() || ghLoading}>{ghLoading ? <Loader size={14} className="spin" /> : <Search size={14} />}<span>Analyze</span></button></div>
              {ghLoading && <div className="tool-loading"><Loader size={28} className="spin" /><p>Fetching GitHub profile...</p></div>}
              {ghNeedsInput && !ghProfile && (<div className="tool-input-section glass-card"><h3><Github size={20} /> GitHub Profile Analyzer</h3><p>Could not auto-detect username from resume. Enter a GitHub username above to analyze.</p></div>)}
              {ghError && !ghNeedsInput && <div className="tool-error glass-card"><AlertCircle size={20} /><p>{ghError}</p><button className="btn btn-secondary" onClick={() => { setGhNeedsInput(true); setGhError(''); setGhUsername(''); }}>Try Another Username</button></div>}
              {ghProfile && (
                <div className="gh-profile">
                  <div className="gh-header glass-card"><img src={ghProfile.avatar_url} alt="" className="gh-avatar" /><div className="gh-info"><h3>{ghProfile.name || ghProfile.username}</h3><a href={ghProfile.profile_url} target="_blank" rel="noopener noreferrer" className="gh-link">@{ghProfile.username} <ExternalLink size={12} /></a>{ghProfile.bio && <p className="gh-bio">{ghProfile.bio}</p>}</div><div className="gh-stats"><div className="gh-stat"><span className="gh-stat-val">{ghProfile.public_repos}</span><span className="gh-stat-label">Repos</span></div><div className="gh-stat"><span className="gh-stat-val">{ghProfile.followers}</span><span className="gh-stat-label">Followers</span></div><div className="gh-stat"><span className="gh-stat-val">{ghProfile.recent_pushes}</span><span className="gh-stat-label">Recent Pushes</span></div></div></div>
                  {ghProfile.ai_analysis && <div className="tool-ai-analysis glass-card"><Brain size={16} /><div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(ghProfile.ai_analysis) }} /></div>}
                  {Object.keys(ghProfile.languages || {}).length > 0 && (<div className="gh-languages glass-card"><h4>Languages</h4><div className="gh-lang-chips">{Object.entries(ghProfile.languages).map(([lang, count]) => <span key={lang} className="agent-chip active">{lang} ({count})</span>)}</div></div>)}
                  {ghProfile.top_repos?.length > 0 && (<div className="gh-repos"><h4>Top Repositories</h4>{ghProfile.top_repos.map((repo, i) => (<div key={i} className="gh-repo glass-card"><div className="gh-repo-header"><a href={repo.url} target="_blank" rel="noopener noreferrer">{repo.name} <ExternalLink size={12} /></a><span className="badge badge-blue">{repo.language}</span></div><p className="gh-repo-desc">{repo.description}</p><div className="gh-repo-stats"><span>⭐ {repo.stars}</span><span>🍴 {repo.forks}</span><span>Updated: {repo.updated}</span></div></div>))}</div>)}
                </div>
              )}
            </div>
          )}

          {/* ════════ CALENDLY ════════ */}
          {activeTool === 'calendly' && (
            <div className="tool-panel">
              {calLoading && <div className="tool-loading"><Loader size={28} className="spin" /><p>Loading Calendly...</p></div>}
              {calError && <div className="tool-error glass-card"><AlertCircle size={20} /><p>{calError}</p></div>}
              {calData && (
                <div className="cal-container">
                  <div className="cal-header glass-card"><Calendar size={24} /><div><h3>Schedule Interview with {anonymize ? 'Candidate' : focusCandidate.name?.split(' ')[0]}</h3><p>Select an event type to share your scheduling link</p></div></div>
                  {calData.event_types?.length > 0 ? (
                    <div className="cal-events">{calData.event_types.map((ev, i) => (<div key={i} className="cal-event glass-card" onClick={() => window.open(ev.scheduling_url, '_blank')}><div className="cal-event-info"><h4>{ev.name}</h4><p>{ev.duration} minutes{ev.description ? ` — ${ev.description}` : ''}</p></div><div className="cal-event-actions"><button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(ev.scheduling_url); showToast('Link copied!'); }}>Copy Link</button><button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); window.open(ev.scheduling_url, '_blank'); }}>Open <ExternalLink size={12} /></button></div></div>))}</div>
                  ) : (
                    <div className="cal-fallback glass-card"><p>No event types found. Share your main scheduling link:</p><a href={calData.scheduling_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">{calData.scheduling_url} <ExternalLink size={14} /></a></div>
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