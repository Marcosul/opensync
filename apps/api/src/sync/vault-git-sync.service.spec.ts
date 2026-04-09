import {
  normalizeVaultRelativePath,
  validateVaultSyncFiles,
} from './vault-git-sync.service';

describe('VaultGitSyncService helpers', () => {
  it('normalizeVaultRelativePath rejeita traversal e absolutos', () => {
    expect(normalizeVaultRelativePath('ok/path.md')).toBe('ok/path.md');
    expect(normalizeVaultRelativePath('../x')).toBeNull();
    expect(normalizeVaultRelativePath('a/../b')).toBeNull();
    expect(normalizeVaultRelativePath('/abs')).toBeNull();
  });

  it('validateVaultSyncFiles normaliza e agrega mapa', () => {
    const m = validateVaultSyncFiles({
      '  a.md  ': 'hi',
      'b/c.md': '',
    });
    expect([...m.entries()]).toEqual([
      ['a.md', 'hi'],
      ['b/c.md', ''],
    ]);
  });

  it('validateVaultSyncFiles rejeita payload invalido', () => {
    expect(() => validateVaultSyncFiles(null as unknown as Record<string, string>)).toThrow();
    expect(() =>
      validateVaultSyncFiles({ x: 1 } as unknown as Record<string, string>),
    ).toThrow();
  });
});
