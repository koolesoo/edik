#!/usr/bin/env bash
# Проверка LiveScore API для РПЛ (competition_id=7 по умолчанию).
# Использование:
#   export LIVESCORE_API_KEY=...
#   export LIVESCORE_API_SECRET=...
#   ./scripts/curl_livescore_rpl.sh              # сегодня
#   ./scripts/curl_livescore_rpl.sh 2026-05-10   # конкретная дата

set -euo pipefail
KEY="${LIVESCORE_API_KEY:?Задайте LIVESCORE_API_KEY}"
SECRET="${LIVESCORE_API_SECRET:?Задайте LIVESCORE_API_SECRET}"
CID="${LIVESCORE_RPL_COMPETITION_ID:-7}"
BASE="https://livescore-api.com/api-client"
DAY="${1:-$(date +%Y-%m-%d)}"

py() { python3 -c "import json,sys; d=json.load(sys.stdin); print('success:', d.get('success'));
if not d.get('success'): print('error:', d.get('error')); sys.exit(0)
data=d.get('data') or {}
if 'table' in data: print('table rows:', len(data['table'] if isinstance(data['table'],list) else [data['table']]))
if 'fixtures' in data: fx=data['fixtures']; print('fixtures:', len(fx if isinstance(fx,list) else [fx]))
if 'match' in data: m=data['match']; print('matches:', len(m if isinstance(m,list) else [m]))
"; }

echo "=== Таблица РПЛ (leagues/table.json) competition_id=$CID ==="
curl -sS "$BASE/leagues/table.json?competition_id=${CID}&lang=ru&key=${KEY}&secret=${SECRET}" | py

echo "=== Календарь на дату $DAY (fixtures/list.json) ==="
curl -sS "$BASE/fixtures/list.json?competition_id=${CID}&date=${DAY}&lang=ru&key=${KEY}&secret=${SECRET}" | py

echo "=== Live сейчас (matches/live.json) ==="
curl -sS "$BASE/matches/live.json?competition_id=${CID}&lang=ru&key=${KEY}&secret=${SECRET}" | py

echo "=== История за $DAY (matches/history.json) ==="
curl -sS "$BASE/matches/history.json?competition_id=${CID}&from=${DAY}&to=${DAY}&lang=ru&key=${KEY}&secret=${SECRET}" | py

echo "=== Локальный Flask (если запущен на 5001): standings ==="
curl -sS -w " HTTP %{http_code}\n" "http://127.0.0.1:5001/api/livescore/rpl/standings" | head -c 400 || true
