import React, { useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { Loader } from 'lucide-react';
import Home from './components/home/Home';
import CandidateLogin from './components/CandidateLogin';
import HiringLogin from './components/auth/HiringLogin';
import HiringRegister from './components/auth/HiringRegister';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { wakeServer } from './services/wake';
import { TermsPage, PrivacyPage } from './components/LegalPage';
import RequestDeletion from './components/RequestDeletion';
import NotFound from './components/NotFound';
// Lazy: a page of its own, only loaded by managers who open it.
const SourcerPage = lazy(() => import('./components/sourcer/SourcerPage'));
// Lazy: the dashboards are most of the app, and the landing page downloaded
// all of them, Jarvis and the interview rooms included.
const Dashboard = lazy(() => import('./components/Dashboard'));
const CandidateDashboard = lazy(() => import('./components/CandidateDashboard'));
const CandidateFocus = lazy(() => import('./components/CandidateFocus'));

/* While a page's code loads: a quiet spinner, announced once. */
function PageLoading() {
  return (
    <div role="status" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ink-muted)' }}>
      <Loader size={22} className="spin" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function UnauthorizedHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const onUnauth = () => {
      // services/api.js dispatches this when a 401 reaches the interceptor.
      // We do a soft navigation so React state (e.g. an in-progress Jarvis
      // session) survives the redirect. The sign-in page says why.
      navigate('/hiring/login', { replace: true, state: { expired: true } });
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

/* A link to another page opens it at the top. The router keeps the window's
 * scroll position, so "Terms" in the homepage's footer opened near the end of
 * the terms. Back and forward are left to the browser, which returns you to
 * where you were, and so is a change within the same page. Instant, because
 * the old stylesheets make the whole page scroll smoothly. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (navigationType !== 'POP') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, navigationType]);
  return null;
}

export default function App() {
  // Wake the backend now, and say so if it is slow to start (services/wake.js).
  useEffect(() => { wakeServer(); }, []);

  return (
    <>
    <ScrollToTop />
    <UnauthorizedHandler />
    <CandidateUnauthorizedHandler />
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={<Home />} />

      {/* Legal — public */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/privacy/delete" element={<RequestDeletion />} />

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

      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </>
  );
}
