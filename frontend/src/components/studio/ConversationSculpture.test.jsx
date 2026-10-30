import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import ConversationSculpture from './ConversationSculpture';

/* The conversation sculpture is a picture: screen readers skip it, and only a
 * live, unmuted conversation moves it, with the candidate's voice. */

afterEach(cleanup);

const scales = container => [...container.querySelectorAll('.sc-wave-column')]
  .map(column => Number(column.style.getPropertyValue('--signal-scale')));

describe('the conversation sculpture', () => {
  it('follows the microphone only in a live, unmuted conversation', () => {
    const { container, rerender } = render(<ConversationSculpture variant="live" live level={0.7} />);
    expect(scales(container).every(scale => scale > 1)).toBe(true);
    rerender(<ConversationSculpture variant="live" live level={0.7} muted />);
    expect(scales(container).every(scale => scale === 1)).toBe(true);
    rerender(<ConversationSculpture variant="live" level={0.7} />);
    expect(scales(container).every(scale => scale === 1)).toBe(true);
  });

  it("tells the interviewer's voice from the candidate's microphone", () => {
    const { container } = render(<ConversationSculpture variant="live" live speaking level={0.9} />);
    expect(container.firstChild.dataset.speaking).toBe('true');
    expect(scales(container).every(scale => scale === 1)).toBe(true);
  });

  it('is hidden from screen readers', () => {
    const { container } = render(<ConversationSculpture />);
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
  });

  it('carries a caption on the Interviews view, and none in an interview', () => {
    const { container, rerender } = render(<ConversationSculpture />);
    expect(container.firstChild.dataset.variant).toBe('feature');
    expect(screen.getByText('A little space to listen.')).toBeTruthy();
    rerender(<ConversationSculpture variant="welcome" />);
    expect(container.firstChild.dataset.variant).toBe('welcome');
    expect(screen.queryByText('A little space to listen.')).toBeNull();
  });
});
