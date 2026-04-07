/** Eco para consola (ANSI) + callback opcional (stream NDJSON). */
export function mirrorSshProgress(sendLine?: (message: string) => void): (message: string) => void {
  return (message: string) => {
    sendLine?.(message);
    const ts = new Date().toISOString();
    console.log(`\x1b[36m[OpenSync SSH ${ts}]\x1b[0m ${message}`);
  };
}
