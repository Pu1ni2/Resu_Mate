import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Boom() {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(<ErrorBoundary><div>all good</div></ErrorBoundary>);
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('shows the fallback when a child throws', () => {
    // Silence the expected React error log for this test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    // The Reload button — use a role query to avoid matching other "Reload" text.
    expect(screen.getByRole('button', { name: /Reload/i })).toBeTruthy();
    spy.mockRestore();
  });
});
