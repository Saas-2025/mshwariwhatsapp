import React, { useState } from 'react';

// Inline brand mark (green robot head) — crisp at any size, used in nav and as a
// fallback until the raster logo is dropped at /public/logo.png.
export const BrandMark: React.FC<{ className?: string }> = ({ className = 'w-9 h-9' }) => (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="24" y1="3.5" x2="24" y2="9" stroke="#1b8354" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="3" r="2.6" fill="#1b8354" />
        <rect x="2" y="18" width="4.5" height="11" rx="2.25" fill="#1b8354" />
        <rect x="41.5" y="18" width="4.5" height="11" rx="2.25" fill="#1b8354" />
        <rect x="6" y="9" width="36" height="30" rx="10" fill="#1b8354" />
        <rect x="11.5" y="14.5" width="25" height="19" rx="7.5" fill="#0f3d2a" />
        <circle cx="19" cy="23" r="2.7" fill="#7ef0b0" />
        <circle cx="29" cy="23" r="2.7" fill="#7ef0b0" />
        <path d="M18.5 27.5 Q24 31.5 29.5 27.5" stroke="#7ef0b0" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
);

// Tries the raster logo (public/logo.png); falls back to the inline mark if missing.
export const Logo: React.FC<{ className?: string; markClassName?: string; alt?: string }> = ({ className, markClassName, alt = 'logo' }) => {
    const [broken, setBroken] = useState(false);
    if (broken) return <BrandMark className={markClassName || className} />;
    return <img src="/logo.png" alt={alt} className={className} onError={() => setBroken(true)} />;
};

export default Logo;
