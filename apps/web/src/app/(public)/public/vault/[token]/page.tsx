import type { Metadata } from "next";

import { PublicVaultPageClient } from "./public-vault-page-client";

export const metadata: Metadata = {
  title: "Cofre partilhado · OpenSync",
  description: "Visualização pública somente leitura de um cofre OpenSync.",
};

type PageProps = { params: Promise<{ token: string }> };

export default async function PublicVaultPage({ params }: PageProps) {
  const { token } = await params;
  return <PublicVaultPageClient token={token} />;
}
