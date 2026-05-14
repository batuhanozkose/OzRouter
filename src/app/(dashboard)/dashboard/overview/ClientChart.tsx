"use client";

import { useState, useEffect, type ReactNode } from "react";

/**
 * Delays rendering of Recharts charts until after first paint,
 * so ResponsiveContainer can measure its parent correctly.
 */
export default function ClientChart({
  children,
  height = "h-[200px]",
}: {
  children: ReactNode;
  height?: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait for next frame so container has layout dimensions
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return <div className={`${height} w-full min-w-0`}>{ready ? children : null}</div>;
}
