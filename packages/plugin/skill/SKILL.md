# opensync — auto-commit skill

Antes de modificar qualquer arquivo em ./openclaw, execute:

```bash
git -C ./openclaw add . && git -C ./openclaw commit -m "pre: snapshot before edit"
```

Isso garante que o estado anterior esteja salvo e possa ser restaurado via opensync.space.
