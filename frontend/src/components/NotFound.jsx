import { Link } from 'react-router-dom';
import AuthCard, { linkStyle } from './auth/AuthCard';

/* An address the app doesn't have. It used to send everyone to the home page
 * without a word, so a mistyped or old link looked like a broken app. */
export default function NotFound() {
  return (
    <AuthCard title="Page not found" subtitle="There's nothing at this address.">
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '10px', textAlign: 'center', fontSize: '14px' }}>
        <li><Link to="/" style={linkStyle}>ResuMate home</Link></li>
        <li><Link to="/hiring/login" style={linkStyle}>Hiring manager sign-in</Link></li>
        <li><Link to="/candidate/login" style={linkStyle}>Candidate portal</Link></li>
      </ul>
    </AuthCard>
  );
}
