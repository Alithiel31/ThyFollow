# GraphQL (démo additive)

Ce backend expose désormais, en plus de sa REST API existante (`/api/*`), un
endpoint `POST /graphql`. C'est une démonstration technique, pas un
remplacement : aucune route REST n'a été retirée ou modifiée, et le frontend
continue d'utiliser exclusivement la REST API.

## Pourquoi c'est additif, pas un remplacement

ThyroTrack est une petite application mono-utilisateur, servie par un seul
client (le SPA React). `analytics.controller.ts` fait déjà l'agrégation
nécessaire côté serveur en un seul appel REST — GraphQL n'apporte donc pas de
gain de performance mesurable ici. L'intérêt de cet ajout est de montrer,
sur une base de code réelle, une maîtrise concrète du modèle GraphQL : design
de schéma, resolvers imbriqués, gestion de l'authentification, et surtout la
maîtrise du piège classique du N+1 (voir plus bas) — plutôt que de prétendre
que c'est objectivement mieux pour cette app.

## Avant / après : le cas `analytics.controller.ts#overview`

**Avant (REST)** : un endpoint dédié qui lance 4 requêtes Prisma en
parallèle (`Promise.all`) et calcule des agrégats (streak, moyennes) en JS,
pour renvoyer une forme fixe, pensée pour un seul écran.

**Après (GraphQL)** : le client compose sa propre query et choisit
exactement les champs et la profondeur dont il a besoin, sans qu'un nouvel
endpoint REST soit nécessaire pour chaque nouvelle vue :

```graphql
query Dashboard {
  me {
    name
    medications {
      name
      intakes(limit: 5) { date time }
    }
    dailyEntries(limit: 30) {
      date
      energyLevel
      symptomLogs { severity symptom { name } }
    }
    labResults(limit: 5) { date tsh ft4 ft3 }
  }
}
```

## Le piège du N+1, et comment il est évité ici

Une implémentation naïve de `Medication.intakes` ferait une requête Prisma
**par médicament renvoyé par la liste parente** : pour un utilisateur avec 5
médicaments actifs, cela donnerait 1 requête (`medications`) + 5 requêtes
(`intakes`) = 6 requêtes pour une seule query GraphQL.

`src/graphql/dataloaders.ts` résout ce problème avec
[DataLoader](https://github.com/graphql/dataloader) : tous les `.load()`
émis pendant le même tick d'exécution sont regroupés en un unique appel
`prisma.medicationIntake.findMany({ where: { medicationId: { in: [...] } } })`.
Résultat : 2 requêtes au total, quel que soit le nombre de médicaments. Cette
propriété est testée explicitement dans `dataloaders.test.ts` et
`resolvers.test.ts` (assertion `toHaveBeenCalledTimes(1)`).

Un loader est recréé **à chaque requête HTTP** (dans `context.ts`, jamais au
niveau module) : son cache interne ne doit pas survivre au-delà d'une
requête, sous peine de mélanger les données de deux utilisateurs.

## Authentification

Même mécanisme que la REST API : un JWT dans l'en-tête
`Authorization: Bearer <token>`. `src/graphql/context.ts` reproduit le
décodage de `middleware/auth.ts`, mais lève une `GraphQLError` (code
`UNAUTHENTICATED`, avec `extensions.http.status: 401`) plutôt que d'écrire
directement une réponse HTTP — la fonction `context` d'Apollo ne peut que
`throw`.

Deux comportements différents à connaître (et à savoir expliquer) :
- Une erreur levée **dans `context`**, avant que l'exécution de la query ne
  démarre, fait échouer toute la requête HTTP avec le statut porté par
  `extensions.http.status` — ici **401**, comme en REST.
- Une erreur levée **dans un resolver** (ex. `NOT_FOUND` sur
  `logMedicationIntake`) n'a pas cet effet : la convention GraphQL-over-HTTP
  par défaut renvoie **200**, l'erreur n'existant que dans
  `body.errors[0]`, même si la mutation a échoué. Voir les tests
  correspondants dans `resolvers.test.ts`.

## Comment l'essayer

En développement (`npm run dev`), l'introspection est activée et [Apollo
Sandbox](https://www.apollographql.com/docs/graphql-software/apollo-sandbox)
est accessible en pointant un client GraphQL vers `http://localhost:3001/graphql`.

Sans Sandbox, un simple `curl` :

```bash
curl -X POST http://localhost:3001/graphql \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { name medications { name } } }"}'
```

## Ce qui est volontairement hors scope

Pour garder cette démo lisible plutôt que de viser l'exhaustivité :

- **Pas de subscriptions/websockets.**
- **Pas de limitation de complexité/profondeur de requête** — nécessaire en
  production pour éviter qu'une query composée par le client ne demande un
  graphe trop coûteux.
- **Pas de pagination par curseur** — uniquement `limit`/`take`, comme la
  convention `?days=N` déjà utilisée côté REST.
- **Enums Prisma exposés en `String`** (`dosageUnit`, `frequency`,
  `category`...) plutôt que mappés 1:1 en enums GraphQL.
- **Dates en `String` ISO** plutôt qu'un scalar `Date` custom.
- **Messages d'erreur non traduits** (pas d'intégration i18next côté
  GraphQL, contrairement à la REST API).

Un système visant la production ajouterait ces éléments ; ils sont omis ici
pour garder le schéma et le code review-friendly.
