// src/components/LogoMark.tsx
// Logo « papillon » de ThyroTrack : ellipses bleu / orange en éventail.
// Même dessin que public/favicon.svg et les icônes PWA.
// Le viewBox est cadré sur les pétales pour que le dessin soit centré.
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 28) / 48)}
      viewBox="10 10 48 28"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <ellipse cx="34" cy="20" rx="4.4" ry="16" fill="#91adff" transform="rotate(-45 34 36)" />
      <ellipse cx="34" cy="22" rx="3.9" ry="14" fill="#6384e6" transform="rotate(-30 34 36)" />
      <ellipse cx="34" cy="26" rx="3.1" ry="10" fill="#91adff" transform="rotate(-15 34 36)" />
      <ellipse cx="34" cy="20" rx="4.4" ry="16" fill="#df8b79" transform="rotate(45 34 36)" />
      <ellipse cx="34" cy="22" rx="3.9" ry="14" fill="#c56e64" transform="rotate(30 34 36)" />
      <ellipse cx="34" cy="26" rx="3.1" ry="10" fill="#df8b79" transform="rotate(15 34 36)" />
    </svg>
  );
}
