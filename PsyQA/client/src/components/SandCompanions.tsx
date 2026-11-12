import React from 'react';

interface SandCompanionsProps {
  hidden?: boolean;
  pulse?: boolean;
}

/** Decorative sand-tray pets perched on the composer. Aria-hidden; not interactive. */
export const SandCompanions: React.FC<SandCompanionsProps> = ({ hidden = false, pulse = false }) => {
  if (hidden) return null;

  return (
    <div
      className={`sand-companions${pulse ? ' sand-companions-pulse' : ''}`}
      aria-hidden="true"
    >
      <svg className="sand-pet sand-pet-cat" viewBox="0 0 72 40" fill="none">
        <ellipse cx="36" cy="30" rx="26" ry="8" fill="#e8d7c0" opacity="0.55" />
        <path
          d="M18 28c0-10 6.5-18 14-18 3.2 0 6 1.4 8 3.6C42.2 11.4 45 10 48.2 10c7.5 0 14 8 14 18"
          fill="#c9b39a"
        />
        <path d="M22 14l-4-8 8 4" fill="#c9b39a" />
        <path d="M50 14l4-8-8 4" fill="#c9b39a" />
        <circle className="sand-pet-eye" cx="30" cy="22" r="1.6" fill="#2f5a4c" />
        <circle className="sand-pet-eye" cx="42" cy="22" r="1.6" fill="#2f5a4c" />
        <path d="M34 26c1.2 1.4 2.8 1.4 4 0" stroke="#a2704f" strokeWidth="1.2" strokeLinecap="round" />
        <path className="sand-pet-paw" d="M24 30h6M42 30h6" stroke="#a2704f" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <svg className="sand-pet sand-pet-dog" viewBox="0 0 76 40" fill="none">
        <ellipse cx="40" cy="31" rx="28" ry="7" fill="#e8d7c0" opacity="0.5" />
        <path
          d="M16 29c1-11 10-19 22-19 9 0 16 5 19 12 2-1.5 5-2 8-1 2.5.8 4 3 3.5 5.5"
          fill="#b9a48a"
        />
        <ellipse cx="18" cy="20" rx="5" ry="7" fill="#a89074" transform="rotate(-18 18 20)" />
        <circle className="sand-pet-eye" cx="34" cy="22" r="1.7" fill="#2f5a4c" />
        <circle className="sand-pet-eye" cx="44" cy="22" r="1.7" fill="#2f5a4c" />
        <ellipse cx="39" cy="26.5" rx="3.2" ry="2.2" fill="#d7b39a" />
        <path className="sand-pet-paw" d="M28 31h7M46 31h7" stroke="#a2704f" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M58 24c4 1 7 4 8 7" stroke="#a89074" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
};
