// src/components/AppShell.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div>PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AppShell — mobile navigation (maquette)', () => {
  it('keeps appointments in the bar and « Comprendre » in the More menu', async () => {
    renderAt('/dashboard');
    const user = userEvent.setup();
    const bar = screen.getByRole('navigation', { name: 'nav.mobileLabel' });

    expect(within(bar).getByRole('link', { name: 'nav.appointmentsShort' })).toHaveAttribute('href', '/appointments');
    expect(within(bar).queryByRole('link', { name: 'nav.learn' })).not.toBeInTheDocument();

    await user.click(within(bar).getByRole('button', { name: 'nav.more' }));
    expect(screen.getAllByRole('link', { name: 'nav.learn' })
      .some((link) => link.getAttribute('href') === '/learn')).toBe(true);
  });

  it('highlights « Plus » on a page that lives in the More menu', () => {
    renderAt('/learn');
    const bar = screen.getByRole('navigation', { name: 'nav.mobileLabel' });
    expect(within(bar).getByRole('button', { name: 'nav.more' }).className).toMatch(/mobileNavItemActive/);
  });
});
