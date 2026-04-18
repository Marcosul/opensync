"use client";

import { useEffect, useState } from "react";

/**
 * `matches` só fica fiável após hidratação (no servidor devolve `initialMatches`).
 */
export function useMediaQuery(query: string, initialMatches = false): boolean {
  const [matches, setMatches] = useState(initialMatches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
