// import React, { useState, useEffect, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { Brain, Shield, Zap, Target, BarChart2, Eye, ArrowRight, Upload, MessageSquare, Users } from 'lucide-react';

// const Logo = ({ size = 32 }) => (
//   <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
//     <defs><linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs>
//     <rect width="32" height="32" rx="8" fill="url(#lg)"/>
//     <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#000" strokeWidth="1.5" fill="none"/>
//     <circle cx="16" cy="16" r="3" fill="#000"/>
//   </svg>
// );

// export default function Landing() {
//   const navigate = useNavigate();
//   const [scrolled, setScrolled] = useState(false);
//   const cursorRef = useRef(null);

//   useEffect(() => {
//     const handleScroll = () => setScrolled(window.scrollY > 50);
//     window.addEventListener('scroll', handleScroll);
//     return () => window.removeEventListener('scroll', handleScroll);
//   }, []);

//   // Cursor glow effect
//   useEffect(() => {
//     const handleMouseMove = (e) => {
//       if (cursorRef.current) {
//         cursorRef.current.style.left = e.clientX + 'px';
//         cursorRef.current.style.top = e.clientY + 'px';
//       }
//     };
//     window.addEventListener('mousemove', handleMouseMove);
//     return () => window.removeEventListener('mousemove', handleMouseMove);
//   }, []);

//   const features = [
//     { icon: <Brain size={24} />, title: 'GPT-5.2 Analysis', desc: 'Latest AI model deeply analyzes resumes, extracting skills, experience, and insights with unmatched accuracy.' },
//     { icon: <Target size={24} />, title: 'Smart Matching', desc: 'Intelligent skill taxonomy and role inference to find the perfect candidates for any position.' },
//     { icon: <Shield size={24} />, title: 'No Hallucinations', desc: 'RAG-powered responses ensure AI only reports facts from resumes with clear uncertainty markers.' },
//     { icon: <BarChart2 size={24} />, title: 'Visual Analytics', desc: 'Beautiful glassmorphism charts and comparisons for your entire candidate pool.' },
//     { icon: <Zap size={24} />, title: 'Context Memory', desc: 'Remembers conversation context - use "he/she" and get intelligent follow-ups.' },
//     { icon: <Eye size={24} />, title: 'Privacy Mode', desc: 'Anonymize candidates for unbiased review while maintaining full analytics.' }
//   ];

//   const steps = [
//     { icon: <Upload size={28} />, title: 'Upload Resumes', desc: 'Upload up to 20+ resumes in PDF, DOCX, or TXT format' },
//     { icon: <Users size={28} />, title: 'Select Candidates', desc: 'Choose which candidates you want to analyze and compare' },
//     { icon: <MessageSquare size={28} />, title: 'Chat with AI', desc: 'Ask anything - compare candidates, find best fits, get insights' }
//   ];

//   return (
//     <div className="landing-page">
//       {/* Cursor Glow */}
//       <div ref={cursorRef} className="cursor-glow" />

//       {/* Navigation */}
//       <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
//         <div className="nav-inner">
//           <div className="nav-logo"><Logo /> ResuMate AI</div>
//           <button onClick={() => navigate('/dashboard')} className="btn btn-primary btn-sm">
//             Get Started <ArrowRight size={16} />
//           </button>
//         </div>
//       </nav>

//       {/* Hero Section */}
//       <section className="hero">
//         <div className="hero-content">
//           <div className="hero-badge"><span className="hero-dot" /> Powered by GPT-5.2</div>
//           <h1 className="hero-title">
//             Intelligent Resume<br />
//             <span className="hero-accent">Analytics Platform</span>
//           </h1>
//           <p className="hero-description">
//             Upload resumes, get instant AI-powered insights, and make evidence-based hiring decisions. 
//             Powered by LangChain + ChromaDB for accurate, context-aware analysis.
//           </p>
//           <div className="hero-actions">
//             <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
//               Start Analyzing <ArrowRight size={18} />
//             </button>
//           </div>
//           <div className="hero-stats">
//             <div><div className="hero-stat-value">20+</div><div className="hero-stat-label">Resumes at Once</div></div>
//             <div><div className="hero-stat-value">GPT-5.2</div><div className="hero-stat-label">Latest AI Model</div></div>
//             <div><div className="hero-stat-value">RAG</div><div className="hero-stat-label">No Hallucinations</div></div>
//           </div>
//         </div>
//       </section>

//       {/* How It Works */}
//       <section className="section">
//         <div className="section-inner">
//           <h2 className="section-title">How It Works</h2>
//           <p className="section-subtitle">Three simple steps to smarter hiring</p>
//           <div className="steps-grid">
//             {steps.map((step, i) => (
//               <div key={i} className="step-card glass-card">
//                 <div className="step-number">{i + 1}</div>
//                 <div className="step-icon">{step.icon}</div>
//                 <h3 className="step-title">{step.title}</h3>
//                 <p className="step-desc">{step.desc}</p>
//               </div>
//             ))}
//           </div>
//         </div>
//       </section>

//       {/* Features */}
//       <section className="section section-dark">
//         <div className="section-inner">
//           <h2 className="section-title">Powerful Features</h2>
//           <p className="section-subtitle">Everything you need for smarter, unbiased hiring decisions</p>
//           <div className="features-grid">
//             {features.map((f, i) => (
//               <div key={i} className="feature-card glass-card">
//                 <div className="feature-icon">{f.icon}</div>
//                 <h3 className="feature-title">{f.title}</h3>
//                 <p className="feature-description">{f.desc}</p>
//               </div>
//             ))}
//           </div>
//         </div>
//       </section>

//       {/* CTA */}
//       <section className="section cta-section">
//         <div className="section-inner" style={{ textAlign: 'center' }}>
//           <h2 className="section-title">Ready to Transform Your Hiring?</h2>
//           <p className="section-subtitle" style={{ marginBottom: '40px' }}>
//             Join thousands of recruiters using AI-powered resume analysis
//           </p>
//           <button onClick={() => navigate('/dashboard')} className="btn btn-primary btn-lg">
//             Get Started Free <ArrowRight size={20} />
//           </button>
//         </div>
//       </section>

//       {/* Footer */}
//       <footer className="footer">
//         <div className="footer-inner">
//           <div className="footer-logo"><Logo size={24} /> ResuMate AI</div>
//           <p className="footer-copy">© 2024 ResuMate AI. Powered by GPT-5.2 + LangChain + ChromaDB</p>
//         </div>
//       </footer>
//     </div>
//   );
// }
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Shield, Zap, Target, BarChart2, Eye, ArrowRight, Upload, MessageSquare, Users } from 'lucide-react';

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
    { icon: <Brain size={24} />, title: 'GPT-5.2 Analysis', desc: 'Latest AI model analyzes resumes with unmatched accuracy and understanding.' },
    { icon: <Target size={24} />, title: 'Smart Matching', desc: 'Find perfect candidates for any role with intelligent skill matching.' },
    { icon: <Shield size={24} />, title: 'No Hallucinations', desc: 'RAG-powered responses ensure accuracy - only facts from resumes.' },
    { icon: <BarChart2 size={24} />, title: 'Visual Analytics', desc: 'Beautiful charts and comparisons for your candidate pool.' },
    { icon: <Zap size={24} />, title: 'Context Memory', desc: 'AI remembers conversation - use natural language like "tell me more".' },
    { icon: <Eye size={24} />, title: 'Privacy Mode', desc: 'Anonymize candidates for unbiased review.' }
  ];

  const steps = [
    { icon: <Upload size={28} />, title: 'Upload Resumes', desc: 'Upload up to 20+ resumes (PDF, DOCX, TXT)' },
    { icon: <Users size={28} />, title: 'Select Candidates', desc: 'Choose candidates to analyze and compare' },
    { icon: <MessageSquare size={28} />, title: 'Chat with AI', desc: 'Ask anything in natural language' }
  ];

  return (
    <div className="landing-page">
      <div ref={cursorRef} className="cursor-glow" />

      <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <div className="nav-logo"><Logo /> ResuMate AI</div>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary btn-sm">
            Get Started <ArrowRight size={16} />
          </button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge"><span className="hero-dot" /> Powered by GPT-5.2</div>
          <h1 className="hero-title">
            Intelligent Resume<br />
            <span className="hero-accent">Analytics Platform</span>
          </h1>
          <p className="hero-description">
            Upload resumes, get AI-powered insights, and make better hiring decisions.
            Powered by LangChain + ChromaDB for accurate analysis.
          </p>
          <div className="hero-actions">
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
              Start Analyzing <ArrowRight size={18} />
            </button>
          </div>
          <div className="hero-stats">
            <div><div className="hero-stat-value">20+</div><div className="hero-stat-label">Resumes at Once</div></div>
            <div><div className="hero-stat-value">GPT-5.2</div><div className="hero-stat-label">Latest AI Model</div></div>
            <div><div className="hero-stat-value">RAG</div><div className="hero-stat-label">No Hallucinations</div></div>
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
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary btn-lg">
            Open Dashboard <ArrowRight size={20} />
          </button>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-logo"><Logo size={24} /> ResuMate AI</div>
          <p className="footer-copy">© 2026 ResuMate AI • GPT-5.2 + LangChain + ChromaDB</p>
        </div>
      </footer>
    </div>
  );
}