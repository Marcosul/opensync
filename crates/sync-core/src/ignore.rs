pub fn should_ignore(ignore: &[String], rel: &str) -> bool {
    for part in rel.split('/') {
        if ignore.iter().any(|p| p == part) {
            return true;
        }
        if part.ends_with(".tmp") || part.ends_with(".swp") {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patterns() -> Vec<String> {
        vec![
            ".git".into(),
            "node_modules".into(),
            ".cache".into(),
            ".DS_Store".into(),
        ]
    }

    #[test]
    fn ignores_git_dir() {
        assert!(should_ignore(&patterns(), ".git/config"));
    }

    #[test]
    fn ignores_node_modules_nested() {
        assert!(should_ignore(
            &patterns(),
            "app/node_modules/lodash/index.js"
        ));
    }

    #[test]
    fn ignores_tmp_extension() {
        assert!(should_ignore(&patterns(), "notes/draft.tmp"));
    }

    #[test]
    fn ignores_swp_extension() {
        assert!(should_ignore(&patterns(), "notes/.note.md.swp"));
    }

    #[test]
    fn ignores_ds_store() {
        assert!(should_ignore(&patterns(), "folder/.DS_Store"));
    }

    #[test]
    fn allows_normal_markdown() {
        assert!(!should_ignore(&patterns(), "notes/meeting.md"));
    }

    #[test]
    fn allows_nested_normal_file() {
        assert!(!should_ignore(&patterns(), "projects/opensync/README.md"));
    }

    #[test]
    fn allows_file_with_tmp_in_name_but_not_extension() {
        assert!(!should_ignore(&patterns(), "notes/tmp-draft.md"));
    }
}
