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
- La teinte pastel d'une catégorie est définie dans `CATEGORY_TONES` (`src/lib/learn.ts`).
- `sectionStyle` (optionnel) choisit la présentation des sections dans le lecteur : `prose` (par
  défaut), `cards` (cartes à icône ronde) ou `checklist`. Il ne change pas le texte.
- Le lecteur (`/learn/<id>`) enchaîne les fiches dans l'ordre de ce fichier, filtré comme la liste
  d'origine ; après la dernière, il ouvre l'écran de fin `/learn/fin` (slug réservé).

## Relecture médicale — obligatoire avant publication

Les 8 fiches actuelles sont des **brouillons pédagogiques**. Elles n'ont été relues par aucun
professionnel de santé. Tant qu'une fiche n'a pas de champ `reviewedAt`, l'app affiche « Fiche
pédagogique en attente de relecture par un professionnel de santé ».

Pour chaque fiche :

1. La faire relire par un médecin ou un pharmacien, en particulier les délais de prise et les
   interactions (`levothyroxine-prise`, `interactions-mineraux`), l'iode (`idees-recues-alimentation`)
   et les marqueurs biologiques (`tsh-t4-t3`, `suivi-tsh`).
2. Vérifier que chaque URL de `sources` existe toujours et appuie bien le texte. Le libellé
   « Service-Public.fr — Santé » (`preparer-consultation`) est générique : confirmer la page visée.
3. Une fois la fiche validée, ajouter `"reviewedAt": "AAAA-MM-JJ"`. L'app affiche alors
   « Relue par un professionnel de santé le … ».

Ne pas ajouter de source qui n'a pas été vérifiée.
