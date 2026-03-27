import { useRef, useCallback } from 'react';

export default function useCandidateCache() {
  const cache = useRef({});

  const saveToCache = useCallback((candidateId, state) => {
    if (!candidateId) return;
    cache.current[candidateId] = { ...state };
  }, []);

  const restoreFromCache = useCallback((candidateId) => {
    return cache.current[candidateId] || null;
  }, []);

  const hasCache = useCallback((candidateId) => {
    return !!cache.current[candidateId];
  }, []);

  return { saveToCache, restoreFromCache, hasCache };
}
