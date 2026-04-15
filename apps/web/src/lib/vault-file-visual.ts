/**
 * Extensão → linguagem Monaco e categoria visual (ícones no explorador).
 */

export function monacoLanguageFromDocPath(path: string): string {
  const lower = path.toLowerCase();
  const base = lower.includes("/") ? lower.slice(lower.lastIndexOf("/") + 1) : lower;
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot) : "";

  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".jsonc": "json",
    ".jsonl": "json",
    ".py": "python",
    ".md": "markdown",
    ".mdx": "markdown",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".sass": "scss",
    ".less": "less",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".rs": "rust",
    ".go": "go",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".java": "java",
    ".kt": "kotlin",
    ".swift": "swift",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".vue": "html",
    ".svelte": "html",
    ".ini": "ini",
    ".toml": "ini",
    ".dockerfile": "dockerfile",
  };

  if (ext && map[ext]) return map[ext];
  if (base === "dockerfile" || base.endsWith("dockerfile")) return "dockerfile";
  return "plaintext";
}

/** Categorias para ícones coloridos (estilo explorador tipo VS Code). */
export type VaultExplorerFileKind =
  | "markdown"
  | "json"
  | "python"
  | "javascript"
  | "typescript"
  | "html"
  | "css"
  | "data"
  | "yaml"
  | "shell"
  | "log"
  | "text"
  | "code"
  | "file";

export function vaultExplorerFileKind(fileName: string): VaultExplorerFileKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown";
  if (lower.endsWith(".json") || lower.endsWith(".jsonc") || lower.endsWith(".jsonl")) return "json";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".mts") || lower.endsWith(".cts")) {
    return "typescript";
  }
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return "javascript";
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css") || lower.endsWith(".scss") || lower.endsWith(".sass") || lower.endsWith(".less")) {
    return "css";
  }
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "data";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".sh") || lower.endsWith(".bash") || lower.endsWith(".zsh")) return "shell";
  if (lower.endsWith(".log")) return "log";
  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".env") ||
    lower.endsWith(".ini") ||
    lower.endsWith(".cfg") ||
    lower.endsWith(".conf")
  ) {
    return "text";
  }
  if (/\.(rs|go|java|kt|swift|c|h|cpp|hpp|cs|php|rb|sql|vue|svelte|toml|xml)$/i.test(lower)) {
    return "code";
  }
  return "file";
}
