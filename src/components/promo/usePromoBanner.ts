import { createContext, useContext } from "react";

interface PromoBannerContextValue {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

export const PromoBannerContext = createContext<PromoBannerContextValue | null>(null);

export const usePromoBanner = () => {
  const context = useContext(PromoBannerContext);
  if (!context) {
    throw new Error("usePromoBanner must be used within a PromoBannerProvider");
  }
  return context;
};
