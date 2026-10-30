import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  User, ArrowLeft, Briefcase, Award, MapPin,
  Mail, Github, Calendar, Video, MessageSquare, Globe, Target, FileText, ArrowUpRight, Search, Download, Loader, BookOpen, CheckCircle, AlertCircle
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
import ResumeIntelPanel from './focus/ResumeIntelPanel';
import { API_BASE, authFetch, responseError } from '../services/authFetch';
import { toast } from '../services/notify';
import WorkspaceShell from './studio/WorkspaceShell';

export default function CandidateFocus() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { candidates, anonymize, getDisplayName } = useApp();

  // A file opens at once, on the résumé alone; the online lookup waits until
  // the manager asks for it.
  const [phase, setPhase] = useState('select');
  const [focusCandidate, setFocusCandidate] = useState(null);
  const [activeTool, setActiveTool] = useState('overview');
  const [pickerQuery, setPickerQuery] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const selectionVersion = useRef(0);

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
  // Why a search didn't happen (not set up, failed), apart from "no results".
  const [searchError, setSearchError] = useState('');
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

  const candidateName = (candidate) => getDisplayName(candidate, candidates.findIndex(c => c.id === candidate.id));

  // The chat's opening line: what it can draw on, the résumé and whatever a
  // lookup found online.
  const chatIntro = (c, profiles = null, contact = null) => {
    const name = anonymize ? 'this candidate' : (c?.name || 'this candidate');
    let intro = `**A closer look at ${name}.** Here is the information available for our conversation:\n\n`;
    intro += `**Resume** — skills, experience, education\n`;
    if (profiles?.github) intro += `**GitHub** (@${profiles.github.username}) — ${profiles.github.public_repos} repos\n`;
    if (profiles?.linkedin) intro += `**LinkedIn** — ${profiles.linkedin.headline || profiles.linkedin.name || 'Profile found'}\n`;
    if (contact?.email) intro += `**Contact** — ${contact.email}\n`;
    intro += `\nAsk me anything about **${name}** and I'll use all sources to answer.`;
    return { role: 'assistant', content: intro, intro: true };
  };
  const chatSuggestions = (c, profiles = null) => {
    const name = anonymize ? 'this candidate' : (c?.name || 'this candidate');
    return [
      `Summarize everything about ${name}`,
      'What are their strongest skills?',
      'Are they a good fit for a senior role?',
      // Only once there is a GitHub profile to ask about.
      ...(profiles?.github ? ['Tell me about their GitHub projects'] : []),
    ];
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
  // Again after Start Over, which clears them.
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
  }, [focusCandidate, activeTool, suggestedRoles.length]);

  useEffect(() => {
    if (agentResult && agentResultRef.current) {
      agentResultRef.current.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [agentResult]);

  // ─── Scanner ───
  const runScanner = async (candidateId, candidate) => {
    const c = candidate || focusCandidate;
    const version = selectionVersion.current;
    setScanRunning(true);
    setScanLogs([]);
    setScanProfiles(null);
    setScanSummary('');
    setScanContact(null);
    setScanDone(false);

    try {
      const resp = await authFetch(`${API_BASE}/api/chat/scan-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      if (version !== selectionVersion.current) return;
      if (!resp.ok) {
        const message = await responseError(resp, 'The scan failed. Please try again.');
        setScanLogs(prev => [...prev, { step: 'error', msg: message, status: 'error' }]);
        return;
      }
      const data = await resp.json();
      if (version !== selectionVersion.current) return;

      // As they happened, all at once: they arrive with the reply, and were
      // replayed 400 ms apart as if live.
      setScanLogs(data.logs || []);

      const scannedProfiles = data.profiles || null;
      const scannedSummary = data.ai_summary || '';
      const scannedContact = data.contact || null;

      setScanProfiles(scannedProfiles);
      setScanSummary(scannedSummary);
      setScanContact(scannedContact);

      // The opening line names what was found too; the rest of the
      // conversation stays as it was.
      chat.setMessages(prev => (prev[0]?.intro ? [chatIntro(c, scannedProfiles, scannedContact), ...prev.slice(1)] : prev));
      chat.setSuggestions(chatSuggestions(c, scannedProfiles));

    } catch (_) {
      if (version !== selectionVersion.current) return;
      setScanLogs(prev => [...prev, { step: 'error', msg: 'Scanner failed to connect', status: 'error' }]);
    } finally {
      if (version === selectionVersion.current) {
        setScanRunning(false);
        setScanDone(true);
      }
    }
  };

  // Opening a file clears the last one's state and puts this one's back if it
  // was open before. Nobody is looked up online here: opening a file used to
  // search the web for the person by name straight away.
  const handleCandidateSelect = (candidate) => {
    voice.stopSpeaking();
    selectionVersion.current += 1;
    setFocusCandidate(candidate);
    setActiveTool('overview');
    setPhase('tools');
    setFileError('');
    setFileBusy(false);
    resetAgent();
    chat.setMessages([]);
    chat.setSuggestions([]);
    chat.setChatInput('');
    setSearchQuery(''); setSearchResults([]); setSearchHistory([]); setSearchError(''); setSearchLoading(false);
    setGhProfile(null); setGhError(''); setGhUsername(''); setGhNeedsInput(false); setGhLoading(false);
    setCalData(null); setCalError(''); setCalLoading(false);
    // Also a lookup still running for the last file: its answer is dropped.
    setScanLogs([]); setScanProfiles(null); setScanSummary(''); setScanContact(null); setScanDone(false); setScanRunning(false);
    setSearchParams({ candidate: String(candidate.id) }, { replace: true });
    const cached = restoreFromCache(candidate.id);
    if (cached) {
      setScanProfiles(cached.scanProfiles || null);
      setScanSummary(cached.scanSummary || '');
      setScanContact(cached.scanContact || null);
      setScanLogs(cached.scanLogs || []);
      setScanDone(Boolean(cached.scanDone));
      chat.setMessages(cached.messages || []);
      chat.setSuggestions(cached.suggestions || []);
      setSearchResults(cached.searchResults || []);
      setSearchHistory(cached.searchHistory || []);
    } else {
      chat.setMessages([chatIntro(candidate)]);
      chat.setSuggestions(chatSuggestions(candidate));
    }
  };

  const requestedCandidate = searchParams.get('candidate');
  useEffect(() => {
    const person = candidates.find(c => String(c.id) === requestedCandidate);
    if (person && String(focusCandidate?.id) !== requestedCandidate) handleCandidateSelect(person);
    // Selection resets the file once, including when the candidate list loads later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCandidate, candidates]);

  useEffect(() => () => { selectionVersion.current += 1; }, []);

  const handleBack = () => {
    voice.stopSpeaking();
    selectionVersion.current += 1;
    if (focusCandidate) {
      saveToCache(focusCandidate.id, {
        scanProfiles, scanSummary, scanContact, scanLogs, scanDone,
        messages: chat.messages, suggestions: chat.suggestions,
        searchResults, searchHistory,
      });
    }
    setSearchParams({}, { replace: true });
    setFocusCandidate(null);
    setPhase('select');
  };

  const openOriginalResume = async () => {
    if (!focusCandidate || fileBusy) return;
    const version = selectionVersion.current;
    setFileBusy(true); setFileError('');
    try {
      const response = await authFetch(`${API_BASE}/api/candidates/${focusCandidate.id}/file`);
      if (version !== selectionVersion.current) return;
      if (response.status === 404) {
        setFileError('The original file is not available. The extracted résumé text is shown below.');
        return;
      }
      if (!response.ok) throw new Error(await responseError(response, 'Could not retrieve the original résumé.'));
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        const url = new URL(data.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The file link is unavailable.');
        if (version === selectionVersion.current) window.open(url.href, '_blank', 'noopener,noreferrer');
      } else {
        const blob = await response.blob();
        if (version !== selectionVersion.current) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = focusCandidate.file_name || 'resume';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (version === selectionVersion.current) setFileError(error.message || 'The original file could not be retrieved.');
    } finally {
      if (version === selectionVersion.current) setFileBusy(false);
    }
  };

  // ─── Web Search ───
  const handleWebSearch = async (query) => {
    const q = query || searchQuery.trim();
    if (!q || searchLoading) return;
    const version = selectionVersion.current;
    setSearchLoading(true);
    setSearchError('');
    setSearchHistory(prev => [q, ...prev.filter(h => h !== q)].slice(0, 10));
    try {
      const response = await authFetch(`${API_BASE}/api/chat/web-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, candidate_id: focusCandidate?.id, candidate_name: anonymize ? null : focusCandidate?.name }),
      });
      if (version !== selectionVersion.current) return;
      if (!response.ok) {
        setSearchResults([]);
        setSearchError(await responseError(response, 'The web search failed. Please try again.'));
        return;
      }
      const data = await response.json();
      if (version !== selectionVersion.current) return;
      setSearchResults(data.results || []);
      if (data.error) setSearchError(data.error);
    } catch {
      if (version !== selectionVersion.current) return;
      // An error, not a result card counted as "Found 1 result".
      setSearchResults([]);
      setSearchError('Could not reach the server to search. Please try again.');
    } finally {
      if (version === selectionVersion.current) setSearchLoading(false);
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
    const version = selectionVersion.current;
    setGhLoading(true); setGhError(''); setGhProfile(null); setGhNeedsInput(false);
    try {
      const resp = await authFetch(`${API_BASE}/api/chat/github-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: focusCandidate.id, candidate_data: getCandidatePayload(), github_username: username || null, anonymize }),
      });
      if (version !== selectionVersion.current) return;
      // A failed reply's error is an object; shown as is, it crashed the page.
      if (!resp.ok) { setGhError(await responseError(resp, 'GitHub analysis failed. Please try again.')); return; }
      const data = await resp.json();
      if (version !== selectionVersion.current) return;
      if (data.error) { setGhError(data.error); if (data.needs_username) setGhNeedsInput(true); }
      else setGhProfile(data.profile);
    } catch { if (version === selectionVersion.current) setGhError('Failed to connect to server'); }
    finally { if (version === selectionVersion.current) setGhLoading(false); }
  };

  // ─── Calendly ───
  const fetchCalendly = async () => {
    const version = selectionVersion.current;
    setCalLoading(true); setCalError(''); setCalData(null);
    try {
      const resp = await authFetch(`${API_BASE}/api/chat/calendly-link`);
      if (version !== selectionVersion.current) return;
      if (!resp.ok) { setCalError(await responseError(resp, 'Could not reach Calendly. Please try again.')); return; }
      const data = await resp.json();
      if (version !== selectionVersion.current) return;
      if (data.error) setCalError(data.error);
      else setCalData(data);
    } catch { if (version === selectionVersion.current) setCalError('Failed to connect to server'); }
    finally { if (version === selectionVersion.current) setCalLoading(false); }
  };

  // ─── Hiring Agent ───
  const runHiringAgent = async () => {
    const version = selectionVersion.current;
    const role = selectedRole === 'other' ? customRole : selectedRole;
    if (!role) { toast('Please select or enter a role', 'error'); return; }
    if (!selectedExperience) { toast('Please select experience level', 'error'); return; }
    if (!selectedLevel) { toast('Please select seniority level', 'error'); return; }
    setAgentLoading(true); setAgentStep('loading'); setAgentResult(null);
    try {
      const response = await authFetch(`${API_BASE}/api/chat/hiring-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: focusCandidate.id, candidate_data: getCandidatePayload(), role, experience_required: selectedExperience, level: selectedLevel, job_description: jdText || null, anonymize }),
      });
      if (version !== selectionVersion.current) return;
      if (!response.ok) {
        setAgentResult({ error: await responseError(response, 'The evaluation failed. Please try again.') }); setAgentStep('result');
        return;
      }
      const data = await response.json();
      if (version !== selectionVersion.current) return;
      setAgentResult(data); setAgentStep('result');
    } catch { if (version === selectionVersion.current) { setAgentResult({ error: 'Could not reach the server.' }); setAgentStep('result'); } }
    finally { if (version === selectionVersion.current) setAgentLoading(false); }
  };

  const runJDAnalysis = async () => {
    const version = selectionVersion.current;
    if (!jdText.trim()) { toast('Please paste a job description', 'error'); return; }
    setAgentLoading(true); setAgentStep('loading');
    try {
      const response = await authFetch(`${API_BASE}/api/chat/hiring-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: focusCandidate.id, candidate_data: getCandidatePayload(), job_description: jdText, role: null, experience_required: null, level: null, anonymize }),
      });
      if (version !== selectionVersion.current) return;
      if (!response.ok) {
        setAgentResult({ error: await responseError(response, 'The analysis failed. Please try again.') }); setAgentStep('result');
        return;
      }
      const data = await response.json();
      if (version !== selectionVersion.current) return;
      setAgentResult(data); setAgentStep('result');
    } catch { if (version === selectionVersion.current) { setAgentResult({ error: 'Could not reach the server.' }); setAgentStep('result'); } }
    finally { if (version === selectionVersion.current) setAgentLoading(false); }
  };

  const skillLabel = (skill) => typeof skill === 'string' ? skill : skill?.name || '';
  const readable = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const goTool = (tool) => {
    setActiveTool(tool);
    if (tool === 'github' && !ghProfile && !ghLoading && !ghError) fetchGitHub('');
    if (tool === 'calendly' && !calData && !calLoading && !calError) fetchCalendly();
  };
  const filteredCandidates = candidates.filter(candidate => {
    const query = pickerQuery.trim().toLowerCase();
    return !query || [candidateName(candidate), candidate.predicted_role, ...getSkills(candidate).map(skillLabel)].join(' ').toLowerCase().includes(query);
  });

  if (phase === 'select' || !focusCandidate) {
    return (
      <WorkspaceShell active="candidates" eyebrow="THE CANDIDATE FILE" title="A closer look." subtitle="Behind every résumé, a person worth understanding.">
        <div className="studio-focus studio-focus-picker">
          <div className="sf-picker-intro">
            <div><span className="sf-kicker">YOUR PEOPLE, IN PERSPECTIVE</span><h2>Open a file. See the whole story.</h2><p>Bring their experience, research and next conversation together in one place.</p></div>
            <div className="sf-file-illustration" aria-hidden="true"><FileText size={44} strokeWidth={1} /><span>THE PERSON<br />BEHIND THE PAPER.</span><i /></div>
          </div>
          <div className="sf-picker-toolbar">
            <p><strong>{filteredCandidates.length}</strong> candidate {filteredCandidates.length === 1 ? 'file' : 'files'}</p>
            <label className="sf-search"><Search size={17} /><input aria-label="Find a candidate file" placeholder="Search name, role or skill" value={pickerQuery} onChange={event => setPickerQuery(event.target.value)} /></label>
          </div>
          {filteredCandidates.length > 0 ? (
            <div className="sf-people-grid">
              {filteredCandidates.map((candidate, index) => (
                <article className="sf-person-card" key={candidate.id}>
                  <div className="sf-person-top"><span className="sf-file-number">FILE {String(candidate.id).padStart(3, '0')}</span><span className={`sf-person-mark sf-mark-${index % 3}`} aria-hidden="true">{anonymize ? <User size={20} /> : (candidate.name || '?').split(' ').filter(Boolean).map(word => word[0]).slice(0, 2).join('')}</span></div>
                  <h3>{candidateName(candidate)}</h3><p className="sf-person-role">{candidate.predicted_role || 'Role not specified'}</p>
                  <p className="sf-person-detail"><Briefcase size={14} />{candidate.total_experience_years != null ? `${candidate.total_experience_years} years of experience` : 'Experience not specified'}</p>
                  <div className="sf-skills">{getSkills(candidate).slice(0, 4).map((skill, i) => <span key={i}>{skillLabel(skill)}</span>)}{!getSkills(candidate).length && <span>No skills extracted yet</span>}</div>
                  <button className="sf-person-open" aria-label={`Open file for ${candidateName(candidate)}`} onClick={() => handleCandidateSelect(candidate)}><span>Open file</span><ArrowUpRight size={18} /></button>
                </article>
              ))}
            </div>
          ) : (
            <div className="sf-empty"><FileText size={34} strokeWidth={1.3} /><h3>{pickerQuery ? 'No matching files.' : 'Your next great hire starts here.'}</h3><p>{pickerQuery ? 'Try another name, role or skill.' : 'Upload a résumé to bring a candidate into your workspace.'}</p>{pickerQuery ? <button className="sf-button" onClick={() => setPickerQuery('')}>Clear search</button> : <Link className="sf-button sf-button-primary" to="/hiring?view=upload">Add candidates <ArrowUpRight size={16} /></Link>}</div>
          )}
        </div>
      </WorkspaceShell>
    );
  }

  const displayName = candidateName(focusCandidate);
  const hasEvaluation = agentStep === 'result' && agentResult && !agentResult.error;
  const activeSection = ['websearch', 'github'].includes(activeTool) ? 'research' : ['agent', 'resume-intel'].includes(activeTool) ? 'evaluation' : ['interview', 'calendly'].includes(activeTool) ? 'interviews' : activeTool;
  const sectionTabs = [
    { id: 'overview', label: 'Overview', icon: User, tool: 'overview' },
    { id: 'resume', label: 'Résumé', icon: FileText, tool: 'resume' },
    { id: 'research', label: 'Research', icon: Globe, tool: 'websearch' },
    { id: 'evaluation', label: 'Evaluation', icon: Target, tool: 'agent' },
    { id: 'interviews', label: 'Interviews', icon: Calendar, tool: 'interview' },
  ];
  const exportEvaluation = () => {
    const url = URL.createObjectURL(new Blob([agentResult.report || ''], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `candidate-${focusCandidate.id}-evaluation.md`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <WorkspaceShell active="candidates" eyebrow="PEOPLE IN PERSPECTIVE" title="The candidate file." actions={<button className="btn btn-secondary" onClick={handleBack}><ArrowLeft size={16} /> All candidate files</button>}>
      <div className="studio-focus sf-file-open">
        <div className="sf-file-cover">
        <header className="sf-identity">
          <div className="sf-identity-main">
            <div className="sf-identity-mark" aria-hidden="true">{anonymize ? <User size={30} /> : (focusCandidate.name || '?').split(' ').filter(Boolean).map(word => word[0]).slice(0, 2).join('')}<span /></div>
            <div><span className="sf-kicker">CANDIDATE / {String(focusCandidate.id).padStart(3, '0')}</span><h2>{displayName}</h2><p>{focusCandidate.predicted_role || 'Role not specified'}</p></div>
          </div>
          <dl className="sf-facts">
            <div><dt><Briefcase size={14} /> Experience</dt><dd>{focusCandidate.total_experience_years != null ? `${focusCandidate.total_experience_years} years` : 'Not specified'}</dd></div>
            <div><dt><Award size={14} /> Level</dt><dd>{focusCandidate.experience_level || 'Not specified'}</dd></div>
            <div><dt><MapPin size={14} /> Location</dt><dd>{anonymize ? 'Hidden' : focusCandidate.location || 'Not specified'}</dd></div>
          </dl>
        </header>
        <div className="sf-action-row">
          <button className={`sf-button ${activeTool === 'chat' ? 'sf-button-primary' : ''}`} onClick={() => goTool('chat')}><MessageSquare size={16} /> Discuss candidate</button>
          <button className={`sf-button ${activeTool === 'email' ? 'sf-button-primary' : ''}`} onClick={() => goTool('email')} disabled={!hasEvaluation} title={!hasEvaluation ? 'Complete a role evaluation to prepare an email.' : 'Prepare an email draft'}><Mail size={16} /> Draft email</button>
          <button className="sf-button" onClick={() => goTool('interview')} disabled={!hasEvaluation} title={!hasEvaluation ? 'Complete a role evaluation to create an interview.' : 'Set up an interview'}><Video size={16} /> Create interview</button>
          {hasEvaluation && agentResult.report && <button className="sf-button sf-export" onClick={exportEvaluation}><Download size={16} /> Export evaluation</button>}
          {!hasEvaluation && <span className="sf-action-note">Evaluate role fit to unlock email & interview setup.</span>}
        </div>
        </div>
        <nav className="sf-file-tabs" aria-label="Candidate file sections">
          {sectionTabs.map(({ id, label, icon: Icon, tool }, index) => <button key={id} onClick={() => goTool(tool)} aria-current={activeSection === id ? 'page' : undefined}><span className="sf-tab-number">0{index + 1}</span><Icon size={16} /><span>{label}</span></button>)}
        </nav>
        <ScannerBar scanLogs={anonymize ? scanLogs.filter(log => log.status === 'error') : scanLogs} scanProfiles={anonymize ? null : scanProfiles} scanSummary={anonymize ? '' : scanSummary} scanContact={anonymize ? null : scanContact} scanRunning={scanRunning} scanDone={scanDone} onLookup={anonymize ? undefined : () => runScanner(focusCandidate.id)} namesHidden={anonymize} />

        {activeTool === 'overview' && (
          <div className="sf-overview-grid">
            <article className="sf-paper sf-profile-story">
              <div className="sf-section-masthead"><span className="sf-kicker">THE PROFILE</span><span className="sf-source-tag"><FileText size={13} /> From the résumé</span></div>
              <h3>More than a résumé.</h3>
              <p className="sf-story-summary">{anonymize ? 'Explore this candidate’s experience and skills with their identity hidden.' : focusCandidate.summary || 'Start with their experience, follow the evidence, and make room for the conversation.'}</p>
              <div className="sf-story-block"><h4>Skills & expertise</h4><div className="sf-skills sf-skills-large">{getSkills(focusCandidate).length ? getSkills(focusCandidate).map((skill, i) => <span key={i}>{skillLabel(skill)}</span>) : <p>No skills were extracted from this file.</p>}</div></div>
              {Array.isArray(focusCandidate.key_strengths) && focusCandidate.key_strengths.length > 0 && <div className="sf-story-block"><h4>Noted strengths</h4><ul className="sf-strengths">{focusCandidate.key_strengths.map((strength, i) => <li key={i}><CheckCircle size={16} /><span>{readable(strength) || readable(strength?.description) || readable(strength?.name)}</span></li>)}</ul></div>}
              <button className="sf-text-link" onClick={() => goTool('resume')}>Read the full résumé <ArrowUpRight size={17} /></button>
            </article>
            <aside className="sf-overview-aside">
              <div className="sf-note"><span className="sf-kicker">THE RIGHT NEXT QUESTION</span><Target size={28} strokeWidth={1.2} /><h3>Great experience.<br />The right fit?</h3><p>Bring a role into the picture. Compare this person’s experience with what your team needs.</p><button className="sf-button sf-button-dark" onClick={() => goTool('agent')}>Evaluate role fit <ArrowUpRight size={17} /></button></div>
              <div className="sf-explore"><h4>Follow the evidence</h4><button onClick={() => goTool('websearch')}><Globe size={17} /><span>Research & public work<small>Look beyond the document</small></span><ArrowUpRight size={16} /></button><button onClick={() => goTool('resume-intel')}><BookOpen size={17} /><span>Résumé intelligence<small>Find what to ask next</small></span><ArrowUpRight size={16} /></button><button onClick={() => goTool('chat')}><MessageSquare size={17} /><span>A second perspective<small>Discuss this candidate</small></span><ArrowUpRight size={16} /></button></div>
            </aside>
          </div>
        )}

        {activeTool === 'resume' && <article className="sf-paper sf-resume-paper"><div className="sf-section-heading"><div><span className="sf-kicker">SOURCE DOCUMENT</span><h3>The résumé, in full.</h3><p>{anonymize ? 'Identity is hidden for this review.' : focusCandidate.file_name || 'Extracted candidate résumé'}</p></div><button className="sf-button" onClick={openOriginalResume} disabled={fileBusy || anonymize}>{fileBusy ? <Loader className="spin" size={16} /> : <Download size={16} />} Original file</button></div><p className="sf-document-note">Original downloads are available when the uploaded file was stored. Extracted text remains available below.</p>{fileError && <div className="sf-notice" role="status"><AlertCircle size={16} />{fileError}</div>}<div className="sf-resume-text">{anonymize ? 'The source text can contain identifying details. Turn off anonymous review to read the original résumé.' : focusCandidate.text || focusCandidate.raw_text || 'No extracted résumé text is available for this candidate.'}</div></article>}

        {activeSection === 'research' && <section className="sf-tool-section"><div className="sf-section-heading"><div><span className="sf-kicker">BEYOND THE RÉSUMÉ</span><h3>A wider perspective.</h3><p>Explore public work and sources that add context to the candidate’s experience.</p></div><Globe className="sf-section-symbol" size={40} strokeWidth={1} /></div><div className="sf-subtabs" role="group" aria-label="Research tools"><button aria-pressed={activeTool === 'websearch'} onClick={() => goTool('websearch')}><Globe size={16} /> Web research</button><button aria-pressed={activeTool === 'github'} onClick={() => goTool('github')}><Github size={16} /> GitHub portfolio</button></div>{activeTool === 'websearch' ? <WebSearchPanel searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchResults={searchResults} searchError={searchError} searchLoading={searchLoading} searchHistory={searchHistory} onSearch={handleWebSearch} getSearchSuggestions={getSearchSuggestions} /> : <GitHubPanel ghUsername={ghUsername} setGhUsername={setGhUsername} ghProfile={ghProfile} ghLoading={ghLoading} ghError={ghError} ghNeedsInput={ghNeedsInput} onFetchGitHub={fetchGitHub} />}</section>}

        {activeSection === 'evaluation' && <section className="sf-tool-section"><div className="sf-section-heading"><div><span className="sf-kicker">MAKE AN INFORMED CALL</span><h3>Evidence meets opportunity.</h3><p>Assess the match to your role, then explore the questions worth asking.</p></div><Target className="sf-section-symbol" size={40} strokeWidth={1} /></div><div className="sf-subtabs" role="group" aria-label="Evaluation tools"><button aria-pressed={activeTool === 'agent'} onClick={() => goTool('agent')}><Target size={16} /> Role fit</button><button aria-pressed={activeTool === 'resume-intel'} onClick={() => goTool('resume-intel')}><BookOpen size={16} /> Résumé intelligence</button></div>{activeTool === 'agent' ? <HiringAgentPanel agentStep={agentStep} setAgentStep={setAgentStep} jdText={jdText} setJdText={setJdText} selectedRole={selectedRole} setSelectedRole={setSelectedRole} customRole={customRole} setCustomRole={setCustomRole} selectedExperience={selectedExperience} setSelectedExperience={setSelectedExperience} selectedLevel={selectedLevel} setSelectedLevel={setSelectedLevel} agentResult={agentResult} agentLoading={agentLoading} suggestedRoles={suggestedRoles} onRunHiringAgent={runHiringAgent} onRunJDAnalysis={runJDAnalysis} onReset={resetAgent} onSwitchToChat={() => goTool('chat')} agentResultRef={agentResultRef} /> : <ResumeIntelPanel key={focusCandidate.id} focusCandidate={focusCandidate} />}</section>}

        {activeSection === 'interviews' && <section className="sf-tool-section"><div className="sf-section-heading"><div><span className="sf-kicker">MAKE ROOM FOR A CONVERSATION</span><h3>The next chapter.</h3><p>Prepare a focused interview or share a time to meet.</p></div><Calendar className="sf-section-symbol" size={40} strokeWidth={1} /></div><div className="sf-subtabs" role="group" aria-label="Interview tools"><button aria-pressed={activeTool === 'interview'} onClick={() => goTool('interview')}><Video size={16} /> Interview setup</button><button aria-pressed={activeTool === 'calendly'} onClick={() => goTool('calendly')}><Calendar size={16} /> Scheduling</button></div>{activeTool === 'calendly' ? <SchedulePanel calData={calData} calLoading={calLoading} calError={calError} anonymize={anonymize} candidateName={focusCandidate.name} /> : hasEvaluation ? <InterviewCreator key={focusCandidate.id} focusCandidate={focusCandidate} selectedRole={selectedRole === 'other' ? customRole : selectedRole} selectedLevel={selectedLevel} selectedExperience={selectedExperience} scanContact={anonymize ? null : scanContact} /> : <div className="sf-empty sf-gated"><Video size={32} strokeWidth={1.2} /><h3>Give the conversation a direction.</h3><p>Complete a role evaluation first, then create an interview with the right context for this candidate.</p><button className="sf-button sf-button-primary" onClick={() => goTool('agent')}>Evaluate role fit <ArrowUpRight size={16} /></button></div>}</section>}

        {activeTool === 'chat' && <section className="sf-tool-section sf-conversation"><div className="sf-section-heading"><div><span className="sf-kicker">A SECOND PERSPECTIVE</span><h3>Let’s talk about the person.</h3><p>Ask about experience, strengths and the questions to explore together.</p></div><MessageSquare className="sf-section-symbol" size={36} strokeWidth={1} /></div><ChatPanel messages={chat.messages} isTyping={chat.isTyping} suggestions={chat.suggestions} chatInput={chat.chatInput} setChatInput={chat.setChatInput} onSend={chat.sendMessage} candidateName={focusCandidate.name} anonymize={anonymize} voice={voice} msgEndRef={chat.msgEndRef} /></section>}
        {activeTool === 'email' && hasEvaluation && <section className="sf-tool-section"><div className="sf-section-heading"><div><span className="sf-kicker">THOUGHTFUL COMMUNICATION</span><h3>Find the right words.</h3><p>Prepare and edit a draft, then open it in your email app to send.</p></div><Mail className="sf-section-symbol" size={36} strokeWidth={1} /></div><EmailComposer key={focusCandidate.id} focusCandidate={focusCandidate} agentResult={agentResult} anonymize={anonymize} getCandidatePayload={getCandidatePayload} /></section>}
      </div>
    </WorkspaceShell>
  );
}
