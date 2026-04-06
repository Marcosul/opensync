import Link from "next/link";

import { GoogleAuthCard } from "@/components/auth/google-auth-card";

export default function SignUpPage() {
  return (
    <div className="w-full max-w-md space-y-4">
      <GoogleAuthCard
        title="Criar conta no OpenSync"
        description="Cadastre-se com Google para iniciar seu workspace OpenClaw com historico seguro."
        buttonLabel="Criar conta com Google"
      />
      <p className="text-center text-sm text-muted-foreground">
        Ja possui conta?{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Fazer login
        </Link>
      </p>
    </div>
  );
}
