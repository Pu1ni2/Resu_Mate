import React, { useState } from 'react';
import { Github, Globe, Mail, ExternalLink, Brain, ChevronDown, Loader, Zap } from 'lucide-react';
import { marked } from 'marked';

export default function ScannerBar({ scanLogs, scanProfiles, scanSummary, scanContact, scanRunning, scanDone, onRescan }) {
  const [expanded, setExpanded] = useState(false);

  // Calculate progress from logs
  const progress = scanRunning ? Math.min(90, (scanLogs.length / 8) * 100) : scanDone ? 100 : 0;
  const lastLog = scanLogs[scanLogs.length - 1];

  if (!scanRunning && !scanDone) return null;

  return (
    <div className="scanner-bar">
      <div className="scanner-bar-main" onClick={() => scanDone && setExpanded(!expanded)}>
        <div className="scanner-bar-left">
          {scanRunning ? (
            <Loader size={14} className="spin" style={{ color: 'var(--success)' }} />
          ) : (
            <Zap size={14} style={{ color: 'var(--accent)' }} />
          )}
          <span className="scanner-bar-status">
            {scanRunning ? (lastLog?.msg || 'Scanning...') : 'Scan complete'}
          </span>
        </div>

        <div className="scanner-bar-right">
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

      {/* Progress bar */}
      {scanRunning && (
        <div className="scanner-bar-progress">
          <div className="scanner-bar-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

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
              <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(scanSummary) }} />
            </div>
          )}

          {onRescan && (
            <button className="btn btn-ghost btn-sm" onClick={onRescan} style={{ marginTop: '8px' }}>↻ Re-scan</button>
          )}
        </div>
      )}
    </div>
  );
}
