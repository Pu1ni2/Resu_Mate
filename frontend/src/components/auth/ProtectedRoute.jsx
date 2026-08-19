import React from 'react';
import { Navigate } from 'react-router-dom';

import { getToken } from '../../services/session';

/**
 * Wraps hiring manager routes. Redirects to /hiring/login if no token is found.
 * The API interceptor handles expired token 401s by also redirecting to login.
 */
export default function ProtectedRoute({ children }) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/hiring/login" replace />;
  }
  return children;
}
