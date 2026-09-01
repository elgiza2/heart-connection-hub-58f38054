import { useState, type ReactNode } from "react";
import { PromoBannerContext } from "./usePromoBanner";

export const PromoBannerProvider = ({ children }: { children: ReactNode }) => {
  const [hidden, setHidden] = useState(false);
  return (
    <PromoBannerContext.Provider value={{ hidden, setHidden }}>
      {children}
    </PromoBannerContext.Provider>
  );
};
