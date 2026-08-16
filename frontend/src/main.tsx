// src/main.tsx
// Doit être importé en tout premier : Sentry.init() doit tourner avant le
// reste du graphe de modules pour capter les erreurs qui surviendraient dès
// leur chargement.
import './lib/sentry';
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { CrashFallback } from './components/CrashFallback';
import './lib/i18n';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<CrashFallback />}>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <App />
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                background: 'var(--bg-raised)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                boxShadow: 'var(--shadow)',
                fontFamily: 'var(--font-body)',
              },
            }}
          />
        </QueryClientProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
