# Prompt Claude Code — pack « Comprendre » 04

```text
Examine le dossier `Comprendre-Pack-04` et prépare l’intégration des fiches et schémas dans la bibliothèque ThyroTrack. Commence par lire `frontend/src/content/comprendre/README.md`, les JSON FR/EN, `frontend/src/lib/learn.ts`, les types et les tests associés. Le dépôt réel est la référence.

Avant toute modification, compare les quatre sujets à tout le contenu actuellement présent, y compris les fiches ajoutées depuis les packs précédents. Retourne un tableau indiquant pour chaque sujet : doublon exact éventuel, chevauchement, apport distinct, décision (ajouter / fusionner / retoucher / écarter), id, catégorie, assets et traduction requis. Porte une attention particulière aux fiches nodules/échographie/cancer, aux traitements Basedow (ATS, iode radioactif, chirurgie) et aux informations sur l’équipe soignante. Ne crée pas une seconde fiche si un sujet est déjà couvert.

Le dossier contient quatre SVG dans `images/`. Vérifie le format d’image réellement accepté par l’app, les conventions de nommage, les dimensions et les tests. Si le projet n’accepte que WebP, indique-le et convertis les SVG avec les outils déjà disponibles dans le dépôt; conserve les sources SVG dans le dossier de livraison, sans ajouter de dépendance injustifiée. Mets à jour les chemins d’image de `fiches-fr.json` selon la convention retenue.

Après l’audit, intègre uniquement les fiches distinctes qui respectent le schéma existant. Ajoute leurs traductions anglaises conformément à l’architecture, avec un anglais naturel. Vérifie les ids/slugs, catégories, ordre, longueur/structure des sections, recherche, navigation et assets. Les fiches sur cancer, cytoponction et choix thérapeutique doivent rester générales et ne pas interpréter un dossier individuel.

Toutes les fiches sont des brouillons destinés à une future relecture médicale : conserve `medicalReviewRequired: true`, n’ajoute pas `reviewedAt` et ne les présente jamais comme validées. Les sources de départ sont à vérifier, et les formulations doivent être soutenues par leurs sources. Garde la mention que la plupart des nodules sont bénins, sans laisser croire qu’un nodule donné est bénin ou malin. Pour Basedow, explique la décision partagée sans désigner d’option universellement préférable. Pour les rôles professionnels, précise que tous les patients ne consultent pas tous les spécialistes.

Termine par un bilan des fiches ajoutées, fusionnées ou écartées, des images retenues ou converties, des fichiers modifiés et des vérifications pertinentes effectuées.
```
