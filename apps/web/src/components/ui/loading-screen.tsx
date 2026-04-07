import Image from "next/image";

type LoadingScreenProps = {
  message?: string;
};

export function LoadingScreen({
  message = "Carregando dados do workspace...",
}: LoadingScreenProps) {
  return (
    <section className="flex min-h-[60vh] w-full items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <div className="relative">
          <div className="h-14 w-14 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Image
              src="/favicon.ico"
              alt="OpenSync"
              width={24}
              height={24}
              className="animate-pulse rounded-sm"
              priority
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </section>
  );
}
