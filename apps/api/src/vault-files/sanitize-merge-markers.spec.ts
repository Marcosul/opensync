import { sanitizeOpenSyncArtifactContent } from './sanitize-merge-markers';

describe('sanitizeOpenSyncArtifactContent', () => {
  it('remove um bloco e mantém o lado local', () => {
    const raw =
      '<<<<<<< OPENSYNC_LOCAL\nA\n=======\nB\n>>>>>>> OPENSYNC_REMOTE\n';
    expect(sanitizeOpenSyncArtifactContent(raw)).toBe('A\n');
  });

  it('remove blocos aninhados', () => {
    const raw =
      '<<<<<<< OPENSYNC_LOCAL\n' +
      'outer\n' +
      '<<<<<<< OPENSYNC_LOCAL\n' +
      'inner\n' +
      '=======\n' +
      'R1\n' +
      '>>>>>>> OPENSYNC_REMOTE\n' +
      '=======\n' +
      'R2\n' +
      '>>>>>>> OPENSYNC_REMOTE\n';
    const out = sanitizeOpenSyncArtifactContent(raw);
    expect(out).not.toContain('<<<<<<<');
    expect(out).not.toContain('=======');
    expect(out).not.toContain('>>>>>>>');
    expect(out.trim()).toBe('outer\ninner');
  });
});
