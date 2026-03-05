import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Shield, Zap, Target, BarChart2, Eye, ArrowRight, Upload, MessageSquare, Users, Briefcase, Video, UserCheck } from 'lucide-react';

const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs><linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs>
    <rect width="32" height="32" rx="8" fill="url(#lg)"/>
    <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#000" strokeWidth="1.5" fill="none"/>
    <circle cx="16" cy="16" r="3" fill="#000"/>
  </svg>
);

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const cursorRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (cursorRef.current) {
        cursorRef.current.style.left = e.clientX + 'px';
        cursorRef.current.style.top = e.clientY + 'px';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const features = [
    { icon: <Brain size={24} />, title: 'GPT-4o Analysis', desc: 'Latest AI model analyzes resumes with unmatched accuracy and understanding.' },
    { icon: <Target size={24} />, title: 'Smart Matching', desc: 'Find perfect candidates for any role with intelligent skill matching.' },
    { icon: <Shield size={24} />, title: 'No Hallucinations', desc: 'RAG-powered responses ensure accuracy - only facts from resumes.' },
    { icon: <BarChart2 size={24} />, title: 'Visual Analytics', desc: 'Beautiful charts and comparisons for your candidate pool.' },
    { icon: <Zap size={24} />, title: 'AI Scanner Agent', desc: 'Auto-detects GitHub, LinkedIn and scrapes profiles with browser agent.' },
    { icon: <Eye size={24} />, title: 'Live AI Interview', desc: 'AI-powered video interviews with face tracking and real-time scoring.' }
  ];

  const steps = [
    { icon: <Upload size={28} />, title: 'Upload Resumes', desc: 'Upload up to 20+ resumes (PDF, DOCX, TXT)' },
    { icon: <Users size={28} />, title: 'AI Analysis', desc: 'Scanner agent finds GitHub, LinkedIn, scrapes profiles' },
    { icon: <MessageSquare size={28} />, title: 'Smart Hiring', desc: 'AI chat, hiring agent, email composer, interview' }
  ];

  return (
    <div className="landing-page">
      <div ref={cursorRef} className="cursor-glow" />

      <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <div className="nav-logo"><Logo /> ResuMate AI</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate('/hiring')} className="btn btn-ghost btn-sm">
              Hiring Manager
            </button>
            <button onClick={() => navigate('/candidate/login')} className="btn btn-primary btn-sm">
              Candidate Login
            </button>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge"><span className="hero-dot" /> Powered by GPT-4o + AI Agents</div>
          <h1 className="hero-title">
            Intelligent Resume<br />
            <span className="hero-accent">Analytics Platform</span>
          </h1>
          <p className="hero-description">
            AI-powered hiring platform with resume analysis, browser agents, live interviews, and smart evaluation tools.
          </p>

          {/* ═══ ROLE SELECTOR CARDS ═══ */}
          <div className="role-cards">
            <div className="role-card hiring" onClick={() => navigate('/hiring')}>
              <div className="role-card-icon"><Briefcase size={32} /></div>
              <h3>I'm a Hiring Manager</h3>
              <p>Upload resumes, analyze candidates, run AI evaluations, create interviews</p>
              <div className="role-card-features">
                <span>📄 Resume Upload</span>
                <span>🤖 AI Scanner Agent</span>
                <span>📊 Analytics</span>
                <span>🎯 Hiring Agent</span>
                <span>✉️ Email Composer</span>
                <span>📅 Interview Creator</span>
              </div>
              <div className="role-card-btn">
                Enter Dashboard <ArrowRight size={16} />
              </div>
            </div>

            <div className="role-card candidate" onClick={() => navigate('/candidate/login')}>
              <div className="role-card-icon candidate-icon"><UserCheck size={32} /></div>
              <h3>I'm a Candidate</h3>
              <p>Upload your resume, get AI analysis, take AI-powered video interviews</p>
              <div className="role-card-features">
                <span>📄 Resume Upload</span>
                <span>🔍 AI Analysis</span>
                <span>💬 AI Chat</span>
                <span>🎥 Live AI Interview</span>
              </div>
              <div className="role-card-btn candidate-btn">
                Login with Email <ArrowRight size={16} />
              </div>
            </div>
          </div>

          <div className="hero-stats">
            <div><div className="hero-stat-value">20+</div><div className="hero-stat-label">Resumes at Once</div></div>
            <div><div className="hero-stat-value">GPT-4o</div><div className="hero-stat-label">Latest AI Model</div></div>
            <div><div className="hero-stat-value">AI Agent</div><div className="hero-stat-label">Browser Automation</div></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-inner">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">Three simple steps to smarter hiring</p>
          <div className="steps-grid">
            {steps.map((step, i) => (
              <div key={i} className="step-card glass-card">
                <div className="step-number">{i + 1}</div>
                <div className="step-icon">{step.icon}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <div className="section-inner">
          <h2 className="section-title">Features</h2>
          <p className="section-subtitle">Everything you need for smarter hiring</p>
          <div className="features-grid">
            {features.map((f, i) => (
              <div key={i} className="feature-card glass-card">
                <div className="feature-icon">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-description">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <div className="section-inner" style={{ textAlign: 'center' }}>
          <h2 className="section-title">Start Analyzing Resumes</h2>
          <p className="section-subtitle" style={{ marginBottom: '40px' }}>
            Upload your first resume and experience AI-powered insights
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/hiring')} className="btn btn-primary btn-lg">
              Hiring Manager <ArrowRight size={20} />
            </button>
            <button onClick={() => navigate('/candidate/login')} className="btn btn-secondary btn-lg">
              Candidate Login <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-logo"><Logo size={24} /> ResuMate AI</div>
          <p className="footer-copy">© 2026 ResuMate AI • Built by Sai Punith Kolla</p>
        </div>
      </footer>
    </div>
  );
}