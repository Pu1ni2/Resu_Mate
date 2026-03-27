import React from 'react';
import { Search, X, Loader, ExternalLink } from 'lucide-react';

export default function WebSearchPanel({
  searchQuery, setSearchQuery, searchResults, searchLoading,
  searchHistory, onSearch, getSearchSuggestions,
}) {
  return (
    <div className="focus-websearch-container">
      <div className="focus-search-bar">
        <div className="focus-search-input-wrap">
          <Search size={18} className="focus-search-icon" />
          <input
            type="text" className="input focus-search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSearch(); }}
            placeholder="Search the web..."
          />
          {searchQuery && <button className="focus-search-clear" onClick={() => setSearchQuery('')}><X size={14} /></button>}
        </div>
        <button onClick={() => onSearch()} disabled={!searchQuery.trim() || searchLoading} className="btn btn-primary">
          {searchLoading ? <Loader size={18} className="spin" /> : <Search size={18} />}<span>Search</span>
        </button>
      </div>

      {searchResults.length === 0 && !searchLoading && (
        <div className="focus-search-suggestions">
          <p className="focus-search-suggestions-label">Quick searches:</p>
          <div className="focus-search-chips">
            {getSearchSuggestions().map((s, i) => (
              <button key={i} className="focus-search-chip" onClick={() => { setSearchQuery(s); onSearch(s); }}>
                <Search size={12} /> {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {searchLoading && <div className="focus-search-loading"><Loader size={24} className="spin" /><p>Searching the web...</p></div>}

      {searchResults.length > 0 && !searchLoading && (
        <div className="focus-search-results">
          <p className="focus-search-results-count">Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
          {searchResults.map((result, i) => (
            <div key={i} className="focus-search-result glass-card">
              <div className="focus-result-header">
                <h3 className="focus-result-title">
                  {result.url ? <a href={result.url} target="_blank" rel="noopener noreferrer">{result.title} <ExternalLink size={14} /></a> : result.title}
                </h3>
                {result.url && <span className="focus-result-url">{result.url}</span>}
              </div>
              <p className="focus-result-snippet">{result.snippet}</p>
            </div>
          ))}
        </div>
      )}

      {searchHistory.length > 0 && (
        <div className="focus-search-history">
          <p className="focus-search-history-label">Recent searches:</p>
          <div className="focus-search-chips">
            {searchHistory.map((h, i) => (
              <button key={i} className="focus-search-chip history" onClick={() => { setSearchQuery(h); onSearch(h); }}>{h}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
