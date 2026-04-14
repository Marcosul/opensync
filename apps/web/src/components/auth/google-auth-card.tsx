"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type GoogleAuthCardProps = {
  title: string;
  description: string;
  buttonLabel: string;
};

export function GoogleAuthCard({
  title,
  description,
  buttonLabel,
}: GoogleAuthCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignInWithGoogle() {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const safeOrigin = window.location.origin.trim().replace(/\/+$/g, "");
      const redirectTo = `${safeOrigin}/auth/callback`.trim();

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) {
        setErrorMessage(mapGoogleOAuthError(error.message));
      }
    } catch {
      setErrorMessage("Nao foi possivel iniciar o login com Google.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <section className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          O projeto precisa das variaveis publicas do Supabase para o login. Copia{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            apps/web/.env.example
          </code>{" "}
          para{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">apps/web/.env</code> e
          preenche{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          e{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          (mesmo projeto em{" "}
          <span className="whitespace-nowrap">dashboard.supabase.com</span> &gt; Settings &gt; API).
          Reinicia o servidor de desenvolvimento depois de gravar o ficheiro.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>

      <Button
        className="mt-6 h-11 w-full text-sm"
        onClick={handleSignInWithGoogle}
        disabled={isLoading}
      >
        <span className="mr-2 inline-flex">
          <GoogleIcon />
        </span>
        {isLoading ? "Conectando..." : buttonLabel}
      </Button>

      {errorMessage ? (
        <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
      ) : null}
    </section>
  );
}

function mapGoogleOAuthError(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes("not enabled") ||
    lower.includes("unsupported provider") ||
    lower.includes("validation_failed")
  ) {
    return "O Google nao esta ativo no projeto Supabase usado por NEXT_PUBLIC_SUPABASE_URL. Ative em Auth > Providers > Google no mesmo projeto, ou alinhe URL e chave publica (anon/publishable) ao projeto correto.";
  }
  return message;
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.3H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.7z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.1 29.3 4 24 4c-7.7 0-14.4 4.3-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.3H42V20H24v8h11.3c-1 2.9-3 5.2-5.8 6.8l.1.1 6.2 5.2C35.4 40.2 44 34 44 24c0-1.3-.1-2.5-.4-3.7z"
      />
    </svg>
  );
}
