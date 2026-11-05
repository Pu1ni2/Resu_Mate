import React, { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { knownYears } from '../../services/experience';

const JarvisAgent = lazy(() => import('../pipeline/JarvisAgent'));

/* What Jarvis is told of the workspace's candidates: the résumés, with what
 * it needs to talk about them and act on them. */
export const jarvisSummary = candidates => (candidates || [])
  .filter(c => c.is_resume !== false)
  .map(c => ({
    id: c.id,
    name: c.name || 'Unknown',
    predicted_role: c.predicted_role || '',
    // null when not known, not 0.
    total_experience_years: knownYears(c.total_experience_years),
    experience_level: c.experience_level || '',
    location: c.location || '',
    email: c.email || c.embedded_links?.email || '',
    skills: c.skills || [],
    github_url: c.embedded_links?.github_url || '',
    linkedin_url: c.embedded_links?.linkedin_url || '',
  }));

// Jarvis, told of the workspace's candidates as it opens.
function Jarvis({ onClose }) {
  const { candidates } = useApp();
  return <JarvisAgent candidatesSummary={jarvisSummary(candidates)} onClose={onClose} />;
}

/* Jarvis over the page, from the assistant's "The whole workspace"
 * (Assistant.jsx), in the sidebar of every manager page. It was only on the
 * dashboard, so the candidate file, Find candidates and the rest had no way to
 * it. Jarvis covers the whole page, so it's rendered into <body>, clear of the
 * sidebar's own layers. */
export default function JarvisOverPage({ onClose }) {
  return createPortal(
    <Suspense fallback={null}>
      <Jarvis onClose={onClose} />
    </Suspense>,
    document.body,
  );
}
