#!/usr/bin/env bash
# Запуск API (Flask) + фронта (Vite) для отладки с iPhone в той же Wi‑Fi сети.
# Использование: из корня репозитория — npm run dev  или  bash scripts/dev-lan.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

die() {
  echo "Ошибка: $*" >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || die "нужен npm"
if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHON="$ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
else
  die "нужен python3 или .venv (см. python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)"
fi

WEB_DIR="$ROOT/football-stats"
[[ -d "$WEB_DIR" ]] || die "нет каталога football-stats"
[[ -f "$WEB_DIR/package.json" ]] || die "нет football-stats/package.json"
[[ -d "$WEB_DIR/node_modules" ]] || die "сначала выполни: cd football-stats && npm install"

LAN_IP=""
for IFACE in en0 en1 bridge0; do
  if IP_TRY=$(ipconfig getifaddr "$IFACE" 2>/dev/null) && [[ -n "$IP_TRY" ]]; then
    LAN_IP="$IP_TRY"
    break
  fi
done
[[ -n "$LAN_IP" ]] || LAN_IP="(узнай IP Mac: Системные настройки → Сеть)"

echo ""
echo "  ─ LAN (iPhone, та же Wi‑Fi) ─"
echo "     http://${LAN_IP}:5173"
echo "  API: Flask :5001 → Vite проксирует /api"
echo ""

if [[ ! -f "$ROOT/.env" && ! -f "$ROOT/livescore.local.env" && ! -f "$WEB_DIR/.env" && ! -f "$WEB_DIR/livescore.local.env" ]]; then
  echo "  Предупреждение: не найдены .env / livescore.local.env — задай LIVESCORE_API_KEY и LIVESCORE_API_SECRET." >&2
  echo ""
fi

cleanup() {
  if [[ -n "${FLASK_PID:-}" ]] && kill -0 "$FLASK_PID" 2>/dev/null; then
    kill "$FLASK_PID" 2>/dev/null || true
    wait "$FLASK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "  Запуск Flask (порт 5001)…"
"$PYTHON" app.py &
FLASK_PID=$!

# Дать Flask время занять порт
sleep 0.6
if ! kill -0 "$FLASK_PID" 2>/dev/null; then
  die "Flask завершился сразу — проверь порт 5001 и лог выше."
fi

echo "  Запуск Vite…"
cd "$WEB_DIR"
npm run dev
