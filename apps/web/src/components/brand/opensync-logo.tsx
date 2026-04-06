import Image from "next/image";
import Link from "next/link";

type OpensyncLogoProps = {
  href?: string;
  priority?: boolean;
  className?: string;
};

export function OpensyncLogo({
  href = "/",
  priority = false,
  className,
}: OpensyncLogoProps) {
  return (
    <Link href={href} className={className}>
      <Image
        src="/logo/opensync-horizontal-dark.svg"
        alt="OpenSync"
        width={172}
        height={36}
        priority={priority}
        className="block dark:hidden"
      />
      <Image
        src="/logo/opensync-horizontal-light.svg"
        alt="OpenSync"
        width={172}
        height={36}
        priority={priority}
        className="hidden dark:block"
      />
    </Link>
  );
}
