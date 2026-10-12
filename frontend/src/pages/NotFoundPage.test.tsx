// src/pages/NotFoundPage.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';

describe('NotFoundPage', () => {
  it('renders on an unknown route and links back to the home route', () => {
    render(
      <MemoryRouter initialEntries={['/nope/nothing']}>
        <Routes>
          <Route path="/" element={<div>HOME</div>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'notFound.title' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'notFound.backHome' })).toHaveAttribute('href', '/');
  });
});
