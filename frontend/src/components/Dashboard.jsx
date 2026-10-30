import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Markdown from './ui/Markdown';
import ConfirmDialog from './ui/ConfirmDialog';
import ATSResultsView from './pipeline/ATSResultsView';
import InterviewReportView from './shared/InterviewReportView';
import { 
  Users, BarChart2, Upload, Check, Sparkles,
  Eye, EyeOff, Briefcase, MapPin, Award, Trash2,
  ChevronLeft, TrendingUp, Send, Bot, FileText, AlertCircle,
  Mic, MicOff, Volume2, Loader, Square, Video, Zap, Search, ArrowUpRight, ArrowRight
} from 'lucide-react';
import { API_BASE, authFetch, responseError } from '../services/authFetch';

// Loaded when opened: Jarvis alone is a large part of the app.
const JarvisAgent = lazy(() => import('./pipeline/JarvisAgent'));
const PipelineWizard = lazy(() => import('./pipeline/PipelineWizard'));
import { toast } from '../services/notify';
import { pressable } from './ui/pressable';
import WorkspaceShell from './studio/WorkspaceShell';
import InterviewHub from './studio/InterviewHub';
import InsightBar from './studio/InsightBar';

const AIAvatar = () => (
  <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
    <Bot size={18} />
  </div>
);

const INTERVIEW_KINDS = { conversational: 'Voice interview', avatar: 'Avatar interview' };

/* The Insights view's interviews: how many are done, for which roles and how
 * recently, and the latest ones, each opening its report. Interviews aren't
 * scored any more, so there are no averages or score bands to show. With names
 * hidden, each person is the name the dashboard gives them. */
function InterviewAnalytics({ candidates = [], anonymize = false, getDisplayName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // The full report existed but a manager could not open one. InterviewReportView
  // is a complete screen -- transcript, credibility, PDF export -- and was
  // mounted only in the candidate portal. The manager's only route to it was
  // asking the voice agent.
  const [openReport, setOpenReport] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await authFetch(`${API_BASE}/api/chat/get-all-interview-results`);
      if (!resp.ok) throw new Error('Interview results could not be loaded.');
      const json = await resp.json();
      setData(json.results || []);
    } catch {
      setError('Interview results could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return (
    <div className="clean-section" style={{ textAlign: 'center', padding: '48px' }}>
      <Loader size={18} className="spin" style={{ color: 'var(--text3)' }} />
      <p style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '10px' }}>Loading interview data...</p>
    </div>
  );

  // A failed load says so: "no completed interviews" would be a claim.
  if (error) return (
    <div className="clean-section" style={{ marginTop: '32px' }}>
      <h3 className="clean-section-title">Interviews</h3>
      <div className="sd-error" role="alert">
        <p>{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={fetchData}>Try again</button>
      </div>
    </div>
  );

  if (!data || data.length === 0) return (
    <div className="clean-section">
      <h3 className="clean-section-title">Interviews</h3>
      <div className="clean-card" style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>No completed interviews yet</p>
      </div>
    </div>
  );

  const nameOf = (d) => {
    if (!anonymize) return d.candidate_name || d.email;
    const email = String(d.email || '').toLowerCase();
    const index = candidates.findIndex(c => [c.email, c.embedded_links?.email].some(e => typeof e === 'string' && e.toLowerCase() === email));
    return index >= 0 && getDisplayName ? getDisplayName(candidates[index], index) : 'Candidate';
  };
  const kindOf = d => INTERVIEW_KINDS[(typeof d.report === 'object' && d.report?.mode) || d.mode] || 'Interview';
  const dateOf = d => (d.timestamp ? new Date(d.timestamp).toLocaleDateString() : '—');

  const total = data.length;
  const roleMap = {};
  data.forEach(d => {
    const role = d.role || 'General';
    roleMap[role] = (roleMap[role] || 0) + 1;
  });
  const roles = Object.entries(roleMap).sort((a, b) => b[1] - a[1]);
  const latest = data.map(d => d.timestamp).filter(Boolean).sort().at(-1);

  // Opening a report replaces the analytics view rather than stacking a modal
  // over it -- a full report inside a dialog is a scroll trap, and this one has
  // a transcript in it.
  if (openReport) {
    const r = typeof openReport.report === 'object' ? openReport.report : {};
    return (
      <div className="clean-section" style={{ marginTop: '32px' }}>
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginBottom: 16 }}
          onClick={() => setOpenReport(null)}
        >
          <ChevronLeft size={14} /> Back to analytics
        </button>
        <InterviewReportView
          viewer="manager"
          report={r}
          candidateId={openReport.candidate_id}
          candidateEmail={openReport.email}
        />
      </div>
    );
  }

  return (
    <>
      <div className="clean-section" style={{ marginTop: '32px' }}>
        <h3 className="clean-section-title">Interviews</h3>
        <div className="clean-stat-grid">
          {[
            { label: 'Completed', value: total, sub: total === 1 ? 'interview' : 'interviews', icon: <Video size={18} /> },
            { label: 'Roles', value: roles.length, sub: roles.length === 1 ? 'role interviewed for' : 'roles interviewed for', icon: <Briefcase size={18} /> },
            { label: 'Most recent', value: latest ? new Date(latest).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—', sub: 'last completed', icon: <TrendingUp size={18} /> },
          ].map(stat => (
            <div key={stat.label} className="clean-stat-card">
              <div className="clean-stat-icon">{stat.icon}</div>
              <div className="clean-stat-value">{stat.value}</div>
              <div className="clean-stat-label">{stat.label}</div>
              <div className="clean-stat-sub">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="clean-two-col">
        <div className="clean-section">
          <h3 className="clean-section-title">By Role</h3>
          <div className="clean-card">
            {roles.slice(0, 6).map(([role, count]) => (
              <div key={role} className="clean-list-row">
                <span className="clean-list-label">{role}</span>
                <span className="clean-pill">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="clean-section">
          <h3 className="clean-section-title">Recent Interviews</h3>
          <div className="clean-card">
            {data.slice(0, 6).map((d, i) => (
              <button key={i} type="button" className="clean-list-row sd-list-button" onClick={() => setOpenReport(d)}>
                <div>
                  <div className="clean-list-primary">{nameOf(d)}</div>
                  <div className="clean-list-secondary">{d.role || 'General'} · {dateOf(d)}</div>
                </div>
                <span className="clean-list-secondary">{kindOf(d)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* The dashboard's views, as the address names them (/hiring?view=…), the
 * workspace section each belongs to, and what the frame says above it. */
const VIEWS = {
  upload: {
    section: 'candidates',
    eyebrow: '01 / THE CANDIDATE COLLECTION',
    title: <>A place for <em>possibility.</em></>,
    subtitle: 'Every résumé is a starting point. Bring your candidates together and get to know the people behind them.',
  },
  screening: {
    section: 'screening',
    eyebrow: '02 / THE ROLE & THE PERSON',
    title: <>Find the <em>right fit.</em></>,
    subtitle: 'One thoughtful brief. A consistent look at every candidate. Your judgment comes next.',
  },
  interviews: {
    section: 'interviews',
    eyebrow: '03 / A REAL CONVERSATION',
    title: <>Beyond the <em>résumé.</em></>,
    subtitle: 'Follow each conversation, from an invitation to the details that matter.',
  },
  analytics: {
    section: 'insights',
    eyebrow: '04 / THE EVIDENCE',
    title: <>The bigger <em>picture.</em></>,
    subtitle: 'See the experience, skills, and interview results behind your hiring decisions.',
  },
  chat: {
    section: 'chat',
    eyebrow: 'A LITTLE HELP, WHEN YOU NEED IT',
    title: <>A second <em>perspective.</em></>,
    subtitle: 'Compare experience, explore strengths, and ask the questions a résumé leaves open.',
  },
};

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

  // The view is in the address, so the workspace's other pages can link to
  // one, and Back goes back to the one before.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('view');
  const tab = Object.keys(VIEWS).includes(requested) ? requested : 'upload';
  const setTab = view => setSearchParams({ view });
  // The Candidates view's search and order. Each card keeps its place in the
  // whole list, which numbers its file and its hidden name.
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateSort, setCandidateSort] = useState('recent');
  const [input, setInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  // Delete All: asking, then deleting. Its own busy flag: the context's
  // `deleting` is also set by a single card's delete, which opened this dialog
  // already showing "Deleting…" before anything was confirmed.
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  // Deleting the account: asked with the password, as the server requires.
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [accountError, setAccountError] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);

  const deleteAccount = async () => {
    setAccountError('');
    setAccountBusy(true);
    try {
      const resp = await authFetch(`${API_BASE}/api/auth/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: accountPassword }),
      });
      if (!resp.ok) {
        setAccountError(await responseError(resp, 'Could not delete the account. Please try again.'));
        return;
      }
      setDeletingAccount(false);
      logoutHiringManager();
      toast('Your account and all its data are deleted.', 'success');
      navigate('/');
    } catch {
      setAccountError('Could not reach the server. Please try again.');
    } finally {
      setAccountBusy(false);
    }
  };
  // Nothing left to delete, as when the list empties while the question is
  // open: drop the question. Kept, it came back by itself with the next upload.
  useEffect(() => {
    if (candidates.length === 0) setConfirmingClearAll(false);
  }, [candidates.length]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(null);
  const [pendingAutoSpeak, setPendingAutoSpeak] = useState(false);
  
  const fileRef = useRef(null);
  const msgEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const resumeCandidates = candidates.filter(c => c.is_resume !== false);
  // Ready to review: a résumé whose analysis didn't fail.
  const readyCount = resumeCandidates.filter(c => !c.analysis_failed).length;
  const query = candidateSearch.toLowerCase().trim();
  const skillNames = c => (c.skills || []).map(s => (typeof s === 'string' ? s : s?.name));
  const visibleCandidates = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate, index }) => [getDisplayName(candidate, index), candidate.predicted_role, ...skillNames(candidate)]
      .join(' ').toLowerCase().includes(query))
    .sort((a, b) => {
      if (candidateSort === 'name') return getDisplayName(a.candidate, a.index).localeCompare(getDisplayName(b.candidate, b.index));
      if (candidateSort === 'experience') return (b.candidate.total_experience_years || 0) - (a.candidate.total_experience_years || 0);
      return a.index - b.index;
    });

  useEffect(() => {
    if (tab === 'chat') initChat();
  }, [tab, initChat]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleUpload = async (files) => {
    for (const file of Array.from(files)) {
      try {
        await uploadResume(file);
      } catch (err) {
        toast(`Failed: ${err.response?.data?.detail || err.message}`, 'error');
      }
    }
  };

  // A made-up person's résumé, to try ResuMate with nothing to upload.
  const loadSample = async () => {
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}sample-resume.pdf`);
      if (!resp.ok) throw new Error(`it isn't available (${resp.status})`);
      const blob = await resp.blob();
      await handleUpload([new File([blob], 'sample-resume.pdf', { type: 'application/pdf' })]);
    } catch (err) {
      toast(`Could not load the sample résumé: ${err.message}`, 'error');
    }
  };

  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null);

  const handleSend = (msg) => {
    const m = msg || input.trim();
    if (m) { 
      setPendingAutoSpeak(false);
      sendMessage(m); 
      setInput(''); 
    }
  };

  const handleVoiceSend = (text) => {
    if (text && text.trim()) {
      setPendingAutoSpeak(true);
      sendMessage(text.trim());
    }
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
      toast('Please allow microphone access to use voice input.', 'error');
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

    const response = await authFetch(`${API_BASE}/api/chat/speech-to-text`, {
      method: 'POST',
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
      throw new Error('Invalid response from server', { cause: parseError });
    }

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.text && data.text.trim()) {
      handleVoiceSend(data.text);
    } else {
      toast('No speech detected. Please try again.', 'info');
    }
  } catch (err) {
    console.error('Transcription error:', err);
    toast('Voice transcription failed: ' + err.message, 'error');
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
      
      const response = await authFetch(`${API_BASE}/api/chat/text-to-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      // A cancelled request is the manager stopping playback, not an error.
      if (err.name !== 'AbortError') console.error('TTS error:', err);
      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(null);
    }
  }, [speakingMsgIndex, stopSpeaking]);

  // Below speakText and stopSpeaking, so these can list them.
  useEffect(() => {
    if (pendingAutoSpeak && messages.length > 0 && !isTyping) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        speakText(lastMsg.content, messages.length - 1);
        setPendingAutoSpeak(false);
      }
    }
  }, [messages, isTyping, pendingAutoSpeak, speakText]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  const handleClearChat = () => {
    stopSpeaking();
    clearChat();
    setPendingAutoSpeak(false);
  };

  const view = VIEWS[tab];
  return (
    <WorkspaceShell
      active={view.section}
      eyebrow={view.eyebrow}
      title={view.title}
      subtitle={view.subtitle}
      onNavigate={setTab}
      onChat={() => setTab('chat')}
      onAssistant={() => setShowPipeline(true)}
      actions={(
        <button type="button" role="switch" aria-checked={anonymize} className="sw-switch" onClick={() => setAnonymize(!anonymize)}>
          {anonymize ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          Hide names
          <span className="sw-switch-track" aria-hidden="true"><span className="sw-switch-knob" /></span>
        </button>
      )}
      footer={hiringManager && (
        <div className="sw-account">
          <section>
            <strong>{hiringManager.name}</strong>
            <small>{hiringManager.company || hiringManager.email}</small>
          </section>
          <div>
            <button type="button" onClick={() => { logoutHiringManager(); navigate('/hiring/login'); }}>Sign Out</button>
            <button type="button" onClick={() => { setAccountPassword(''); setAccountError(''); setDeletingAccount(true); }}>Delete account</button>
          </div>
        </div>
      )}
    >
      <ConfirmDialog
        open={deletingAccount}
        title="Delete your account?"
        confirmLabel="Delete account"
        busy={accountBusy}
        onConfirm={deleteAccount}
        onCancel={() => setDeletingAccount(false)}
      >
        <p style={{ marginBottom: 12 }}>
          This deletes your account and everything in it: candidates, interviews and reports,
          searches and chats. It can't be undone.
        </p>
        <label htmlFor="delete-account-password" style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Your password</label>
        <input
          id="delete-account-password"
          type="password"
          autoComplete="current-password"
          className="input"
          value={accountPassword}
          onChange={e => setAccountPassword(e.target.value)}
          style={{ width: '100%' }}
        />
        {accountError && <p role="alert" style={{ color: 'var(--color-critical)', fontSize: 13, marginTop: 8 }}>{accountError}</p>}
      </ConfirmDialog>

      {/* Jarvis opens over any view, from the sidebar. */}
      {showPipeline && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      <div className="studio-dashboard">
          {/* UPLOAD TAB */}
          {tab === 'upload' && (
            <div className={`upload-tab${candidates.length ? ' has-candidates' : ''}`}>
              <div className="sd-overview">
                {[
                  ['YOUR COLLECTION', candidates.length, 'candidate files'],
                  ['READY TO REVIEW', readyCount, 'résumés in the collection'],
                  ['IN YOUR SELECTION', selectedIds.length, 'for screening & comparison'],
                ].map(([label, count, note]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{String(count).padStart(2, '0')}</strong>
                    <small>{note}</small>
                  </div>
                ))}
                <section className="sd-desk-note">
                  <span aria-hidden="true">✳</span>
                  <p>Good people.<br /><em>Great possibilities.</em></p>
                </section>
              </div>

              <div className="card upload-card">
                <div className="card-body">
                  <div
                    className={`upload-zone ${dragActive ? 'active' : ''}`}
                    {...pressable(() => fileRef.current?.click())}
                    onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={e => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
                  >
                    <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
                    <div className="upload-icon"><Upload size={36} /></div>
                    <h3>Drop resumes here or click to upload</h3>
                    <p>PDF, DOCX, TXT • Max 5MB each • No duplicates</p>
                  </div>
                  {candidates.length === 0 && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={loadSample} style={{ marginTop: 12 }}>
                      <FileText size={14} /> No résumés to hand? Try a made-up sample
                    </button>
                  )}

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
                    <h2>The collection <span>{candidates.length}</span></h2>
                    <div className="candidates-actions">
                      {/* One screening action. There used to be two buttons here,
                          side by side, both with a Zap icon: "AutoHire" opened the
                          voice agent, "Rank" ran a different and weaker ranking
                          endpoint. Nothing in either label told you which was which. */}
                      {resumeCandidates.length >= 1 && (
                        <button onClick={() => setTab('screening')} className="btn btn-primary btn-sm">
                          <Zap size={14} /> Screen candidates
                        </button>
                      )}
                      {/* Jarvis opens from the sidebar, on every view. */}
                      <button onClick={selectAll} className="btn btn-secondary btn-sm">Select All</button>
                      <button onClick={clearSelection} className="btn btn-ghost btn-sm">Clear</button>
                      <button onClick={() => setConfirmingClearAll(true)} className="btn btn-danger btn-sm">
                        Delete All
                      </button>
                      <ConfirmDialog
                        open={confirmingClearAll}
                        title={candidates.length === 1 ? 'Delete 1 candidate?' : `Delete all ${candidates.length} candidates?`}
                        confirmLabel={candidates.length === 1 ? 'Delete' : 'Delete all'}
                        busy={clearingAll}
                        onConfirm={async () => {
                          setClearingAll(true);
                          try {
                            await clearAllCandidates();
                          } finally {
                            setClearingAll(false);
                            setConfirmingClearAll(false);
                          }
                        }}
                        onCancel={() => setConfirmingClearAll(false)}
                      >
                        {candidates.length === 1
                          ? "Their résumé, analysis and interviews are deleted for good. This can't be undone."
                          : "Their résumés, analysis and interviews are deleted for good. This can't be undone."}
                      </ConfirmDialog>

                    </div>
                  </div>

                  <div className="sd-filterbar">
                    <label>
                      <Search size={16} aria-hidden="true" />
                      <input
                        type="search"
                        aria-label="Search candidates"
                        placeholder="Search by name, role, or skill"
                        value={candidateSearch}
                        onChange={e => setCandidateSearch(e.target.value)}
                      />
                    </label>
                    <div>
                      <span aria-live="polite">{visibleCandidates.length} {visibleCandidates.length === 1 ? 'file' : 'files'}</span>
                      <select aria-label="Sort candidates" value={candidateSort} onChange={e => setCandidateSort(e.target.value)}>
                        <option value="recent">Original order</option>
                        <option value="name">Name A–Z</option>
                        <option value="experience">Most experience</option>
                      </select>
                    </div>
                  </div>
                  {visibleCandidates.length === 0 && (
                    <div className="sd-no-results">
                      No candidates match “{candidateSearch}”.{' '}
                      <button type="button" onClick={() => setCandidateSearch('')}>Clear search</button>
                    </div>
                  )}

                  <div className="candidates-slider">
                    <div className="slider-track">
                      {visibleCandidates.map(({ candidate: c, index: i }) => (
                        <div
                          key={c.id}
                          className={`candidate-card glass-card ${selectedIds.includes(c.id) ? 'selected' : ''} ${c.is_resume === false ? 'not-resume' : ''}`}
                          onClick={() => toggleSelection(c.id)}
                        >
                          {/* The mouse clicks the card. The keyboard and screen readers get a real
                              checkbox, so the card's details are still read out after it. */}
                          <input type="checkbox" className="sr-only candidate-select"
                            checked={selectedIds.includes(c.id)}
                            onChange={() => toggleSelection(c.id)}
                            onClick={e => e.stopPropagation()}
                            aria-label={`Select ${getDisplayName(c, i)}`} />
                          {c.is_resume === false && (
                            <div className="not-resume-banner">
                              <AlertCircle size={14} /> Not a Resume
                            </div>
                          )}
                          <div className="sd-file-number" aria-hidden="true">CANDIDATE FILE <span>{String(i + 1).padStart(3, '0')}</span></div>
                          <div className="candidate-header">
                            <div className="candidate-avatar" aria-hidden="true">
                              {getDisplayName(c, i)[0]?.toUpperCase()}
                            </div>
                            {selectedIds.includes(c.id) && (
                              <div className="selected-check"><Check size={14} /></div>
                            )}
                            <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteCandidate(c.id); }} aria-label={`Delete ${getDisplayName(c, i)}`}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <h3 className="candidate-name">{getDisplayName(c, i)}</h3>
                          {/* The analysis failed: say so, rather than "Processing..." forever.
                              The same file again is refused as a duplicate, so delete it first. */}
                          <p className="candidate-role">
                            {c.analysis_failed ? "Couldn't analyse this résumé. Delete it and upload it again." : (c.predicted_role || 'Processing...')}
                          </p>
                          
                          <div className="candidate-badges">
                            {c.badges?.slice(0, 3).map((b, j) => (
                              <span key={j} className={`badge badge-${b.color || 'blue'}`}>{b.label}</span>
                            ))}
                          </div>

                          <div className="candidate-stats">
                            <span><Briefcase size={12} /> {c.total_experience_years != null ? `${c.total_experience_years}y` : '—'}</span>
                            <span><Award size={12} /> {c.experience_level || '—'}</span>
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
                          <button
                            type="button"
                            className="sd-open-file"
                            onClick={e => { e.stopPropagation(); navigate(`/hiring/focus?candidate=${c.id}`); }}
                            aria-label={`Open candidate file for ${getDisplayName(c, i)}`}
                          >
                            Open candidate file<ArrowUpRight size={16} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {candidates.length === 0 && !loading && (
                <section className="sd-first-file">
                  <div className="sd-paper-art" aria-hidden="true">
                    <span className="sd-paper-back" />
                    <span className="sd-paper-front">
                      <i /><b>YOUR NEXT<br />GREAT HIRE.</b><em>Starts with a closer look.</em><u /><u /><u />
                    </span>
                    <span className="sd-paper-seal">POSSIBILITY<br />INSIDE</span>
                  </div>
                  <div>
                    <span className="sw-eyebrow">AN OPEN DESK. A FRESH START.</span>
                    <h2>Your next great hire<br />starts <em>here.</em></h2>
                    <p>Add a résumé to begin. We'll gather the details, so you can focus on what makes each person different.</p>
                    <div className="sd-first-steps">
                      <span>01 Gather</span><ArrowRight size={14} aria-hidden="true" />
                      <span>02 Understand</span><ArrowRight size={14} aria-hidden="true" />
                      <span>03 Connect</span>
                    </div>
                    <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                      <Upload size={15} aria-hidden="true" />Upload your first resume
                    </button>
                  </div>
                </section>
              )}
              {loading && candidates.length === 0 && (
                <p role="status" className="sd-loading"><Loader size={18} className="spin" aria-hidden="true" />Opening your candidate collection…</p>
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
                  <Suspense fallback={null}>
                    <PipelineWizard
                      candidateCount={candidates.filter(c => c.is_resume !== false).length}
                      onComplete={data => setPipelineResult(data)}
                    />
                  </Suspense>
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

          {/* INTERVIEWS */}
          {tab === 'interviews' && <InterviewHub candidates={candidates} anonymize={anonymize} getDisplayName={getDisplayName} />}

          {/* ANALYTICS TAB */}
          {tab === 'analytics' && (
            <div className="analytics-tab sd-insights">

              {selectedCandidates.length === 0 ? (
                <div className="clean-empty">
                  <BarChart2 size={32} strokeWidth={1.5} />
                  <h3>No candidates selected</h3>
                  <p>Select candidates in Candidates to see analytics.</p>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => setTab('upload')}>
                    Go to Candidates
                  </button>
                </div>
              ) : (
                <>
                  {/* Overview Stats */}
                  <div className="clean-stat-grid">
                    {[
                      { label: 'Candidates', value: analytics.total, sub: 'selected', icon: <Users size={18} /> },
                      { label: 'Avg Experience', value: analytics.avgExperience === '—' ? '—' : `${analytics.avgExperience}y`, sub: 'years average', icon: <Briefcase size={18} /> },
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
                        // Named by their place in the whole list, as on Candidates,
                        // so a hidden name is the same stand-in everywhere.
                        const name = getDisplayName(c, candidates.findIndex(x => x.id === c.id));
                        return (
                          <div key={c.id} className="clean-exp-row">
                            <div className="clean-exp-info">
                              <div className="avatar-sm" style={{ background: getAvatarGradient(c.name) }}>
                                {name[0]}
                              </div>
                              <div>
                                <div className="clean-exp-name">{name}</div>
                                <div className="clean-exp-role">{c.predicted_role}</div>
                              </div>
                            </div>
                            <div className="clean-exp-bar-area">
                              <InsightBar
                                percent={pct}
                                color="var(--accent)"
                                index={i}
                                detail={`${name} · ${c.total_experience_years || 0} years of experience`}
                              />
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
                        // When every skill has the same count -- which is
                        // always true for a single candidate -- bars are all the
                        // same length and encode nothing. A ranked chip list is
                        // the honest form for that data.
                        analytics.topSkillsAllEqual || analytics.total < 2 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {analytics.topSkills.map(s => (
                              <span key={s.name} className="skill">{s.name}</span>
                            ))}
                          </div>
                        ) : (
                          <div className="clean-bar-chart">
                            {analytics.topSkills.map((s, i) => (
                              <div key={s.name} className="clean-bar-row">
                                <span className="clean-bar-label">{s.name}</span>
                                {/* Scaled to the most common skill, not to the
                                    candidate count. */}
                                <InsightBar
                                  percent={s.barPct}
                                  index={i}
                                  detail={`${s.name} · ${s.count} of ${analytics.total} selected candidates (${s.share}%)`}
                                />
                                <span className="clean-bar-count" title={`${s.share}% of selected candidates`}>
                                  {s.count}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
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

              <InterviewAnalytics candidates={candidates} anonymize={anonymize} getDisplayName={getDisplayName} />
            </div>
          )}

          {/* AI CHAT TAB */}
          {tab === 'chat' && (
            <div className="chat-tab">
              {selectedCandidates.length === 0 ? (
                <div className="empty-state glass-card">
                  <div className="empty-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                    <Bot size={40} />
                  </div>
                  <h3>Select candidates to chat</h3>
                  <p>Select candidates in Candidates to chat about them.</p>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => setTab('upload')}>
                    Go to Candidates
                  </button>
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
                            {selectedCandidates.filter(c => c.is_resume !== false).length} candidates
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

                    {/* Messages: a log, so a screen reader reads each reply as it arrives. */}
                    <div className="chat-messages" role="log" aria-label="Conversation">
                      {messages.map((m, i) => (
                        <div key={i} className={`chat-message ${m.role}`}>
                          {m.role === 'assistant' && <AIAvatar />}
                          <div className={`chat-bubble ${m.role}`}>
                            {m.role === 'user' ? (
                              <p>{m.content}</p>
                            ) : (
                              <Markdown text={m.content} />
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
                        aria-label="Message the AI assistant"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                          if (e.key === 'Escape') setInput('');
                        }}
                        placeholder={isRecording ? 'Listening…' : isTranscribing ? 'Transcribing…' : 'Ask about your selected candidates…'}
                        disabled={isTyping || isRecording || isTranscribing}
                      />
                      
                      <button
                        aria-label="Send"
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

      </div>
    </WorkspaceShell>
  );
}

