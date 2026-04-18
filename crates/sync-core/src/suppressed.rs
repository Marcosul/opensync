use crate::hash::hash_content;
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

/// Evita loop watcher→sync: após gravar arquivo do remoto, o watcher dispara;
/// se o conteúdo for exatamente o que acabamos de gravar, o upload deve ser ignorado.
pub struct SuppressedWrites {
    map: HashMap<String, (String, Instant)>, // path → (hash, expires_at)
    ttl: Duration,
}

impl SuppressedWrites {
    pub fn new(ttl_ms: u64) -> Self {
        Self {
            map: HashMap::new(),
            ttl: Duration::from_millis(ttl_ms),
        }
    }

    pub fn register(&mut self, path: &str, content: &str) {
        let key = normalize(path);
        let hash = hash_content(content);
        let expires = Instant::now() + self.ttl;
        self.prune();
        self.map.insert(key, (hash, expires));
    }

    /// Retorna true e remove a entrada se o conteúdo bater com o hash registrado.
    pub fn consume_if_match(&mut self, path: &str, content: &str) -> bool {
        let key = normalize(path);
        self.prune();
        let hash = hash_content(content);
        if let Some((stored_hash, _)) = self.map.get(&key) {
            if *stored_hash == hash {
                self.map.remove(&key);
                return true;
            }
        }
        false
    }

    pub fn clear_path(&mut self, path: &str) {
        self.map.remove(&normalize(path));
    }

    fn prune(&mut self) {
        let now = Instant::now();
        self.map.retain(|_, (_, exp)| *exp > now);
    }
}

fn normalize(p: &str) -> String {
    p.replace('\\', "/").trim_start_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consume_match_removes_entry() {
        let mut sw = SuppressedWrites::new(8000);
        sw.register("notes/a.md", "conteúdo");
        assert!(sw.consume_if_match("notes/a.md", "conteúdo"));
        // segunda chamada: entrada já removida
        assert!(!sw.consume_if_match("notes/a.md", "conteúdo"));
    }

    #[test]
    fn no_match_if_content_differs() {
        let mut sw = SuppressedWrites::new(8000);
        sw.register("notes/a.md", "original");
        assert!(!sw.consume_if_match("notes/a.md", "diferente"));
    }

    #[test]
    fn entries_expire_after_ttl() {
        let mut sw = SuppressedWrites::new(1); // TTL de 1ms
        sw.register("f.md", "x");
        std::thread::sleep(Duration::from_millis(10));
        // prune é chamado ao tentar consumir
        assert!(!sw.consume_if_match("f.md", "x"));
    }

    #[test]
    fn clear_path_removes_entry() {
        let mut sw = SuppressedWrites::new(8000);
        sw.register("f.md", "x");
        sw.clear_path("f.md");
        assert!(!sw.consume_if_match("f.md", "x"));
    }

    #[test]
    fn normalizes_backslash_paths() {
        let mut sw = SuppressedWrites::new(8000);
        sw.register("notes\\a.md", "x");
        assert!(sw.consume_if_match("notes/a.md", "x"));
    }
}
