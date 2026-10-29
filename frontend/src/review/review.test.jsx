import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Review } from './review';
import api from '../services/api';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('resumate_onboarded', 'true');
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ statuses: {}, results: [], access: false }) });
  vi.spyOn(api, 'get').mockResolvedValue({ data: { runs: [] } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('local design review', () => {
  it('renders every review destination with the actual page components', async () => {
    const { container } = render(<Review />);
    const picker = screen.getByRole('combobox', { name: 'Review a page' });
    const paths = Array.from(picker.options).map(option => option.value);
    for (const path of paths) {
      fireEvent.change(picker, { target: { value: path } });
      await waitFor(() => expect(container.querySelector('h1,h2')).toBeTruthy());
      expect(screen.queryByText('Back to the studio.')).toBeNull();
    }
  });
});
