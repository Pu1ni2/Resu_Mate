import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Upload, Video, UserCheck, Bot, Search, Mail, Cpu, Shield, BarChart2, Globe
} from 'lucide-react';
import Button from './ui/Button';
import { cn } from './ui/cn';
import HeroBand from './landing/HeroBand';

// ─── Logo ───
const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="logo-g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8" fill="url(#logo-g)" />
    <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#000" strokeWidth="1.5" fill="none" />
    <circle cx="16" cy="16" r="3" fill="#000" />
  </svg>
);

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [activeAgent, setActiveAgent] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-rotate agents
  useEffect(() => {
    const timer = setInterval(() => setActiveAgent(a => (a + 1) % 5), 3500);
    return () => clearInterval(timer);
  }, []);

  const agents = [
    { name: 'Data Agent', desc: 'Scans resumes, scrapes GitHub & LinkedIn with browser automation, enriches candidate profiles from multiple sources.', icon: <Search size={20} />, tools: ['PDF Extract', 'Playwright', 'GitHub API', 'Tavily'] },
    { name: 'HR Agent', desc: 'Evaluates candidates against job requirements, drafts personalized emails, provides hiring recommendations with bias checks.', icon: <UserCheck size={20} />, tools: ['GPT-4o', 'Salary Research', 'Email Drafting'] },
    { name: 'Technical Agent', desc: 'Orchestrates the entire interview pipeline — splits into two specialized sub-agents that work in sequence.', icon: <Cpu size={20} />, tools: ['LiveKit', 'Simli Avatar', 'OpenAI Realtime', 'Whisper'], hasSubAgents: true },
    { name: 'Research Agent', desc: 'Searches the web for candidate info, fact-checks resume claims, provides real-time data during AI chat.', icon: <Globe size={20} />, tools: ['Tavily Search', 'Fact Check', 'Citation'] },
    { name: 'Advisor Agent', desc: 'Candidate-facing career coach with 3 modes — Resume Coach, Interview Prep, and Career Advisor. Personalized AI guidance.', icon: <Bot size={20} />, tools: ['Resume Coach', 'Interview Prep', 'Career Advisor'] },
  ];

  const features = [
    { icon: <Bot size={22} />, title: '5 AI Agents', desc: 'Custom agent framework with Plan → Execute → Reflect → Output pipeline. Real agents, not just prompts.' },
    { icon: <Search size={22} />, title: 'Scanner Agent', desc: 'Extracts links from PDFs, launches headless browser to scrape GitHub profiles, searches LinkedIn via Tavily.' },
    { icon: <Video size={22} />, title: 'Live AI Interview', desc: 'Camera + mic. AI asks questions via voice, candidate answers live. Real-time scoring with evaluation report.' },
    { icon: <Shield size={22} />, title: 'RAG — No Hallucinations', desc: 'ChromaDB vector store ensures AI only uses facts from actual resumes. Never makes things up.' },
    { icon: <BarChart2 size={22} />, title: 'Smart Analytics', desc: 'Compare multiple candidates side by side. Skills matching, experience analysis, role fit scoring.' },
    { icon: <Mail size={22} />, title: 'Email Composer', desc: 'AI drafts personalized emails based on evaluation. One-click open in Gmail, Outlook, or default mail.' },
  ];

  const steps = [
    { num: '01', title: 'Upload Resumes', desc: 'Drop PDFs, DOCX, or TXT files. AI extracts text, embedded links, and analyzes content instantly.', icon: <Upload size={24} /> },
    { num: '02', title: 'AI Agents Activate', desc: 'Data Agent scans profiles. Research Agent searches the web. All findings feed into a rich candidate profile.', icon: <Cpu size={24} /> },
    { num: '03', title: 'Evaluate & Interview', desc: 'HR Agent evaluates fit. Create AI interviews for candidates. Get comprehensive reports with recommendations.', icon: <Cpu size={24} /> },
  ];

  return (
    <div className="editorial grain-overlay relative min-h-screen overflow-x-hidden font-text">

      {/* ═══ NAV ═══ */}
      <nav
        className={cn(
          'fixed inset-x-0 top-0 z-50 px-6 py-4',
          'transition-[background-color,border-color] duration-200 ease-out',
          // Paper, not frosted glass. A translucent blurred bar is a dark-UI
          // device; on paper it just muddies the type behind it. The rule
          // appears on scroll and that is the whole transition.
          scrolled
            ? 'border-b border-line bg-canvas'
            : 'border-b border-transparent',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-2 font-display text-[20px] tracking-[-0.01em] text-ink"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <Logo size={26} />
            <span>ResuMate<span className="ml-1 italic text-accent">AI</span></span>
          </button>

          <div className="hide-mobile flex gap-7">
            {[['#agents', 'Agents'], ['#features', 'Features'], ['#how', 'How It Works']].map(
              ([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle no-underline transition-colors duration-[120ms] hover:text-ink"
                >
                  {label}
                </a>
              ),
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => navigate('/candidate/login')}
            >
              Candidate Login
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/hiring')}>
              Hiring Dashboard <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </nav>

      <HeroBand navigate={navigate} />

      {/* ═══ AGENTS SHOWCASE ═══ */}
      <section className="l-section" id="agents">
        <div className="l-section-inner">
          <div className="l-section-header">
            <span className="l-section-tag">Architecture</span>
            <h2>5 Specialized AI Agents</h2>
            <p>Each agent plans its approach, executes with tools, reflects on quality, and delivers results. Not prompt templates — real multi-step agents.</p>
          </div>

          <div className="l-agents-showcase">
            {/* Agent tabs */}
            <div className="l-agents-tabs">
              {agents.map((agent, i) => (
                <button key={i} className={`l-agent-tab ${activeAgent === i ? 'active' : ''}`} onClick={() => setActiveAgent(i)}>
                  <div className="l-agent-tab-icon">{agent.icon}</div>
                  <span>{agent.name}</span>
                </button>
              ))}
            </div>

            {/* Active agent detail */}
            <div className="l-agent-detail" key={activeAgent}>
              <div className="l-agent-detail-header">
                <div className="l-agent-detail-icon">{agents[activeAgent].icon}</div>
                <div>
                  <h3>{agents[activeAgent].name}</h3>
                  <div className="l-agent-pipeline">
                    {['Plan', 'Execute', 'Reflect', 'Output'].map((step, i) => (
                      <React.Fragment key={step}>
                        <span className="l-pipeline-step">{step}</span>
                        {i < 3 && <span className="l-pipeline-arrow">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
              <p className="l-agent-detail-desc">{agents[activeAgent].desc}</p>

              {/* Sub-agents for Technical Agent */}
              {agents[activeAgent].hasSubAgents && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0', margin: '16px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {/* Technical Agent box */}
                  <div style={{ padding: '12px 18px', background: 'var(--color-accent-wash)', border: '1px solid var(--color-accent-line)', borderRadius: '12px', textAlign: 'center', minWidth: '100px' }}>
                    <Cpu size={18} style={{ marginBottom: '4px' }} />
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-accent)' }}>Technical Agent</div>
                  </div>

                  {/* Animated arrow */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 8px' }}>
                    <svg width="60" height="60" viewBox="0 0 60 60" style={{ overflow: 'visible' }}>
                      {/* Arrow to Interview Agent */}
                      <path d="M0,20 Q30,5 55,15" fill="none" strokeWidth="2" strokeDasharray="4,4" style={{ stroke: 'var(--color-accent)' }}>
                        <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" />
                      </path>
                      <polygon points="52,12 58,16 52,20" style={{ fill: 'var(--color-accent)' }}>
                        <animate attributeName="opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite" />
                      </polygon>
                      {/* Arrow to Scoring Agent */}
                      <path d="M0,40 Q30,55 55,45" fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="4,4">
                        <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" />
                      </path>
                      <polygon points="52,42 58,46 52,50" fill="#F59E0B">
                        <animate attributeName="opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite" />
                      </polygon>
                    </svg>
                  </div>

                  {/* Sub-agent boxes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ padding: '10px 16px', background: 'var(--color-accent-wash)', border: '1px solid var(--color-accent-line)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--color-accent-wash)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Video size={14} style={{ color: 'var(--color-accent)' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-accent-hover)' }}>Interview Agent</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)' }}>LiveKit + Simli Avatar + OpenAI Realtime</div>
                      </div>
                    </div>

                    {/* Arrow between sub-agents */}
                    <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <svg width="20" height="20" viewBox="0 0 20 20">
                        <path d="M10,2 L10,14" strokeWidth="1.5" strokeDasharray="3,2" style={{ stroke: 'var(--color-ink-subtle)' }}>
                          <animate attributeName="stroke-dashoffset" from="5" to="0" dur="0.8s" repeatCount="indefinite" />
                        </path>
                        <polygon points="7,12 10,18 13,12" style={{ fill: 'var(--color-ink-subtle)' }} />
                      </svg>
                      <span style={{ fontSize: '10px', opacity: 0.6 }}>scores feed into</span>
                    </div>

                    <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BarChart2 size={14} style={{ color: '#F59E0B' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#FBBF24' }}>Scoring Agent</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)' }}>GPT-4o evaluation + per-question feedback</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="l-agent-tools">
                <span className="l-agent-tools-label">Tools:</span>
                {agents[activeAgent].tools.map(tool => (
                  <span key={tool} className="l-tool-chip">{tool}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="l-section l-section-alt" id="how">
        <div className="l-section-inner">
          <div className="l-section-header">
            <span className="l-section-tag">Process</span>
            <h2>How It Works</h2>
            <p>Three steps from resume upload to hiring decision.</p>
          </div>
          <div className="l-steps">
            {steps.map((step, i) => (
              <div key={i} className="l-step-card">
                <div className="l-step-num">{step.num}</div>
                <div className="l-step-icon">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="l-section" id="features">
        <div className="l-section-inner">
          <div className="l-section-header">
            <span className="l-section-tag">Capabilities</span>
            <h2>Everything You Need</h2>
            <p>A complete AI hiring toolkit built with cutting-edge technology.</p>
          </div>
          <div className="l-features-grid">
            {features.map((f, i) => (
              <div key={i} className="l-feature-card" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="l-feature-icon bg-accent-wash text-accent">{f.icon}</div>
                <h4>{f.title}</h4>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="l-cta">
        <div className="l-cta-inner">
          <div className="l-cta-glow" aria-hidden="true" />
          <h2>Ready to hire smarter?</h2>
          <p>Upload your first resume and let AI agents do the heavy lifting.</p>
          <div className="l-cta-buttons">
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/hiring')}>
              Open Dashboard <ArrowRight size={18} />
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate('/candidate/login')}>
              Candidate Portal
            </button>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="l-footer">
        <div className="l-footer-inner">
          <div className="l-footer-logo"><Logo size={22} /> ResuMate AI</div>
          <div className="l-footer-links">
            <a href="#agents">Agents</a>
            <a href="#features">Features</a>
            <a href="#how">How It Works</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
          <p className="l-footer-copy">Built by Punith · Multi-Agent AI · GPT-4o + LangChain + ChromaDB</p>
        </div>
      </footer>
    </div>
  );
}