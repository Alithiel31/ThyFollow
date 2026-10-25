# Fiches « Comprendre »

Contenu de la bibliothèque de l'onglet **Comprendre** (`/learn`). Il est livré avec le bundle et
s'affiche sans appel à l'API. Les articles rédigés depuis `/admin/articles` restent servis par le
backend et apparaissent en plus, dans la section « Articles de l'équipe ».

- `content.fr.json` : la **base** — structure de chaque fiche (catégorie, image, durée, style,
  « À la une ») et son texte français. Type `EducationLibrary` (`src/types/index.ts`).
- `content.en.json` : les **traductions anglaises**, par `id`, sans la structure (titre, résumé,
  intro, sections, « À retenir », sources, `tags`, statut de relecture). Type
  `EducationTranslations`. La fusion se fait dans `localize` / `getLibrary` (`src/lib/learn.ts`),
  selon la langue de l'interface.
- Une fiche absente de `content.en.json` s'affiche en français dans l'interface anglaise, avec la
  note `articles.frenchOnlyGuide` et `lang="fr"` pour les lecteurs d'écran. `learn.test.ts` exige
  aujourd'hui une traduction pour chaque fiche, avec le même nombre de sections et de « À retenir » :
  ajouter une fiche, c'est l'ajouter aux deux fichiers. Les sources peuvent différer d'une langue à
  l'autre : les fiches ajoutées depuis le pack « Comprendre — nouvelles fiches » citent l'Assurance
  Maladie et la HAS en français, le NHS en anglais.
- Catégories : ordre et teinte dans `CATEGORIES` / `CATEGORY_TONES` (`src/lib/learn.ts`) ; libellé
  et description dans les fichiers de traduction (`articles.categories.<id>` de
  `src/locales/{fr,en}/common.json`). La description s'affiche sous la liste quand le filtre est
  actif. L'avertissement du lecteur est `articles.disclaimerReader`.
- Illustrations : `frontend/public/assets/comprendre/*.webp`, référencées par `image`
  (`/assets/comprendre/…`). `src/lib/learn.test.ts` vérifie que chaque chemin existe.
- L'`id` d'une fiche sert d'URL (`/learn/<id>`) et passe avant un article API qui aurait le même slug
  (`fin` est réservé à l'écran de fin).
- `tags` (optionnel) : mots-clés pris en compte par la recherche, qui couvre aussi le titre, le
  résumé, l'introduction, les sections et « À retenir ».
- Les fiches marquées `featured` apparaissent toutes dans « À la une » (une par maladie).
- `sectionStyle` (optionnel) choisit la présentation des sections dans le lecteur : `prose` (par
  défaut), `cards` (cartes à icône ronde) ou `checklist`. Il ne change pas le texte.
- Le lecteur (`/learn/<id>`) enchaîne les fiches dans l'ordre de ce fichier, filtré comme la liste
  d'origine ; après la dernière, il ouvre l'écran de fin `/learn/fin` (slug réservé).

## Relecture médicale — obligatoire avant publication

Les 32 fiches actuelles sont des **brouillons pédagogiques** : les 8 fiches d'origine
(hypothyroïdie, Hashimoto, lévothyroxine…), les 10 fiches Basedow issues du pack éditorial
« ThyroTrack-Comprendre-Extension-Basedow », 7 fiches du pack « Comprendre — nouvelles fiches »
(anti-TPO/anti-Tg, prise de sang, grossesse, nodule, échographie, iode radioactif, suivi après
thyroïdectomie) et les 5 fiches du pack « Comprendre — pack suivant » (TSH et âge, biotine,
thyroïdite du post-partum, thyroïdite subaiguë, produit de contraste iodé). Le pack
« Comprendre » 03 a ajouté `medicaments-et-thyroide` et `hypothyroidie-fruste` ; sa fiche « Basedow,
tabac et santé des yeux » est devenue la 4e section de `basedow-yeux`, et son complément sur le café
et le petit-déjeuner a été ajouté à la première section de `levothyroxine-prise`. Aucune n'a été
relue par un professionnel de santé.

Sur les 10 fiches de ce dernier pack, « Préparer une prise de sang » et « Valeurs de référence » ont
été fusionnées (`preparer-prise-sang-thyroide`) ; « Hashimoto sans hypothyroïdie » est devenue la
4e section de `hashimoto-hypothyroidie` ; « Hyperthyroïdie et cœur » a été écartée, car elle
reprenait `basedow-symptomes` et `urgence-difficulte-respiratoire`.
Chaque fiche porte `"medicalReviewRequired": true`. Tant que ce drapeau est vrai ou que `reviewedAt`
manque, l'app affiche « Fiche pédagogique en attente de relecture par un professionnel de santé »
(`isMedicallyReviewed` dans `src/lib/learn.ts`, vérifié par `learn.test.ts`).

**Les traductions anglaises se relisent comme des originaux.** Elles ont été rédigées par Claude
Code à partir des brouillons français : chacune porte son propre `medicalReviewRequired: true` et
son propre `reviewedAt`. La relecture du français ne valide jamais l'anglais (`localize` ne recopie
pas le statut). Points d'attention propres à l'anglais :

- les sources Ameli sont remplacées par des pages NHS côté anglais ; celles de l'ANSES, de
  Service-Public et de la base des médicaments restent en français (libellé « (in French) ») :
  une source anglophone équivalente serait préférable ;
- les numéros d'urgence (`urgence-difficulte-respiratoire`) citent le 112 (Union européenne) et le
  15 (France) ; un public britannique ou nord-américain attend le 999 ou le 911 : à décider selon le
  public visé, puis à relire ;
- la terminologie (« Graves’ disease », « antithyroid medicines », FT4/FT3, « thyroid eye
  disease ») est à confirmer par le relecteur.

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
   `"medicalReviewRequired"` à `false` — dans `content.fr.json` pour le français, dans
   `content.en.json` pour l'anglais, chacun après sa propre relecture. L'app affiche alors « Relue par un professionnel de santé
   le … ». Le test `never presents a draft as medically reviewed` de `learn.test.ts` devra alors
   être adapté.

   Liens du pack « Comprendre — nouvelles fiches » **non vérifiés** (même raison) :
   - Assurance Maladie : `…/themes/nodule-thyroidien/cas-faut-consulter-examens-realises`,
     `…/themes/hypothyroidie/symptomes-diagnostic-evolution`, `…/themes/hypothyroidie/grossesse`,
     `…/themes/hyperthyroidie/symptomes-diagnostic-evolution`, `…/themes/hyperthyroidie/traitement`,
     `…/themes/cancer-thyroide/surveillance-medicale-vie-quotidienne`,
     `…/examen/analyse/lire-resultats-prise-sang` (sous `https://www.ameli.fr/assure/sante`) ;
   - HAS : `https://www.has-sante.fr/jcms/p_3216305/fr/prise-en-charge-des-dysthyroidies-chez-l-adulte` ;
   - NHS (choisis par Claude Code comme équivalents anglophones, à confirmer en priorité) :
     `/conditions/goitre/` (nodule, échographie), `/tests-and-treatments/ultrasound-scan/`,
     `/tests-and-treatments/blood-tests/`, `/conditions/underactive-thyroid-hypothyroidism/`,
     `/conditions/overactive-thyroid-hyperthyroidism/` et `…/treatment/`, `/conditions/thyroid-cancer/`
     (sous `https://www.nhs.uk`). Faute de page NHS dédiée identifiée aux nodules et à la grossesse
     thyroïdienne, les pages citées sont les plus proches.
   Liens du pack « Comprendre — pack suivant » **non vérifiés** (même raison) :
   - Assurance Maladie : `…/themes/hypothyroidie/comprendre-hypothyroidie`,
     `…/themes/hyperthyroidie/comprendre-hyperthyroidie` (sous `https://www.ameli.fr/assure/sante`) ;
   - HAS : `https://www.has-sante.fr/jcms/p_3420835/fr/` (libellé du pack « cas des personnes de
     plus de 65 ans », page à identifier) et `…/jcms/p_3418924/fr/prise-en-charge-des-hypothyroidies-chez-l-adulte-recommandations` ;
   - FDA : `https://www.fda.gov/medical-devices/in-vitro-diagnostics/biotin-interference-troponin-lab-tests-assays-subject-biotin-interference`
     (page centrée sur la troponine ; une source sur les dosages thyroïdiens serait plus adaptée).
     Le second lien FDA du pack (`/media/127915/download`, guide destiné aux fabricants) n'a pas
     été repris ;
   - American Thyroid Association : `…/ata-statement-on-the-potential-risks-of-excess-iodine-ingestion-and-exposure/`
     et `…/patient-thyroid-information/ct-for-patients/april-2025/vol-18-issue-4-p-11-12/`
     (sous `https://www.thyroid.org`), cités tels quels dans les deux langues.
   Liens du pack « Comprendre » 03 **non vérifiés** (même raison) : Assurance Maladie
   `…/themes/trouble-bipolaire/traitement`, NHS `/medicines/lithium/`, `/medicines/amiodarone/`,
   `/medicines/levothyroxine/`, American Thyroid Association `https://www.thyroid.org/thyroid-eye-disease/`.
   La notice française de la lévothyroxine n'a pas pu être consultée : le passage sur le café, le
   thé et les repas reste volontairement sans délai chiffré, à confirmer par le relecteur.
   Relecture attentive : l'interférence de la biotine selon les méthodes (`biotine-analyses-thyroide`),
   la lecture de la TSH avec l'âge (`tsh-et-age`, sans seuil chiffré), et l'évolution en phases des
   thyroïdites (`thyroidite-post-partum`, `thyroidite-subaigue`).
   Relecture spécialisée attentive pour `thyroide-grossesse-suivi`, `suivi-apres-thyroidectomie` et
   `iode-radioactif-comprendre`.

Ne pas ajouter de source qui n'a pas été vérifiée.
