const OPENSSH_V1_MAGIC = Buffer.from("openssh-key-v1\u0000", "utf8");

function rewrapPemBlock(beginLine: string, endLine: string, base64NoWhitespace: string): string {
  const lines = base64NoWhitespace.match(/.{1,64}/g) ?? [base64NoWhitespace];
  return `${beginLine}\n${lines.join("\n")}\n${endLine}\n`;
}

function normalizeBareOpenSshBase64(t: string): string {
  const b64 = t.replace(/\s+/g, "");
  if (b64.length < 40 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) {
    return t.trim().endsWith("\n") ? t.trim() : `${t.trim()}\n`;
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return t.trim().endsWith("\n") ? t.trim() : `${t.trim()}\n`;
  }

  if (buf.length < OPENSSH_V1_MAGIC.length) {
    return t.trim().endsWith("\n") ? t.trim() : `${t.trim()}\n`;
  }
  if (!buf.subarray(0, OPENSSH_V1_MAGIC.length).equals(OPENSSH_V1_MAGIC)) {
    return t.trim().endsWith("\n") ? t.trim() : `${t.trim()}\n`;
  }

  return rewrapPemBlock(
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "-----END OPENSSH PRIVATE KEY-----",
    b64,
  );
}

/**
 * Normaliza PEM (rejunta Base64 do corpo e volta a partir em linhas de 64 chars) e,
 * se for só Base64 OpenSSH v1 sem cabeçalhos, reconstroi o PEM.
 */
export function normalizeSshPrivateKeyPem(raw: string): string {
  const t = raw.trim().replace(/\r\n/g, "\n");

  const beginMatch = /-----BEGIN ([^-]+)-----/.exec(t);
  const endMatch = /-----END ([^-]+)-----/.exec(t);
  if (beginMatch && endMatch) {
    const label = beginMatch[1].trim();
    if (label === endMatch[1].trim()) {
      const beginLine = `-----BEGIN ${label}-----`;
      const endLine = `-----END ${label}-----`;
      const start = beginMatch.index! + beginMatch[0].length;
      const endPos = t.indexOf(endLine, start);
      if (endPos === -1) {
        return t.endsWith("\n") ? t : `${t}\n`;
      }
      const inner = t.slice(start, endPos).replace(/\s+/g, "");
      if (/^[A-Za-z0-9+/]+=*$/.test(inner) && inner.length > 0) {
        return rewrapPemBlock(beginLine, endLine, inner);
      }
      return t.endsWith("\n") ? t : `${t}\n`;
    }
  }

  return normalizeBareOpenSshBase64(t);
}
