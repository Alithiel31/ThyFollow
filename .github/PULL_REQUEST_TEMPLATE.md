## Description

<!-- What does this PR do, and why? -->

## Checklist

- [ ] `CHANGELOG.md` updated under `[Unreleased]` (in French) if the change is notable for a user
      or an operator — see [CONTRIBUTING.md](../CONTRIBUTING.md#opening-a-pull-request)
- [ ] Lint, type-check and tests pass locally for the package(s) touched (`backend`, `frontend`) —
      see [CONTRIBUTING.md](../CONTRIBUTING.md#reproducing-ci-locally)
- [ ] A Prisma schema change comes with its migration (`npx prisma migrate dev`)
- [ ] Documentation under `docs/` updated (both languages) if behaviour, configuration or routes changed
- [ ] No secret (`.env`, `JWT_SECRET`, Google credentials, `TOKEN_ENCRYPTION_KEY`, database dump) and no
      real health data is present in the diff

## Additional context

<!-- Linked issue, screenshots, design decisions... -->
