// ---------------------------------------------------------------------------
// Merged icon set
// ---------------------------------------------------------------------------
// Every prototype screen had its own `Icon` component with a switch statement,
// each with a slightly different (overlapping) set of cases. This merges all
// of them into one library. If you find a screen using an icon name that
// isn't here yet, add the case — don't recreate a second Icon component.
//
// NOTE: this file is a starting point. As you migrate each screen in Claude
// Code, diff its local `Icon` switch against this one and port over any
// case that's missing (e.g. star, heart, glasses, bookmark, paused, drop,
// collection, image, logo, flame, layers, calendar, reorder, etc. — several
// screens had large icon sets that weren't fully visible during retrieval).

export default function Icon({ name, size = 18, color = "#fff", strokeWidth = 1.8 }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (name) {
    case "back":
      return <svg {...p}><path d="M15 5l-7 7 7 7" /></svg>;
    case "chevronRight":
      return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
    case "chevronDown":
      return <svg {...p}><path d="M6 9l6 6 6-6" /></svg>;
    case "external":
      return <svg {...p}><path d="M7 17L17 7M9 7h8v8" /></svg>;
    case "globe":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
        </svg>
      );
    case "logout":
      return (
        <svg {...p}>
          <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
          <path d="M15 16l4-4-4-4M19 12H9" />
        </svg>
      );
    case "trash":
      return (
        <svg {...p}>
          <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
        </svg>
      );
    case "export":
      return (
        <svg {...p}>
          <path d="M12 15V4M8 8l4-4 4 4" />
          <path d="M5 18v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" />
        </svg>
      );
    case "plus":
      return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case "quote":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <path d="M4.5 9.6c0-2.6 1.8-4.7 4.6-5.3l.7 1.7c-1.6.5-2.5 1.5-2.6 3h2.5v5H4.5V9.6zm9.4 0c0-2.6 1.8-4.7 4.6-5.3l.7 1.7c-1.6.5-2.5 1.5-2.6 3h2.5v5h-5.2V9.6z" />
        </svg>
      );
    case "x":
      return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "warning":
      return (
        <svg {...p}>
          <path d="M12 3.5l9.5 16.5H2.5z" />
          <path d="M12 10v4.5M12 17.2v.1" />
        </svg>
      );
    case "check":
      return <svg {...p}><path d="M4 12.5l5 5.5L20 6" /></svg>;
    case "camera":
      return (
        <svg {...p}>
          <rect x="3" y="7" width="18" height="13" rx="2.5" />
          <path d="M8 7l1.5-2.5h5L16 7" />
          <circle cx="12" cy="13.5" r="3.3" />
        </svg>
      );
    case "image":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <circle cx="9" cy="10.5" r="1.5" />
          <path d="M4 17l5-5 4 4 3-3 4 4" />
        </svg>
      );
    case "sun":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </svg>
      );
    case "moon":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
        </svg>
      );
    case "auto":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill={color} stroke="none" />
        </svg>
      );
    case "star":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M12 2.5l2.9 6.1 6.6.7-4.9 4.6 1.3 6.6L12 17.3 5.9 20.5l1.3-6.6-4.9-4.6 6.6-.7z" />
        </svg>
      );
    case "heart":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M12 21s-7.5-4.6-10-9.1C.6 8.7 2.3 5 6 5c2 0 3.4 1 4.5 2.4C11.6 6 13 5 15 5c3.7 0 5.4 3.7 4 6.9-2.5 4.5-10 9.1-10 9.1z" />
        </svg>
      );
    case "heartOutline":
      return (
        <svg {...p}>
          <path d="M12 21s-7.5-4.6-10-9.1C.6 8.7 2.3 5 6 5c2 0 3.4 1 4.5 2.4C11.6 6 13 5 15 5c3.7 0 5.4 3.7 4 6.9-2.5 4.5-10 9.1-10 9.1z" />
        </svg>
      );
    case "sort":
      return (
        <svg {...p}>
          <path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3" />
        </svg>
      );
    case "filter":
      return (
        <svg {...p}>
          <path d="M4 5h16l-6.5 7.5v6L10.5 20v-7.5L4 5z" />
        </svg>
      );
    case "more":
      return (
        <svg {...p} fill={color} stroke="none">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      );
    case "edit":
      return (
        <svg {...p}>
          <path d="M4 20l1-4 11-11 3 3-11 11-4 1z" />
          <path d="M14 6l3 3" />
        </svg>
      );
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    case "home":
      return (
        <svg {...p}>
          <path d="M4 11.5L12 4l8 7.5" />
          <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case "flame":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 011.925-3.545 3.75 3.75 0 013.255 3.717z" />
        </svg>
      );
    case "thumbsUp":
      return (
        <svg {...p}>
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
      );
    case "similar":
      return (
        <svg {...p}>
          <circle cx="9.5" cy="12" r="6" />
          <circle cx="14.5" cy="12" r="6" />
        </svg>
      );
    case "user":
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c1-3.8 4-5.8 7-5.8s6 2 7 5.8" />
        </svg>
      );
    case "reorder":
      return (
        <svg {...p} fill={color} stroke="none">
          <circle cx="8" cy="6" r="1.4" />
          <circle cx="16" cy="6" r="1.4" />
          <circle cx="8" cy="12" r="1.4" />
          <circle cx="16" cy="12" r="1.4" />
          <circle cx="8" cy="18" r="1.4" />
          <circle cx="16" cy="18" r="1.4" />
        </svg>
      );
    case "play":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z" />
        </svg>
      );
    case "playSquare":
      return (
        <svg {...p}>
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <path d="M10.5 8.7L16 12l-5.5 3.3z" fill={color} stroke="none" />
        </svg>
      );
    case "ticket":
      return (
        <svg {...p}>
          <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a1.6 1.6 0 0 0 0 3.2V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.8a1.6 1.6 0 0 0 0-3.2V8z" />
          <path d="M10 6.5v11" strokeDasharray="2.2 2.2" />
        </svg>
      );
    case "clapperboard":
      return (
        <svg {...p}>
          <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
          <path d="m6.2 5.3 3.1 5.4" />
          <path d="m12.4 3.4 3.1 5.4" />
          <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
      );
    case "dvdSpines":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8.5 4v16M13 4v16M17 4v16" />
        </svg>
      );
    case "info":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5M12 8v.01" />
        </svg>
      );
    case "tv":
      return (
        <svg {...p}>
          <rect x="3" y="4.5" width="18" height="12" rx="1.6" />
          <path d="M8.5 20h7M12 16.5V20" />
        </svg>
      );
    case "genreSciFi":
      return (
        <svg {...p}>
          <path d="M12 2.5c2.3 2.2 3.8 5.6 3.8 9 0 2-.5 3.7-1.2 5.3h-5.2c-.7-1.6-1.2-3.3-1.2-5.3 0-3.4 1.5-6.8 3.8-9z" />
          <circle cx="12" cy="10" r="1.4" fill={color} stroke="none" />
          <path d="M8.6 14.8l-2.3 1.3v3l2.3-1.6M15.4 14.8l2.3 1.3v3l-2.3-1.6" />
          <path d="M10.5 17.8c.3 1.2.9 2.2 1.5 2.7.6-.5 1.2-1.5 1.5-2.7" />
        </svg>
      );
    case "genreCrime":
      return (
        <svg {...p}>
          <circle cx="8" cy="14" r="3.2" />
          <circle cx="16" cy="14" r="3.2" />
          <path d="M8 10.8V7a2 2 0 0 1 2-2h1M16 10.8V7a2 2 0 0 1-2-2h-1" />
        </svg>
      );
    case "genreAction":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M13 2L4 14h6l-1 8 9-13h-6z" />
        </svg>
      );
    case "genreComedy":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 9.5c.4-.7 1-.7 1.5 0M14.5 9.5c.4-.7 1-.7 1.5 0" />
          <path d="M7.5 13c1 2.6 3 4 4.5 4s3.5-1.4 4.5-4" />
        </svg>
      );
    case "genreMystery":
      return (
        <svg {...p}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.3 15.3L20 20" />
        </svg>
      );
    case "genreFamily":
      return (
        <svg {...p}>
          <circle cx="8.5" cy="8" r="2.3" />
          <circle cx="16" cy="9" r="1.8" />
          <path d="M3.5 19c.8-3 2.6-4.6 5-4.6s4.2 1.6 5 4.6M14.5 19c.6-2.3 2-3.6 3.8-3.6s3 1 3.7 2.8" />
        </svg>
      );
    case "genreWar":
      return (
        <svg {...p}>
          <path d="M12 3l7 3v5.5c0 4.5-3 7.5-7 9.5-4-2-7-5-7-9.5V6z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...p}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "gridToggle":
      return (
        <svg {...p}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
        </svg>
      );
    case "list":
      return (
        <svg {...p}>
          <circle cx="4.5" cy="6" r="1.4" fill={color} stroke="none" />
          <path d="M9 6h11" />
          <circle cx="4.5" cy="12" r="1.4" fill={color} stroke="none" />
          <path d="M9 12h11" />
          <circle cx="4.5" cy="18" r="1.4" fill={color} stroke="none" />
          <path d="M9 18h11" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...p}>
          <path d="M12 3c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-3.8L5.5 21V4.5a1 1 0 0 1 1-1z" />
        </svg>
      );
    case "glasses":
      return (
        <svg {...p}>
          <circle cx="7.2" cy="13.2" r="3.2" />
          <circle cx="16.8" cy="13.2" r="3.2" />
          <path d="M10.4 13.2h3.2M3.2 12l1-3.2M20.8 12l-1-3.2" />
        </svg>
      );
    case "pause":
      return (
        <svg {...p} fill={color} stroke="none">
          <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
          <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "layers":
      return (
        <svg {...p}>
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
        </svg>
      );
    case "episodes":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3 9.5h18" />
          <circle cx="7" cy="7.2" r="0.6" fill={color} stroke="none" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...p}>
          <path d="M4 4v5h5" />
          <path d="M4.6 15A8 8 0 1 0 6 7.3L4 9" />
        </svg>
      );
    case "settings":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.5a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.3-2.5a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6z" />
        </svg>
      );
    case "paused":
      return (
        <svg {...p} fill={color} stroke="none">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case "drop":
      return (
        <svg {...p}>
          <path d="M4.5 7h15M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13" />
          <path d="M10 11l4 4.5M14 11l-4 4.5" />
        </svg>
      );
    // "Skipped" episode status — classic skip-forward media glyph
    // (triangle + bar), distinct from "eyeOff" (Not Watched) and "check"
    // (Watched).
    case "skip":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M6 5.5a1 1 0 0 1 1.53-.85l9 5.5a1 1 0 0 1 0 1.7l-9 5.5A1 1 0 0 1 6 16.5v-11z" />
          <rect x="16.5" y="5" width="2.3" height="14" rx="1" />
        </svg>
      );
    case "infinity":
      return (
        <svg {...p}>
          <path d="M6.5 8.5a3.5 3.5 0 1 0 0 7c2.5 0 3.7-2 5.5-3.5 1.8-1.5 3-3.5 5.5-3.5a3.5 3.5 0 1 1 0 7c-2.5 0-3.7-2-5.5-3.5C10.2 10.5 9 8.5 6.5 8.5z" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5.5l3.5 2" />
        </svg>
      );
    case "history":
      return (
        <svg {...p}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v4h4" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case "checkCircle":
      return (
        <svg {...p} fill={color} stroke="none">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12.5l2.7 3L16.5 9" stroke="#111" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "crown":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...p}>
          <path d="M8 4h8v6a4 4 0 0 1-8 0V4z" />
          <path d="M8 5H5a2 2 0 0 0 0 4h1.5M16 5h3a2 2 0 0 1 0 4h-1.5" />
          <path d="M12 14v3M9 20h6M9.5 17h5l.5 3h-6l.5-3z" />
        </svg>
      );
    case "circle":
      return <svg {...p}><circle cx="12" cy="12" r="9.2" /></svg>;
    case "collection":
      return (
        <svg {...p}>
          <rect x="4" y="7" width="16" height="13" rx="2" />
          <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
        </svg>
      );
    case "eyeOff":
      return (
        <svg {...p}>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c5.5 0 9.5 4.8 10 7-.3 1-1 2.4-2.1 3.7M6.6 6.6C4.5 8 3.2 10 3 12c.6 2.4 2.9 5.2 6 6.4a10.6 10.6 0 0 0 3.4.6c.9 0 1.8-.1 2.6-.4" />
          <path d="M9.9 10a3 3 0 0 0 4.2 4.2" />
        </svg>
      );
    case "eye":
      return (
        <svg {...p}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "mail":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3.5 7l8.5 6 8.5-6" />
        </svg>
      );
    case "lock":
      return (
        <svg {...p}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "apple":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M16.53 12.7c.03 3.11 2.72 4.15 2.75 4.16-.02.08-.43 1.47-1.42 2.9-.86 1.24-1.75 2.48-3.16 2.5-1.38.03-1.83-.82-3.41-.82-1.58 0-2.08.79-3.38.85-1.36.05-2.4-1.34-3.27-2.57-1.78-2.53-3.14-7.16-1.31-10.28.91-1.55 2.54-2.53 4.3-2.55 1.34-.02 2.61.9 3.43.9.82 0 2.37-1.11 4-.95.68.03 2.6.28 3.83 2.08-.1.06-2.29 1.34-2.26 4z" />
          <path d="M13.68 6.4c.75-.9 1.25-2.17 1.11-3.42-1.08.04-2.38.72-3.15 1.62-.7.79-1.31 2.07-1.15 3.29 1.18.09 2.4-.6 3.19-1.49z" />
        </svg>
      );
    case "logo":
      return (
        <svg {...p}>
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M9 9v6M9 9h2.5a2 2 0 1 1 0 4H9" />
        </svg>
      );
    case "select":
      return (
        <svg {...p}>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <path d="M8 12l2.5 2.5L16 9" />
        </svg>
      );
    case "share":
      return (
        <svg {...p}>
          <path d="M12 15V3M8 7l4-4 4 4" />
          <path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
        </svg>
      );
    case "bookmarkFilled":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M6 4h12v16l-6-4-6 4V4z" />
        </svg>
      );
    case "folderPlus":
      return (
        <svg {...p}>
          <path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5H9l2 2.2h8a1.5 1.5 0 0 1 1.5 1.5v8.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
          <path d="M12 12v5M9.5 14.5h5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...p}>
          <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case "lightning":
      return (
        <svg {...p} fill={color} stroke="none">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
        </svg>
      );
    // Pulse/waveform glyph — plain stroke-based ECG line (replaces the
    // earlier rounded-square + notification-dot badge treatment), per
    // explicit request to match a simpler pulse/waveform reference icon.
    case "activity":
      return <svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
    default:
      return null;
  }
}
