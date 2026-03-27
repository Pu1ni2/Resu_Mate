import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './components/Landing';
import Dashboard from './components/Dashboard';
import CandidateLogin from './components/CandidateLogin';
import CandidateDashboard from './components/CandidateDashboard';
import CandidateFocus from './components/CandidateFocus';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/hiring/*" element={<Dashboard />} />
      <Route path="/hiring/focus" element={<CandidateFocus />} />
      <Route path="/candidate/login" element={<CandidateLogin />} />
      <Route path="/candidate/dashboard/*" element={<CandidateDashboard />} />
      {/* Keep old route working */}
      <Route path="/dashboard/*" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
