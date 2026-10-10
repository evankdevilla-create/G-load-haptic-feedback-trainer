/**
 * The canopy and glareshield you are looking out through.
 *
 * This is an overlay rather than 3D geometry, and that is the physically correct
 * choice: the canopy is bolted to the airframe your head is strapped into, so it
 * never shifts relative to your eyes. Drawing it in the scene would buy nothing
 * and cost a lot of triangles.
 */

export function CockpitFrame() {
  return (
    <svg
      className="cockpit"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#161b1f" />
          <stop offset="100%" stopColor="#090c0e" />
        </linearGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14181b" />
          <stop offset="55%" stopColor="#0b0e10" />
          <stop offset="100%" stopColor="#050708" />
        </linearGradient>
        {/* A faint sheen across the canopy, so the glass reads as glass. */}
        <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
          <stop offset="35%" stopColor="rgba(255,255,255,0.015)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Canopy glass sheen. */}
      <rect x="0" y="0" width="1000" height="1000" fill="url(#glare)" />

      {/* Left and right canopy rails, angling in towards the top. */}
      <path d="M0,0 L0,1000 L120,1000 C96,700 84,420 150,0 Z" fill="url(#frame)" />
      <path d="M1000,0 L1000,1000 L880,1000 C904,700 916,420 850,0 Z" fill="url(#frame)" />

      {/* Top bow. */}
      <path d="M0,0 L1000,0 L1000,44 C700,74 300,74 0,44 Z" fill="url(#frame)" />

      {/* Glareshield and instrument panel. */}
      <path
        d="M80,1000 L920,1000 L920,792 C760,742 600,724 500,724 C400,724 240,742 80,792 Z"
        fill="url(#panel)"
      />
      {/* Glareshield lip, to separate panel from sky. */}
      <path
        d="M80,792 C240,742 400,724 500,724 C600,724 760,742 920,792"
        fill="none"
        stroke="rgba(170,190,200,0.22)"
        strokeWidth="3"
      />

      {/* Canopy rail highlights. */}
      <path
        d="M150,0 C84,420 96,700 120,1000"
        fill="none"
        stroke="rgba(170,190,200,0.17)"
        strokeWidth="2.5"
      />
      <path
        d="M850,0 C916,420 904,700 880,1000"
        fill="none"
        stroke="rgba(170,190,200,0.17)"
        strokeWidth="2.5"
      />
    </svg>
  );
}
