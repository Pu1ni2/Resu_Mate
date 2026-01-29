// import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
// import { candidatesAPI, chatAPI } from '../services/api';

// const AppContext = createContext(null);

// export const useApp = () => {
//   const context = useContext(AppContext);
//   if (!context) throw new Error('useApp must be used within AppProvider');
//   return context;
// };

// export const AppProvider = ({ children }) => {
//   // Candidates
//   const [candidates, setCandidates] = useState([]);
//   const [selectedIds, setSelectedIds] = useState([]);
//   const [uploadProgress, setUploadProgress] = useState({});
//   const [loading, setLoading] = useState(false);

//   // Chat
//   const [messages, setMessages] = useState([]);
//   const [suggestions, setSuggestions] = useState([]);
//   const [isTyping, setIsTyping] = useState(false);

//   // Settings
//   const [anonymize, setAnonymize] = useState(false);

//   // Selected candidates
//   const selectedCandidates = useMemo(
//     () => candidates.filter(c => selectedIds.includes(c.id)),
//     [candidates, selectedIds]
//   );

//   // Analytics
//   const analytics = useMemo(() => {
//     const selected = selectedCandidates.filter(c => c.is_resume !== false);
//     if (selected.length === 0) {
//       return { total: 0, avgExperience: 0, totalSkills: 0, topSkills: [], roleDistribution: [], levelDistribution: [] };
//     }

//     const total = selected.length;
//     const avgExperience = (selected.reduce((s, c) => s + (c.total_experience_years || 0), 0) / total).toFixed(1);

//     const skillMap = new Map();
//     selected.forEach(c => {
//       (c.skills || []).forEach(skill => {
//         const name = typeof skill === 'string' ? skill : skill?.name;
//         if (name) skillMap.set(name, (skillMap.get(name) || 0) + 1);
//       });
//     });
//     const topSkills = Array.from(skillMap.entries())
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 10)
//       .map(([name, count]) => ({ name, count, percentage: Math.round(count / total * 100) }));

//     const roleMap = new Map();
//     selected.forEach(c => {
//       const role = c.predicted_role || 'Unknown';
//       roleMap.set(role, (roleMap.get(role) || 0) + 1);
//     });
//     const roleDistribution = Array.from(roleMap.entries())
//       .map(([name, count]) => ({ name, count }))
//       .sort((a, b) => b.count - a.count);

//     const levelMap = new Map();
//     selected.forEach(c => {
//       const level = c.experience_level || 'Entry';
//       levelMap.set(level, (levelMap.get(level) || 0) + 1);
//     });
//     const levelDistribution = Array.from(levelMap.entries())
//       .map(([name, count]) => ({ name, count }))
//       .sort((a, b) => b.count - a.count);

//     return { total, avgExperience, totalSkills: skillMap.size, topSkills, roleDistribution, levelDistribution };
//   }, [selectedCandidates]);

//   // Load candidates
//   const loadCandidates = useCallback(async () => {
//     setLoading(true);
//     try {
//       const res = await candidatesAPI.getAll();
//       setCandidates(res.data.candidates || []);
//     } catch (err) {
//       console.error('Failed to load candidates:', err);
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   // Upload resume
//   const uploadResume = useCallback(async (file) => {
//     const uploadId = `upload-${Date.now()}`;
//     setUploadProgress(prev => ({ ...prev, [uploadId]: 5 }));

//     const interval = setInterval(() => {
//       setUploadProgress(prev => ({ ...prev, [uploadId]: Math.min((prev[uploadId] || 0) + 5, 90) }));
//     }, 300);

//     try {
//       const res = await candidatesAPI.upload(file);
//       clearInterval(interval);
//       setUploadProgress(prev => ({ ...prev, [uploadId]: 100 }));

//       setTimeout(() => {
//         setCandidates(prev => [res.data, ...prev]);
//         setUploadProgress(prev => {
//           const newProgress = { ...prev };
//           delete newProgress[uploadId];
//           return newProgress;
//         });
//       }, 500);

//       return res.data;
//     } catch (err) {
//       clearInterval(interval);
//       setUploadProgress(prev => {
//         const newProgress = { ...prev };
//         delete newProgress[uploadId];
//         return newProgress;
//       });
//       throw err;
//     }
//   }, []);

//   // Delete candidate
//   const deleteCandidate = useCallback(async (id) => {
//     await candidatesAPI.delete(id);
//     setCandidates(prev => prev.filter(c => c.id !== id));
//     setSelectedIds(prev => prev.filter(x => x !== id));
//   }, []);

//   // Selection
//   const toggleSelection = useCallback((id) => {
//     setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
//   }, []);
//   const selectAll = useCallback(() => setSelectedIds(candidates.map(c => c.id)), [candidates]);
//   const clearSelection = useCallback(() => setSelectedIds([]), []);

//   // Chat
//   const sendMessage = useCallback(async (message) => {
//     if (!message.trim() || selectedCandidates.length === 0) return;

//     setMessages(prev => [...prev, { role: 'user', content: message }]);
//     setIsTyping(true);
//     setSuggestions([]);

//     try {
//       const res = await chatAPI.send({
//         message,
//         candidate_ids: selectedIds,
//         conversation_id: 'default'
//       });

//       setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
//       setSuggestions(res.data.suggestions || []);
//     } catch (err) {
//       const errorMsg = err.response?.data?.detail || err.message || 'Something went wrong';
//       setMessages(prev => [...prev, { role: 'assistant', content: `**Error:** ${errorMsg}` }]);
//     } finally {
//       setIsTyping(false);
//     }
//   }, [selectedIds, selectedCandidates.length]);

//   const initChat = useCallback(async () => {
//     if (messages.length > 0) return;
//     try {
//       const res = await chatAPI.getIntro(selectedCandidates.length);
//       setMessages([{ role: 'assistant', content: res.data.response }]);
//       setSuggestions(res.data.suggestions || []);
//     } catch (err) {
//       setMessages([{
//         role: 'assistant',
//         content: '**Welcome to ResuMate AI!** 👋\n\nUpload resumes and select candidates to get started.'
//       }]);
//     }
//   }, [selectedCandidates.length, messages.length]);

//   const clearChat = useCallback(() => {
//     setMessages([]);
//     setSuggestions([]);
//     chatAPI.clear().catch(() => {});
//   }, []);

//   // Helpers
//   const getDisplayName = useCallback((c, i) => {
//     if (anonymize) return `Candidate ${i + 1}`;
//     return c.name || `Candidate ${i + 1}`;
//   }, [anonymize]);

//   const getAvatarGradient = useCallback((name) => {
//     const gradients = [
//       'linear-gradient(135deg, #F59E0B, #D97706)',
//       'linear-gradient(135deg, #10B981, #059669)',
//       'linear-gradient(135deg, #3B82F6, #2563EB)',
//       'linear-gradient(135deg, #8B5CF6, #7C3AED)',
//       'linear-gradient(135deg, #EC4899, #DB2777)'
//     ];
//     const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
//     return gradients[hash % gradients.length];
//   }, []);

//   return (
//     <AppContext.Provider value={{
//       candidates, selectedIds, selectedCandidates, uploadProgress, loading,
//       loadCandidates, uploadResume, deleteCandidate, toggleSelection, selectAll, clearSelection,
//       anonymize, setAnonymize, analytics,
//       messages, suggestions, isTyping, sendMessage, initChat, clearChat,
//       getDisplayName, getAvatarGradient
//     }}>
//       {children}
//     </AppContext.Provider>
//   );
// };


import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { candidatesAPI, chatAPI } from '../services/api';

const AppContext = createContext(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export const AppProvider = ({ children }) => {
  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  const [anonymize, setAnonymize] = useState(false);

  const selectedCandidates = useMemo(
    () => candidates.filter(c => selectedIds.includes(c.id)),
    [candidates, selectedIds]
  );

  const analytics = useMemo(() => {
    const selected = selectedCandidates.filter(c => c.is_resume !== false);
    if (selected.length === 0) {
      return { total: 0, avgExperience: 0, totalSkills: 0, topSkills: [], roleDistribution: [], levelDistribution: [] };
    }

    const total = selected.length;
    const avgExperience = (selected.reduce((s, c) => s + (c.total_experience_years || 0), 0) / total).toFixed(1);

    const skillMap = new Map();
    selected.forEach(c => {
      (c.skills || []).forEach(skill => {
        const name = typeof skill === 'string' ? skill : skill?.name;
        if (name) skillMap.set(name, (skillMap.get(name) || 0) + 1);
      });
    });
    const topSkills = Array.from(skillMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count, percentage: Math.round(count / total * 100) }));

    const roleMap = new Map();
    selected.forEach(c => {
      const role = c.predicted_role || 'Unknown';
      roleMap.set(role, (roleMap.get(role) || 0) + 1);
    });
    const roleDistribution = Array.from(roleMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const levelMap = new Map();
    selected.forEach(c => {
      const level = c.experience_level || 'Entry';
      levelMap.set(level, (levelMap.get(level) || 0) + 1);
    });
    const levelDistribution = Array.from(levelMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { total, avgExperience, totalSkills: skillMap.size, topSkills, roleDistribution, levelDistribution };
  }, [selectedCandidates]);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await candidatesAPI.getAll();
      setCandidates(res.data.candidates || []);
    } catch (err) {
      console.error('Failed to load candidates:', err);
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
        setCandidates(prev => [res.data, ...prev]);
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

  const deleteCandidate = useCallback(async (id) => {
    await candidatesAPI.delete(id);
    setCandidates(prev => prev.filter(c => c.id !== id));
    setSelectedIds(prev => prev.filter(x => x !== id));
  }, []);

  const toggleSelection = useCallback((id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);
  const selectAll = useCallback(() => setSelectedIds(candidates.map(c => c.id)), [candidates]);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  // Clear chat when anonymize changes
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
    } catch (err) {
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
      candidates, selectedIds, selectedCandidates, uploadProgress, loading,
      loadCandidates, uploadResume, deleteCandidate, toggleSelection, selectAll, clearSelection,
      anonymize, setAnonymize, analytics,
      messages, suggestions, isTyping, sendMessage, initChat, clearChat,
      getDisplayName, getAvatarGradient
    }}>
      {children}
    </AppContext.Provider>
  );
};