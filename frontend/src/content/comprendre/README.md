# Fiches « Comprendre »

Contenu de la bibliothèque de l'onglet **Comprendre** (`/learn`). Il est livré avec le bundle et
s'affiche sans appel à l'API. Les articles rédigés depuis `/admin/articles` restent servis par le
backend et apparaissent en plus, dans la section « Articles de l'équipe ».

- `content.fr.json` : catégories et fiches. Le type est `EducationLibrary` dans `src/types/index.ts`,
  et la logique de filtrage se trouve dans `src/lib/learn.ts`.
- Illustrations : `frontend/public/assets/comprendre/*.webp`, référencées par `image`
  (`/assets/comprendre/…`). `src/lib/learn.test.ts` vérifie que chaque chemin existe.
- L'`id` d'une fiche sert d'URL (`/learn/<id>`) et passe avant un article API qui aurait le même slug
  (`fin` est réservé à l'écran de fin).
- La teinte pastel d'une catégorie est définie dans `CATEGORY_TONES` (`src/lib/learn.ts`) ; une
  catégorie peut avoir une `description`, affichée sous la liste quand le filtre est actif.
- `tags` (optionnel) : mots-clés pris en compte par la recherche, qui couvre aussi le titre, le
  résumé, l'introduction, les sections et « À retenir ».
- Les fiches marquées `featured` apparaissent toutes dans « À la une » (une par maladie).
- `sectionStyle` (optionnel) choisit la présentation des sections dans le lecteur : `prose` (par
  défaut), `cards` (cartes à icône ronde) ou `checklist`. Il ne change pas le texte.
- Le lecteur (`/learn/<id>`) enchaîne les fiches dans l'ordre de ce fichier, filtré comme la liste
  d'origine ; après la dernière, il ouvre l'écran de fin `/learn/fin` (slug réservé).

## Relecture médicale — obligatoire avant publication

Les 18 fiches actuelles sont des **brouillons pédagogiques** : les 8 fiches d'origine
(hypothyroïdie, Hashimoto, lévothyroxine…) et les 10 fiches Basedow issues du pack éditorial
« ThyroTrack-Comprendre-Extension-Basedow ». Aucune n'a été relue par un professionnel de santé.
Chaque fiche porte `"medicalReviewRequired": true`. Tant que ce drapeau est vrai ou que `reviewedAt`
manque, l'app affiche « Fiche pédagogique en attente de relecture par un professionnel de santé »
(`isMedicallyReviewed` dans `src/lib/learn.ts`, vérifié par `learn.test.ts`).

Lors de l'intégration du pack Basedow, le tutoiement a été remplacé par le vouvoiement des fiches
existantes, sans autre changement de texte. Les champs du pack ont été renommés (`subtitle` →
`summary`, `readingTimeMinutes` → `readMinutes`) et ses illustrations, identiques à celles déjà
livrées à quelques pixels de recadrage près, pointent vers `public/assets/comprendre/`.

Pour chaque fiche :

1. La faire relire par un médecin ou un pharmacien, en particulier les délais de prise et les
   interactions (`levothyroxine-prise`, `interactions-mineraux`), l'iode (`idees-recues-alimentation`)
   et les marqueurs biologiques (`tsh-t4-t3`, `suivi-tsh`). Côté Basedow, en priorité : les signes
   d'alerte sous antithyroïdiens (`basedow-antithyroidiens`), les signes oculaires urgents
   (`basedow-yeux`), la conduite à tenir en urgence (`urgence-difficulte-respiratoire`), et
   l'interprétation des TRAb et du bilan (`basedow-trab`, `hyperthyroidie-analyses`).
2. Vérifier que chaque URL de `sources` existe toujours et appuie bien le texte. Le libellé
   « Service-Public.fr — Santé » (`preparer-consultation`) est générique : confirmer la page visée.
   Liens du pack Basedow **non vérifiés** (le réseau de l'environnement d'intégration ne permettait
   pas de les ouvrir) :
   - `https://www.nhs.uk/conditions/overactive-thyroid-hyperthyroidism/`
   - `https://www.niddk.nih.gov/health-information/endocrine-diseases/graves-disease`
   - `https://www.niddk.nih.gov/health-information/endocrine-diseases/hashimotos-disease`
   - `https://www.nhs.uk/conditions/thyroid-eye-disease/`
   - `https://www.nhs.uk/medicines/carbimazole/` (page britannique : la notice française du
     médicament, sur la base de données publique des médicaments, serait plus adaptée)
   - `https://www.service-public.fr/` (`urgence-difficulte-respiratoire`) : page d'accueil
     générique, à remplacer par une page précise sur les numéros d'urgence (15, 112).
   Ces sources sont en anglais (sauf Service-Public) : une source française équivalente (HAS,
   Assurance Maladie, ANSM) serait plus adaptée.
3. Une fois la fiche validée, ajouter `"reviewedAt": "AAAA-MM-JJ"` et passer
   `"medicalReviewRequired"` à `false`. L'app affiche alors « Relue par un professionnel de santé
   le … ». Le test `never presents a draft as medically reviewed` de `learn.test.ts` devra alors
   être adapté.

Ne pas ajouter de source qui n'a pas été vérifiée.
