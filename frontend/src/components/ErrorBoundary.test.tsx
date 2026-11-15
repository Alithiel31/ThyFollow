// src/components/ErrorBoundary.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new Error('kaboom');
  return <p>contenu sain</p>;
}

// React consigne lui-même l'erreur rattrapée : on fait taire la console, le
// comportement vérifié est celui de l'écran de repli, pas du journal.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom fail={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('contenu sain')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the fallback with the error message when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom fail />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recharger|reload/i })).toBeInTheDocument();
  });

  it('reloads the page from the fallback', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload, assign: vi.fn() },
    });
    render(
      <ErrorBoundary variant="page">
        <Boom fail />
      </ErrorBoundary>
    );
    await userEvent.click(screen.getByRole('button', { name: /recharger|reload/i }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
