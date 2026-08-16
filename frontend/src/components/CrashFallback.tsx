// src/components/CrashFallback.tsx
// Filet de secours affiché par Sentry.ErrorBoundary (main.tsx) si un rendu
// plante — volontairement sans dépendance à i18n/store (un crash peut venir
// de là) : texte bilingue en dur.
export function CrashFallback() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
        textAlign: 'center',
        gap: 12,
      }}
    >
      <p>Une erreur inattendue s&apos;est produite. / Something went wrong.</p>
      <button onClick={() => window.location.assign('/dashboard')}>Recharger / Reload</button>
    </div>
  );
}
