#!/usr/bin/env bash
# Recette de bout en bout de l'import de bilans PDF (script jetable, non branché en CI).
#
# Prérequis : `qpdf`, `psql`, `curl`, `node` ; une base PostgreSQL JETABLE dont le schéma est
# migré (`npx prisma migrate deploy`) — le script y crée puis supprime un utilisateur de test.
#
#   E2E_DATABASE_URL=postgresql://user:pass@localhost:5432/base_jetable ./scripts/e2e-lab-import.sh
set -euo pipefail

: "${E2E_DATABASE_URL:?Définissez E2E_DATABASE_URL (base PostgreSQL jetable, schéma migré)}"
cd "$(dirname "$0")/.."

PORT=3055
API="http://localhost:${PORT}/api"
export DATABASE_URL="$E2E_DATABASE_URL"
export JWT_SECRET="e2e-secret-at-least-32-characters-long-ok"
export PDF_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export NODE_ENV=development PORT
PDF_PASSWORD="e2e-Secret-Pa55 word"
USER_ID="e2e-user-$$"
WORK="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  psql "$E2E_DATABASE_URL" -q -c "DELETE FROM users WHERE id = '${USER_ID}'" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

sql() { psql "$E2E_DATABASE_URL" -tA -c "$1"; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
step() { printf '\n== %s\n' "$1"; }

step "Utilisateur de test et jeton"
sql "INSERT INTO users (id, email, name, role, \"emailVerified\", \"updatedAt\") VALUES ('${USER_ID}', '${USER_ID}@e2e.test', 'E2E Test', 'USER', true, now())" >/dev/null
TOKEN="$(node -e "console.log(require('jsonwebtoken').sign({ userId: '${USER_ID}' }, process.env.JWT_SECRET, { expiresIn: '1h' }))")"

step "PDF de test protégé par mot de passe"
node -e "
const { PDFDocument, StandardFonts } = require('pdf-lib');
(async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  ['Biogroup', 'Preleve le 12/03/2026', 'TSH ultrasensible 2,35 mUI/L', 'Ferritine 64 ug/L']
    .forEach((t, i) => page.drawText(t, { x: 50, y: 750 - i * 20, size: 11, font }));
  require('fs').writeFileSync('${WORK}/plain.pdf', await doc.save());
})();"
qpdf --encrypt "$PDF_PASSWORD" owner-pw 256 -- "$WORK/plain.pdf" "$WORK/protected.pdf"

step "Démarrage du backend (port ${PORT})"
npx tsx src/index.ts >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 60); do curl -fs "http://localhost:${PORT}/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fs "http://localhost:${PORT}/health" >/dev/null || { cat "$WORK/server.log"; echo "Le backend n'a pas démarré"; exit 1; }

step "Import (mot de passe fourni + mémorisation)"
curl -fsS -H "Authorization: Bearer ${TOKEN}" \
  -F "files=@${WORK}/protected.pdf;type=application/pdf" \
  -F "password=${PDF_PASSWORD}" -F "remember=true" -F "passwordLabel=Biogroup E2E" \
  "${API}/lab-results/import" >"$WORK/import.json"
cat "$WORK/import.json"; echo
DOC_ID="$(node -e "console.log(require('${WORK}/import.json').results[0].documentId)")"
STATUS="$(node -e "console.log(require('${WORK}/import.json').results[0].status)")"
[ "$STATUS" = "ready" ] || { echo "ÉCHEC : statut '${STATUS}' au lieu de 'ready'"; exit 1; }

step "Confirmation (valeurs relues)"
curl -fsS -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"date":"2026-03-12","lab":"Biogroup","tsh":2.35,"ferritin":64}' \
  "${API}/lab-results/import/${DOC_ID}/confirm" >"$WORK/confirm.json"
cat "$WORK/confirm.json"; echo
RESULT_ID="$(node -e "console.log(require('${WORK}/confirm.json').id)")"

step "Téléchargement"
curl -fsS -H "Authorization: Bearer ${TOKEN}" -o "$WORK/downloaded.pdf" "${API}/lab-results/documents/${DOC_ID}"

step "Vérifications"
FAIL=0
check() { if [ "$2" = "$3" ]; then echo "OK   $1"; else echo "ÉCHEC $1 (obtenu: '$2', attendu: '$3')"; FAIL=1; fi; }

# qpdf génère un /ID aléatoire à chaque déchiffrement : deux déchiffrements du même fichier ne sont
# pas identiques octet pour octet. La référence est donc le sha256 enregistré par le serveur au
# moment de l'import (hash des octets déchiffrés qu'il a stockés).
check "(a) sha256 téléchargé == sha256 du PDF déchiffré stocké à l'import" "$(sha "$WORK/downloaded.pdf")" "$(sql "SELECT sha256 FROM lab_documents WHERE id = '${DOC_ID}'")"
qpdf --is-encrypted "$WORK/downloaded.pdf" && ENC=0 || ENC=$?
check "(a') le PDF téléchargé n'est plus protégé par mot de passe (qpdf --is-encrypted = 2)" "$ENC" "2"
HEAD4="$(sql "SELECT encode(substring(\"dataEnc\" from 1 for 4), 'escape') FROM lab_documents WHERE id = '${DOC_ID}'")"
echo "      (b) 4 premiers octets en base : '${HEAD4}'"
[ "$HEAD4" != "%PDF" ] && echo "OK   (b) le contenu en base n'est pas un PDF en clair" || { echo "ÉCHEC (b)"; FAIL=1; }
check "(b') le PDF en base ne contient pas la chaîne '%PDF'" "$(sql "SELECT position('\\x25504446'::bytea in \"dataEnc\") FROM lab_documents WHERE id = '${DOC_ID}'")" "0"
check "(c) mots de passe mémorisés : 1 ligne" "$(sql "SELECT count(*) FROM pdf_passwords WHERE \"userId\" = '${USER_ID}'")" "1"
check "(c) aucun mot de passe en clair dans pdf_passwords" "$(sql "SELECT count(*) FROM pdf_passwords WHERE \"passwordEnc\" LIKE '%e2e-Secret%'")" "0"

curl -fsS -X DELETE -H "Authorization: Bearer ${TOKEN}" "${API}/lab-results/${RESULT_ID}" >/dev/null
check "(d) après suppression du LabResult : 0 document" "$(sql "SELECT count(*) FROM lab_documents WHERE \"userId\" = '${USER_ID}'")" "0"

[ "$FAIL" = "0" ] && echo && echo "RECETTE OK" || { echo; echo "RECETTE EN ÉCHEC"; exit 1; }
