import { useEffect, useState } from 'react';
import { API_BASE } from './authFetch';

/* What this server can do, from GET /api/features, asked once per page load.
 *
 * Avatar interviews need the interview worker, which the free hosting can't
 * run; without it an avatar interview left the candidate in an empty room.
 * Until the server answers, or if it can't, avatars count as unavailable: a
 * voice interview always works. */
let pending = null;

export function getFeatures() {
  if (!pending) {
    pending = fetch(`${API_BASE}/api/features`)
      .then(resp => (resp.ok ? resp.json() : {}))
      .catch(() => ({}));
  }
  return pending;
}

/* Forget the answer, so the next getFeatures() asks again. For tests. */
export function resetFeatures() {
  pending = null;
}

export function useAvatarInterviews() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    getFeatures().then(features => {
      if (live) setAvailable(features?.avatar_interviews === true);
    });
    return () => {
      live = false;
    };
  }, []);
  return available;
}
