import { useState, type FormEvent } from "react";
import { LogIn, ShieldCheck } from "lucide-react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@opensync/ui";

import { ipc, type AuthSession } from "../lib/ipc";

export interface LoginViewProps {
  defaultApiUrl: string;
  onAuthenticated: (session: AuthSession) => void;
}

export function LoginView({ defaultApiUrl, onAuthenticated }: LoginViewProps) {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await ipc.login({
        uskToken: token,
        apiUrl: apiUrl.trim() || undefined,
      });
      onAuthenticated(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace(/^Error:\s*/, ""));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5" />
            <CardTitle>Entrar no OpenSync</CardTitle>
          </div>
          <CardDescription>
            Cole o seu token pessoal (<code>usk_…</code>) gerado na página de
            definições da app web.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-url">URL da API</Label>
              <Input
                id="api-url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://opensync.space/api"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="usk-token">Token pessoal</Label>
              <Input
                id="usk-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="usk_xxxxxxxxxxxx"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={submitting || !token.trim()}>
              <LogIn />
              {submitting ? "A validar…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
