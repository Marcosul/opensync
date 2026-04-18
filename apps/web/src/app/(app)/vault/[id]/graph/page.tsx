import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

/** Links antigos `/vault/:id/graph` passam a abrir o grafo dentro do workspace (`/vault?vaultId=…&view=graph`). */
export default async function VaultGraphLegacyRedirectPage({ params }: PageProps) {
  const { id } = await params;
  const vaultId = typeof id === "string" ? id.trim() : "";
  if (!vaultId) {
    redirect("/vault");
  }
  redirect(`/vault?vaultId=${encodeURIComponent(vaultId)}&view=graph`);
}
