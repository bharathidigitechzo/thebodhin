/**
 * Re-render whenever the app's data changes from outside this screen: another tab on this browser, the shared
 * cloud store, or just time passing (so "starts in 3 min" stays right). Used by the live screens and the banner.
 */
import { useEffect, useState } from 'react';
import { dbListeners } from '@/api/mockDb';

export function useDbTick(everyMs = 4000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((x) => x + 1);
    dbListeners.add(bump);
    const t = everyMs > 0 ? setInterval(bump, everyMs) : null;
    return () => {
      dbListeners.delete(bump);
      if (t) clearInterval(t);
    };
  }, [everyMs]);
  return n;
}
