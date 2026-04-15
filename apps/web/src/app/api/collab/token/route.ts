import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";

type CollabTokenPayload = {
  userId: string;
  name: string;
  color: string;
  vaultId: string;
  docId: string;
  iat: number;
  exp: number;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const secret = process.env.OPENSYNC_COLLAB_SHARED_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "missing OPENSYNC_COLLAB_SHARED_SECRET" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const vaultId = (url.searchParams.get("vaultId") ?? "").trim();
  const docId = (url.searchParams.get("docId") ?? "").trim();
  if (!vaultId || !docId) {
    return NextResponse.json({ error: "vaultId/docId required" }, { status: 400 });
  }

  const iat = Math.floor(Date.now() / 1000);
  const payload: CollabTokenPayload = {
    userId: user.id,
    name:
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
      user.email ||
      "OpenSync User",
    color: "#4f46e5",
    vaultId,
    docId,
    iat,
    exp: iat + 60 * 10,
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  const token = `${payloadB64}.${signature}`;

  return NextResponse.json({ token, profile: payload });
}
