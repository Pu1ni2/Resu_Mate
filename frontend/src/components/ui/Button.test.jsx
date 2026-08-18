import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Button from './Button';

describe('Button', () => {
  it('renders children and defaults to type=button', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    // Defaulting to "button" matters: these are used inside forms, and the
    // HTML default of type=submit would submit on click.
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('applies the variant and size requested', () => {
    render(<Button variant="primary" size="lg">Go</Button>);
    const cls = screen.getByRole('button', { name: 'Go' }).className;
    expect(cls).toContain('bg-accent');
    expect(cls).toContain('h-[52px]');
  });

  it('falls back to the secondary variant for an unknown name', () => {
    render(<Button variant="nope">X</Button>);
    expect(screen.getByRole('button', { name: 'X' }).className).toContain('bg-surface-raised');
  });

  it('puts caller classes last so they can override', () => {
    render(<Button className="w-full">Wide</Button>);
    const cls = screen.getByRole('button', { name: 'Wide' }).className;
    expect(cls.trim().endsWith('w-full')).toBe(true);
  });

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Nope</Button>);
    screen.getByRole('button', { name: 'Nope' }).click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards arbitrary props such as aria-label', () => {
    render(<Button icon aria-label="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
