// // // import React, { useState, useRef, useEffect } from 'react';
// // // import { useNavigate } from 'react-router-dom';
// // // import { useApp } from '../context/AppContext';
// // // import { marked } from 'marked';
// // // import { 
// // //   Users, BarChart2, MessageSquare, Upload, Check, Home, Sparkles, 
// // //   Eye, EyeOff, Briefcase, MapPin, Award, GraduationCap, Trash2, 
// // //   ChevronLeft, ChevronRight, TrendingUp, Send, Bot, FileText, AlertCircle
// // // } from 'lucide-react';

// // // const Logo = ({ size = 32 }) => (
// // //   <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
// // //     <defs><linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs>
// // //     <rect width="32" height="32" rx="8" fill="url(#lg2)"/>
// // //     <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#000" strokeWidth="1.5" fill="none"/>
// // //     <circle cx="16" cy="16" r="3" fill="#000"/>
// // //   </svg>
// // // );

// // // const AIAvatar = () => (
// // //   <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
// // //     <Bot size={18} />
// // //   </div>
// // // );

// // // export default function Dashboard() {
// // //   const navigate = useNavigate();
// // //   const {
// // //     candidates, selectedIds, selectedCandidates, uploadProgress, loading,
// // //     loadCandidates, uploadResume, deleteCandidate, toggleSelection, selectAll, clearSelection,
// // //     anonymize, setAnonymize, analytics,
// // //     messages, suggestions, isTyping, sendMessage, initChat, clearChat,
// // //     getDisplayName, getAvatarGradient
// // //   } = useApp();

// // //   const [tab, setTab] = useState('upload');
// // //   const [input, setInput] = useState('');
// // //   const [dragActive, setDragActive] = useState(false);
// // //   const fileRef = useRef(null);
// // //   const msgEndRef = useRef(null);
// // //   const sliderRef = useRef(null);
// // //   const cursorRef = useRef(null);

// // //   // Load candidates on mount
// // //   useEffect(() => { loadCandidates(); }, [loadCandidates]);

// // //   // Init chat when switching to chat tab
// // //   useEffect(() => {
// // //     if (tab === 'chat') initChat();
// // //   }, [tab, initChat]);

// // //   // Scroll chat
// // //   useEffect(() => {
// // //     msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
// // //   }, [messages, isTyping]);

// // //   // Cursor glow
// // //   useEffect(() => {
// // //     const handleMouseMove = (e) => {
// // //       if (cursorRef.current) {
// // //         cursorRef.current.style.left = e.clientX + 'px';
// // //         cursorRef.current.style.top = e.clientY + 'px';
// // //       }
// // //     };
// // //     window.addEventListener('mousemove', handleMouseMove);
// // //     return () => window.removeEventListener('mousemove', handleMouseMove);
// // //   }, []);

// // //   const handleUpload = async (files) => {
// // //     for (const file of Array.from(files)) {
// // //       try {
// // //         await uploadResume(file);
// // //       } catch (err) {
// // //         console.error('Upload failed:', err);
// // //         alert(`Failed: ${err.response?.data?.detail || err.message}`);
// // //       }
// // //     }
// // //   };

// // //   const handleSend = (msg) => {
// // //     const m = msg || input.trim();
// // //     if (m) { sendMessage(m); setInput(''); }
// // //   };

// // //   const scrollSlider = (dir) => {
// // //     sliderRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });
// // //   };

// // //   // Get skills array from candidate
// // //   const getSkills = (c) => {
// // //     if (!c.skills) return [];
// // //     if (Array.isArray(c.skills)) return c.skills.slice(0, 6);
// // //     return [];
// // //   };

// // //   return (
// // //     <div className="dashboard-layout">
// // //       <div ref={cursorRef} className="cursor-glow" />

// // //       {/* Sidebar */}
// // //       <aside className="sidebar">
// // //         <div className="sidebar-header">
// // //           <button className="sidebar-logo" onClick={() => navigate('/')}>
// // //             <Logo /> ResuMate
// // //           </button>
// // //         </div>
// // //         <nav className="sidebar-nav">
// // //           <div className="sidebar-section">
// // //             <div className="sidebar-section-title">Navigation</div>
// // //             <div className="sidebar-link" onClick={() => navigate('/')}>
// // //               <Home size={18} /><span>Home</span>
// // //             </div>
// // //             {[
// // //               { id: 'upload', icon: <Upload size={18} />, label: 'Upload' },
// // //               { id: 'analytics', icon: <BarChart2 size={18} />, label: 'Analytics' },
// // //               { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Chat' }
// // //             ].map(item => (
// // //               <div
// // //                 key={item.id}
// // //                 className={`sidebar-link ${tab === item.id ? 'active' : ''}`}
// // //                 onClick={() => setTab(item.id)}
// // //               >
// // //                 {item.icon}<span>{item.label}</span>
// // //               </div>
// // //             ))}
// // //           </div>
// // //         </nav>
// // //         <div className="sidebar-footer">
// // //           <div className="sidebar-stats">
// // //             <div className="sidebar-stat">
// // //               <span className="sidebar-stat-value">{candidates.length}</span>
// // //               <span className="sidebar-stat-label">Uploaded</span>
// // //             </div>
// // //             <div className="sidebar-stat">
// // //               <span className="sidebar-stat-value">{selectedIds.length}</span>
// // //               <span className="sidebar-stat-label">Selected</span>
// // //             </div>
// // //           </div>
// // //         </div>
// // //       </aside>

// // //       {/* Main */}
// // //       <main className="main">
// // //         <header className="main-header">
// // //           <div className="header-left">
// // //             <h1 className="main-title">
// // //               {tab === 'upload' ? 'Upload Resumes' : tab === 'analytics' ? 'Analytics' : 'AI Chat'}
// // //             </h1>
// // //             {candidates.length > 0 && <span className="badge badge-orange">{candidates.length} candidates</span>}
// // //             {selectedIds.length > 0 && <span className="badge badge-green">{selectedIds.length} selected</span>}
// // //           </div>
// // //           <div className="header-right">
// // //             <div className="toggle-wrapper">
// // //               <span className="toggle-label">
// // //                 {anonymize ? <EyeOff size={16} /> : <Eye size={16} />} Anonymize
// // //               </span>
// // //               <div className={`toggle ${anonymize ? 'active' : ''}`} onClick={() => setAnonymize(!anonymize)}>
// // //                 <div className="toggle-knob" />
// // //               </div>
// // //             </div>
// // //           </div>
// // //         </header>

// // //         <div className="main-body">
// // //           {/* ========== UPLOAD TAB ========== */}
// // //           {tab === 'upload' && (
// // //             <div className="upload-tab">
// // //               {/* Upload Zone */}
// // //               <div className="card upload-card">
// // //                 <div className="card-body">
// // //                   <div
// // //                     className={`upload-zone ${dragActive ? 'active' : ''}`}
// // //                     onClick={() => fileRef.current?.click()}
// // //                     onDragOver={e => { e.preventDefault(); setDragActive(true); }}
// // //                     onDragLeave={() => setDragActive(false)}
// // //                     onDrop={e => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
// // //                   >
// // //                     <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
// // //                     <div className="upload-icon"><Upload size={36} /></div>
// // //                     <h3>Drop resumes here or click to upload</h3>
// // //                     <p>PDF, DOCX, TXT • Up to 20+ files • AI will analyze each one</p>
// // //                   </div>

// // //                   {/* Progress */}
// // //                   {Object.entries(uploadProgress).map(([id, p]) => (
// // //                     <div key={id} className="upload-progress">
// // //                       <div className="progress-header">
// // //                         <span>AI analyzing resume...</span>
// // //                         <span className="progress-value">{p}%</span>
// // //                       </div>
// // //                       <div className="progress"><div className="progress-fill" style={{ width: `${p}%` }} /></div>
// // //                     </div>
// // //                   ))}
// // //                 </div>
// // //               </div>

// // //               {/* Candidates List */}
// // //               {candidates.length > 0 && (
// // //                 <div className="candidates-section">
// // //                   <div className="candidates-header">
// // //                     <h2>Uploaded Candidates ({candidates.length})</h2>
// // //                     <div className="candidates-actions">
// // //                       <button onClick={selectAll} className="btn btn-secondary btn-sm">Select All</button>
// // //                       <button onClick={clearSelection} className="btn btn-ghost btn-sm">Clear</button>
// // //                     </div>
// // //                   </div>

// // //                   <div className="candidates-slider">
// // //                     <button className="slider-btn slider-btn-left" onClick={() => scrollSlider(-1)}>
// // //                       <ChevronLeft size={20} />
// // //                     </button>
// // //                     <div className="slider-track" ref={sliderRef}>
// // //                       {candidates.map((c, i) => (
// // //                         <div
// // //                           key={c.id}
// // //                           className={`candidate-card glass-card ${selectedIds.includes(c.id) ? 'selected' : ''} ${!c.is_resume ? 'not-resume' : ''}`}
// // //                           onClick={() => toggleSelection(c.id)}
// // //                         >
// // //                           {!c.is_resume && (
// // //                             <div className="not-resume-banner">
// // //                               <AlertCircle size={14} /> Not a Resume
// // //                             </div>
// // //                           )}
// // //                           <div className="candidate-header">
// // //                             <div className="candidate-avatar" style={{ background: getAvatarGradient(c.name) }}>
// // //                               {getDisplayName(c, i)[0]?.toUpperCase()}
// // //                             </div>
// // //                             {selectedIds.includes(c.id) && (
// // //                               <div className="selected-check"><Check size={14} /></div>
// // //                             )}
// // //                             <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteCandidate(c.id); }}>
// // //                               <Trash2 size={14} />
// // //                             </button>
// // //                           </div>
// // //                           <h3 className="candidate-name">{getDisplayName(c, i)}</h3>
// // //                           <p className="candidate-role">{c.predicted_role || 'Processing...'}</p>
                          
// // //                           <div className="candidate-badges">
// // //                             {c.badges?.slice(0, 3).map((b, j) => (
// // //                               <span key={j} className={`badge badge-${b.color || 'blue'}`}>{b.label}</span>
// // //                             ))}
// // //                           </div>

// // //                           <div className="candidate-stats">
// // //                             <span><Briefcase size={12} /> {c.total_experience_years || 0}y</span>
// // //                             <span><Award size={12} /> {c.experience_level || 'N/A'}</span>
// // //                           </div>

// // //                           {c.location && (
// // //                             <div className="candidate-location">
// // //                               <MapPin size={12} /> {c.location}
// // //                             </div>
// // //                           )}

// // //                           <div className="candidate-skills">
// // //                             {getSkills(c).slice(0, 4).map((s, j) => (
// // //                               <span key={j} className="skill">{typeof s === 'string' ? s : s?.name}</span>
// // //                             ))}
// // //                             {getSkills(c).length > 4 && <span className="skill">+{getSkills(c).length - 4}</span>}
// // //                           </div>
// // //                         </div>
// // //                       ))}
// // //                     </div>
// // //                     <button className="slider-btn slider-btn-right" onClick={() => scrollSlider(1)}>
// // //                       <ChevronRight size={20} />
// // //                     </button>
// // //                   </div>
// // //                 </div>
// // //               )}

// // //               {/* Empty State */}
// // //               {candidates.length === 0 && !loading && (
// // //                 <div className="empty-state">
// // //                   <div className="empty-icon"><FileText size={40} /></div>
// // //                   <h3>No resumes uploaded yet</h3>
// // //                   <p>Upload resumes to get started with AI-powered analysis</p>
// // //                 </div>
// // //               )}
// // //             </div>
// // //           )}

// // //           {/* ========== ANALYTICS TAB ========== */}
// // //           {tab === 'analytics' && (
// // //             <div className="analytics-tab">
// // //               {selectedCandidates.length === 0 ? (
// // //                 <div className="empty-state">
// // //                   <div className="empty-icon"><BarChart2 size={40} /></div>
// // //                   <h3>No candidates selected</h3>
// // //                   <p>Select candidates in the Upload tab to see analytics</p>
// // //                 </div>
// // //               ) : (
// // //                 <>
// // //                   {/* Stats Grid */}
// // //                   <div className="analytics-grid">
// // //                     {[
// // //                       { label: 'Selected', value: analytics.total, color: 'var(--accent)', icon: <Users size={20} /> },
// // //                       { label: 'Avg Experience', value: `${analytics.avgExperience}y`, color: 'var(--success)', icon: <Briefcase size={20} /> },
// // //                       { label: 'Unique Skills', value: analytics.totalSkills, color: 'var(--info)', icon: <Sparkles size={20} /> }
// // //                     ].map((stat, i) => (
// // //                       <div key={i} className="analytics-card glass-card">
// // //                         <div className="analytics-icon" style={{ color: stat.color }}>{stat.icon}</div>
// // //                         <div className="analytics-label">{stat.label}</div>
// // //                         <div className="analytics-value" style={{ color: stat.color }}>{stat.value}</div>
// // //                       </div>
// // //                     ))}
// // //                   </div>

// // //                   {/* Experience Slider */}
// // //                   <div className="chart-section">
// // //                     <h3 className="chart-title"><TrendingUp size={20} /> Experience Comparison</h3>
// // //                     <div className="experience-slider">
// // //                       {selectedCandidates.filter(c => c.is_resume !== false).map((c, i) => {
// // //                         const maxExp = Math.max(...selectedCandidates.map(x => x.total_experience_years || 0), 1);
// // //                         const pct = ((c.total_experience_years || 0) / maxExp) * 100;
// // //                         return (
// // //                           <div key={c.id} className="experience-card glass-card">
// // //                             <div className="exp-header">
// // //                               <div className="avatar-sm" style={{ background: getAvatarGradient(c.name) }}>
// // //                                 {getDisplayName(c, i)[0]}
// // //                               </div>
// // //                               <div>
// // //                                 <div className="exp-name">{getDisplayName(c, i)}</div>
// // //                                 <div className="exp-role">{c.predicted_role}</div>
// // //                               </div>
// // //                             </div>
// // //                             <div className="exp-value">{c.total_experience_years || 0}y</div>
// // //                             <div className="exp-bar">
// // //                               <div className="exp-bar-fill" style={{ width: `${pct}%` }} />
// // //                             </div>
// // //                           </div>
// // //                         );
// // //                       })}
// // //                     </div>
// // //                   </div>

// // //                   {/* Skills Chart */}
// // //                   <div className="chart-section">
// // //                     <h3 className="chart-title"><Sparkles size={20} /> Top Skills</h3>
// // //                     <div className="glass-card" style={{ padding: '24px' }}>
// // //                       {analytics.topSkills.map((s, i) => (
// // //                         <div key={i} className="chart-bar">
// // //                           <div className="chart-bar-header">
// // //                             <span>{s.name}</span>
// // //                             <span className="chart-bar-value">{s.count} ({s.percentage}%)</span>
// // //                           </div>
// // //                           <div className="chart-bar-track">
// // //                             <div className="chart-bar-fill" style={{ width: `${s.percentage}%` }} />
// // //                           </div>
// // //                         </div>
// // //                       ))}
// // //                       {analytics.topSkills.length === 0 && <p className="no-data">No skills data</p>}
// // //                     </div>
// // //                   </div>

// // //                   {/* Distributions */}
// // //                   <div className="distributions-grid">
// // //                     <div className="glass-card distribution-card">
// // //                       <h3 className="chart-title"><Users size={18} /> Roles</h3>
// // //                       {analytics.roleDistribution.map((r, i) => (
// // //                         <div key={i} className="dist-row">
// // //                           <span>{r.name}</span>
// // //                           <span className="badge badge-orange">{r.count}</span>
// // //                         </div>
// // //                       ))}
// // //                     </div>
// // //                     <div className="glass-card distribution-card">
// // //                       <h3 className="chart-title"><Award size={18} /> Levels</h3>
// // //                       {analytics.levelDistribution.map((l, i) => (
// // //                         <div key={i} className="dist-row">
// // //                           <span>{l.name}</span>
// // //                           <span className="badge badge-green">{l.count}</span>
// // //                         </div>
// // //                       ))}
// // //                     </div>
// // //                   </div>
// // //                 </>
// // //               )}
// // //             </div>
// // //           )}

// // //           {/* ========== AI CHAT TAB ========== */}
// // //           {tab === 'chat' && (
// // //             <div className="chat-tab">
// // //               {selectedCandidates.length === 0 ? (
// // //                 <div className="empty-state">
// // //                   <div className="empty-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
// // //                     <Bot size={40} />
// // //                   </div>
// // //                   <h3>Select candidates to chat</h3>
// // //                   <p>Go to Upload tab and select at least one candidate to start chatting with AI</p>
// // //                 </div>
// // //               ) : (
// // //                 <div className="chat-container">
// // //                   <div className="chat-card glass-card">
// // //                     {/* Chat Header */}
// // //                     <div className="chat-header">
// // //                       <div className="chat-header-left">
// // //                         <AIAvatar />
// // //                         <div>
// // //                           <div className="chat-ai-name">ResuMate AI</div>
// // //                           <div className="chat-ai-status">
// // //                             Analyzing {selectedCandidates.filter(c => c.is_resume !== false).length} candidate(s) • GPT-5.2
// // //                           </div>
// // //                         </div>
// // //                       </div>
// // //                       <button onClick={clearChat} className="btn btn-ghost btn-sm">
// // //                         <Trash2 size={14} /> Clear
// // //                       </button>
// // //                     </div>

// // //                     {/* Messages */}
// // //                     <div className="chat-messages">
// // //                       {messages.map((m, i) => (
// // //                         <div key={i} className={`chat-message ${m.role}`}>
// // //                           {m.role === 'assistant' && <AIAvatar />}
// // //                           <div className={`chat-bubble ${m.role}`}>
// // //                             {m.role === 'user' ? (
// // //                               <p>{m.content}</p>
// // //                             ) : (
// // //                               <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />
// // //                             )}
// // //                           </div>
// // //                           {m.role === 'user' && (
// // //                             <div className="avatar-sm" style={{ background: 'var(--bg3)' }}>
// // //                               <Users size={16} />
// // //                             </div>
// // //                           )}
// // //                         </div>
// // //                       ))}
// // //                       {isTyping && (
// // //                         <div className="chat-message assistant">
// // //                           <AIAvatar />
// // //                           <div className="chat-bubble assistant">
// // //                             <div className="typing"><span /><span /><span /></div>
// // //                           </div>
// // //                         </div>
// // //                       )}
// // //                       <div ref={msgEndRef} />
// // //                     </div>

// // //                     {/* Suggestions */}
// // //                     {suggestions.length > 0 && !isTyping && (
// // //                       <div className="chat-suggestions">
// // //                         {suggestions.map((q, i) => (
// // //                           <button key={i} className="chat-suggestion" onClick={() => handleSend(q)}>
// // //                             {q}
// // //                           </button>
// // //                         ))}
// // //                       </div>
// // //                     )}

// // //                     {/* Input */}
// // //                     <div className="chat-input-area">
// // //                       <input
// // //                         type="text"
// // //                         className="input chat-input"
// // //                         value={input}
// // //                         onChange={e => setInput(e.target.value)}
// // //                         onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
// // //                         placeholder="Ask anything about your candidates..."
// // //                         disabled={isTyping}
// // //                       />
// // //                       <button
// // //                         onClick={() => handleSend()}
// // //                         disabled={!input.trim() || isTyping}
// // //                         className="btn btn-primary send-btn"
// // //                       >
// // //                         <Send size={18} />
// // //                       </button>
// // //                     </div>
// // //                   </div>
// // //                 </div>
// // //               )}
// // //             </div>
// // //           )}
// // //         </div>
// // //       </main>
// // //     </div>
// // //   );
// // // }
// // import React, { useState, useRef, useEffect } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // import { useApp } from '../context/AppContext';
// // import { marked } from 'marked';
// // import { 
// //   Users, BarChart2, MessageSquare, Upload, Check, Home, Sparkles, 
// //   Eye, EyeOff, Briefcase, MapPin, Award, GraduationCap, Trash2, 
// //   ChevronLeft, ChevronRight, TrendingUp, Send, Bot, FileText, AlertCircle
// // } from 'lucide-react';

// // const Logo = ({ size = 32 }) => (
// //   <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
// //     <defs><linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs>
// //     <rect width="32" height="32" rx="8" fill="url(#lg2)"/>
// //     <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#000" strokeWidth="1.5" fill="none"/>
// //     <circle cx="16" cy="16" r="3" fill="#000"/>
// //   </svg>
// // );

// // const AIAvatar = () => (
// //   <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
// //     <Bot size={18} />
// //   </div>
// // );

// // // Floating particles for analytics
// // const FloatingParticles = () => (
// //   <div className="floating-particles">
// //     {[...Array(20)].map((_, i) => (
// //       <div 
// //         key={i} 
// //         className="particle"
// //         style={{
// //           left: `${Math.random() * 100}%`,
// //           top: `${Math.random() * 100}%`,
// //           animationDelay: `${Math.random() * 5}s`,
// //           animationDuration: `${10 + Math.random() * 10}s`
// //         }}
// //       />
// //     ))}
// //   </div>
// // );

// // export default function Dashboard() {
// //   const navigate = useNavigate();
// //   const {
// //     candidates, selectedIds, selectedCandidates, uploadProgress, loading,
// //     loadCandidates, uploadResume, deleteCandidate, toggleSelection, selectAll, clearSelection,
// //     anonymize, setAnonymize, analytics,
// //     messages, suggestions, isTyping, sendMessage, initChat, clearChat,
// //     getDisplayName, getAvatarGradient
// //   } = useApp();

// //   const [tab, setTab] = useState('upload');
// //   const [input, setInput] = useState('');
// //   const [dragActive, setDragActive] = useState(false);
// //   const fileRef = useRef(null);
// //   const msgEndRef = useRef(null);
// //   const sliderRef = useRef(null);
// //   const cursorRef = useRef(null);

// //   useEffect(() => { loadCandidates(); }, [loadCandidates]);

// //   useEffect(() => {
// //     if (tab === 'chat') initChat();
// //   }, [tab, initChat]);

// //   useEffect(() => {
// //     msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
// //   }, [messages, isTyping]);

// //   useEffect(() => {
// //     const handleMouseMove = (e) => {
// //       if (cursorRef.current) {
// //         cursorRef.current.style.left = e.clientX + 'px';
// //         cursorRef.current.style.top = e.clientY + 'px';
// //       }
// //     };
// //     window.addEventListener('mousemove', handleMouseMove);
// //     return () => window.removeEventListener('mousemove', handleMouseMove);
// //   }, []);

// //   const handleUpload = async (files) => {
// //     for (const file of Array.from(files)) {
// //       try {
// //         await uploadResume(file);
// //       } catch (err) {
// //         alert(`Failed: ${err.response?.data?.detail || err.message}`);
// //       }
// //     }
// //   };

// //   const handleSend = (msg) => {
// //     const m = msg || input.trim();
// //     if (m) { sendMessage(m); setInput(''); }
// //   };

// //   const scrollSlider = (dir) => {
// //     sliderRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });
// //   };

// //   const getSkills = (c) => {
// //     if (!c.skills) return [];
// //     if (Array.isArray(c.skills)) return c.skills.slice(0, 6);
// //     return [];
// //   };

// //   return (
// //     <div className="dashboard-layout">
// //       <div ref={cursorRef} className="cursor-glow" />

// //       {/* Sidebar */}
// //       <aside className="sidebar">
// //         <div className="sidebar-header">
// //           <button className="sidebar-logo" onClick={() => navigate('/')}>
// //             <Logo /> ResuMate
// //           </button>
// //         </div>
// //         <nav className="sidebar-nav">
// //           <div className="sidebar-section">
// //             <div className="sidebar-section-title">Navigation</div>
// //             <div className="sidebar-link" onClick={() => navigate('/')}>
// //               <Home size={18} /><span>Home</span>
// //             </div>
// //             {[
// //               { id: 'upload', icon: <Upload size={18} />, label: 'Upload' },
// //               { id: 'analytics', icon: <BarChart2 size={18} />, label: 'Analytics' },
// //               { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Chat' }
// //             ].map(item => (
// //               <div
// //                 key={item.id}
// //                 className={`sidebar-link ${tab === item.id ? 'active' : ''}`}
// //                 onClick={() => setTab(item.id)}
// //               >
// //                 {item.icon}<span>{item.label}</span>
// //               </div>
// //             ))}
// //           </div>
// //         </nav>
// //         <div className="sidebar-footer">
// //           <div className="sidebar-stats">
// //             <div className="sidebar-stat">
// //               <span className="sidebar-stat-value">{candidates.length}</span>
// //               <span className="sidebar-stat-label">Uploaded</span>
// //             </div>
// //             <div className="sidebar-stat">
// //               <span className="sidebar-stat-value">{selectedIds.length}</span>
// //               <span className="sidebar-stat-label">Selected</span>
// //             </div>
// //           </div>
// //         </div>
// //       </aside>

// //       {/* Main */}
// //       <main className="main">
// //         <header className="main-header">
// //           <div className="header-left">
// //             <h1 className="main-title">
// //               {tab === 'upload' ? 'Upload Resumes' : tab === 'analytics' ? 'Analytics' : 'AI Chat'}
// //             </h1>
// //             {candidates.length > 0 && <span className="badge badge-orange">{candidates.length}</span>}
// //             {selectedIds.length > 0 && <span className="badge badge-green">{selectedIds.length} selected</span>}
// //           </div>
// //           <div className="header-right">
// //             <div className="toggle-wrapper">
// //               <span className="toggle-label">
// //                 {anonymize ? <EyeOff size={16} /> : <Eye size={16} />} Anonymize
// //               </span>
// //               <div className={`toggle ${anonymize ? 'active' : ''}`} onClick={() => setAnonymize(!anonymize)}>
// //                 <div className="toggle-knob" />
// //               </div>
// //             </div>
// //           </div>
// //         </header>

// //         <div className="main-body">
// //           {/* UPLOAD TAB */}
// //           {tab === 'upload' && (
// //             <div className="upload-tab">
// //               <div className="card upload-card">
// //                 <div className="card-body">
// //                   <div
// //                     className={`upload-zone ${dragActive ? 'active' : ''}`}
// //                     onClick={() => fileRef.current?.click()}
// //                     onDragOver={e => { e.preventDefault(); setDragActive(true); }}
// //                     onDragLeave={() => setDragActive(false)}
// //                     onDrop={e => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
// //                   >
// //                     <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
// //                     <div className="upload-icon"><Upload size={36} /></div>
// //                     <h3>Drop resumes here or click to upload</h3>
// //                     <p>PDF, DOCX, TXT • Max 5MB each • No duplicates</p>
// //                   </div>

// //                   {Object.entries(uploadProgress).map(([id, p]) => (
// //                     <div key={id} className="upload-progress">
// //                       <div className="progress-header">
// //                         <span>Analyzing...</span>
// //                         <span className="progress-value">{p}%</span>
// //                       </div>
// //                       <div className="progress"><div className="progress-fill" style={{ width: `${p}%` }} /></div>
// //                     </div>
// //                   ))}
// //                 </div>
// //               </div>

// //               {candidates.length > 0 && (
// //                 <div className="candidates-section">
// //                   <div className="candidates-header">
// //                     <h2>Candidates ({candidates.length})</h2>
// //                     <div className="candidates-actions">
// //                       <button onClick={selectAll} className="btn btn-secondary btn-sm">Select All</button>
// //                       <button onClick={clearSelection} className="btn btn-ghost btn-sm">Clear</button>
// //                     </div>
// //                   </div>

// //                   <div className="candidates-slider">
// //                     <button className="slider-btn slider-btn-left" onClick={() => scrollSlider(-1)}>
// //                       <ChevronLeft size={20} />
// //                     </button>
// //                     <div className="slider-track" ref={sliderRef}>
// //                       {candidates.map((c, i) => (
// //                         <div
// //                           key={c.id}
// //                           className={`candidate-card glass-card ${selectedIds.includes(c.id) ? 'selected' : ''} ${!c.is_resume ? 'not-resume' : ''}`}
// //                           onClick={() => toggleSelection(c.id)}
// //                         >
// //                           {!c.is_resume && (
// //                             <div className="not-resume-banner">
// //                               <AlertCircle size={14} /> Not a Resume
// //                             </div>
// //                           )}
// //                           <div className="candidate-header">
// //                             <div className="candidate-avatar" style={{ background: getAvatarGradient(c.name) }}>
// //                               {getDisplayName(c, i)[0]?.toUpperCase()}
// //                             </div>
// //                             {selectedIds.includes(c.id) && (
// //                               <div className="selected-check"><Check size={14} /></div>
// //                             )}
// //                             <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteCandidate(c.id); }}>
// //                               <Trash2 size={14} />
// //                             </button>
// //                           </div>
// //                           <h3 className="candidate-name">{getDisplayName(c, i)}</h3>
// //                           <p className="candidate-role">{c.predicted_role || 'Processing...'}</p>
                          
// //                           <div className="candidate-badges">
// //                             {c.badges?.slice(0, 3).map((b, j) => (
// //                               <span key={j} className={`badge badge-${b.color || 'blue'}`}>{b.label}</span>
// //                             ))}
// //                           </div>

// //                           <div className="candidate-stats">
// //                             <span><Briefcase size={12} /> {c.total_experience_years || 0}y</span>
// //                             <span><Award size={12} /> {c.experience_level || 'N/A'}</span>
// //                           </div>

// //                           {c.location && (
// //                             <div className="candidate-location">
// //                               <MapPin size={12} /> {c.location}
// //                             </div>
// //                           )}

// //                           <div className="candidate-skills">
// //                             {getSkills(c).slice(0, 4).map((s, j) => (
// //                               <span key={j} className="skill">{typeof s === 'string' ? s : s?.name}</span>
// //                             ))}
// //                           </div>
// //                         </div>
// //                       ))}
// //                     </div>
// //                     <button className="slider-btn slider-btn-right" onClick={() => scrollSlider(1)}>
// //                       <ChevronRight size={20} />
// //                     </button>
// //                   </div>
// //                 </div>
// //               )}

// //               {candidates.length === 0 && !loading && (
// //                 <div className="empty-state">
// //                   <div className="empty-icon"><FileText size={40} /></div>
// //                   <h3>No resumes yet</h3>
// //                   <p>Upload resumes to start analyzing</p>
// //                 </div>
// //               )}
// //             </div>
// //           )}

// //           {/* ANALYTICS TAB - Enhanced with glassmorphism */}
// //           {tab === 'analytics' && (
// //             <div className="analytics-tab">
// //               <FloatingParticles />
              
// //               {selectedCandidates.length === 0 ? (
// //                 <div className="empty-state glass-card" style={{ padding: '60px' }}>
// //                   <div className="empty-icon"><BarChart2 size={40} /></div>
// //                   <h3>No candidates selected</h3>
// //                   <p>Select candidates in Upload tab to see analytics</p>
// //                 </div>
// //               ) : (
// //                 <>
// //                   {/* Stats Grid */}
// //                   <div className="analytics-grid">
// //                     {[
// //                       { label: 'Selected', value: analytics.total, color: 'var(--accent)', icon: <Users size={24} /> },
// //                       { label: 'Avg Experience', value: `${analytics.avgExperience}y`, color: 'var(--success)', icon: <Briefcase size={24} /> },
// //                       { label: 'Unique Skills', value: analytics.totalSkills, color: 'var(--info)', icon: <Sparkles size={24} /> }
// //                     ].map((stat, i) => (
// //                       <div key={i} className="analytics-card glass-card floating-card" style={{ animationDelay: `${i * 0.1}s` }}>
// //                         <div className="analytics-glow" style={{ background: stat.color }} />
// //                         <div className="analytics-icon" style={{ color: stat.color }}>{stat.icon}</div>
// //                         <div className="analytics-label">{stat.label}</div>
// //                         <div className="analytics-value" style={{ color: stat.color }}>{stat.value}</div>
// //                       </div>
// //                     ))}
// //                   </div>

// //                   {/* Experience Comparison */}
// //                   <div className="chart-section">
// //                     <h3 className="chart-title"><TrendingUp size={20} /> Experience Comparison</h3>
// //                     <div className="experience-grid">
// //                       {selectedCandidates.filter(c => c.is_resume !== false).map((c, i) => {
// //                         const maxExp = Math.max(...selectedCandidates.map(x => x.total_experience_years || 0), 1);
// //                         const pct = ((c.total_experience_years || 0) / maxExp) * 100;
// //                         return (
// //                           <div key={c.id} className="experience-card glass-card floating-card" style={{ animationDelay: `${i * 0.1}s` }}>
// //                             <div className="exp-glow" />
// //                             <div className="exp-header">
// //                               <div className="avatar-sm" style={{ background: getAvatarGradient(c.name) }}>
// //                                 {getDisplayName(c, i)[0]}
// //                               </div>
// //                               <div>
// //                                 <div className="exp-name">{getDisplayName(c, i)}</div>
// //                                 <div className="exp-role">{c.predicted_role}</div>
// //                               </div>
// //                             </div>
// //                             <div className="exp-value">{c.total_experience_years || 0}<span>years</span></div>
// //                             <div className="exp-bar">
// //                               <div className="exp-bar-fill" style={{ width: `${pct}%` }} />
// //                             </div>
// //                           </div>
// //                         );
// //                       })}
// //                     </div>
// //                   </div>

// //                   {/* Skills Chart */}
// //                   <div className="chart-section">
// //                     <h3 className="chart-title"><Sparkles size={20} /> Top Skills</h3>
// //                     <div className="glass-card skills-chart-card">
// //                       {analytics.topSkills.map((s, i) => (
// //                         <div key={i} className="chart-bar" style={{ animationDelay: `${i * 0.05}s` }}>
// //                           <div className="chart-bar-header">
// //                             <span>{s.name}</span>
// //                             <span className="chart-bar-value">{s.count} ({s.percentage}%)</span>
// //                           </div>
// //                           <div className="chart-bar-track">
// //                             <div className="chart-bar-fill animated-fill" style={{ '--target-width': `${s.percentage}%` }} />
// //                           </div>
// //                         </div>
// //                       ))}
// //                       {analytics.topSkills.length === 0 && <p className="no-data">No skills data</p>}
// //                     </div>
// //                   </div>

// //                   {/* Distributions */}
// //                   <div className="distributions-grid">
// //                     <div className="glass-card distribution-card floating-card">
// //                       <div className="dist-glow" />
// //                       <h3 className="chart-title"><Users size={18} /> Roles</h3>
// //                       {analytics.roleDistribution.map((r, i) => (
// //                         <div key={i} className="dist-row">
// //                           <span>{r.name}</span>
// //                           <span className="badge badge-orange">{r.count}</span>
// //                         </div>
// //                       ))}
// //                     </div>
// //                     <div className="glass-card distribution-card floating-card" style={{ animationDelay: '0.1s' }}>
// //                       <div className="dist-glow" />
// //                       <h3 className="chart-title"><Award size={18} /> Levels</h3>
// //                       {analytics.levelDistribution.map((l, i) => (
// //                         <div key={i} className="dist-row">
// //                           <span>{l.name}</span>
// //                           <span className="badge badge-green">{l.count}</span>
// //                         </div>
// //                       ))}
// //                     </div>
// //                   </div>
// //                 </>
// //               )}
// //             </div>
// //           )}

// //           {/* AI CHAT TAB */}
// //           {tab === 'chat' && (
// //             <div className="chat-tab">
// //               {selectedCandidates.length === 0 ? (
// //                 <div className="empty-state glass-card" style={{ padding: '60px' }}>
// //                   <div className="empty-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
// //                     <Bot size={40} />
// //                   </div>
// //                   <h3>Select candidates to chat</h3>
// //                   <p>Go to Upload tab and select candidates</p>
// //                 </div>
// //               ) : (
// //                 <div className="chat-container">
// //                   <div className="chat-card glass-card">
// //                     <div className="chat-header">
// //                       <div className="chat-header-left">
// //                         <AIAvatar />
// //                         <div>
// //                           <div className="chat-ai-name">ResuMate AI</div>
// //                           <div className="chat-ai-status">
// //                             {selectedCandidates.filter(c => c.is_resume !== false).length} candidates • GPT-5.2
// //                           </div>
// //                         </div>
// //                       </div>
// //                       <button onClick={clearChat} className="btn btn-ghost btn-sm">
// //                         <Trash2 size={14} /> Clear
// //                       </button>
// //                     </div>

// //                     <div className="chat-messages">
// //                       {messages.map((m, i) => (
// //                         <div key={i} className={`chat-message ${m.role}`}>
// //                           {m.role === 'assistant' && <AIAvatar />}
// //                           <div className={`chat-bubble ${m.role}`}>
// //                             {m.role === 'user' ? (
// //                               <p>{m.content}</p>
// //                             ) : (
// //                               <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />
// //                             )}
// //                           </div>
// //                           {m.role === 'user' && (
// //                             <div className="avatar-sm" style={{ background: 'var(--bg3)' }}>
// //                               <Users size={16} />
// //                             </div>
// //                           )}
// //                         </div>
// //                       ))}
// //                       {isTyping && (
// //                         <div className="chat-message assistant">
// //                           <AIAvatar />
// //                           <div className="chat-bubble assistant">
// //                             <div className="typing"><span /><span /><span /></div>
// //                           </div>
// //                         </div>
// //                       )}
// //                       <div ref={msgEndRef} />
// //                     </div>

// //                     {suggestions.length > 0 && !isTyping && (
// //                       <div className="chat-suggestions">
// //                         {suggestions.map((q, i) => (
// //                           <button key={i} className="chat-suggestion" onClick={() => handleSend(q)}>
// //                             {q}
// //                           </button>
// //                         ))}
// //                       </div>
// //                     )}

// //                     <div className="chat-input-area">
// //                       <input
// //                         type="text"
// //                         className="input chat-input"
// //                         value={input}
// //                         onChange={e => setInput(e.target.value)}
// //                         onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
// //                         placeholder="Ask anything... (e.g., 'tell me about ravi', 'what about the guys')"
// //                         disabled={isTyping}
// //                       />
// //                       <button
// //                         onClick={() => handleSend()}
// //                         disabled={!input.trim() || isTyping}
// //                         className="btn btn-primary send-btn"
// //                       >
// //                         <Send size={18} />
// //                       </button>
// //                     </div>
// //                   </div>
// //                 </div>
// //               )}
// //             </div>
// //           )}
// //         </div>
// //       </main>
// //     </div>
// //   );
// // }

// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { useApp } from '../context/AppContext';
// import { marked } from 'marked';
// import { 
//   Users, BarChart2, MessageSquare, Upload, Check, Home, Sparkles, 
//   Eye, EyeOff, Briefcase, MapPin, Award, Trash2, 
//   ChevronLeft, ChevronRight, TrendingUp, Send, Bot, FileText, AlertCircle,
//   Mic, MicOff, Volume2, VolumeX, Square, Loader2
// } from 'lucide-react';

// const Logo = ({ size = 32 }) => (
//   <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
//     <defs><linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs>
//     <rect width="32" height="32" rx="8" fill="url(#lg2)"/>
//     <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#000" strokeWidth="1.5" fill="none"/>
//     <circle cx="16" cy="16" r="3" fill="#000"/>
//   </svg>
// );

// const AIAvatar = () => (
//   <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
//     <Bot size={18} />
//   </div>
// );

// const FloatingParticles = () => (
//   <div className="floating-particles">
//     {[...Array(20)].map((_, i) => (
//       <div 
//         key={i} 
//         className="particle"
//         style={{
//           left: `${Math.random() * 100}%`,
//           top: `${Math.random() * 100}%`,
//           animationDelay: `${Math.random() * 5}s`,
//           animationDuration: `${10 + Math.random() * 10}s`
//         }}
//       />
//     ))}
//   </div>
// );

// export default function Dashboard() {
//   const navigate = useNavigate();
//   const {
//     candidates, selectedIds, selectedCandidates, uploadProgress, loading,
//     loadCandidates, uploadResume, deleteCandidate, toggleSelection, selectAll, clearSelection,
//     anonymize, setAnonymize, analytics,
//     messages, suggestions, isTyping, sendMessage, initChat, clearChat,
//     getDisplayName, getAvatarGradient
//   } = useApp();

//   const [tab, setTab] = useState('upload');
//   const [input, setInput] = useState('');
//   const [dragActive, setDragActive] = useState(false);
  
//   // Voice states
//   const [isRecording, setIsRecording] = useState(false);
//   const [isTranscribing, setIsTranscribing] = useState(false);
//   const [autoSpeak, setAutoSpeak] = useState(false);
//   const [speakingMsgId, setSpeakingMsgId] = useState(null);
//   const [loadingMsgId, setLoadingMsgId] = useState(null);
  
//   // Refs
//   const fileRef = useRef(null);
//   const msgEndRef = useRef(null);
//   const sliderRef = useRef(null);
//   const cursorRef = useRef(null);
//   const mediaRecorderRef = useRef(null);
//   const audioChunksRef = useRef([]);
//   const currentAudioRef = useRef(null);
//   const lastSpokenMsgRef = useRef(null);

//   useEffect(() => { loadCandidates(); }, [loadCandidates]);

//   useEffect(() => {
//     if (tab === 'chat') initChat();
//   }, [tab, initChat]);

//   useEffect(() => {
//     msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages, isTyping]);

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

//   // Auto-speak new AI messages when autoSpeak is ON
//   useEffect(() => {
//     if (autoSpeak && messages.length > 0 && !isTyping) {
//       const lastMsg = messages[messages.length - 1];
//       if (lastMsg.role === 'assistant' && lastSpokenMsgRef.current !== messages.length - 1) {
//         lastSpokenMsgRef.current = messages.length - 1;
//         speakText(lastMsg.content, messages.length - 1);
//       }
//     }
//   }, [messages, isTyping, autoSpeak]);

//   // Cleanup audio on unmount
//   useEffect(() => {
//     return () => {
//       stopSpeaking();
//     };
//   }, []);

//   const handleUpload = async (files) => {
//     for (const file of Array.from(files)) {
//       try {
//         await uploadResume(file);
//       } catch (err) {
//         alert(`Failed: ${err.response?.data?.detail || err.message}`);
//       }
//     }
//   };

//   const handleSend = (msg) => {
//     const m = msg || input.trim();
//     if (m) { 
//       sendMessage(m); 
//       setInput(''); 
//     }
//   };

//   const scrollSlider = (dir) => {
//     sliderRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });
//   };

//   const getSkills = (c) => {
//     if (!c.skills) return [];
//     if (Array.isArray(c.skills)) return c.skills.slice(0, 6);
//     return [];
//   };

//   // ============ VOICE FUNCTIONS ============
  
//   const startRecording = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
//       mediaRecorderRef.current = mediaRecorder;
//       audioChunksRef.current = [];

//       mediaRecorder.ondataavailable = (e) => {
//         if (e.data.size > 0) {
//           audioChunksRef.current.push(e.data);
//         }
//       };

//       mediaRecorder.onstop = async () => {
//         const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
//         stream.getTracks().forEach(track => track.stop());
//         await transcribeAudio(audioBlob);
//       };

//       mediaRecorder.start();
//       setIsRecording(true);
//     } catch (err) {
//       console.error('Microphone access denied:', err);
//       alert('Please allow microphone access to use voice input.');
//     }
//   };

//   const stopRecording = () => {
//     if (mediaRecorderRef.current && isRecording) {
//       mediaRecorderRef.current.stop();
//       setIsRecording(false);
//     }
//   };

//   const transcribeAudio = async (audioBlob) => {
//     setIsTranscribing(true);
//     try {
//       const formData = new FormData();
//       formData.append('audio', audioBlob, 'recording.webm');

//       const response = await fetch('/api/chat/speech-to-text', {
//         method: 'POST',
//         headers: { 'Authorization': 'Bearer demo-token' },
//         body: formData
//       });

//       if (!response.ok) {
//         throw new Error('Transcription failed');
//       }

//       const data = await response.json();
//       if (data.text && data.text.trim()) {
//         sendMessage(data.text.trim());
//       }
//     } catch (err) {
//       console.error('Transcription error:', err);
//       alert('Voice transcription failed. Please try again.');
//     } finally {
//       setIsTranscribing(false);
//     }
//   };

//   const stopSpeaking = useCallback(() => {
//     if (currentAudioRef.current) {
//       currentAudioRef.current.pause();
//       currentAudioRef.current.currentTime = 0;
//       currentAudioRef.current = null;
//     }
//     setSpeakingMsgId(null);
//     setLoadingMsgId(null);
//   }, []);

//   const speakText = useCallback(async (text, msgId) => {
//     // If already speaking this message, stop it
//     if (speakingMsgId === msgId) {
//       stopSpeaking();
//       return;
//     }

//     // Stop any currently playing audio first
//     stopSpeaking();

//     // Set loading state
//     setLoadingMsgId(msgId);

//     try {
//       // Clean text - remove markdown
//       let cleanText = text
//         .replace(/\*\*/g, '')
//         .replace(/\*/g, '')
//         .replace(/#{1,6}\s?/g, '')
//         .replace(/`/g, '')
//         .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
//         .replace(/\n+/g, '. ')
//         .trim();

//       // Limit text length
//       if (cleanText.length > 4000) {
//         cleanText = cleanText.slice(0, 4000) + '...';
//       }

//       const response = await fetch('/api/chat/text-to-speech', {
//         method: 'POST',
//         headers: {
//           'Authorization': 'Bearer demo-token',
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({ text: cleanText, voice: 'nova' })
//       });

//       if (!response.ok) {
//         throw new Error('TTS failed');
//       }

//       const audioBlob = await response.blob();
//       const audioUrl = URL.createObjectURL(audioBlob);
//       const audio = new Audio(audioUrl);
      
//       currentAudioRef.current = audio;
      
//       audio.onended = () => {
//         URL.revokeObjectURL(audioUrl);
//         currentAudioRef.current = null;
//         setSpeakingMsgId(null);
//       };

//       audio.onerror = () => {
//         URL.revokeObjectURL(audioUrl);
//         currentAudioRef.current = null;
//         setSpeakingMsgId(null);
//         setLoadingMsgId(null);
//       };

//       setLoadingMsgId(null);
//       setSpeakingMsgId(msgId);
//       await audio.play();
      
//     } catch (err) {
//       console.error('TTS error:', err);
//       setLoadingMsgId(null);
//       setSpeakingMsgId(null);
//     }
//   }, [speakingMsgId, stopSpeaking]);

//   const toggleAutoSpeak = () => {
//     if (autoSpeak) {
//       // Turning off - stop any current speech
//       stopSpeaking();
//     }
//     setAutoSpeak(!autoSpeak);
//     lastSpokenMsgRef.current = null;
//   };

//   const handleClearChat = () => {
//     stopSpeaking();
//     clearChat();
//     lastSpokenMsgRef.current = null;
//   };

//   return (
//     <div className="dashboard-layout">
//       <div ref={cursorRef} className="cursor-glow" />

//       {/* Sidebar */}
//       <aside className="sidebar">
//         <div className="sidebar-header">
//           <button className="sidebar-logo" onClick={() => navigate('/')}>
//             <Logo /> ResuMate
//           </button>
//         </div>
//         <nav className="sidebar-nav">
//           <div className="sidebar-section">
//             <div className="sidebar-section-title">Navigation</div>
//             <div className="sidebar-link" onClick={() => navigate('/')}>
//               <Home size={18} /><span>Home</span>
//             </div>
//             {[
//               { id: 'upload', icon: <Upload size={18} />, label: 'Upload' },
//               { id: 'analytics', icon: <BarChart2 size={18} />, label: 'Analytics' },
//               { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Chat' }
//             ].map(item => (
//               <div
//                 key={item.id}
//                 className={`sidebar-link ${tab === item.id ? 'active' : ''}`}
//                 onClick={() => setTab(item.id)}
//               >
//                 {item.icon}<span>{item.label}</span>
//               </div>
//             ))}
//           </div>
//         </nav>
//         <div className="sidebar-footer">
//           <div className="sidebar-stats">
//             <div className="sidebar-stat">
//               <span className="sidebar-stat-value">{candidates.length}</span>
//               <span className="sidebar-stat-label">Uploaded</span>
//             </div>
//             <div className="sidebar-stat">
//               <span className="sidebar-stat-value">{selectedIds.length}</span>
//               <span className="sidebar-stat-label">Selected</span>
//             </div>
//           </div>
//         </div>
//       </aside>

//       {/* Main */}
//       <main className="main">
//         <header className="main-header">
//           <div className="header-left">
//             <h1 className="main-title">
//               {tab === 'upload' ? 'Upload Resumes' : tab === 'analytics' ? 'Analytics' : 'AI Chat'}
//             </h1>
//             {candidates.length > 0 && <span className="badge badge-orange">{candidates.length}</span>}
//             {selectedIds.length > 0 && <span className="badge badge-green">{selectedIds.length} selected</span>}
//           </div>
//           <div className="header-right">
//             <div className="toggle-wrapper">
//               <span className="toggle-label">
//                 {anonymize ? <EyeOff size={16} /> : <Eye size={16} />} Anonymize
//               </span>
//               <div className={`toggle ${anonymize ? 'active' : ''}`} onClick={() => setAnonymize(!anonymize)}>
//                 <div className="toggle-knob" />
//               </div>
//             </div>
//           </div>
//         </header>

//         <div className="main-body">
//           {/* UPLOAD TAB */}
//           {tab === 'upload' && (
//             <div className="upload-tab">
//               <div className="card upload-card">
//                 <div className="card-body">
//                   <div
//                     className={`upload-zone ${dragActive ? 'active' : ''}`}
//                     onClick={() => fileRef.current?.click()}
//                     onDragOver={e => { e.preventDefault(); setDragActive(true); }}
//                     onDragLeave={() => setDragActive(false)}
//                     onDrop={e => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
//                   >
//                     <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
//                     <div className="upload-icon"><Upload size={36} /></div>
//                     <h3>Drop resumes here or click to upload</h3>
//                     <p>PDF, DOCX, TXT • Max 5MB each • No duplicates</p>
//                   </div>

//                   {Object.entries(uploadProgress).map(([id, p]) => (
//                     <div key={id} className="upload-progress">
//                       <div className="progress-header">
//                         <span>Analyzing...</span>
//                         <span className="progress-value">{p}%</span>
//                       </div>
//                       <div className="progress"><div className="progress-fill" style={{ width: `${p}%` }} /></div>
//                     </div>
//                   ))}
//                 </div>
//               </div>

//               {candidates.length > 0 && (
//                 <div className="candidates-section">
//                   <div className="candidates-header">
//                     <h2>Candidates ({candidates.length})</h2>
//                     <div className="candidates-actions">
//                       <button onClick={selectAll} className="btn btn-secondary btn-sm">Select All</button>
//                       <button onClick={clearSelection} className="btn btn-ghost btn-sm">Clear</button>
//                     </div>
//                   </div>

//                   <div className="candidates-slider">
//                     <button className="slider-btn slider-btn-left" onClick={() => scrollSlider(-1)}>
//                       <ChevronLeft size={20} />
//                     </button>
//                     <div className="slider-track" ref={sliderRef}>
//                       {candidates.map((c, i) => (
//                         <div
//                           key={c.id}
//                           className={`candidate-card glass-card ${selectedIds.includes(c.id) ? 'selected' : ''} ${!c.is_resume ? 'not-resume' : ''}`}
//                           onClick={() => toggleSelection(c.id)}
//                         >
//                           {!c.is_resume && (
//                             <div className="not-resume-banner">
//                               <AlertCircle size={14} /> Not a Resume
//                             </div>
//                           )}
//                           <div className="candidate-header">
//                             <div className="candidate-avatar" style={{ background: getAvatarGradient(c.name) }}>
//                               {getDisplayName(c, i)[0]?.toUpperCase()}
//                             </div>
//                             {selectedIds.includes(c.id) && (
//                               <div className="selected-check"><Check size={14} /></div>
//                             )}
//                             <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteCandidate(c.id); }}>
//                               <Trash2 size={14} />
//                             </button>
//                           </div>
//                           <h3 className="candidate-name">{getDisplayName(c, i)}</h3>
//                           <p className="candidate-role">{c.predicted_role || 'Processing...'}</p>
                          
//                           <div className="candidate-badges">
//                             {c.badges?.slice(0, 3).map((b, j) => (
//                               <span key={j} className={`badge badge-${b.color || 'blue'}`}>{b.label}</span>
//                             ))}
//                           </div>

//                           <div className="candidate-stats">
//                             <span><Briefcase size={12} /> {c.total_experience_years || 0}y</span>
//                             <span><Award size={12} /> {c.experience_level || 'N/A'}</span>
//                           </div>

//                           {c.location && (
//                             <div className="candidate-location">
//                               <MapPin size={12} /> {c.location}
//                             </div>
//                           )}

//                           <div className="candidate-skills">
//                             {getSkills(c).slice(0, 4).map((s, j) => (
//                               <span key={j} className="skill">{typeof s === 'string' ? s : s?.name}</span>
//                             ))}
//                           </div>
//                         </div>
//                       ))}
//                     </div>
//                     <button className="slider-btn slider-btn-right" onClick={() => scrollSlider(1)}>
//                       <ChevronRight size={20} />
//                     </button>
//                   </div>
//                 </div>
//               )}

//               {candidates.length === 0 && !loading && (
//                 <div className="empty-state">
//                   <div className="empty-icon"><FileText size={40} /></div>
//                   <h3>No resumes yet</h3>
//                   <p>Upload resumes to start analyzing</p>
//                 </div>
//               )}
//             </div>
//           )}

//           {/* ANALYTICS TAB */}
//           {tab === 'analytics' && (
//             <div className="analytics-tab">
//               <FloatingParticles />
              
//               {selectedCandidates.length === 0 ? (
//                 <div className="empty-state glass-card" style={{ padding: '60px' }}>
//                   <div className="empty-icon"><BarChart2 size={40} /></div>
//                   <h3>No candidates selected</h3>
//                   <p>Select candidates in Upload tab</p>
//                 </div>
//               ) : (
//                 <>
//                   <div className="analytics-grid">
//                     {[
//                       { label: 'Selected', value: analytics.total, color: 'var(--accent)', icon: <Users size={24} /> },
//                       { label: 'Avg Experience', value: `${analytics.avgExperience}y`, color: 'var(--success)', icon: <Briefcase size={24} /> },
//                       { label: 'Unique Skills', value: analytics.totalSkills, color: 'var(--info)', icon: <Sparkles size={24} /> }
//                     ].map((stat, i) => (
//                       <div key={i} className="analytics-card glass-card floating-card" style={{ animationDelay: `${i * 0.1}s` }}>
//                         <div className="analytics-glow" style={{ background: stat.color }} />
//                         <div className="analytics-icon" style={{ color: stat.color }}>{stat.icon}</div>
//                         <div className="analytics-label">{stat.label}</div>
//                         <div className="analytics-value" style={{ color: stat.color }}>{stat.value}</div>
//                       </div>
//                     ))}
//                   </div>

//                   <div className="chart-section">
//                     <h3 className="chart-title"><TrendingUp size={20} /> Experience Comparison</h3>
//                     <div className="experience-grid">
//                       {selectedCandidates.filter(c => c.is_resume !== false).map((c, i) => {
//                         const maxExp = Math.max(...selectedCandidates.map(x => x.total_experience_years || 0), 1);
//                         const pct = ((c.total_experience_years || 0) / maxExp) * 100;
//                         return (
//                           <div key={c.id} className="experience-card glass-card floating-card" style={{ animationDelay: `${i * 0.1}s` }}>
//                             <div className="exp-glow" />
//                             <div className="exp-header">
//                               <div className="avatar-sm" style={{ background: getAvatarGradient(c.name) }}>
//                                 {getDisplayName(c, i)[0]}
//                               </div>
//                               <div>
//                                 <div className="exp-name">{getDisplayName(c, i)}</div>
//                                 <div className="exp-role">{c.predicted_role}</div>
//                               </div>
//                             </div>
//                             <div className="exp-value">{c.total_experience_years || 0}<span>years</span></div>
//                             <div className="exp-bar">
//                               <div className="exp-bar-fill" style={{ width: `${pct}%` }} />
//                             </div>
//                           </div>
//                         );
//                       })}
//                     </div>
//                   </div>

//                   <div className="chart-section">
//                     <h3 className="chart-title"><Sparkles size={20} /> Top Skills</h3>
//                     <div className="glass-card skills-chart-card">
//                       {analytics.topSkills.map((s, i) => (
//                         <div key={i} className="chart-bar" style={{ animationDelay: `${i * 0.05}s` }}>
//                           <div className="chart-bar-header">
//                             <span>{s.name}</span>
//                             <span className="chart-bar-value">{s.count} ({s.percentage}%)</span>
//                           </div>
//                           <div className="chart-bar-track">
//                             <div className="chart-bar-fill animated-fill" style={{ '--target-width': `${s.percentage}%` }} />
//                           </div>
//                         </div>
//                       ))}
//                       {analytics.topSkills.length === 0 && <p className="no-data">No skills data</p>}
//                     </div>
//                   </div>

//                   <div className="distributions-grid">
//                     <div className="glass-card distribution-card floating-card">
//                       <div className="dist-glow" />
//                       <h3 className="chart-title"><Users size={18} /> Roles</h3>
//                       {analytics.roleDistribution.map((r, i) => (
//                         <div key={i} className="dist-row">
//                           <span>{r.name}</span>
//                           <span className="badge badge-orange">{r.count}</span>
//                         </div>
//                       ))}
//                     </div>
//                     <div className="glass-card distribution-card floating-card" style={{ animationDelay: '0.1s' }}>
//                       <div className="dist-glow" />
//                       <h3 className="chart-title"><Award size={18} /> Levels</h3>
//                       {analytics.levelDistribution.map((l, i) => (
//                         <div key={i} className="dist-row">
//                           <span>{l.name}</span>
//                           <span className="badge badge-green">{l.count}</span>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 </>
//               )}
//             </div>
//           )}

//           {/* AI CHAT TAB */}
//           {tab === 'chat' && (
//             <div className="chat-tab">
//               {selectedCandidates.length === 0 ? (
//                 <div className="empty-state glass-card" style={{ padding: '60px' }}>
//                   <div className="empty-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
//                     <Bot size={40} />
//                   </div>
//                   <h3>Select candidates to chat</h3>
//                   <p>Go to Upload tab and select candidates</p>
//                 </div>
//               ) : (
//                 <div className="chat-container">
//                   <div className="chat-card glass-card">
//                     {/* Chat Header */}
//                     <div className="chat-header">
//                       <div className="chat-header-left">
//                         <AIAvatar />
//                         <div>
//                           <div className="chat-ai-name">ResuMate AI</div>
//                           <div className="chat-ai-status">
//                             {selectedCandidates.filter(c => c.is_resume !== false).length} candidates • GPT-5.2
//                           </div>
//                         </div>
//                       </div>
//                       <div className="chat-header-actions">
//                         {/* Auto-speak toggle */}
//                         <button 
//                           className={`icon-btn ${autoSpeak ? 'active' : ''}`}
//                           onClick={toggleAutoSpeak}
//                           title={autoSpeak ? 'Auto-speak ON (click to turn off)' : 'Auto-speak OFF (click to turn on)'}
//                         >
//                           {autoSpeak ? <Volume2 size={18} /> : <VolumeX size={18} />}
//                         </button>
                        
//                         {/* Stop speaking button - only show when speaking */}
//                         {speakingMsgId !== null && (
//                           <button 
//                             className="icon-btn stop-btn"
//                             onClick={stopSpeaking}
//                             title="Stop speaking"
//                           >
//                             <Square size={16} />
//                           </button>
//                         )}
                        
//                         {/* Clear chat */}
//                         <button 
//                           className="icon-btn"
//                           onClick={handleClearChat}
//                           title="Clear chat"
//                         >
//                           <Trash2 size={18} />
//                         </button>
//                       </div>
//                     </div>

//                     {/* Messages */}
//                     <div className="chat-messages">
//                       {messages.map((m, i) => (
//                         <div key={i} className={`chat-message ${m.role}`}>
//                           {m.role === 'assistant' && <AIAvatar />}
//                           <div className={`chat-bubble ${m.role}`}>
//                             {m.role === 'user' ? (
//                               <p>{m.content}</p>
//                             ) : (
//                               <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />
//                             )}
//                           </div>
//                           {m.role === 'user' && (
//                             <div className="avatar-sm user-avatar">
//                               <Users size={16} />
//                             </div>
//                           )}
//                           {/* Speak button for AI messages */}
//                           {m.role === 'assistant' && (
//                             <button 
//                               className={`msg-speak-btn ${speakingMsgId === i ? 'speaking' : ''} ${loadingMsgId === i ? 'loading' : ''}`}
//                               onClick={() => speakText(m.content, i)}
//                               disabled={loadingMsgId !== null && loadingMsgId !== i}
//                               title={speakingMsgId === i ? 'Stop' : 'Read aloud'}
//                             >
//                               {loadingMsgId === i ? (
//                                 <Loader2 size={16} className="spin" />
//                               ) : speakingMsgId === i ? (
//                                 <Square size={14} />
//                               ) : (
//                                 <Volume2 size={16} />
//                               )}
//                             </button>
//                           )}
//                         </div>
//                       ))}
//                       {isTyping && (
//                         <div className="chat-message assistant">
//                           <AIAvatar />
//                           <div className="chat-bubble assistant">
//                             <div className="typing"><span /><span /><span /></div>
//                           </div>
//                         </div>
//                       )}
//                       <div ref={msgEndRef} />
//                     </div>

//                     {/* Suggestions */}
//                     {suggestions.length > 0 && !isTyping && (
//                       <div className="chat-suggestions">
//                         {suggestions.map((q, i) => (
//                           <button key={i} className="chat-suggestion" onClick={() => handleSend(q)}>
//                             {q}
//                           </button>
//                         ))}
//                       </div>
//                     )}

//                     {/* Input Area */}
//                     <div className="chat-input-area">
//                       {/* Voice input button */}
//                       <button
//                         className={`voice-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
//                         onClick={isRecording ? stopRecording : startRecording}
//                         disabled={isTranscribing || isTyping}
//                         title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input'}
//                       >
//                         {isTranscribing ? (
//                           <Loader2 size={20} className="spin" />
//                         ) : isRecording ? (
//                           <MicOff size={20} />
//                         ) : (
//                           <Mic size={20} />
//                         )}
//                       </button>
                      
//                       <input
//                         type="text"
//                         className="input chat-input"
//                         value={input}
//                         onChange={e => setInput(e.target.value)}
//                         onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); }}
//                         placeholder={isRecording ? '🎤 Listening...' : isTranscribing ? '⏳ Transcribing...' : 'Ask anything or use voice 🎤'}
//                         disabled={isTyping || isRecording || isTranscribing}
//                       />
                      
//                       <button
//                         onClick={() => handleSend()}
//                         disabled={!input.trim() || isTyping}
//                         className="btn btn-primary send-btn"
//                       >
//                         <Send size={18} />
//                       </button>
//                     </div>
//                   </div>
//                 </div>
//               )}
//             </div>
//           )}
//         </div>
//       </main>
//     </div>
//   );
// }

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { marked } from 'marked';
import { 
  Users, BarChart2, MessageSquare, Upload, Check, Home, Sparkles, 
  Eye, EyeOff, Briefcase, MapPin, Award, Trash2, 
  ChevronLeft, ChevronRight, TrendingUp, Send, Bot, FileText, AlertCircle,
  Mic, MicOff, Volume2, VolumeX, Loader, Square
} from 'lucide-react';

const Logo = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs><linearGradient id="lg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/></linearGradient></defs>
    <rect width="32" height="32" rx="8" fill="url(#lg2)"/>
    <path d="M16 8L22 12V20L16 24L10 20V12L16 8Z" stroke="#000" strokeWidth="1.5" fill="none"/>
    <circle cx="16" cy="16" r="3" fill="#000"/>
  </svg>
);

const AIAvatar = () => (
  <div className="avatar-sm" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))' }}>
    <Bot size={18} />
  </div>
);

const FloatingParticles = () => (
  <div className="floating-particles">
    {[...Array(20)].map((_, i) => (
      <div 
        key={i} 
        className="particle"
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 5}s`,
          animationDuration: `${10 + Math.random() * 10}s`
        }}
      />
    ))}
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    candidates, selectedIds, selectedCandidates, uploadProgress, loading,
    loadCandidates, uploadResume, deleteCandidate, toggleSelection, selectAll, clearSelection,
    anonymize, setAnonymize, analytics,
    messages, suggestions, isTyping, sendMessage, initChat, clearChat,
    getDisplayName, getAvatarGradient
  } = useApp();

  const [tab, setTab] = useState('upload');
  const [input, setInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  
  // Voice states
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(null);
  const [lastInputWasVoice, setLastInputWasVoice] = useState(false);
  const [pendingAutoSpeak, setPendingAutoSpeak] = useState(false);
  
  // Refs
  const fileRef = useRef(null);
  const msgEndRef = useRef(null);
  const sliderRef = useRef(null);
  const cursorRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  useEffect(() => {
    if (tab === 'chat') initChat();
  }, [tab, initChat]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

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

  // Auto-speak ONLY when voice input was used
  useEffect(() => {
    if (pendingAutoSpeak && messages.length > 0 && !isTyping) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        speakText(lastMsg.content, messages.length - 1);
        setPendingAutoSpeak(false);
      }
    }
  }, [messages, isTyping, pendingAutoSpeak]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const handleUpload = async (files) => {
    for (const file of Array.from(files)) {
      try {
        await uploadResume(file);
      } catch (err) {
        alert(`Failed: ${err.response?.data?.detail || err.message}`);
      }
    }
  };

  // Send message via typing (no auto-speak)
  const handleSend = (msg) => {
    const m = msg || input.trim();
    if (m) { 
      setLastInputWasVoice(false);
      setPendingAutoSpeak(false);
      sendMessage(m); 
      setInput(''); 
    }
  };

  // Send message via voice (will auto-speak response)
  const handleVoiceSend = (text) => {
    if (text && text.trim()) {
      setLastInputWasVoice(true);
      setPendingAutoSpeak(true);
      sendMessage(text.trim());
    }
  };

  const scrollSlider = (dir) => {
    sliderRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });
  };

  const getSkills = (c) => {
    if (!c.skills) return [];
    if (Array.isArray(c.skills)) return c.skills.slice(0, 6);
    return [];
  };

  // ============ VOICE FUNCTIONS ============
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Please allow microphone access to use voice input.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }; 

  const transcribeAudio = async (audioBlob) => {
  setIsTranscribing(true);
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    const response = await fetch('https://resumate-2vad.onrender.com/api/chat/speech-to-text', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer demo-token' },
      body: formData
    });

    // Check if response is ok
    if (!response.ok) {
      const errorText = await response.text();
      console.error('STT Response error:', errorText);
      throw new Error(`Server error: ${response.status}`);
    }

    // Try to parse JSON
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error('Invalid response from server');
    }

    // Check for error in response
    if (data.error) {
      throw new Error(data.error);
    }

    if (data.text && data.text.trim()) {
      handleVoiceSend(data.text);
    } else {
      alert('No speech detected. Please try again.');
    }
  } catch (err) {
    console.error('Transcription error:', err);
    alert('Voice transcription failed: ' + err.message);
  } finally {
    setIsTranscribing(false);
  }
};


 
  const stopSpeaking = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      if (currentAudioRef.current.src) {
        URL.revokeObjectURL(currentAudioRef.current.src);
      }
      currentAudioRef.current = null;
    }
    
    setSpeakingMsgIndex(null);
    setLoadingMsgIndex(null);
  }, []);

  const speakText = useCallback(async (text, msgIndex) => {
    if (speakingMsgIndex === msgIndex) {
      stopSpeaking();
      return;
    }
    
    stopSpeaking();
    setLoadingMsgIndex(msgIndex);
    
    try {
      abortControllerRef.current = new AbortController();
      
      let cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/`/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/•/g, ',')
        .replace(/\n+/g, '. ')
        .trim();
      
      if (cleanText.length > 4000) {
        cleanText = cleanText.substring(0, 4000) + '...';
      }
      
      const response = await fetch('https://resumate-2vad.onrender.com/api/chat/text-to-speech', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer demo-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: cleanText, voice: 'nova' }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error('TTS failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setSpeakingMsgIndex(null);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setSpeakingMsgIndex(null);
      };

      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(msgIndex);
      
      await audio.play();
      
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Speech request cancelled');
      } else {
        console.error('TTS error:', err);
      }
      setLoadingMsgIndex(null);
      setSpeakingMsgIndex(null);
    }
  }, [speakingMsgIndex, stopSpeaking]);

  const handleClearChat = () => {
    stopSpeaking();
    clearChat();
    setLastInputWasVoice(false);
    setPendingAutoSpeak(false);
  };

  return (
    <div className="dashboard-layout">
      <div ref={cursorRef} className="cursor-glow" />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="sidebar-logo" onClick={() => navigate('/')}>
            <Logo /> ResuMate
          </button>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Navigation</div>
            <div className="sidebar-link" onClick={() => navigate('/')}>
              <Home size={18} /><span>Home</span>
            </div>
            {[
              { id: 'upload', icon: <Upload size={18} />, label: 'Upload' },
              { id: 'analytics', icon: <BarChart2 size={18} />, label: 'Analytics' },
              { id: 'chat', icon: <MessageSquare size={18} />, label: 'AI Chat' }
            ].map(item => (
              <div
                key={item.id}
                className={`sidebar-link ${tab === item.id ? 'active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.icon}<span>{item.label}</span>
              </div>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-stats">
            <div className="sidebar-stat">
              <span className="sidebar-stat-value">{candidates.length}</span>
              <span className="sidebar-stat-label">Uploaded</span>
            </div>
            <div className="sidebar-stat">
              <span className="sidebar-stat-value">{selectedIds.length}</span>
              <span className="sidebar-stat-label">Selected</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="main-header">
          <div className="header-left">
            <h1 className="main-title">
              {tab === 'upload' ? 'Upload Resumes' : tab === 'analytics' ? 'Analytics' : 'AI Chat'}
            </h1>
            {candidates.length > 0 && <span className="badge badge-orange">{candidates.length}</span>}
            {selectedIds.length > 0 && <span className="badge badge-green">{selectedIds.length} selected</span>}
          </div>
          <div className="header-right">
            <div className="toggle-wrapper">
              <span className="toggle-label">
                {anonymize ? <EyeOff size={16} /> : <Eye size={16} />} Anonymize
              </span>
              <div className={`toggle ${anonymize ? 'active' : ''}`} onClick={() => setAnonymize(!anonymize)}>
                <div className="toggle-knob" />
              </div>
            </div>
          </div>
        </header>

        <div className="main-body">
          {/* UPLOAD TAB */}
          {tab === 'upload' && (
            <div className="upload-tab">
              <div className="card upload-card">
                <div className="card-body">
                  <div
                    className={`upload-zone ${dragActive ? 'active' : ''}`}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={e => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
                  >
                    <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} />
                    <div className="upload-icon"><Upload size={36} /></div>
                    <h3>Drop resumes here or click to upload</h3>
                    <p>PDF, DOCX, TXT • Max 5MB each • No duplicates</p>
                  </div>

                  {Object.entries(uploadProgress).map(([id, p]) => (
                    <div key={id} className="upload-progress">
                      <div className="progress-header">
                        <span>Analyzing...</span>
                        <span className="progress-value">{p}%</span>
                      </div>
                      <div className="progress"><div className="progress-fill" style={{ width: `${p}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>

              {candidates.length > 0 && (
                <div className="candidates-section">
                  <div className="candidates-header">
                    <h2>Candidates ({candidates.length})</h2>
                    <div className="candidates-actions">
                      <button onClick={selectAll} className="btn btn-secondary btn-sm">Select All</button>
                      <button onClick={clearSelection} className="btn btn-ghost btn-sm">Clear</button>
                    <button
                     onClick={async () => {
            if (window.confirm('Delete ALL candidates? This cannot be undone.')) {
              await clearAllCandidates();
            }
          }} 
          className="btn btn-danger btn-sm"
        >
          Delete All
        </button>
                    
                    </div>
                  </div>

                  <div className="candidates-slider">
                    <button className="slider-btn slider-btn-left" onClick={() => scrollSlider(-1)}>
                      <ChevronLeft size={20} />
                    </button>
                    <div className="slider-track" ref={sliderRef}>
                      {candidates.map((c, i) => (
                        <div
                          key={c.id}
                          className={`candidate-card glass-card ${selectedIds.includes(c.id) ? 'selected' : ''} ${!c.is_resume ? 'not-resume' : ''}`}
                          onClick={() => toggleSelection(c.id)}
                        >
                          {!c.is_resume && (
                            <div className="not-resume-banner">
                              <AlertCircle size={14} /> Not a Resume
                            </div>
                          )}
                          <div className="candidate-header">
                            <div className="candidate-avatar" style={{ background: getAvatarGradient(c.name) }}>
                              {getDisplayName(c, i)[0]?.toUpperCase()}
                            </div>
                            {selectedIds.includes(c.id) && (
                              <div className="selected-check"><Check size={14} /></div>
                            )}
                            <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteCandidate(c.id); }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <h3 className="candidate-name">{getDisplayName(c, i)}</h3>
                          <p className="candidate-role">{c.predicted_role || 'Processing...'}</p>
                          
                          <div className="candidate-badges">
                            {c.badges?.slice(0, 3).map((b, j) => (
                              <span key={j} className={`badge badge-${b.color || 'blue'}`}>{b.label}</span>
                            ))}
                          </div>

                          <div className="candidate-stats">
                            <span><Briefcase size={12} /> {c.total_experience_years || 0}y</span>
                            <span><Award size={12} /> {c.experience_level || 'N/A'}</span>
                          </div>

                          {c.location && (
                            <div className="candidate-location">
                              <MapPin size={12} /> {c.location}
                            </div>
                          )}

                          <div className="candidate-skills">
                            {getSkills(c).slice(0, 4).map((s, j) => (
                              <span key={j} className="skill">{typeof s === 'string' ? s : s?.name}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="slider-btn slider-btn-right" onClick={() => scrollSlider(1)}>
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}

              {candidates.length === 0 && !loading && (
                <div className="empty-state">
                  <div className="empty-icon"><FileText size={40} /></div>
                  <h3>No resumes yet</h3>
                  <p>Upload resumes to start analyzing</p>
                </div>
              )}
            </div>
          )}

          {/* ANALYTICS TAB */}
          {tab === 'analytics' && (
            <div className="analytics-tab">
              <FloatingParticles />
              
              {selectedCandidates.length === 0 ? (
                <div className="empty-state glass-card" style={{ padding: '60px' }}>
                  <div className="empty-icon"><BarChart2 size={40} /></div>
                  <h3>No candidates selected</h3>
                  <p>Select candidates in Upload tab</p>
                </div>
              ) : (
                <>
                  <div className="analytics-grid">
                    {[
                      { label: 'Selected', value: analytics.total, color: 'var(--accent)', icon: <Users size={24} /> },
                      { label: 'Avg Experience', value: `${analytics.avgExperience}y`, color: 'var(--success)', icon: <Briefcase size={24} /> },
                      { label: 'Unique Skills', value: analytics.totalSkills, color: 'var(--info)', icon: <Sparkles size={24} /> }
                    ].map((stat, i) => (
                      <div key={i} className="analytics-card glass-card floating-card" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="analytics-glow" style={{ background: stat.color }} />
                        <div className="analytics-icon" style={{ color: stat.color }}>{stat.icon}</div>
                        <div className="analytics-label">{stat.label}</div>
                        <div className="analytics-value" style={{ color: stat.color }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="chart-section">
                    <h3 className="chart-title"><TrendingUp size={20} /> Experience Comparison</h3>
                    <div className="experience-grid">
                      {selectedCandidates.filter(c => c.is_resume !== false).map((c, i) => {
                        const maxExp = Math.max(...selectedCandidates.map(x => x.total_experience_years || 0), 1);
                        const pct = ((c.total_experience_years || 0) / maxExp) * 100;
                        return (
                          <div key={c.id} className="experience-card glass-card floating-card" style={{ animationDelay: `${i * 0.1}s` }}>
                            <div className="exp-glow" />
                            <div className="exp-header">
                              <div className="avatar-sm" style={{ background: getAvatarGradient(c.name) }}>
                                {getDisplayName(c, i)[0]}
                              </div>
                              <div>
                                <div className="exp-name">{getDisplayName(c, i)}</div>
                                <div className="exp-role">{c.predicted_role}</div>
                              </div>
                            </div>
                            <div className="exp-value">{c.total_experience_years || 0}<span>years</span></div>
                            <div className="exp-bar">
                              <div className="exp-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="chart-section">
                    <h3 className="chart-title"><Sparkles size={20} /> Top Skills</h3>
                    <div className="glass-card skills-chart-card">
                      {analytics.topSkills.map((s, i) => (
                        <div key={i} className="chart-bar" style={{ animationDelay: `${i * 0.05}s` }}>
                          <div className="chart-bar-header">
                            <span>{s.name}</span>
                            <span className="chart-bar-value">{s.count} ({s.percentage}%)</span>
                          </div>
                          <div className="chart-bar-track">
                            <div className="chart-bar-fill animated-fill" style={{ '--target-width': `${s.percentage}%` }} />
                          </div>
                        </div>
                      ))}
                      {analytics.topSkills.length === 0 && <p className="no-data">No skills data</p>}
                    </div>
                  </div>

                  <div className="distributions-grid">
                    <div className="glass-card distribution-card floating-card">
                      <div className="dist-glow" />
                      <h3 className="chart-title"><Users size={18} /> Roles</h3>
                      {analytics.roleDistribution.map((r, i) => (
                        <div key={i} className="dist-row">
                          <span>{r.name}</span>
                          <span className="badge badge-orange">{r.count}</span>
                        </div>
                      ))}
                    </div>
                    <div className="glass-card distribution-card floating-card" style={{ animationDelay: '0.1s' }}>
                      <div className="dist-glow" />
                      <h3 className="chart-title"><Award size={18} /> Levels</h3>
                      {analytics.levelDistribution.map((l, i) => (
                        <div key={i} className="dist-row">
                          <span>{l.name}</span>
                          <span className="badge badge-green">{l.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI CHAT TAB */}
          {tab === 'chat' && (
            <div className="chat-tab">
              {selectedCandidates.length === 0 ? (
                <div className="empty-state glass-card" style={{ padding: '60px' }}>
                  <div className="empty-icon" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                    <Bot size={40} />
                  </div>
                  <h3>Select candidates to chat</h3>
                  <p>Go to Upload tab and select candidates</p>
                </div>
              ) : (
                <div className="chat-container">
                  <div className="chat-card glass-card">
                    {/* Chat Header */}
                    <div className="chat-header">
                      <div className="chat-header-left">
                        <AIAvatar />
                        <div>
                          <div className="chat-ai-name">ResuMate AI</div>
                          <div className="chat-ai-status">
                            {selectedCandidates.filter(c => c.is_resume !== false).length} candidates • GPT-5.2
                            {anonymize && ' • 🔒 Anonymized'}
                          </div>
                        </div>
                      </div>
                      <div className="chat-header-actions">
                        {/* Stop speaking button */}
                        {speakingMsgIndex !== null && (
                          <button 
                            className="btn-icon stop-btn"
                            onClick={stopSpeaking}
                            title="Stop speaking"
                          >
                            <Square size={16} />
                          </button>
                        )}
                        
                        {/* Clear chat */}
                        <button 
                          className="btn-icon"
                          onClick={handleClearChat}
                          title="Clear chat"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="chat-messages">
                      {messages.map((m, i) => (
                        <div key={i} className={`chat-message ${m.role}`}>
                          {m.role === 'assistant' && <AIAvatar />}
                          <div className={`chat-bubble ${m.role}`}>
                            {m.role === 'user' ? (
                              <p>{m.content}</p>
                            ) : (
                              <div className="md" dangerouslySetInnerHTML={{ __html: marked.parse(m.content) }} />
                            )}
                          </div>
                          
                          {m.role === 'user' && (
                            <div className="avatar-sm" style={{ background: 'var(--bg3)' }}>
                              <Users size={16} />
                            </div>
                          )}
                          
                          {/* Speak button for AI messages */}
                          {m.role === 'assistant' && (
                            <button 
                              className={`msg-speak-btn ${speakingMsgIndex === i ? 'speaking' : ''} ${loadingMsgIndex === i ? 'loading' : ''}`}
                              onClick={() => speakText(m.content, i)}
                              title={speakingMsgIndex === i ? 'Stop' : 'Read aloud'}
                              disabled={loadingMsgIndex !== null && loadingMsgIndex !== i}
                            >
                              {loadingMsgIndex === i ? (
                                <Loader size={16} className="spin" />
                              ) : speakingMsgIndex === i ? (
                                <Square size={14} />
                              ) : (
                                <Volume2 size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      ))}
                      
                      {isTyping && (
                        <div className="chat-message assistant">
                          <AIAvatar />
                          <div className="chat-bubble assistant">
                            <div className="typing"><span /><span /><span /></div>
                          </div>
                        </div>
                      )}
                      <div ref={msgEndRef} />
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && !isTyping && (
                      <div className="chat-suggestions">
                        {suggestions.map((q, i) => (
                          <button key={i} className="chat-suggestion" onClick={() => handleSend(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Input Area */}
                    <div className="chat-input-area">
                      <button
                        className={`btn-icon voice-btn ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isTranscribing || isTyping}
                        title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input (auto-speaks response)'}
                      >
                        {isTranscribing ? (
                          <Loader size={20} className="spin" />
                        ) : isRecording ? (
                          <MicOff size={20} />
                        ) : (
                          <Mic size={20} />
                        )}
                      </button>
                      
                      <input
                        type="text"
                        className="input chat-input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                        placeholder={isRecording ? '🎤 Listening...' : isTranscribing ? '⏳ Transcribing...' : "Type or use 🎤 for voice..."}
                        disabled={isTyping || isRecording || isTranscribing}
                      />
                      
                      <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isTyping}
                        className="btn btn-primary send-btn"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

