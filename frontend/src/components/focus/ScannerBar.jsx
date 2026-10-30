import React, { useState } from 'react';
import { Github, Globe, Mail, ExternalLink, Brain, ChevronDown, Loader, Zap } from 'lucide-react';
import Markdown from '../ui/Markdown';
import { pressable } from '../ui/pressable';

/* What was found about the person online, and the way to ask for it. Nothing
 * is looked up until the manager asks (onLookup): opening a file used to
 * search the web for the person by name at once. Never while names are
 * hidden, either, as the search goes by the name. */
export default function ScannerBar({ scanLogs, scanProfiles, scanSummary, scanContact, scanRunning, scanDone, onLookup, namesHidden }) {
  const [expanded, setExpanded] = useState(false);

  // No percentage: the steps come back together with the result, so a bar
  // worked out from them was never real progress.
  const lastLog = scanLogs[scanLogs.length - 1];
  const notYet = !scanRunning && !scanDone;

  let status = 'Not looked up online yet. This searches the web for their GitHub and LinkedIn.';
  if (scanRunning) status = 'Looking them up online…';
  else if (scanDone) status = lastLog?.status === 'error' ? lastLog.msg : 'Looked up online';
  else if (namesHidden) status = "Names are hidden, so they aren't looked up online.";

  return (
    <div className="scanner-bar">
      <div className="scanner-bar-main"
        {...(scanDone ? { ...pressable(() => setExpanded(!expanded)), 'aria-expanded': expanded } : {})}>
        <div className="scanner-bar-left">
          {scanRunning ? (
            <Loader size={14} className="spin" style={{ color: 'var(--success)' }} />
          ) : notYet ? (
            <Globe size={14} style={{ color: 'var(--accent)' }} />
          ) : (
            <Zap size={14} style={{ color: 'var(--accent)' }} />
          )}
          {/* Announced as it changes: a lookup starting, and how it ended. */}
          <span className="scanner-bar-status" role="status">{status}</span>
        </div>

        <div className="scanner-bar-right">
          {notYet && onLookup && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onLookup}>Look them up online</button>
          )}
          {scanDone && scanProfiles && (
            <div className="scanner-bar-summary">
              {scanProfiles.github && <span className="scanner-bar-chip"><Github size={12} /> GitHub</span>}
              {scanProfiles.linkedin && <span className="scanner-bar-chip"><Globe size={12} /> LinkedIn</span>}
              {scanContact?.email && <span className="scanner-bar-chip"><Mail size={12} /> Contact</span>}
            </div>
          )}
          {scanDone && (
            <ChevronDown size={14} className={`scanner-bar-chevron ${expanded ? 'expanded' : ''}`} />
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && scanDone && (
        <div className="scanner-bar-expandable">
          {/* Log lines */}
          <div className="scanner-bar-logs">
            {scanLogs.map((log, i) => (
              <div key={i} className={`scanner-log ${log.status || ''}`}>
                <span className="scanner-prefix">{log.status === 'success' ? '✓' : log.status === 'error' ? '✗' : log.status === 'warning' ? '⚠' : '›'}</span>
                <span>{log.msg}</span>
              </div>
            ))}
          </div>

          {/* Profile cards */}
          {scanProfiles && (
            <div className="scanner-bar-profiles">
              {scanProfiles.github && (
                <div className="scanner-result-card">
                  <Github size={16} />
                  <div><strong>{scanProfiles.github.name || scanProfiles.github.username}</strong><span>{scanProfiles.github.public_repos} repos · {scanProfiles.github.followers} followers</span></div>
                  <a href={scanProfiles.github.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a>
                </div>
              )}
              {scanProfiles.linkedin && (
                <div className="scanner-result-card">
                  <Globe size={16} />
                  <div><strong>{scanProfiles.linkedin.name || scanProfiles.linkedin.username}</strong><span>{scanProfiles.linkedin.headline || scanProfiles.linkedin.note || ''}</span></div>
                  <a href={scanProfiles.linkedin.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a>
                </div>
              )}
              {scanProfiles.portfolio && (
                <div className="scanner-result-card">
                  <Globe size={16} />
                  <div><strong>{scanProfiles.portfolio.title || 'Portfolio'}</strong><span>{scanProfiles.portfolio.description || scanProfiles.portfolio.url}</span></div>
                  <a href={scanProfiles.portfolio.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /></a>
                </div>
              )}
              {scanContact && (scanContact.email || scanContact.phone) && (
                <div className="scanner-result-card">
                  <Mail size={16} />
                  <div><strong>Contact</strong><span>{[scanContact.email, scanContact.phone].filter(Boolean).join(' · ')}</span></div>
                </div>
              )}
            </div>
          )}

          {scanSummary && (
            <div className="scanner-ai-summary">
              <Brain size={14} />
              <Markdown text={scanSummary} />
            </div>
          )}

          {onLookup && (
            <button className="btn btn-ghost btn-sm" onClick={onLookup} style={{ marginTop: '8px' }}>↻ Look again</button>
          )}
        </div>
      )}
    </div>
  );
}
