import { describe, expect, it } from "vitest";

import { mergeLazyGitNoteContentsAfterRemoteTree } from "./vault-git-tree-import";

describe("mergeLazyGitNoteContentsAfterRemoteTree", () => {
  const allowed = new Set<string>(["README.md", "local-only.md"]);

  it("preserves remote file bodies from prev", () => {
    const prev = { "README.md": "# hello\n" };
    const merged = mergeLazyGitNoteContentsAfterRemoteTree(prev, {}, allowed);
    expect(merged["README.md"]).toBe("# hello\n");
  });

  it("carries allowed paths from prev", () => {
    const prev = { "README.md": "# dirty\n" };
    const merged = mergeLazyGitNoteContentsAfterRemoteTree(prev, {}, allowed);
    expect(merged["README.md"]).toBe("# dirty\n");
  });
});
