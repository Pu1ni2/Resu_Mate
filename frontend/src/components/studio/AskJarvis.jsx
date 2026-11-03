import React, { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const JarvisAgent = lazy(() => import('../pipeline/JarvisAgent'));

/* What Jarvis is told of the workspace's candidates: the résumés, with what
 * it needs to talk about them and act on them. */
export const jarvisSummary = candidates => (candidates || [])
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
  }));

// Jarvis, told of the workspace's candidates as it opens.
function Jarvis({ onClose }) {
  const { candidates } = useApp();
  return <JarvisAgent candidatesSummary={jarvisSummary(candidates)} onClose={onClose} />;
}

/* "Ask Jarvis", in the sidebar of every manager page, opening Jarvis over
 * the page. It was only on the dashboard, so the candidate file, Find
 * candidates and the rest had no way to it. Jarvis covers the whole page, so
 * it's rendered into <body>, clear of the sidebar's own layers. */
export default function AskJarvis() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="sw-assist-jarvis" onClick={() => setOpen(true)}>
        <Sparkles size={16} aria-hidden="true" /><span>Ask Jarvis</span><ArrowUpRight size={13} aria-hidden="true" />
      </button>
      {open && createPortal(
        <Suspense fallback={null}>
          <Jarvis onClose={() => setOpen(false)} />
        </Suspense>,
        document.body,
      )}
    </>
  );
}
