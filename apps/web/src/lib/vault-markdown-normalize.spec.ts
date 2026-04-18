import { describe, expect, it } from "vitest";

import {
  isNormalizedVaultMarkdownEmpty,
  isWhitespaceOnlyVaultMarkdown,
  normalizeVaultMarkdownForCompare,
} from "./vault-markdown-normalize";

describe("normalizeVaultMarkdownForCompare", () => {
  it("unifica CRLF e trim à direita", () => {
    expect(normalizeVaultMarkdownForCompare("a\r\nb  \n")).toBe("a\nb");
  });

  it("decodifica entidades de espaço ASCII", () => {
    expect(normalizeVaultMarkdownForCompare("x&#x20;y")).toBe("x y");
    expect(normalizeVaultMarkdownForCompare("x&#32;y")).toBe("x y");
  });
});

describe("isNormalizedVaultMarkdownEmpty", () => {
  it("trata string vazia e só espaços finais como vazio", () => {
    expect(isNormalizedVaultMarkdownEmpty("")).toBe(true);
    expect(isNormalizedVaultMarkdownEmpty("   ")).toBe(true);
  });

  it("não considera vazio se existir texto", () => {
    expect(isNormalizedVaultMarkdownEmpty("# t")).toBe(false);
    expect(isNormalizedVaultMarkdownEmpty("a")).toBe(false);
  });
});

describe("isWhitespaceOnlyVaultMarkdown", () => {
  it("trata só quebras de linha / espaços como vazio lógico", () => {
    expect(isWhitespaceOnlyVaultMarkdown("\n\n")).toBe(true);
    expect(isWhitespaceOnlyVaultMarkdown(" \n ")).toBe(true);
  });

  it("falso quando há texto", () => {
    expect(isWhitespaceOnlyVaultMarkdown("\nx")).toBe(false);
  });
});
