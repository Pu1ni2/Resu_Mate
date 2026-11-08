import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { accountAPI, candidatesAPI, chatAPI, messageForApiError } from '../services/api';
import { saveSession, clearSession, readStoredUser, saveStoredUser, clearCandidateCache } from '../services/session';
import { toast } from '../services/notify';
import { computeAnalytics } from './analytics';

// Exported for the design review page (src/review), which fills it with
// sample data; the app itself goes through AppProvider and useApp.
export const AppContext = createContext(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export const AppProvider = ({ children }) => {
  // In memory only. The whole list, résumé text and all, used to be copied to
  // the browser's storage, where it stayed for anyone at this browser after
  // the manager had gone.
  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [loading, setLoading] = useState(false);
  // 'loading' until the server has answered for the list, then 'loaded', or
  // 'failed' when it couldn't be reached: an empty list means no candidates
  // only once it is 'loaded'.
  const [candidatesStatus, setCandidatesStatus] = useState('loading');

  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  // "Hide names", as the account keeps it: the server keeps candidates' names
  // and contact details from the AI by it too. It was the page's alone, and
  // off again after every reload. setAnonymize, below, saves it.
  const [anonymize, setHideNames] = useState(() => Boolean(readStoredUser()?.hide_names));
  const [hideNamesSaving, setHideNamesSaving] = useState(false);
  const savingHideNames = useRef(false);

  // Candidate session (for candidate portal)
  const [candidateSession, setCandidateSession] = useState(() => {
    try {
      const stored = localStorage.getItem('resumate_candidate');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // Hiring manager auth
  const [hiringManager, setHiringManager] = useState(readStoredUser);

  const loginHiringManager = useCallback((token, refreshToken, user) => {
    saveSession(token, refreshToken, user);
    setHiringManager(user);
    setHideNames(Boolean(user?.hide_names));
  }, []);

  /* The signed-in manager's account as the server sent it now, such as once
   * their email is confirmed. Only theirs: another manager may have signed in
   * here meanwhile. */
  const refreshHiringManager = useCallback((user) => {
    if (!user || readStoredUser()?.id !== user.id) return;
    saveStoredUser({ ...readStoredUser(), ...user });
    setHiringManager(prev => ({ ...prev, ...user }));
  }, []);

  // The candidate list request running, if one is, and which signed-in
  // session it's for (loadCandidates).
  const listRequest = useRef(null);
  const listSession = useRef(0);

  const logoutHiringManager = useCallback(() => {
    // Same teardown a 401 performs, so signing out and being signed out cannot
    // drift apart.
    clearSession();
    // A list still coming is the last manager's: the next one asks anew, and
    // it isn't shown.
    listSession.current += 1;
    listRequest.current = null;
    setHiringManager(null);
    setCandidates([]);
    setCandidatesStatus('loading');
    setSelectedIds([]);
    setHideNames(false);
  }, []);

  /* Turn "Hide names" on or off, and keep it on the account. The switch moves
   * at once and waits while it's saved; when the server can't keep it, it
   * moves back and the manager is told. Signed out, it's the page's alone. */
  const setAnonymize = useCallback(async (next) => {
    if (savingHideNames.current) return;
    const value = Boolean(next);
    const user = readStoredUser();
    setHideNames(value);
    if (!user) return;
    savingHideNames.current = true;
    setHideNamesSaving(true);
    try {
      const res = await accountAPI.savePreferences({ hide_names: value });
      const now = readStoredUser();
      if (now?.id === user.id) saveStoredUser({ ...now, ...res?.data });
    } catch (err) {
      // Not once they've gone: the next manager's switch is theirs.
      if (readStoredUser()?.id === user.id) {
        setHideNames(Boolean(user.hide_names));
        toast(messageForApiError(err, 'Could not save "Hide names". Please try again.'), 'error');
      }
    } finally {
      savingHideNames.current = false;
      setHideNamesSaving(false);
    }
  }, []);

  useEffect(() => { clearCandidateCache(); }, []);

  const selectedCandidates = useMemo(
    () => candidates.filter(c => selectedIds.includes(c.id)),
    [candidates, selectedIds]
  );

  const analytics = useMemo(
    () => computeAnalytics(selectedCandidates),
    [selectedCandidates]
  );

  // One request at a time, shared by whoever asks while it runs: the
  // dashboard asks as it opens, and so does this context for a signed-in
  // manager, which downloaded the whole list twice on every page load.
  const loadCandidates = useCallback(() => {
    if (listRequest.current) return listRequest.current;
    const session = listSession.current;
    const current = () => session === listSession.current;
    const request = (async () => {
      setLoading(true);
      setCandidatesStatus('loading');
      try {
        const res = await candidatesAPI.getAll();
        if (!current()) return;
        const list = res?.data?.candidates || [];
        setCandidates(list);
        setCandidatesStatus('loaded');
        if (list.length === 0) setSelectedIds([]);
      } catch (err) {
        if (!current()) return;
        console.warn('loadCandidates: backend fetch failed, keeping the list as it was:', err?.message);
        setCandidatesStatus('failed');
      } finally {
        // Not while the next manager's list is coming.
        if (current() || !listRequest.current) setLoading(false);
      }
    })();
    listRequest.current = request;
    request.finally(() => { if (listRequest.current === request) listRequest.current = null; });
    return request;
  }, []);

  // Whenever a hiring manager is signed in: on mount, for a saved session, and
  // after signing in. Not when their account is refreshed, which is the same
  // manager.
  const managerId = hiringManager?.id ?? null;
  const signedIn = Boolean(hiringManager);
  useEffect(() => {
    if (signedIn) loadCandidates();
  }, [signedIn, managerId, loadCandidates]);

  const uploadResume = useCallback(async (file) => {
    const uploadId = `upload-${Date.now()}`;
    // What is really happening: the file going up, as far as the browser
    // reports it, then the server reading it, which says nothing until it's
    // done. A timer ran a bar up to 90% under "Analyzing...", whatever was
    // happening. Each upload is { stage, percent }.
    const stage = value => setUploadProgress(prev => (uploadId in prev ? { ...prev, [uploadId]: value } : prev));
    setUploadProgress(prev => ({ ...prev, [uploadId]: { stage: 'uploading', percent: 0 } }));

    try {
      const res = await candidatesAPI.upload(file, percent => stage(
        percent !== null && percent >= 100 ? { stage: 'reading', percent: null } : { stage: 'uploading', percent },
      ));
      stage({ stage: 'done', percent: 100 });

      setTimeout(() => {
        setCandidates(prev => {
          // FIX: Remove any existing candidate with same ID to prevent duplicates
          const filtered = prev.filter(c => c.id !== res.data.id);
          return [res.data, ...filtered];
        });
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[uploadId];
          return newProgress;
        });
      }, 500);

      return res.data;
    } catch (err) {
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[uploadId];
        return newProgress;
      });
      throw err;
    }
  }, []);

  const [deleting, setDeleting] = useState(false);

  const deleteCandidate = useCallback(async (id) => {
    setDeleting(true);
    try {
      // Wait for backend to fully delete (hash cleanup)
      await candidatesAPI.delete(id);
      // Small delay to ensure backend state is consistent
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      // A 404 means it is already gone, so it leaves the list. Anything else
      // means it is still there: it used to leave the list anyway, and came
      // back on the next reload.
      if (err?.response?.status !== 404) {
        toast(messageForApiError(err, 'Could not delete the candidate. Please try again.'), 'error');
        setDeleting(false);
        return false;
      }
    }
    // Remove from state
    setCandidates(prev => prev.filter(c => c.id !== id));
    setSelectedIds(prev => prev.filter(x => x !== id));
    setMessages([]);
    setSuggestions([]);
    setDeleting(false);
    return true;
  }, []);

  /* Resolves true once the server has deleted them. On failure the list stays
   * and the manager is told: it used to be emptied either way, so a failed
   * delete looked like a successful one until a reload brought everyone back. */
  const clearAllCandidates = useCallback(async () => {
    setDeleting(true);
    try {
      await candidatesAPI.deleteAll();
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      toast(messageForApiError(err, 'Could not delete the candidates. Please try again.'), 'error');
      setDeleting(false);
      return false;
    }
    setCandidates([]);
    setSelectedIds([]);
    setMessages([]);
    setSuggestions([]);
    setDeleting(false);
    return true;
  }, []);

  // FIX: toggleSelection with strict equality
  const toggleSelection = useCallback((id) => {
    setSelectedIds(prev => {
      const exists = prev.some(x => x === id);
      if (exists) {
        return prev.filter(x => x !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);
  
  // The given candidates, added to the selection: the ones a list shows.
  // Selecting every candidate picked people a search had hidden, and files
  // that aren't résumés, so a bulk invite reached people never seen.
  const selectAll = useCallback((ids) => {
    setSelectedIds(prev => [...new Set([...prev, ...ids])]);
  }, []);
  
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  useEffect(() => {
    setMessages([]);
    setSuggestions([]);
  }, [anonymize]);

  const sendMessage = useCallback(async (message) => {
    if (!message.trim() || selectedCandidates.length === 0) return;

    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsTyping(true);
    setSuggestions([]);

    try {
      const res = await chatAPI.send({
        message,
        candidate_ids: selectedIds,
        conversation_id: 'default',
        anonymize: anonymize
      });

      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
      setSuggestions(res.data.suggestions || []);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Something went wrong';
      setMessages(prev => [...prev, { role: 'assistant', content: `**Error:** ${errorMsg}` }]);
    } finally {
      setIsTyping(false);
    }
  }, [selectedIds, selectedCandidates.length, anonymize]);

  const initChat = useCallback(async () => {
    if (messages.length > 0) return;
    // The conversation so far, which the server keeps. The page started
    // afresh on every visit while the chat remembered, so it answered from
    // things the page no longer showed.
    try {
      const kept = (await chatAPI.history()).data?.messages || [];
      if (kept.length) {
        setMessages(kept);
        setSuggestions([]);
        return;
      }
    } catch (_) {
      // Without it, the greeting below opens the chat as before.
    }
    try {
      const res = await chatAPI.getIntro(selectedCandidates.length, anonymize);
      setMessages([{ role: 'assistant', content: res.data.response }]);
      setSuggestions(res.data.suggestions || []);
    } catch (_) {
      setMessages([{
        role: 'assistant',
        content: '**Welcome to ResuMate!** 👋\n\nUpload resumes and select candidates to get started.'
      }]);
    }
  }, [selectedCandidates.length, messages.length, anonymize]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSuggestions([]);
    chatAPI.clear().catch(() => {});
  }, []);

  const getDisplayName = useCallback((c, i) => {
    if (anonymize) return `Candidate ${i + 1}`;
    return c.name || `Candidate ${i + 1}`;
  }, [anonymize]);

  const getAvatarGradient = useCallback((name) => {
    const gradients = [
      'linear-gradient(135deg, #F59E0B, #D97706)',
      'linear-gradient(135deg, #10B981, #059669)',
      'linear-gradient(135deg, #3B82F6, #2563EB)',
      'linear-gradient(135deg, #8B5CF6, #7C3AED)',
      'linear-gradient(135deg, #EC4899, #DB2777)'
    ];
    const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return gradients[hash % gradients.length];
  }, []);

  return (
    <AppContext.Provider value={{
      candidates, setCandidates, candidatesStatus, selectedIds, selectedCandidates, uploadProgress, loading, deleting,
      loadCandidates, uploadResume, deleteCandidate, clearAllCandidates, toggleSelection, selectAll, clearSelection,
      anonymize, setAnonymize, hideNamesSaving, analytics,
      messages, suggestions, isTyping, sendMessage, initChat, clearChat,
      getDisplayName, getAvatarGradient,
      candidateSession, setCandidateSession,
      hiringManager, loginHiringManager, logoutHiringManager, refreshHiringManager,
    }}>
      {children}
    </AppContext.Provider>
  );
};