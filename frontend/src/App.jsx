import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Landing from './components/Landing';
import Dashboard from './components/Dashboard';
import CandidateLogin from './components/CandidateLogin';
import CandidateDashboard from './components/CandidateDashboard';
import CandidateFocus from './components/CandidateFocus';
import HiringLogin from './components/auth/HiringLogin';
import HiringRegister from './components/auth/HiringRegister';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { TermsPage, PrivacyPage } from './components/LegalPage';
import StyleLab from './components/landing/StyleLab';

function UnauthorizedHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const onUnauth = () => {
      // services/api.js dispatches this when a 401 reaches the interceptor.
      // We do a soft navigation so React state (e.g. an in-progress Jarvis
      // session) survives the redirect.
      navigate('/hiring/login', { replace: true });
    };
    window.addEventListener('resumate:unauthorized', onUnauth);
    return () => window.removeEventListener('resumate:unauthorized', onUnauth);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <>
    <UnauthorizedHandler />
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* Unlisted: side-by-side look comparison. Delete with StyleLab.jsx. */}
      <Route path="/styles" element={<StyleLab />} />

      {/* Legal — public */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      {/* Hiring manager auth pages — public */}
      <Route path="/hiring/login" element={<HiringLogin />} />
      <Route path="/hiring/register" element={<HiringRegister />} />

      {/* Hiring manager dashboard — protected */}
      <Route path="/hiring/focus" element={<ProtectedRoute><CandidateFocus /></ProtectedRoute>} />
      <Route path="/hiring/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      {/* Candidate portal */}
      <Route path="/candidate/login" element={<CandidateLogin />} />
      <Route path="/candidate/dashboard/*" element={<CandidateDashboard />} />

      {/* Legacy route */}
      <Route path="/dashboard/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
