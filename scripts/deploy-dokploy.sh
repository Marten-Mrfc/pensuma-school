#!/usr/bin/env bash
# Trigger a Dokploy deployment of the Pensuma app and wait for the result.
#
#   DOKPLOY_URL=https://dokploy.example.com \
#   DOKPLOY_API_KEY=... \
#   DOKPLOY_APP_ID=... \
#   scripts/deploy-dokploy.sh ["Titel van de deploy"]
#
# Optional: APP_URL=https://... to smoke-test the app after the deploy.
set -euo pipefail

: "${DOKPLOY_URL:?Set DOKPLOY_URL}"
: "${DOKPLOY_API_KEY:?Set DOKPLOY_API_KEY}"
: "${DOKPLOY_APP_ID:?Set DOKPLOY_APP_ID}"
TITLE="${1:-Deploy $(git rev-parse --short HEAD 2>/dev/null || date +%s)}"

api() {
  local method="$1" path="$2" body="${3:-}"
  if [[ "$method" == GET ]]; then
    curl -fsS -m 60 -H "x-api-key: ${DOKPLOY_API_KEY}" "${DOKPLOY_URL}/api/${path}"
  else
    curl -fsS -m 60 -H "x-api-key: ${DOKPLOY_API_KEY}" -H 'content-type: application/json' \
      -X "$method" "${DOKPLOY_URL}/api/${path}" -d "$body"
  fi
}

json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);console.log($1)})"; }

latest_deployment() {
  api GET "deployment.all?applicationId=${DOKPLOY_APP_ID}" |
    json "JSON.stringify((d||[]).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]||{})"
}

before_id="$(latest_deployment | json "d.deploymentId||''")"
echo "▶ Deploy starten: ${TITLE}"
api POST application.deploy "$(node -e "console.log(JSON.stringify({applicationId:process.argv[1],title:process.argv[2],description:'scripts/deploy-dokploy.sh'}))" "$DOKPLOY_APP_ID" "$TITLE")" >/dev/null

echo "⏳ Wachten op de nieuwe deployment…"
for _ in $(seq 1 30); do
  current="$(latest_deployment)"
  id="$(echo "$current" | json "d.deploymentId||''")"
  [[ -n "$id" && "$id" != "$before_id" ]] && break
  sleep 2
done

for _ in $(seq 1 180); do
  current="$(latest_deployment)"
  status="$(echo "$current" | json "d.status||''")"
  case "$status" in
    done) echo "✅ Deploy gelukt (${id})"; break ;;
    error) echo "❌ Deploy mislukt (${id}). Bekijk de build-logs in Dokploy."; exit 1 ;;
    *) printf '.'; sleep 10 ;;
  esac
done
[[ "$status" == done ]] || { echo; echo "⚠️  Time-out: status '${status}'"; exit 1; }

if [[ -n "${APP_URL:-}" ]]; then
  echo "🔎 Smoke test ${APP_URL}"
  for _ in $(seq 1 30); do
    if curl -fsS -m 10 "${APP_URL}/api/auth/ok" >/dev/null 2>&1; then
      echo "✅ ${APP_URL} reageert"
      exit 0
    fi
    sleep 5
  done
  echo "❌ ${APP_URL} reageert niet"
  exit 1
fi
