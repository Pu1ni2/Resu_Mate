import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ConversationSculpture from './ConversationSculpture';

afterEach(cleanup);

it('responds to microphone levels only during an unmuted live conversation', () => {
  const { container, rerender } = render(<ConversationSculpture variant="live" live level={0.7} />);
  const scales = () => [...container.querySelectorAll('.sc-wave-column')].map(column => Number(column.style.getPropertyValue('--signal-scale')));
  expect(scales().every(scale => scale > 1)).toBe(true);
  rerender(<ConversationSculpture variant="live" live level={0.7} muted />);
  expect(scales().every(scale => scale === 1)).toBe(true);
  rerender(<ConversationSculpture variant="live" level={0.7} />);
  expect(scales().every(scale => scale === 1)).toBe(true);
});

it('distinguishes the interviewer speaking from candidate microphone input', () => {
  const { container } = render(<ConversationSculpture variant="live" live speaking level={0.9} />);
  expect(container.firstChild.dataset.speaking).toBe('true');
  expect([...container.querySelectorAll('.sc-wave-column')].every(column => column.style.getPropertyValue('--signal-scale') === '1')).toBe(true);
  expect(container.firstChild.getAttribute('aria-hidden')).toBe('true');
});
