#!/usr/bin/env bash
set -e

echo "🌳 Compilando Banyan CLI v2.0.0..."
npm install
npm run build
npm link

WRAPPER_BLOCK='
# --- BANYAN (Agentic Worktree & Junction Orchestrator) ---
bny() {
  local target
  target="$(banyan-bin "$@")"
  if [ $? -eq 0 ] && [ -n "$target" ] && [ -d "$target" ]; then
    cd "$target" || return
  fi
}
# --- END BANYAN ---
'

for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  if [ -f "$rc" ]; then
    if ! grep -q "bny()" "$rc"; then
      printf "%s\n" "$WRAPPER_BLOCK" >> "$rc"
      echo "✔ Función 'bny' añadida a $rc"
    else
      echo "ℹ️ La función 'bny' ya existe en $rc"
    fi
  fi
done

echo "¡Listo! Recarga tu shell y ejecuta 'bny --splash' o 'bny -s'."
