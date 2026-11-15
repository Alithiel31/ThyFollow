-- Les emails sont désormais normalisés (espaces retirés, minuscules) avant
-- toute écriture ou recherche (controllers/auth.controller.ts, lib/oidc.ts).
-- On aligne l'existant. Si deux comptes ne diffèrent que par la casse, l'index
-- unique "users_email_key" fait échouer cette migration : volontaire, le
-- déploiement s'arrête avant de recréer le backend (voir docker-compose.yml,
-- service `migrate`) et les doublons se traitent à la main.
UPDATE "users"
SET "email" = lower(btrim("email"))
WHERE "email" <> lower(btrim("email"));
