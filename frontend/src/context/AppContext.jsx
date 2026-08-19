import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { candidatesAPI, chatAPI } from '../services/api';
import { saveSession, clearSession, readStoredUser } from '../services/session';
import { computeAnalytics } from './analytics';

const AppContext = createContext(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

const getStoredCandidates = () => {
  try {
    const stored = localStorage.getItem('resumate_candidates');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const storeCandidates = (candidates) => {
  try {
    localStorage.setItem('resumate_candidates', JSON.stringify(candidates));
  } catch (e) {
    console.error('Failed to store candidates:', e);
  }
};

export const AppProvider = ({ children }) => {
  const [candidates, setCandidates] = useState(() => getStoredCandidates());
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  const [anonymize, setAnonymize] = useState(false);

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
  }, []);

  const logoutHiringManager = useCallback(() => {
    // Same teardown a 401 performs, so signing out and being signed out cannot
    // drift apart.
    clearSession();
    setHiringManager(null);
    setCandidates([]);
    setSelectedIds([]);
  }, []);

  useEffect(() => {
    storeCandidates(candidates);
  }, [candidates]);

  // Fetch candidates from backend whenever a hiring manager session is active.
  // Runs on mount (picks up persisted session) AND after login (hiringManager changes).
  useEffect(() => {
    if (!hiringManager) return; // not logged in

    const syncWithBackend = async () => {
      try {
        const res = await candidatesAPI.getAll();
        const backendCandidates = res.data.candidates || [];
        setCandidates(backendCandidates);
        if (backendCandidates.length === 0) {
          setSelectedIds([]);
          localStorage.removeItem('resumate_candidates');
        }
      } catch {
        // Backend not reachable — keep whatever is cached
      }
    };
    syncWithBackend();
  }, [hiringManager]); // re-runs on login / logout

  const selectedCandidates = useMemo(
    () => candidates.filter(c => selectedIds.includes(c.id)),
    [candidates, selectedIds]
  );

  const analytics = useMemo(
    () => computeAnalytics(selectedCandidates),
    [selectedCandidates]
  );

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await candidatesAPI.getAll();
      const list = res?.data?.candidates || [];
      setCandidates(list);
      if (list.length === 0) {
        setSelectedIds([]);
        localStorage.removeItem('resumate_candidates');
      }
    } catch (err) {
      console.warn('loadCandidates: backend fetch failed, keeping cached list:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadResume = useCallback(async (file) => {
    const uploadId = `upload-${Date.now()}`;
    setUploadProgress(prev => ({ ...prev, [uploadId]: 5 }));

    const interval = setInterval(() => {
      setUploadProgress(prev => ({ ...prev, [uploadId]: Math.min((prev[uploadId] || 0) + 5, 90) }));
    }, 300);

    try {
      const res = await candidatesAPI.upload(file);
      clearInterval(interval);
      setUploadProgress(prev => ({ ...prev, [uploadId]: 100 }));

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
      clearInterval(interval);
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
      // Wait for backend to fully delete (hash cleanup, ChromaDB)
      await candidatesAPI.delete(id);
      // Small delay to ensure backend state is consistent
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error('Failed to delete from backend:', err);
    }
    // Remove from state
    setCandidates(prev => {
      const updated = prev.filter(c => c.id !== id);
      try { localStorage.setItem('resumate_candidates', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setSelectedIds(prev => prev.filter(x => x !== id));
    setMessages([]);
    setSuggestions([]);
    setDeleting(false);
  }, []);

  const clearAllCandidates = useCallback(async () => {
    setDeleting(true);
    try {
      await candidatesAPI.deleteAll();
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error('Failed to clear backend:', err);
    }
    setCandidates([]);
    setSelectedIds([]);
    setMessages([]);
    setSuggestions([]);
    localStorage.removeItem('resumate_candidates');
    setDeleting(false);
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
  
  const selectAll = useCallback(() => {
    setSelectedIds(candidates.map(c => c.id));
  }, [candidates]);
  
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
    try {
      const res = await chatAPI.getIntro(selectedCandidates.length, anonymize);
      setMessages([{ role: 'assistant', content: res.data.response }]);
      setSuggestions(res.data.suggestions || []);
    } catch (_) {
      setMessages([{
        role: 'assistant',
        content: '**Welcome to ResuMate AI!** 👋\n\nUpload resumes and select candidates to get started.'
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
      candidates, setCandidates, selectedIds, selectedCandidates, uploadProgress, loading, deleting,
      loadCandidates, uploadResume, deleteCandidate, clearAllCandidates, toggleSelection, selectAll, clearSelection,
      anonymize, setAnonymize, analytics,
      messages, suggestions, isTyping, sendMessage, initChat, clearChat,
      getDisplayName, getAvatarGradient,
      candidateSession, setCandidateSession,
      hiringManager, loginHiringManager, logoutHiringManager,
    }}>
      {children}
    </AppContext.Provider>
  );
};