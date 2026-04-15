import { createHmac, timingSafeEqual } from 'node:crypto';

type CollabTokenPayload = {
  userId: string;
  name: string;
  color: string;
  vaultId: string;
  docId: string;
  iat: number;
  exp: number;
};

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function verifyCollabToken(
  token: string,
  secret: string,
): CollabTokenPayload | null {
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;

  const expected = sign(payloadB64, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    ) as CollabTokenPayload;
    if (
      !payload ||
      !payload.userId ||
      !payload.vaultId ||
      !payload.docId ||
      !payload.exp
    ) {
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
