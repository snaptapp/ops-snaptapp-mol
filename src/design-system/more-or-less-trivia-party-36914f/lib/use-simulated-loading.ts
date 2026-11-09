import { useEffect, useState } from "react";

/**
 * Simulates a data fetch for mock screens so loading and empty states are
 * exercised. Swap for a real query when the backend lands.
 */
export function useSimulatedLoading(ms = 700) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}
