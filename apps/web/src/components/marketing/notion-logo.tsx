import Image from "next/image";

import { cn } from "@/lib/utils";

type NotionLogoProps = {
  className?: string;
  /** Display size in pixels (width and height). Default 32. */
  size?: number;
};

/**
 * Notion mark from https://www.notion.so/images/logo-ios.png (bundled under /public).
 */
export function NotionLogo({ className, size = 32 }: NotionLogoProps) {
  return (
    <Image
      src="/logo/notion-logo-ios.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
    />
  );
}
