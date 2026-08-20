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

  // restoreFromCache returning null already answers "is it cached?", which is
  // why nothing ever called the hasCache that used to sit here.
  return { saveToCache, restoreFromCache };
}
