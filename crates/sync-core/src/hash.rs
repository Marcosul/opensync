use sha2::{Digest, Sha256};

pub fn hash_content(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_matches_known_sha256() {
        // SHA-256 de "" é o valor canónico
        assert_eq!(
            hash_content(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn hello_world_matches_known_sha256() {
        // echo -n "hello" | sha256sum
        assert_eq!(
            hash_content("hello"),
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn deterministic_for_same_input() {
        assert_eq!(hash_content("abc"), hash_content("abc"));
    }

    #[test]
    fn different_inputs_produce_different_hashes() {
        assert_ne!(hash_content("abc"), hash_content("ABC"));
    }

    #[test]
    fn utf8_content_hashed_correctly() {
        // Garante que conteúdo com acentos não quebra
        let h = hash_content("conteúdo com acentos: ção, ã, é");
        assert_eq!(h.len(), 64); // SHA-256 hex = 64 chars
    }
}
