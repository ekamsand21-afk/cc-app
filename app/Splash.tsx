"use client";

import Image from "next/image";
import { useState } from "react";

// One-time intro shown on a fresh page load of the student page.
//
// The animation is pure CSS (see .splash in globals.css), so it is in the
// server-rendered HTML and starts on the first frame, before React hydrates:
// no flash of the page underneath. Its final keyframe sets visibility: hidden,
// so even if JS never runs it can't block clicks. When it finishes, React
// removes it from the DOM. State lives in this component, so upvotes, searches
// and re-renders never replay it; only a new page load does.
// prefers-reduced-motion hides it outright (globals.css).
export default function Splash() {
  const [done, setDone] = useState(false);
  if (done) return null;

  return (
    <div
      aria-hidden
      className="splash"
      onAnimationEnd={(e) => {
        // The logo's own animation bubbles up here too; only the veil ends it.
        if (e.target === e.currentTarget) setDone(true);
      }}
    >
      <Image
        src="/logo-splash.webp"
        alt=""
        width={480}
        height={480}
        loading="eager"
        fetchPriority="high"
        unoptimized
        className="splash-logo"
      />
    </div>
  );
}
