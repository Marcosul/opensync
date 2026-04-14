import { describe, expect, it } from "vitest";

import { mergeLazyGitNoteContentsAfterRemoteTree } from "./vault-git-tree-import";

describe("mergeLazyGitNoteContentsAfterRemoteTree", () => {
  const remotePaths = ["README.md"] as const;
  const allowed = new Set<string>(["README.md", "local-only.md"]);
  const dirty = new Set<string>();

  it("preserves remote file bodies from prev when evictRemoteCachedBodies is false", () => {
    const prev = { "README.md": "# hello\n" };
    const merged = mergeLazyGitNoteContentsAfterRemoteTree(
      prev,
      {},
      remotePaths,
      allowed,
      dirty,
      false,
    );
    expect(merged["README.md"]).toBe("# hello\n");
  });

  it("does not preserve remote file bodies from prev when evictRemoteCachedBodies is true", () => {
    const prev = { "README.md": "# stale\n" };
    const merged = mergeLazyGitNoteContentsAfterRemoteTree(
      prev,
      {},
      remotePaths,
      allowed,
      dirty,
      true,
    );
    expect(merged["README.md"]).toBeUndefined();
  });

  it("always carries dirty remote paths from prev", () => {
    const dirtySet = new Set(["README.md"]);
    const prev = { "README.md": "# dirty\n" };
    const merged = mergeLazyGitNoteContentsAfterRemoteTree(
      prev,
      {},
      remotePaths,
      allowed,
      dirtySet,
      true,
    );
    expect(merged["README.md"]).toBe("# dirty\n");
  });
});
