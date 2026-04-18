use similar::{ChangeTag, TextDiff};

const CONFLICT_OPEN: &str = "<<<<<<< OPENSYNC_LOCAL";
const CONFLICT_SEP: &str = "=======";
const CONFLICT_CLOSE: &str = ">>>>>>> OPENSYNC_REMOTE";

/// Remove marcadores de conflito legados, preservando o lado local.
pub fn strip_conflict_markers(text: &str) -> String {
    let text = text.replace("\r\n", "\n");
    let mut out = String::with_capacity(text.len());
    let mut in_local = false;
    let mut in_remote = false;

    for line in text.lines() {
        if line == CONFLICT_OPEN {
            in_local = true;
            in_remote = false;
            continue;
        }
        if line == CONFLICT_SEP && in_local {
            in_local = false;
            in_remote = true;
            continue;
        }
        if line == CONFLICT_CLOSE && in_remote {
            in_remote = false;
            continue;
        }
        if !in_remote {
            out.push_str(line);
            out.push('\n');
        }
    }

    // Preservar ausência de newline final se o original não tinha
    if !text.ends_with('\n') && out.ends_with('\n') {
        out.pop();
    }
    out
}

fn line_diff_change_ratio(left: &str, right: &str) -> f64 {
    let diff = TextDiff::from_lines(left, right);
    let mut common = 0usize;
    let mut changed = 0usize;
    for change in diff.iter_all_changes() {
        let n = change.value().len();
        match change.tag() {
            ChangeTag::Equal => common += n,
            _ => changed += n,
        }
    }
    changed as f64 / (common + changed).max(1) as f64
}

/// Funde dois textos sem ancestral: diff por linhas (union). Fallback para `prefer`
/// se >72% de divergência.
pub fn merge_text_automatic(local: &str, remote: &str, prefer_local: bool) -> String {
    let l = strip_conflict_markers(&local.replace("\r\n", "\n"));
    let r = strip_conflict_markers(&remote.replace("\r\n", "\n"));

    if l == r {
        return l;
    }
    if l.is_empty() {
        return r;
    }
    if r.is_empty() {
        return l;
    }

    if line_diff_change_ratio(&l, &r) > 0.72 {
        return if prefer_local { l } else { r };
    }

    let diff = TextDiff::from_lines(l.as_str(), r.as_str());
    let mut out = String::with_capacity(l.len() + r.len());
    for change in diff.iter_all_changes() {
        out.push_str(change.value());
    }
    out
}

/// Compat com opensync-ubuntu: merge preservando ambos os lados, preferindo local.
pub fn merge_text_preserve_both(local: &str, remote: &str) -> String {
    merge_text_automatic(local, remote, true)
}

/// Merge 3-way leve: se apenas um lado divergiu da base, usa o que mudou.
pub fn merge_text_three_way_lite(base: &str, local: &str, remote: &str) -> String {
    let b = strip_conflict_markers(&base.replace("\r\n", "\n"));
    let l = strip_conflict_markers(&local.replace("\r\n", "\n"));
    let r = strip_conflict_markers(&remote.replace("\r\n", "\n"));
    if l == r {
        return l;
    }
    if l == b {
        return r;
    }
    if r == b {
        return l;
    }
    merge_text_preserve_both(&l, &r)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_texts_return_same() {
        assert_eq!(merge_text_preserve_both("hello", "hello"), "hello");
    }

    #[test]
    fn empty_local_returns_remote() {
        assert_eq!(merge_text_preserve_both("", "remote"), "remote");
    }

    #[test]
    fn empty_remote_returns_local() {
        assert_eq!(merge_text_preserve_both("local", ""), "local");
    }

    #[test]
    fn strips_conflict_markers_keeps_local() {
        let text =
            "<<<<<<< OPENSYNC_LOCAL\nlocal line\n=======\nremote line\n>>>>>>> OPENSYNC_REMOTE\n";
        let result = strip_conflict_markers(text);
        assert!(result.contains("local line"), "deve conter lado local");
        assert!(
            !result.contains("remote line"),
            "não deve conter lado remoto"
        );
        assert!(!result.contains("<<<<<<<"), "não deve conter marcador");
    }

    #[test]
    fn strips_nested_conflict_markers() {
        let text = concat!(
            "<<<<<<< OPENSYNC_LOCAL\n",
            "<<<<<<< OPENSYNC_LOCAL\ninner local\n=======\ninner remote\n>>>>>>> OPENSYNC_REMOTE\n",
            "=======\n",
            "outer remote\n",
            ">>>>>>> OPENSYNC_REMOTE\n",
        );
        let result = strip_conflict_markers(text);
        assert!(!result.contains("<<<<<<<"));
    }

    #[test]
    fn non_overlapping_edits_are_both_preserved() {
        // Arquivos com bastante conteúdo comum → ratio < 0.72 → ambos preservados
        let local = "## Header\n\nParagrafo 1.\n\nParagrafo 2 LOCAL.\n\nFim.\n";
        let remote = "## Header\n\nParagrafo 1.\n\nParagrafo 2.\n\nFim REMOTE.\n";
        let merged = merge_text_preserve_both(local, remote);
        assert!(merged.contains("LOCAL"), "deve conter edição local");
        assert!(merged.contains("REMOTE"), "deve conter edição remota");
    }

    #[test]
    fn high_divergence_falls_back_to_local() {
        // Sem nada em comum → ratio > 0.72 → retorna lado local (prefer_local=true)
        let local = "texto completamente local\n";
        let remote = "zzz yyy xxx www vvv uuu\n";
        let merged = merge_text_preserve_both(local, remote);
        assert_eq!(merged.trim(), local.trim());
    }

    #[test]
    fn three_way_local_unchanged_returns_remote() {
        let base = "linha base\n";
        let local = "linha base\n";
        let remote = "linha remota editada\n";
        assert_eq!(
            merge_text_three_way_lite(base, local, remote).trim(),
            "linha remota editada"
        );
    }

    #[test]
    fn three_way_remote_unchanged_returns_local() {
        let base = "linha base\n";
        let local = "linha local editada\n";
        let remote = "linha base\n";
        assert_eq!(
            merge_text_three_way_lite(base, local, remote).trim(),
            "linha local editada"
        );
    }

    #[test]
    fn crlf_normalized_before_merge() {
        let local = "linha 1\r\nlinha 2\r\n";
        let remote = "linha 1\r\nlinha 2\r\n";
        assert_eq!(
            merge_text_preserve_both(local, remote),
            "linha 1\nlinha 2\n"
        );
    }
}
