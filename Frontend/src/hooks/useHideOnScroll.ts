import { useEffect, useRef, useState } from "react";

/** Hides the header while scrolling down past `threshold`, and brings it back
 * as soon as the user scrolls up at all (or is near the top of the page) —
 * the common "sticky nav that steps aside while reading" pattern. Scroll
 * position is only read inside a `requestAnimationFrame`-throttled handler
 * so this doesn't add work on every native scroll event. */
export function useHideOnScroll(threshold = 64) {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function update() {
      const scrollY = window.scrollY;
      const delta = scrollY - lastScrollY.current;

      if (scrollY <= threshold) {
        setHidden(false);
      } else if (delta > 0) {
        setHidden(true);
      } else if (delta < 0) {
        setHidden(false);
      }

      lastScrollY.current = scrollY;
      ticking.current = false;
    }

    function onScroll() {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
