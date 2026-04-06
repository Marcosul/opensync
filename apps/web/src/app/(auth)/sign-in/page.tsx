import Link from "next/link";

import { GoogleAuthCard } from "@/components/auth/google-auth-card";

export default function SignInPage() {
  return (
    <div className="w-full max-w-md space-y-4">
      <GoogleAuthCard
        title="Entrar no OpenSync"
        description="Use sua conta Google para acessar seus vaults e continuar o onboarding."
        buttonLabel="Entrar com Google"
      />
      <p className="text-center text-sm text-muted-foreground">
        Ainda nao tem conta?{" "}
        <Link href="/sign-up" className="font-medium text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
