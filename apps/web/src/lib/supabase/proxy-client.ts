import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnvOrNull } from "@/lib/supabase/env";

export function createSupabaseProxyClient(request: NextRequest): {
  supabase: SupabaseClient;
  response: NextResponse;
} | null {
  const env = getSupabaseEnvOrNull();
  if (!env) {
    return null;
  }
  const { url, anonKey } = env;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  return { supabase, response };
}
