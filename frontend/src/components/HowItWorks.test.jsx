import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HowItWorks from './HowItWorks';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const open = () => render(<MemoryRouter><HowItWorks /></MemoryRouter>);

describe('the hiring workflow', () => {
  it('lets the reader follow the process and return to its beginning', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /^02.*Understand fit/ }));
    expect(screen.getByRole('heading', { name: 'Give fit a little context.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^02.*Understand fit/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Next: Look closer/ }));
    expect(screen.getByRole('heading', { name: 'Curiosity makes better questions.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^05.*Review the picture/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to the beginning' }));
    expect(screen.getByRole('heading', { name: 'The candidate file' })).toBeTruthy();
  });

  it('connects each tool to its workflow step and gives both roles an entry point', () => {
    Element.prototype.scrollIntoView = vi.fn();
    open();
    fireEvent.click(screen.getByRole('button', { name: /Interviewing.*Shapes role-specific questions/ }));
    expect(screen.getByRole('heading', { name: 'Let experience find its voice.' })).toBeTruthy();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Start hiring/ }).getAttribute('href')).toBe('/hiring/register');
    expect(screen.getByRole('link', { name: /here as a candidate/ }).getAttribute('href')).toBe('/candidate/login');
  });
});
