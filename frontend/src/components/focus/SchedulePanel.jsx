import React from 'react';
import { Calendar, Loader, AlertCircle, ExternalLink } from 'lucide-react';

export default function SchedulePanel({ calData, calLoading, calError, showToast, anonymize, candidateName }) {
  const displayName = anonymize ? 'Candidate' : candidateName?.split(' ')[0];

  return (
    <div className="tool-panel">
      {calLoading && <div className="tool-loading"><Loader size={28} className="spin" /><p>Loading Calendly...</p></div>}
      {calError && <div className="tool-error glass-card"><AlertCircle size={20} /><p>{calError}</p></div>}
      {calData && (
        <div className="cal-container">
          <div className="cal-header glass-card">
            <Calendar size={24} />
            <div><h3>Schedule Interview with {displayName}</h3><p>Select an event type to share your scheduling link</p></div>
          </div>
          {calData.event_types?.length > 0 ? (
            <div className="cal-events">
              {calData.event_types.map((ev, i) => (
                <div key={i} className="cal-event glass-card" onClick={() => window.open(ev.scheduling_url, '_blank')}>
                  <div className="cal-event-info"><h4>{ev.name}</h4><p>{ev.duration} minutes{ev.description ? ` — ${ev.description}` : ''}</p></div>
                  <div className="cal-event-actions">
                    <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(ev.scheduling_url); showToast('Link copied!'); }}>Copy Link</button>
                    <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); window.open(ev.scheduling_url, '_blank'); }}>Open <ExternalLink size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cal-fallback glass-card">
              <p>No event types found. Share your main scheduling link:</p>
              <a href={calData.scheduling_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">{calData.scheduling_url} <ExternalLink size={14} /></a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
