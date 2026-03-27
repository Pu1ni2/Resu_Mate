import React from 'react';
import { marked } from 'marked';
import {
  UserCheck, FileText, Target, Briefcase, Award,
  ChevronRight, Loader, AlertCircle, MessageSquare
} from 'lucide-react';

export default function HiringAgentPanel({
  agentStep, setAgentStep, jdText, setJdText,
  selectedRole, setSelectedRole, customRole, setCustomRole,
  selectedExperience, setSelectedExperience,
  selectedLevel, setSelectedLevel,
  agentResult, agentLoading, suggestedRoles,
  onRunHiringAgent, onRunJDAnalysis, onReset,
  onSwitchToChat, agentResultRef,
}) {
  return (
    <div className="agent-container">
      <div className="agent-intro">
        <div className="agent-intro-icon"><UserCheck size={28} /></div>
        <div>
          <h3 className="agent-intro-title">Hiring Manager Agent</h3>
          <p className="agent-intro-desc">I'll evaluate this candidate's fit for your position using resume data, online research, and hiring best practices.</p>
        </div>
      </div>

      {agentStep === 'choose' && (
        <div className="agent-choose">
          <div className="agent-option glass-card" onClick={() => setAgentStep('jd')}>
            <div className="agent-option-icon"><FileText size={24} /></div>
            <div><h4>Paste Job Description</h4><p>I'll extract the role, requirements, and evaluate the candidate against it</p></div>
            <ChevronRight size={18} />
          </div>
          <div className="agent-option glass-card" onClick={() => setAgentStep('quick')}>
            <div className="agent-option-icon"><Target size={24} /></div>
            <div><h4>Quick Setup</h4><p>Select role, experience, and level — I'll do the rest</p></div>
            <ChevronRight size={18} />
          </div>
        </div>
      )}

      {agentStep === 'jd' && (
        <div className="agent-jd">
          <label className="agent-label">Paste the full Job Description:</label>
          <textarea className="agent-textarea input" value={jdText} onChange={e => setJdText(e.target.value)} rows={10} placeholder="Paste the complete job description here..." />
          <div className="agent-actions">
            <button className="btn btn-ghost" onClick={() => setAgentStep('choose')}>← Back</button>
            <button className="btn btn-primary" onClick={onRunJDAnalysis} disabled={!jdText.trim() || agentLoading}>
              {agentLoading ? <Loader size={16} className="spin" /> : <Target size={16} />}<span>Evaluate Candidate</span>
            </button>
          </div>
        </div>
      )}

      {agentStep === 'quick' && (
        <div className="agent-quick">
          <div className="agent-section">
            <label className="agent-label"><Target size={14} /> What role are you hiring for?</label>
            <div className="agent-chips">
              {suggestedRoles.map((r, i) => (
                <button key={i} className={`agent-chip ${selectedRole === r ? 'active' : ''}`} onClick={() => { setSelectedRole(r); setCustomRole(''); }}>{r}</button>
              ))}
              <button className={`agent-chip ${selectedRole === 'other' ? 'active' : ''}`} onClick={() => setSelectedRole('other')}>Other...</button>
            </div>
            {selectedRole === 'other' && <input type="text" className="input agent-input" value={customRole} onChange={e => setCustomRole(e.target.value)} placeholder="Enter the role title..." />}
          </div>
          <div className="agent-section">
            <label className="agent-label"><Briefcase size={14} /> Required experience:</label>
            <div className="agent-chips">
              {['0-1 years', '1-3 years', '3-5 years', '5-8 years', '8+ years'].map(exp => (
                <button key={exp} className={`agent-chip ${selectedExperience === exp ? 'active' : ''}`} onClick={() => setSelectedExperience(exp)}>{exp}</button>
              ))}
            </div>
          </div>
          <div className="agent-section">
            <label className="agent-label"><Award size={14} /> Seniority level:</label>
            <div className="agent-chips">
              {['Intern', 'Junior', 'Mid-Level', 'Senior', 'Lead / Principal'].map(lvl => (
                <button key={lvl} className={`agent-chip ${selectedLevel === lvl ? 'active' : ''}`} onClick={() => setSelectedLevel(lvl)}>{lvl}</button>
              ))}
            </div>
          </div>
          <div className="agent-actions">
            <button className="btn btn-ghost" onClick={() => setAgentStep('choose')}>← Back</button>
            <button className="btn btn-primary" onClick={onRunHiringAgent} disabled={agentLoading}>
              {agentLoading ? <Loader size={16} className="spin" /> : <Target size={16} />}<span>Evaluate Candidate</span>
            </button>
          </div>
        </div>
      )}

      {agentStep === 'loading' && (
        <div className="agent-loading">
          <Loader size={36} className="spin" />
          <h3>Evaluating candidate...</h3>
          <div className="agent-loading-steps">
            <p className="agent-step-item active">Analyzing resume data...</p>
            <p className="agent-step-item">Searching online presence...</p>
            <p className="agent-step-item">Matching against requirements...</p>
            <p className="agent-step-item">Generating fit report...</p>
          </div>
        </div>
      )}

      {agentStep === 'result' && agentResult && (
        <div className="agent-result" ref={agentResultRef}>
          {agentResult.error ? (
            <div className="agent-error glass-card"><AlertCircle size={24} /><p>{agentResult.error}</p></div>
          ) : (
            <>
              <div className="agent-report"><div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(agentResult.report || '') }} /></div>
              <div className="agent-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={onReset}>← Start Over</button>
                <button className="btn btn-secondary btn-sm" onClick={onSwitchToChat}><MessageSquare size={14} /> Discuss</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
