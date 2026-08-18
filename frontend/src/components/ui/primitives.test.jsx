import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card, { CardHeader, CardBody } from './Card';
import Input, { Textarea, Select, Field } from './Input';
import Badge, { toneForLegacyColor } from './Badge';

describe('Card', () => {
  it('renders children inside a surface with a border', () => {
    render(<Card data-testid="c">body</Card>);
    const cls = screen.getByTestId('c').className;
    expect(cls).toContain('bg-surface');
    expect(cls).toContain('border-line');
  });

  it('only attaches hover affordances when interactive', () => {
    const { rerender } = render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).not.toContain('cursor-pointer');
    rerender(<Card data-testid="c" interactive>x</Card>);
    expect(screen.getByTestId('c').className).toContain('cursor-pointer');
  });

  it('can render as another element', () => {
    render(<Card as="section" data-testid="c">x</Card>);
    expect(screen.getByTestId('c').tagName).toBe('SECTION');
  });

  it('composes with header and body', () => {
    render(<Card><CardHeader>Title</CardHeader><CardBody>Body</CardBody></Card>);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('carries the edge highlight and e1 elevation by default', () => {
    render(<Card data-testid="c">x</Card>);
    const cls = screen.getByTestId('c').className;
    expect(cls).toContain('shadow-e1');
    expect(cls).toContain('before:h-px');
  });

  it('can raise elevation and drop the highlight', () => {
    render(<Card data-testid="c" elevation={3} highlight={false}>x</Card>);
    const cls = screen.getByTestId('c').className;
    expect(cls).toContain('shadow-e3');
    expect(cls).not.toContain('before:h-px');
  });

  it('falls back to e1 for an out-of-range elevation', () => {
    render(<Card data-testid="c" elevation={9}>x</Card>);
    expect(screen.getByTestId('c').className).toContain('shadow-e1');
  });

  it('supports a flat card with no shadow', () => {
    render(<Card data-testid="c" elevation={0}>x</Card>);
    expect(screen.getByTestId('c').className).not.toContain('shadow-e');
  });
});

describe('Input', () => {
  it('marks invalid fields for assistive tech, not just visually', () => {
    render(<Input invalid placeholder="Email" />);
    expect(screen.getByPlaceholderText('Email').getAttribute('aria-invalid')).toBe('true');
  });

  it('omits aria-invalid when valid', () => {
    render(<Input placeholder="Email" />);
    expect(screen.getByPlaceholderText('Email').getAttribute('aria-invalid')).toBeNull();
  });

  it('renders textarea and select variants', () => {
    render(
      <>
        <Textarea placeholder="Notes" />
        <Select aria-label="Pick"><option>One</option></Select>
      </>,
    );
    expect(screen.getByPlaceholderText('Notes').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Pick').tagName).toBe('SELECT');
  });

  it('Field shows its label and error text', () => {
    render(<Field label="Role" error="Required"><Input /></Field>);
    expect(screen.getByText('Role')).toBeTruthy();
    expect(screen.getByText('Required')).toBeTruthy();
  });
});

describe('Badge', () => {
  it('defaults to the neutral tone', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New').className).toContain('bg-surface-raised');
  });

  it('applies a status tone', () => {
    render(<Badge tone="positive">Done</Badge>);
    expect(screen.getByText('Done').className).toContain('text-positive');
  });

  it('maps the legacy hue names onto tones', () => {
    // The five-hue palette survives in candidate data; blue and purple carried
    // no distinct meaning, so both collapse to neutral rather than reintroducing
    // extra brand hues.
    expect(toneForLegacyColor('orange')).toBe('accent');
    expect(toneForLegacyColor('green')).toBe('positive');
    expect(toneForLegacyColor('red')).toBe('critical');
    expect(toneForLegacyColor('blue')).toBe('neutral');
    expect(toneForLegacyColor('purple')).toBe('neutral');
    expect(toneForLegacyColor(undefined)).toBe('neutral');
  });
});
