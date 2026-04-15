/**
 * Marcadores estilo Git: nenhuma das partes é descartada silenciosamente.
 * Quando local === remoto retorna o conteúdo sem marcadores.
 */
export function mergeTextPreserveBoth(local: string, remote: string): string {
  const L = local.replace(/\r\n/g, "\n");
  const R = remote.replace(/\r\n/g, "\n");
  if (L === R) return L;
  return `<<<<<<< OPENSYNC_LOCAL\n${L}\n=======\n${R}\n>>>>>>> OPENSYNC_REMOTE\n`;
}
