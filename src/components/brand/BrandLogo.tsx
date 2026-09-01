/** @doc BrandLogo — Megsy icon with a silver shimmer sweep that settles to white. */
import { useBrandLogo } from "@/hooks/useBrandLogo";
import { cn } from "@/lib/utils";
import type { HTMLAttributes, ImgHTMLAttributes } from "react";

export interface BrandLogoProps extends ImgHTMLAttributes<HTMLImageElement> {}

export function BrandLogo({ className, style, alt = "Megsy", ...props }: BrandLogoProps) {
  const src = useBrandLogo();
  return (
    <span className="brand-logo-wrap relative inline-flex items-center justify-center">
      <img
        src={src}
        alt={alt}
        className={cn("brand-logo-img object-contain", className)}
        style={style}
        {...props}
      />
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={cn("brand-logo-shine object-contain", className)}
      />
    </span>
  );
}

export function BrandWord({ className, children = "Megsy", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("brand-word", className)} {...props}>
      {children}
    </span>
  );
}
