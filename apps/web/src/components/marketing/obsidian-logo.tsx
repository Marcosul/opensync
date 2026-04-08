import Image from "next/image";

import { cn } from "@/lib/utils";

type ObsidianLogoProps = {
  className?: string;
  /** Display size in pixels (width and height). Default 32. */
  size?: number;
};

/**
 * Official Obsidian mark from https://obsidian.md/favicon.svg (bundled under /public).
 */
export function ObsidianLogo({ className, size = 32 }: ObsidianLogoProps) {
  return (
    <Image
      src="/logo/obsidian-favicon.svg"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
    />
  );
}
