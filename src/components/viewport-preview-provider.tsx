"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ViewportPreview = "mobile" | "desktop" | null;

const ViewportPreviewContext = createContext<{
  previewViewport: ViewportPreview;
  setPreviewViewport: (v: ViewportPreview) => void;
} | null>(null);

export function ViewportPreviewProvider({ children }: { children: ReactNode }) {
  const [previewViewport, setPreviewViewport] = useState<ViewportPreview>(null);

  useEffect(() => {
    const root = document.documentElement;
    document.body.dataset.viewportPreview = previewViewport ?? "";
    if (previewViewport === "mobile") {
      root.style.fontSize = "87.5%";
    } else if (previewViewport === "desktop") {
      root.style.fontSize = "100%";
    } else {
      root.style.fontSize = "";
    }
    return () => {
      root.style.fontSize = "";
    };
  }, [previewViewport]);

  return (
    <ViewportPreviewContext.Provider value={{ previewViewport, setPreviewViewport }}>
      {children}
    </ViewportPreviewContext.Provider>
  );
}

export function useViewportPreview() {
  return useContext(ViewportPreviewContext);
}
