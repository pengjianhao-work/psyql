import React from 'react';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg className="category-glyph" viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
      {children}
    </svg>
  );
}

const BY_ID: Record<string, React.ReactNode> = {
  academic_stress: (
    <Glyph>
      <path {...stroke} d="M4 19V7l8-3 8 3v12" />
      <path {...stroke} d="M12 4v15M8 10h3M8 13h3" />
    </Glyph>
  ),
  interpersonal: (
    <Glyph>
      <circle {...stroke} cx="9" cy="9" r="3" />
      <circle {...stroke} cx="16" cy="10" r="2.5" />
      <path {...stroke} d="M4 19c.8-3 2.8-4.5 5-4.5S13.2 16 14 19M14 19c.4-2 1.8-3.2 3.5-3.2 1.4 0 2.6.8 3.2 2.2" />
    </Glyph>
  ),
  family_relationship: (
    <Glyph>
      <path {...stroke} d="M4 11l8-6 8 6v9H4v-9z" />
      <path {...stroke} d="M10 20v-6h4v6" />
    </Glyph>
  ),
  romantic_relationship: (
    <Glyph>
      <path {...stroke} d="M12 19s-6.5-4.2-6.5-9A3.5 3.5 0 0 1 12 8.2 3.5 3.5 0 0 1 18.5 10c0 4.8-6.5 9-6.5 9z" />
    </Glyph>
  ),
  career_future: (
    <Glyph>
      <path {...stroke} d="M5 16l4-4 3 2 6-7" />
      <path {...stroke} d="M14 7h4v4" />
    </Glyph>
  ),
  self_identity: (
    <Glyph>
      <circle {...stroke} cx="12" cy="12" r="7" />
      <circle {...stroke} cx="12" cy="12" r="2.2" />
      <path {...stroke} d="M12 5v2M12 17v2M5 12h2M17 12h2" />
    </Glyph>
  ),
  emotion_regulation: (
    <Glyph>
      <path {...stroke} d="M4 14c2-4 4-6 8-6s6 2 8 6" />
      <path {...stroke} d="M7 14h10" />
      <circle {...stroke} cx="9" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle {...stroke} cx="15" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </Glyph>
  ),
  body_image: (
    <Glyph>
      <circle {...stroke} cx="12" cy="7" r="2.5" />
      <path {...stroke} d="M8 20v-5.5A4 4 0 0 1 12 10a4 4 0 0 1 4 4.5V20" />
    </Glyph>
  ),
  addiction: (
    <Glyph>
      <rect {...stroke} x="7" y="4" width="10" height="16" rx="2" />
      <path {...stroke} d="M10 8h4M10 12h4M10 16h3" />
    </Glyph>
  ),
  trauma: (
    <Glyph>
      <path {...stroke} d="M12 4v7M12 15v5" />
      <circle {...stroke} cx="12" cy="12.5" r="1.4" fill="currentColor" stroke="none" />
      <circle {...stroke} cx="12" cy="12" r="8" />
    </Glyph>
  ),
  other: (
    <Glyph>
      <circle {...stroke} cx="7" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle {...stroke} cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle {...stroke} cx="17" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Glyph>
  ),
  all: (
    <Glyph>
      <path {...stroke} d="M6 5h12v14H6z" />
      <path {...stroke} d="M9 9h6M9 12h6M9 15h4" />
    </Glyph>
  )
};

export function CategoryGlyph({ id }: { id: string }) {
  return <>{BY_ID[id] || BY_ID.other}</>;
}

export function stripCategoryEmoji(name: string): string {
  return name
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .trim();
}
