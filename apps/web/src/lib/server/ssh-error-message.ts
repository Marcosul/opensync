/** Mensagem amigavel para erros comuns do ssh2 / conexao. */
export function mapSshKeyOrConnectionError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("cannot parse privatekey") || m.includes("unsupported key format")) {
    return "Chave privada invalida ou ilegivel. Use o ficheiro sem .pub: linhas -----BEGIN OPENSSH PRIVATE KEY----- ... -----END-----, ou o bloco Base64 completo da mesma chave. A linha ssh-ed25519 AAA... e a chave publica.";
  }
  if (m.includes("all configured authentication methods failed")) {
    return "O servidor recusou a autenticacao por chave. Na VPS, confirme que a chave publica (.pub) correspondente a esta privada esta em ~/.ssh/authorized_keys do utilizador que indicou (ex.: root), com chmod 700 ~/.ssh e chmod 600 ~/.ssh/authorized_keys. No teu PC teste: ssh -i caminho/da/privada -o IdentitiesOnly=yes utilizador@IP. Se root falhar, o servidor pode ter PermitRootLogin sem chave ou outro utilizador.";
  }
  return message;
}
