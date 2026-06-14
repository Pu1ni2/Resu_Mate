import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Upload, MessageSquare, Users, Briefcase, Video, UserCheck,
  Bot, Search, Github, Mail, Calendar, Cpu, Shield, Eye,
  ChevronRight, Zap, BarChart2, Globe, Play, Star
} from 'lucide-react';

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

// ─── Animated grid background ───
const GridBackground = () => (
  <div className="l-grid-bg" aria-hidden="true">
    <div className="l-grid-pattern" />
    <div className="l-grid-fade" />
    <div className="l-grid-glow l-grid-glow-1" />
    <div className="l-grid-glow l-grid-glow-2" />
  </div>
);

// ─── Floating agent badges in hero ───
const FloatingBadge = ({ icon, label, className, delay }) => (
  <div className={`l-float-badge ${className}`} style={{ animationDelay: `${delay}s` }}>
    {icon}
    <span>{label}</span>
  </div>
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
    { name: 'Data Agent', desc: 'Scans resumes, scrapes GitHub & LinkedIn with browser automation, enriches candidate profiles from multiple sources.', icon: <Search size={20} />, color: '#3B82F6', tools: ['PDF Extract', 'Playwright', 'GitHub API', 'Tavily'] },
    { name: 'HR Agent', desc: 'Evaluates candidates against job requirements, drafts personalized emails, provides hiring recommendations with bias checks.', icon: <UserCheck size={20} />, color: '#22C55E', tools: ['GPT-4o', 'Salary Research', 'Email Drafting'] },
    { name: 'Technical Agent', desc: 'Orchestrates the entire interview pipeline — splits into two specialized sub-agents that work in sequence.', icon: <Cpu size={20} />, color: '#8B5CF6', tools: ['LiveKit', 'Simli Avatar', 'OpenAI Realtime', 'Whisper'], hasSubAgents: true },
    { name: 'Research Agent', desc: 'Searches the web for candidate info, fact-checks resume claims, provides real-time data during AI chat.', icon: <Globe size={20} />, color: '#F59E0B', tools: ['Tavily Search', 'Fact Check', 'Citation'] },
    { name: 'Advisor Agent', desc: 'Candidate-facing career coach with 3 modes — Resume Coach, Interview Prep, and Career Advisor. Personalized AI guidance.', icon: <Bot size={20} />, color: '#EC4899', tools: ['Resume Coach', 'Interview Prep', 'Career Advisor'] },
  ];

  const features = [
    { icon: <Bot size={22} />, title: '5 AI Agents', desc: 'Custom agent framework with Plan → Execute → Reflect → Output pipeline. Real agents, not just prompts.', accent: '#F59E0B' },
    { icon: <Search size={22} />, title: 'Scanner Agent', desc: 'Extracts links from PDFs, launches headless browser to scrape GitHub profiles, searches LinkedIn via Tavily.', accent: '#3B82F6' },
    { icon: <Video size={22} />, title: 'Live AI Interview', desc: 'Camera + mic. AI asks questions via voice, candidate answers live. Real-time scoring with evaluation report.', accent: '#8B5CF6' },
    { icon: <Shield size={22} />, title: 'RAG — No Hallucinations', desc: 'ChromaDB vector store ensures AI only uses facts from actual resumes. Never makes things up.', accent: '#22C55E' },
    { icon: <BarChart2 size={22} />, title: 'Smart Analytics', desc: 'Compare multiple candidates side by side. Skills matching, experience analysis, role fit scoring.', accent: '#EC4899' },
    { icon: <Mail size={22} />, title: 'Email Composer', desc: 'AI drafts personalized emails based on evaluation. One-click open in Gmail, Outlook, or default mail.', accent: '#F59E0B' },
  ];

  const steps = [
    { num: '01', title: 'Upload Resumes', desc: 'Drop PDFs, DOCX, or TXT files. AI extracts text, embedded links, and analyzes content instantly.', icon: <Upload size={24} /> },
    { num: '02', title: 'AI Agents Activate', desc: 'Data Agent scans profiles. Research Agent searches the web. All findings feed into a rich candidate profile.', icon: <Cpu size={24} /> },
    { num: '03', title: 'Evaluate & Interview', desc: 'HR Agent evaluates fit. Create AI interviews for candidates. Get comprehensive reports with recommendations.', icon: <Cpu size={24} /> },
  ];

  return (
    <div className="l-page">
      <GridBackground />

      {/* ═══ NAV ═══ */}
      <nav className={`l-nav ${scrolled ? 'l-nav-scrolled' : ''}`}>
        <div className="l-nav-inner">
          <div className="l-nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <Logo size={28} />
            <span>ResuMate<span className="l-nav-ai">AI</span></span>
          </div>
          <div className="l-nav-links hide-mobile">
            <a href="#agents">Agents</a>
            <a href="#features">Features</a>
            <a href="#how">How It Works</a>
          </div>
          <div className="l-nav-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/candidate/login')}>Candidate Login</button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/hiring')}>
              Hiring Dashboard <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="l-hero">
        <div className="l-hero-content">
          <div className="l-hero-badge animate-fadeInUp">
            <span className="l-pulse-dot" />
            <span>Multi-Agent AI Platform</span>
            <Zap size={12} />
          </div>

          <h1 className="l-hero-title animate-fadeInUp" style={{ animationDelay: '100ms' }}>
            Hire Smarter with<br />
            <span className="l-gradient-text">AI Agents</span>
          </h1>

          <p className="l-hero-desc animate-fadeInUp" style={{ animationDelay: '200ms' }}>
            5 specialized AI agents work together to analyze resumes, scrape profiles, evaluate candidates, coach careers, and conduct live avatar interviews — all in one platform.
          </p>

          {/* Role selector */}
          <div className="l-hero-roles animate-fadeInUp" style={{ animationDelay: '300ms' }}>
            <button className="l-role-btn l-role-hiring" onClick={() => navigate('/hiring')}>
              <div className="l-role-icon"><Briefcase size={22} /></div>
              <div className="l-role-info">
                <strong>I'm Hiring</strong>
                <span>Upload resumes, evaluate, interview</span>
              </div>
              <ChevronRight size={18} className="l-role-arrow" />
            </button>
            <button className="l-role-btn l-role-candidate" onClick={() => navigate('/candidate/login')}>
              <div className="l-role-icon l-role-icon-blue"><UserCheck size={22} /></div>
              <div className="l-role-info">
                <strong>I'm a Candidate</strong>
                <span>Take AI interview, view analysis</span>
              </div>
              <ChevronRight size={18} className="l-role-arrow" />
            </button>
          </div>

          {/* Tech badges */}
          <div className="l-hero-tech animate-fadeInUp" style={{ animationDelay: '400ms' }}>
            {['GPT-4o', 'LangChain', 'ChromaDB', 'Playwright', 'Tavily', 'PostgreSQL'].map(t => (
              <span key={t} className="l-tech-pill">{t}</span>
            ))}
          </div>
        </div>

        {/* Floating badges */}
        <div className="l-hero-floats hide-mobile" aria-hidden="true">
          <FloatingBadge icon={<Search size={14} />} label="Scanning GitHub..." className="l-fb-1" delay={0} />
          <FloatingBadge icon={<Bot size={14} />} label="Evaluating candidate..." className="l-fb-2" delay={1.2} />
          <FloatingBadge icon={<Video size={14} />} label="Interview ready" className="l-fb-3" delay={2.4} />
          <FloatingBadge icon={<Mail size={14} />} label="Email drafted" className="l-fb-4" delay={3.6} />
        </div>
      </section>

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
                <button key={i} className={`l-agent-tab ${activeAgent === i ? 'active' : ''}`} onClick={() => setActiveAgent(i)} style={{ '--agent-color': agent.color }}>
                  <div className="l-agent-tab-icon">{agent.icon}</div>
                  <span>{agent.name}</span>
                </button>
              ))}
            </div>

            {/* Active agent detail */}
            <div className="l-agent-detail" key={activeAgent}>
              <div className="l-agent-detail-header" style={{ '--agent-color': agents[activeAgent].color }}>
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
                  <div style={{ padding: '12px 18px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '12px', textAlign: 'center', minWidth: '100px' }}>
                    <Cpu size={18} style={{ color: '#8B5CF6', marginBottom: '4px' }} />
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#8B5CF6' }}>Technical Agent</div>
                  </div>

                  {/* Animated arrow */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 8px' }}>
                    <svg width="60" height="60" viewBox="0 0 60 60" style={{ overflow: 'visible' }}>
                      {/* Arrow to Interview Agent */}
                      <path d="M0,20 Q30,5 55,15" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeDasharray="4,4">
                        <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" />
                      </path>
                      <polygon points="52,12 58,16 52,20" fill="#8B5CF6">
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
                    <div style={{ padding: '10px 16px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Video size={14} style={{ color: '#8B5CF6' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#A78BFA' }}>Interview Agent</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)' }}>LiveKit + Simli Avatar + OpenAI Realtime</div>
                      </div>
                    </div>

                    {/* Arrow between sub-agents */}
                    <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <svg width="20" height="20" viewBox="0 0 20 20">
                        <path d="M10,2 L10,14" stroke="var(--text3)" strokeWidth="1.5" strokeDasharray="3,2">
                          <animate attributeName="stroke-dashoffset" from="5" to="0" dur="0.8s" repeatCount="indefinite" />
                        </path>
                        <polygon points="7,12 10,18 13,12" fill="var(--text3)" />
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
                  <span key={tool} className="l-tool-chip" style={{ '--agent-color': agents[activeAgent].color }}>{tool}</span>
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
                <div className="l-feature-icon" style={{ background: `${f.accent}15`, color: f.accent }}>{f.icon}</div>
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