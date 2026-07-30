#!/usr/bin/env bash
# smoke_test.sh — szybka weryfikacja aplikacji (lokalnie lub po deployu na MonsterASP.NET)
#
# Użycie:
#   ./smoke_test.sh http://localhost:3000
#   ./smoke_test.sh https://twoja-subdomena.runasp.net
#
# Sprawdza: stronę główną (200 HTML) oraz /api/health (200 JSON z "ok":true).
set -u

BASE="${1:-}"
HEALTH_PATH="${2:-/api/health}"
if [ -z "$BASE" ]; then
  echo "Użycie: $0 <BASE_URL> [HEALTH_PATH]" >&2
  exit 2
fi
BASE="${BASE%/}"

fail=0
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

check() { # check <path> <oczekiwany_status> <opis>
  local path="$1" want="$2" desc="$3"
  local code
  code="$(curl -sS -m 20 -o "$tmp" -w '%{http_code}' "$BASE$path" 2>/dev/null || echo 000)"
  if [ "$code" = "$want" ]; then
    printf '  ✅ [%s] %s — %s\n' "$code" "$path" "$desc"
  else
    printf '  ❌ [%s ≠ %s] %s — %s\n' "$code" "$want" "$path" "$desc"
    fail=1
  fi
}

echo "🔥 Smoke test: $BASE"

check "/" 200 "strona główna (HTML)"
if ! grep -qi "<html" "$tmp"; then
  echo "  ❌ [/] treść nie wygląda na HTML"
  fail=1
fi

check "$HEALTH_PATH" 200 "endpoint health (JSON)"
if grep -q '"ok"[[:space:]]*:[[:space:]]*true' "$tmp"; then
  echo "  ✅ [/api/health] zawiera \"ok\":true"
  db="$(grep -o '"db"[[:space:]]*:[[:space:]]*"[^"]*"' "$tmp" | head -1)"
  [ -n "$db" ] && echo "  ℹ️  status bazy: $db"
else
  echo "  ❌ [/api/health] brak \"ok\":true w odpowiedzi"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "🎉 Wszystko działa."
else
  echo "⚠️  Są problemy — patrz ../references/troubleshooting.md"
fi
exit "$fail"
