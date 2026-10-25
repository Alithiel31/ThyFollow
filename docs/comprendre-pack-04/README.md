# ThyroTrack — pack éducatif « Comprendre » 04

Quatre brouillons de fiches et quatre schémas pédagogiques SVG originaux, prévus pour être transmis à Claude Code puis discutés avec un professionnel de santé.

## Contenu

- `fiches-fr.json` : les quatre fiches en français au format proche de la bibliothèque actuelle.
- `images/` : quatre schémas SVG éditables, un par fiche.
- `PROMPT-CLAUDE.md` : consignes d’audit, d’intégration et de vérification du format des illustrations.

## À savoir

Les contenus sont des brouillons à relire par un médecin avant publication. Ils sont tous marqués `medicalReviewRequired: true` et n’ont pas de `reviewedAt`. Les sources sont des références de départ à vérifier.

Les illustrations sont des schémas vectoriels originaux. La bibliothèque existante semble documenter des illustrations WebP : Claude Code doit vérifier si les SVG sont acceptés par le code et les tests. Si le projet exige WebP, les SVG peuvent servir de sources pour une conversion, sans modification des originaux.

## Intégration dans l'app

Les quatre fiches sont intégrées dans `frontend/src/content/comprendre/content.fr.json`, avec leur
traduction anglaise dans `content.en.json`, toujours en brouillon (`medicalReviewRequired: true`,
sans `reviewedAt`). Retouches par rapport à ce pack : « irathérapie » devient « traitement par iode
radioactif (irathérapie) » et « Faire une décision partagée » devient « Prendre une décision
partagée » (`basedow-choix-traitement`) ; `equipe-suivi-thyroide` mentionne le chirurgien et son
premier « À retenir » précise que tout le monde ne consulte pas chacun de ces professionnels.

Illustrations : l'app n'accepte que le WebP. Les SVG de `images/` (originaux, non modifiés) ont été
convertis en `webp/` (800 × 500), mais **ne sont pas utilisés** : dans le lecteur, l'image est
recadrée en hauteur et estompée sur les bords (le titre du schéma est coupé sur ordinateur), le
texte devient illisible sur mobile et reste en français dans l'interface anglaise. Dans
`cytoponction-nodule.svg`, la légende du bas chevauche l'étiquette « prélèvement de cellules ».
Les fiches pointent donc vers les illustrations existantes (`fiches-fr.json` mis à jour) :

| Fiche | Image retenue |
|---|---|
| `cytoponction-nodule-thyroidien` | `/assets/comprendre/analyses.webp` |
| `cancer-thyroide-parcours` | `/assets/comprendre/consultation.webp` |
| `basedow-choix-traitement` | `/assets/comprendre/traitement.webp` |
| `equipe-suivi-thyroide` | `/assets/comprendre/consultation.webp` |

Conversion faite hors dépôt, sans dépendance ajoutée : rendu des SVG par Chromium (Playwright de
l'environnement) puis `convert … -quality 82 -define webp:method=6` (ImageMagick). Pour brancher ces
schémas plus tard : une version sans texte (ou une par langue), ou un affichage sans recadrage.
