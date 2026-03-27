import React from 'react';
import { marked } from 'marked';
import { Github, Search, Loader, AlertCircle, ExternalLink, Brain } from 'lucide-react';

export default function GitHubPanel({
  ghUsername, setGhUsername, ghProfile, ghLoading, ghError, ghNeedsInput, onFetchGitHub,
}) {
  return (
    <div className="tool-panel">
      <div className="gh-search-bar glass-card">
        <Github size={18} />
        <input
          type="text" className="input gh-search-input"
          value={ghUsername} onChange={e => setGhUsername(e.target.value)}
          placeholder="Enter GitHub username..."
          onKeyDown={e => { if (e.key === 'Enter' && ghUsername.trim()) onFetchGitHub(ghUsername.trim()); }}
        />
        <button className="btn btn-primary btn-sm" onClick={() => onFetchGitHub(ghUsername.trim())} disabled={!ghUsername.trim() || ghLoading}>
          {ghLoading ? <Loader size={14} className="spin" /> : <Search size={14} />}<span>Analyze</span>
        </button>
      </div>

      {ghLoading && <div className="tool-loading"><Loader size={28} className="spin" /><p>Fetching GitHub profile...</p></div>}

      {ghNeedsInput && !ghProfile && (
        <div className="tool-input-section glass-card">
          <h3><Github size={20} /> GitHub Profile Analyzer</h3>
          <p>Could not auto-detect username from resume. Enter a GitHub username above to analyze.</p>
        </div>
      )}

      {ghError && !ghNeedsInput && (
        <div className="tool-error glass-card">
          <AlertCircle size={20} /><p>{ghError}</p>
          <button className="btn btn-secondary" onClick={() => { setGhUsername(''); onFetchGitHub(''); }}>Try Another Username</button>
        </div>
      )}

      {ghProfile && (
        <div className="gh-profile">
          <div className="gh-header glass-card">
            <img src={ghProfile.avatar_url} alt="" className="gh-avatar" />
            <div className="gh-info">
              <h3>{ghProfile.name || ghProfile.username}</h3>
              <a href={ghProfile.profile_url} target="_blank" rel="noopener noreferrer" className="gh-link">@{ghProfile.username} <ExternalLink size={12} /></a>
              {ghProfile.bio && <p className="gh-bio">{ghProfile.bio}</p>}
            </div>
            <div className="gh-stats">
              <div className="gh-stat"><span className="gh-stat-val">{ghProfile.public_repos}</span><span className="gh-stat-label">Repos</span></div>
              <div className="gh-stat"><span className="gh-stat-val">{ghProfile.followers}</span><span className="gh-stat-label">Followers</span></div>
              <div className="gh-stat"><span className="gh-stat-val">{ghProfile.recent_pushes}</span><span className="gh-stat-label">Recent Pushes</span></div>
            </div>
          </div>

          {ghProfile.ai_analysis && (
            <div className="tool-ai-analysis glass-card"><Brain size={16} /><div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(ghProfile.ai_analysis) }} /></div>
          )}

          {Object.keys(ghProfile.languages || {}).length > 0 && (
            <div className="gh-languages glass-card">
              <h4>Languages</h4>
              <div className="gh-lang-chips">{Object.entries(ghProfile.languages).map(([lang, count]) => <span key={lang} className="agent-chip active">{lang} ({count})</span>)}</div>
            </div>
          )}

          {ghProfile.top_repos?.length > 0 && (
            <div className="gh-repos">
              <h4>Top Repositories</h4>
              {ghProfile.top_repos.map((repo, i) => (
                <div key={i} className="gh-repo glass-card">
                  <div className="gh-repo-header"><a href={repo.url} target="_blank" rel="noopener noreferrer">{repo.name} <ExternalLink size={12} /></a><span className="badge badge-blue">{repo.language}</span></div>
                  <p className="gh-repo-desc">{repo.description}</p>
                  <div className="gh-repo-stats"><span>⭐ {repo.stars}</span><span>🍴 {repo.forks}</span><span>Updated: {repo.updated}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
