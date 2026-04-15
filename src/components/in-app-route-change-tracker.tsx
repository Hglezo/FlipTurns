"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { IN_APP_CLIENT_ROUTE_KEY } from "@/lib/in-app-navigation";

export function InAppRouteChangeTracker() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastPathRef.current === null) {
      lastPathRef.current = pathname;
      return;
    }
    if (lastPathRef.current !== pathname) {
      sessionStorage.setItem(IN_APP_CLIENT_ROUTE_KEY, "1");
      lastPathRef.current = pathname;
    }
  }, [pathname]);

  return null;
}
