// src/lib/oidc.ts
// Client OpenID Connect / OAuth2 pour "Se connecter avec Google".
//
// Rappel des rôles (souvent confondus) :
// - OAuth2 est un protocole d'AUTORISATION : il délègue l'accès à une
//   ressource (ici, le profil Google) via un access_token.
// - OpenID Connect (OIDC) est une couche d'IDENTITÉ construite AU-DESSUS
//   d'OAuth2 : en plus de l'access_token, le fournisseur renvoie un
//   id_token — un JWT signé par Google — qui certifie QUI s'est connecté.
//   C'est cet id_token, une fois vérifié, qui nous sert à authentifier
//   l'utilisateur (pas l'access_token, qu'on n'utilise même pas ici).
import * as client from 'openid-client';
import { config } from '../config.js';

let discoveredConfig: client.Configuration | null = null;

// La "discovery" (RFC 8414 / OIDC Discovery) va chercher
// https://accounts.google.com/.well-known/openid-configuration pour
// connaître dynamiquement les endpoints d'autorisation/token/JWKS de
// Google, plutôt que de les coder en dur. Mise en cache car un aller-retour
// réseau à chaque login serait inutile (les endpoints ne changent pas).
async function getGoogleConfig(): Promise<client.Configuration> {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configurés');
  }
  if (!discoveredConfig) {
    discoveredConfig = await client.discovery(
      new URL('https://accounts.google.com'),
      config.googleClientId,
      config.googleClientSecret
    );
  }
  return discoveredConfig;
}

export interface OidcFlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
}

// Prépare l'URL d'autorisation Google (redirection navigateur) ainsi que
// les valeurs à conserver côté serveur (cookie httpOnly) pour vérifier la
// réponse au retour :
// - `state` : protège contre le CSRF (l'attaquant ne peut pas forger une
//   redirection de callback valide sans connaître le state qu'on a émis).
// - `nonce` : rejoué dans l'id_token, protège contre le replay d'un
//   id_token volé sur une autre tentative de connexion.
// - PKCE (`code_verifier` / `code_challenge`) : empêche un attaquant qui
//   intercepterait le `code` (ex: sur un appareil partagé, un proxy) de
//   l'échanger lui-même contre des tokens, puisqu'il n'a pas le verifier.
export async function buildGoogleAuthorizationUrl(): Promise<{ url: string; flow: OidcFlowState }> {
  const openidConfig = await getGoogleConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const url = client.buildAuthorizationUrl(openidConfig, {
    redirect_uri: config.googleRedirectUri,
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return { url: url.href, flow: { state, nonce, codeVerifier } };
}

export interface GoogleIdentity {
  providerAccountId: string; // claim `sub`
  email: string;
  emailVerified: boolean;
  name: string;
}

// Échange le `code` reçu en callback contre les tokens, puis valide
// l'id_token (signature via les clés publiques JWKS de Google, `iss`,
// `aud`, `exp`, et `nonce` comparé à celui émis plus haut). openid-client
// fait cette vérification à l'intérieur d'`authorizationCodeGrant` — c'est
// la partie qu'on ne réimplémente pas à la main, la vérification de
// signature JWT étant facile à se rater soi-même (mauvais algo, `alg: none`,
// clé du mauvais type...).
export async function handleGoogleCallback(
  callbackUrl: URL,
  flow: OidcFlowState
): Promise<GoogleIdentity> {
  const openidConfig = await getGoogleConfig();

  const tokens = await client.authorizationCodeGrant(openidConfig, callbackUrl, {
    pkceCodeVerifier: flow.codeVerifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
  });

  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== 'string') {
    throw new Error('id_token Google sans claim sub');
  }

  const userinfo = await client.fetchUserInfo(openidConfig, tokens.access_token, claims.sub);

  return {
    providerAccountId: claims.sub,
    email: userinfo.email ?? '',
    emailVerified: userinfo.email_verified === true,
    name: userinfo.name ?? userinfo.email ?? 'Utilisateur Google',
  };
}
