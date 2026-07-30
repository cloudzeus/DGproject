#!/usr/bin/env bash
#
# Τρέχει όλα τα *.test.ts του lib/.
#
# Τα tests είναι γραμμένα με node:test και χρησιμοποιούν το path alias `@/`,
# οπότε χρειάζονται ts-node σε CommonJS με tsconfig-paths. Χωρίς αυτό το script
# η εντολή πρέπει να ανακαλυφθεί από την αρχή κάθε φορά.
#
# Τα integration tests (portal, proposals) χτυπούν τη ΖΩΝΤΑΝΗ βάση — γι' αυτό
# φορτώνεται το .env.
#
# Χρήση:  npm test            (όλα)
#         npm test proposals  (μόνο όσα ταιριάζουν στο μοτίβο)

set -uo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
source ./.env 2>/dev/null || true
set +a

export TS_NODE_TRANSPILE_ONLY=1
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","verbatimModuleSyntax":false}'

FILTER="${1:-}"
PASS=0
FAIL=0
FAILED=()

while IFS= read -r file; do
  [ -n "$FILTER" ] && [[ "$file" != *"$FILTER"* ]] && continue

  output=$(npx ts-node -r tsconfig-paths/register "$file" 2>&1)
  p=$(printf '%s' "$output" | grep -oE '^ℹ pass [0-9]+' | grep -oE '[0-9]+' || echo 0)
  f=$(printf '%s' "$output" | grep -oE '^ℹ fail [0-9]+' | grep -oE '[0-9]+' || echo 0)

  PASS=$((PASS + p))
  FAIL=$((FAIL + f))

  if [ "$f" != "0" ] || [ "$p" = "0" ]; then
    FAILED+=("$file")
    printf '✖ %-50s pass=%s fail=%s\n' "$file" "$p" "$f"
    printf '%s\n' "$output" | tail -30
  else
    printf '✔ %-50s pass=%s\n' "$file" "$p"
  fi
done < <(find lib -name '*.test.ts' | sort)

echo "──────────────────────────────────────────────────"
echo "ΣΥΝΟΛΟ: pass=$PASS fail=$FAIL"

if [ ${#FAILED[@]} -gt 0 ]; then
  printf 'ΑΠΕΤΥΧΑΝ:\n'
  printf '  %s\n' "${FAILED[@]}"
  exit 1
fi
