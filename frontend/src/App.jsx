import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Landing from './components/Landing';
import Dashboard from './components/Dashboard';
import CandidateLogin from './components/CandidateLogin';
import CandidateDashboard from './components/CandidateDashboard';
import CandidateFocus from './components/CandidateFocus';
import HiringLogin from './components/auth/HiringLogin';
import HiringRegister from './components/auth/HiringRegister';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { wakeServer } from './services/wake';
import { TermsPage, PrivacyPage } from './components/LegalPage';
// Lazy: an unlisted comparison page must not cost the product bundle anything.
const StyleLab = lazy(() => import('./components/landing/StyleLab'));
// Lazy: a page of its own, only loaded by managers who open it.
const SourcerPage = lazy(() => import('./components/sourcer/SourcerPage'));

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

/* The candidate's sign-in expired (services/authFetch.js candidateFetch): back
 * to the portal's sign-in, which says why. A manager's session is untouched.
 * The sign-in page forgets the stale session: forgetting it here as well set
 * off the dashboard's own redirect, which lost the reason. */
function CandidateUnauthorizedHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const onExpired = () => navigate('/candidate/login', { replace: true, state: { expired: true } });
    window.addEventListener('resumate:candidate-unauthorized', onExpired);
    return () => window.removeEventListener('resumate:candidate-unauthorized', onExpired);
  }, [navigate]);
  return null;
}

export default function App() {
  // Wake the backend now, and say so if it is slow to start (services/wake.js).
  useEffect(() => { wakeServer(); }, []);

  return (
    <>
    <UnauthorizedHandler />
    <CandidateUnauthorizedHandler />
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* Unlisted: side-by-side look comparison. Delete with StyleLab.jsx. */}
      <Route path="/styles" element={<Suspense fallback={null}><StyleLab /></Suspense>} />

      {/* Legal — public */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      {/* Hiring manager auth pages — public */}
      <Route path="/hiring/login" element={<HiringLogin />} />
      <Route path="/hiring/register" element={<HiringRegister />} />
      <Route path="/hiring/forgot" element={<ForgotPassword />} />
      <Route path="/hiring/reset" element={<ResetPassword />} />

      {/* Hiring manager dashboard — protected */}
      <Route path="/hiring/focus" element={<ProtectedRoute><CandidateFocus /></ProtectedRoute>} />
      <Route
        path="/hiring/sourcer"
        element={<ProtectedRoute><Suspense fallback={null}><SourcerPage /></Suspense></ProtectedRoute>}
      />
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
