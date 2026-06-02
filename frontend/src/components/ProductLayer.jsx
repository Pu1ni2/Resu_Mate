/**
 * ProductLayer — App-wide product features layer.
 * Wraps around the entire app to provide:
 * 1. Onboarding walkthrough (first-time users)
 * 2. Notification system (toasts + bell)
 * 3. Global keyboard shortcuts
 * 4. Dark/Light mode toggle
 * 
 * Usage: Wrap <App /> with <ProductLayer> in main.jsx
 */
import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  X, ChevronRight, ChevronLeft, Bell, Sun, Moon, Keyboard,
  Upload, MessageSquare, Users, Cpu, Video, Check, AlertCircle, Info, ArrowRight
} from 'lucide-react';

// ═══════ CONTEXT ═══════
const ProductContext = createContext(null);
export const useProduct = () => useContext(ProductContext);

export default function ProductLayer({ children }) {
  const location = useLocation();

  // ─── Theme ───
  const [theme, setTheme] = useState(() => localStorage.getItem('resumate_theme') || 'dark');

  // ─── Onboarding ───
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(() => localStorage.getItem('resumate_onboarded') === 'true');

  // ─── Notifications ───
  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  // ─── Keyboard shortcuts panel ───
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ═══ THEME ═══
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('resumate_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // ═══ ONBOARDING ═══
  useEffect(() => {
    if (!hasSeenOnboarding && location.pathname.startsWith('/hiring')) {
      const timer = setTimeout(() => setShowOnboarding(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenOnboarding, location.pathname]);

  const completeOnboarding = () => {
    setShowOnboarding(false);
    setHasSeenOnboarding(true);
    localStorage.setItem('resumate_onboarded', 'true');
  };

  const onboardingSteps = [
    {
      title: 'Welcome to ResuMate AI!',
      desc: 'Your AI-powered hiring platform with 4 specialized agents. Let me show you around.',
      icon: <Cpu size={28} />,
      image: '🚀'
    },
    {
      title: 'Upload Resumes',
      desc: 'Start by uploading PDF, DOCX, or TXT resumes. AI will extract text, find embedded links, and analyze each candidate.',
      icon: <Upload size={28} />,
      image: '📄'
    },
    {
      title: 'AI Chat',
      desc: 'Select candidates and chat with AI about them. Ask comparisons, strengths, fit analysis — AI only uses real resume data.',
      icon: <MessageSquare size={28} />,
      image: '💬'
    },
    {
      title: 'Candidate Focus',
      desc: 'Deep-dive into one candidate. Scanner Agent finds their GitHub & LinkedIn. Hiring Agent evaluates fit. Create AI interviews.',
      icon: <Users size={28} />,
      image: '🎯'
    },
    {
      title: 'Live AI Interview',
      desc: 'Create interviews for candidates. They login with email, take a live video interview with AI, and you get a detailed report.',
      icon: <Video size={28} />,
      image: '🎥'
    }
  ];

  // ═══ NOTIFICATIONS ═══
  const addNotification = useCallback((title, body, type = 'info') => {
    const notif = { id: Date.now(), title, body, type, time: new Date(), read: false };
    setNotifications(prev => [notif, ...prev].slice(0, 50));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  // ═══ KEYBOARD SHORTCUTS ═══
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger when typing anywhere editable. Covers <input>, <textarea>,
      // <select>, AND contenteditable elements (e.g. rich-text composers). Without
      // the contenteditable check, pressing "t" inside a Jarvis chat composer
      // would flip the theme instead of typing the letter.
      const tag = e.target?.tagName;
      const inEditable =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
        e.target?.isContentEditable;
      if (inEditable) {
        // Ctrl+Enter to send in chat
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          const sendBtn = document.querySelector('.send-btn, .cd-chat-input button');
          if (sendBtn && !sendBtn.disabled) sendBtn.click();
        }
        // Escape to blur
        if (e.key === 'Escape' && typeof e.target.blur === 'function') e.target.blur();
        return;
      }

      // Global shortcuts
      if (e.key === '?' && e.shiftKey) { e.preventDefault(); setShowShortcuts(s => !s); }
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowNotifPanel(false);
        setShowOnboarding(false);
      }
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) { setShowNotifPanel(s => !s); }
      if (e.key === 't' && !e.ctrlKey && !e.metaKey) { toggleTheme(); }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTheme]);

  // ═══ CONTEXT VALUE ═══
  const contextValue = {
    theme, toggleTheme,
    addNotification, addToast,
    showOnboarding: () => { setOnboardingStep(0); setShowOnboarding(true); }
  };

  return (
    <ProductContext.Provider value={contextValue}>
      {children}

      {/* ═══ TOAST CONTAINER ═══ */}
      <div className="pl-toast-container" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`pl-toast pl-toast-${t.type}`}>
            {t.type === 'success' && <Check size={16} />}
            {t.type === 'error' && <AlertCircle size={16} />}
            {t.type === 'info' && <Info size={16} />}
            <span>{t.message}</span>
            <button className="pl-toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}><X size={12} /></button>
          </div>
        ))}
      </div>

      {/* ═══ FLOATING TOOLBAR (bottom-right) ═══ */}
      <div className="pl-toolbar">
        {/* Theme toggle */}
        <button className="pl-toolbar-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode (T)`} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <button className="pl-toolbar-btn" onClick={() => setShowNotifPanel(s => !s)} title="Notifications (N)" aria-label="Notifications">
          <Bell size={18} />
          {unreadCount > 0 && <span className="pl-notif-badge">{unreadCount}</span>}
        </button>

        {/* Keyboard shortcuts */}
        <button className="pl-toolbar-btn" onClick={() => setShowShortcuts(s => !s)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          <Keyboard size={18} />
        </button>
      </div>

      {/* ═══ NOTIFICATION PANEL ═══ */}
      {showNotifPanel && (
        <div className="pl-panel pl-notif-panel">
          <div className="pl-panel-header">
            <h3><Bell size={16} /> Notifications</h3>
            <div className="pl-panel-actions">
              {unreadCount > 0 && <button className="pl-link" onClick={markAllRead}>Mark all read</button>}
              <button className="pl-close" onClick={() => setShowNotifPanel(false)}><X size={16} /></button>
            </div>
          </div>
          <div className="pl-panel-body">
            {notifications.length === 0 ? (
              <div className="pl-panel-empty"><Bell size={24} /><p>No notifications yet</p></div>
            ) : (
              notifications.slice(0, 20).map(n => (
                <div key={n.id} className={`pl-notif-item ${n.read ? '' : 'unread'}`}>
                  <div className={`pl-notif-dot ${n.type}`} />
                  <div className="pl-notif-content">
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                    <span className="pl-notif-time">{timeAgo(n.time)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ═══ KEYBOARD SHORTCUTS ═══ */}
      {showShortcuts && (
        <div className="pl-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="pl-modal" onClick={e => e.stopPropagation()}>
            <div className="pl-modal-header">
              <h3><Keyboard size={18} /> Keyboard Shortcuts</h3>
              <button className="pl-close" onClick={() => setShowShortcuts(false)}><X size={16} /></button>
            </div>
            <div className="pl-shortcuts-grid">
              <div className="pl-shortcut-section">
                <h4>Global</h4>
                <div className="pl-shortcut"><span>Toggle theme</span><kbd>T</kbd></div>
                <div className="pl-shortcut"><span>Notifications</span><kbd>N</kbd></div>
                <div className="pl-shortcut"><span>This panel</span><kbd>Shift</kbd> + <kbd>?</kbd></div>
                <div className="pl-shortcut"><span>Close panels</span><kbd>Esc</kbd></div>
              </div>
              <div className="pl-shortcut-section">
                <h4>Chat</h4>
                <div className="pl-shortcut"><span>Send message</span><kbd>Ctrl</kbd> + <kbd>↵</kbd></div>
                <div className="pl-shortcut"><span>Clear input</span><kbd>Esc</kbd></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ONBOARDING ═══ */}
      {showOnboarding && (
        <div className="pl-overlay pl-onboarding-overlay">
          <div className="pl-onboarding">
            <button className="pl-onboarding-skip" onClick={completeOnboarding}>Skip</button>

            <div className="pl-onboarding-content" key={onboardingStep}>
              <div className="pl-onboarding-emoji">{onboardingSteps[onboardingStep].image}</div>
              <div className="pl-onboarding-icon">{onboardingSteps[onboardingStep].icon}</div>
              <h2>{onboardingSteps[onboardingStep].title}</h2>
              <p>{onboardingSteps[onboardingStep].desc}</p>
            </div>

            {/* Progress dots */}
            <div className="pl-onboarding-dots">
              {onboardingSteps.map((_, i) => (
                <div key={i} className={`pl-dot ${i === onboardingStep ? 'active' : ''} ${i < onboardingStep ? 'done' : ''}`} onClick={() => setOnboardingStep(i)} />
              ))}
            </div>

            {/* Navigation */}
            <div className="pl-onboarding-nav">
              {onboardingStep > 0 && (
                <button className="btn btn-ghost" onClick={() => setOnboardingStep(s => s - 1)}>
                  <ChevronLeft size={16} /> Back
                </button>
              )}
              <div style={{ flex: 1 }} />
              {onboardingStep < onboardingSteps.length - 1 ? (
                <button className="btn btn-primary" onClick={() => setOnboardingStep(s => s + 1)}>
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn btn-primary" onClick={completeOnboarding}>
                  Get Started <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </ProductContext.Provider>
  );
}

// Helper
function timeAgo(date) {
  const s = Math.floor((new Date() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}