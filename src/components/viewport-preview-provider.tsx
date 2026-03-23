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
    document.body.dataset.viewportPreview = previewViewport ?? "";
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
