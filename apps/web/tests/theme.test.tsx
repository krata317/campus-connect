import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/lib/theme';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const renderToggle = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );

describe('theme toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('starts in light mode when nothing is stored', () => {
    renderToggle();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(screen.getByRole('button', { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it('switches to dark mode and remembers the choice', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('cc-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument();
  });

  it('honours a stored preference on load', () => {
    localStorage.setItem('cc-theme', 'dark');
    renderToggle();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('switches back to light mode', async () => {
    localStorage.setItem('cc-theme', 'dark');
    document.documentElement.classList.add('dark');
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('cc-theme')).toBe('light');
  });
});
