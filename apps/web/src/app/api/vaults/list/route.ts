import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import type { VaultListItem } from "@/lib/vault-list-types";
import { fetchVaultListForUser } from "@/lib/server/vault-list";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ vaults: [] as VaultListItem[] });
  }

  const { items } = await fetchVaultListForUser(user);
  return NextResponse.json({ vaults: items });
}
