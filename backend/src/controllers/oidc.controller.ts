// src/controllers/oidc.controller.ts
// "Se connecter avec Google" — Authorization Code + PKCE (OAuth2) surmonté
// d'OpenID Connect pour l'identité. Voir src/lib/oidc.ts pour le détail du
// protocole ; ce contrôleur relie le flux OIDC au modèle d'auth existant
// de l'app (un utilisateur `User` + un JWT de session applicatif).
//
// Deux usages du même flux Google sont gérés ici :
// - "login" (googleAuthorize/googleCallback) : utilisateur non authentifié,
//   connexion ou création de compte automatique.
// - "link" (googleLinkStart/googleUnlink + branche link dans googleCallback) :
//   utilisateur déjà authentifié qui associe/dissocie Google à son compte
//   existant (ex: un compte créé par email/mot de passe).
import { Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { buildGoogleAuthorizationUrl, handleGoogleCallback, type OidcFlowState } from '../lib/oidc.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

const OIDC_COOKIE = 'thyro_oidc_google';
// Cookie distinct pour le flux de liaison (utilisateur déjà connecté) : il
// porte en plus l'id de l'utilisateur courant, ce qui permet à
// googleCallback de savoir quel compte relier une fois Google revenu, sans
// dépendre d'un header Authorization (absent lors d'une navigation
// plein-page déclenchée par la redirection de Google).
const OIDC_LINK_COOKIE = 'thyro_oidc_google_link';
// Une tentative de connexion ne dure jamais 5 minutes en pratique ; on
// borde volontairement large pour tolérer un écran de consentement Google
// laissé ouvert un moment, sans pour autant garder le cookie indéfiniment.
const OIDC_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

type OidcLinkFlowState = OidcFlowState & { userId: string };

function googleNotConfigured(): boolean {
  return !config.googleClientId || !config.googleClientSecret;
}

function signSessionToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] });
}

// Traite le retour de Google pour le flux de liaison (utilisateur déjà
// connecté). Les erreurs ne sont jamais renvoyées en JSON ici : la requête
// est une navigation plein-page initiée par Google, donc on redirige
// toujours vers le Profil avec un paramètre de query indiquant le résultat,
// plutôt que d'afficher du JSON brut dans le navigateur.
async function handleGoogleLinkCallback(req: AuthRequest, res: Response, rawCookie: string): Promise<void> {
  const profileUrl = new URL('/profile', config.appUrl);

  try {
    const flow: OidcLinkFlowState = JSON.parse(rawCookie);
    const callbackUrl = new URL(req.originalUrl, config.googleRedirectUri);
    const identity = await handleGoogleCallback(callbackUrl, flow);

    const existingLink = await prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: identity.providerAccountId } },
    });

    if (existingLink && existingLink.userId !== flow.userId) {
      // Ce compte Google est déjà relié à quelqu'un d'autre : on refuse
      // (sinon deux comptes ThyroTrack se retrouveraient reliés au même
      // compte Google, ce qui casserait l'unicité provider+providerAccountId).
      profileUrl.searchParams.set('googleLinkError', 'conflict');
    } else if (!existingLink) {
      await prisma.oAuthAccount.create({
        data: { provider: 'google', providerAccountId: identity.providerAccountId, userId: flow.userId },
      });
      profileUrl.searchParams.set('googleLinked', '1');
    } else {
      // Déjà relié à ce même compte (ex: double clic) : idempotent, succès.
      profileUrl.searchParams.set('googleLinked', '1');
    }
  } catch {
    profileUrl.searchParams.set('googleLinkError', '1');
  }

  res.redirect(profileUrl.href);
}

export const oidcController = {
  // GET /api/auth/oidc/google — démarre le flux, redirige vers Google.
  // Utilisé pour se connecter ou créer un compte (utilisateur non authentifié).
  googleAuthorize: async (req: AuthRequest, res: Response): Promise<void> => {
    if (googleNotConfigured()) {
      throw new AppError(501, req.t('errors.oidcNotConfigured'));
    }

    const { url, flow } = await buildGoogleAuthorizationUrl();

    res.cookie(OIDC_COOKIE, JSON.stringify(flow satisfies OidcFlowState), {
      httpOnly: true,
      secure: config.isProd,
      // Lax : le cookie doit être renvoyé lors de la redirection GET
      // top-level que Google effectue vers notre callback (navigation
      // cross-site, mais méthode "safe").
      sameSite: 'lax',
      maxAge: OIDC_COOKIE_MAX_AGE_MS,
      path: '/api/auth/oidc/google',
    });

    res.redirect(url);
  },

  // POST /api/auth/oidc/google/link — démarre le flux de liaison pour
  // l'utilisateur actuellement connecté. Contrairement à googleAuthorize,
  // ce n'est pas un lien <a href> classique : le frontend l'appelle en XHR
  // (pour transporter le header Authorization, nécessaire ici puisque la
  // route est protégée par `authenticate`), récupère l'URL Google renvoyée,
  // puis fait lui-même la navigation plein-page vers cette URL.
  googleLinkStart: async (req: AuthRequest, res: Response): Promise<void> => {
    if (googleNotConfigured()) {
      throw new AppError(501, req.t('errors.oidcNotConfigured'));
    }

    const { url, flow } = await buildGoogleAuthorizationUrl();
    const linkFlow: OidcLinkFlowState = { ...flow, userId: req.userId! };

    res.cookie(OIDC_LINK_COOKIE, JSON.stringify(linkFlow), {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: OIDC_COOKIE_MAX_AGE_MS,
      path: '/api/auth/oidc/google',
    });

    res.json({ url });
  },

  // DELETE /api/auth/oidc/google/link — dissocie Google du compte connecté.
  googleUnlink: async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { password: true } });
    if (!user) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.user') }));

    // Sans mot de passe local, Google est l'unique moyen de se connecter :
    // délier reviendrait à se verrouiller hors de son propre compte. On
    // impose de définir un mot de passe d'abord (via "mot de passe oublié",
    // qui fonctionne déjà pour tout compte existant, avec ou sans mot de
    // passe préalable).
    if (!user.password) {
      throw new ConflictError(req.t('errors.oidcLinkCannotUnlinkNoPassword'));
    }

    await prisma.oAuthAccount.deleteMany({ where: { provider: 'google', userId: req.userId } });
    res.json({ message: req.t('auth.googleAccountUnlinked') });
  },

  // GET /api/auth/oidc/google/callback — Google revient ici avec ?code&state.
  // Partagé par les deux flux (login et link) : on distingue via le cookie
  // présent (un seul flux à la fois par navigateur).
  googleCallback: async (req: AuthRequest, res: Response): Promise<void> => {
    if (googleNotConfigured()) {
      throw new AppError(501, req.t('errors.oidcNotConfigured'));
    }

    const linkRaw = req.cookies?.[OIDC_LINK_COOKIE];
    if (linkRaw) {
      res.clearCookie(OIDC_LINK_COOKIE, { path: '/api/auth/oidc/google' });
      await handleGoogleLinkCallback(req, res, linkRaw);
      return;
    }

    const raw = req.cookies?.[OIDC_COOKIE];
    res.clearCookie(OIDC_COOKIE, { path: '/api/auth/oidc/google' });
    if (!raw) throw new ValidationError(req.t('errors.oidcFlowExpired'));

    let flow: OidcFlowState;
    try {
      flow = JSON.parse(raw);
    } catch {
      throw new ValidationError(req.t('errors.oidcFlowExpired'));
    }

    // openid-client compare `req.query.state` à `flow.state` (et valide
    // signature/iss/aud/exp/nonce de l'id_token) à l'intérieur de cet appel.
    const callbackUrl = new URL(req.originalUrl, config.googleRedirectUri);
    const identity = await handleGoogleCallback(callbackUrl, flow);

    if (!identity.email) {
      throw new ValidationError(req.t('errors.oidcNoEmail'));
    }

    const existingLink = await prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: identity.providerAccountId } },
      include: { user: true },
    });

    let userId: string;

    if (existingLink) {
      userId = existingLink.userId;
    } else {
      // Pas encore de compte lié à ce `sub` Google. Si un compte existe déjà
      // avec cet email, on le lie (federated identity linking) — mais
      // seulement si Google certifie l'email vérifié, sinon un attaquant
      // pourrait créer un compte Google sur l'email de quelqu'un d'autre
      // pour prendre le contrôle de son compte ThyroTrack.
      const existingUser = identity.emailVerified
        ? await prisma.user.findUnique({ where: { email: identity.email } })
        : null;

      if (existingUser) {
        await prisma.oAuthAccount.create({
          data: { provider: 'google', providerAccountId: identity.providerAccountId, userId: existingUser.id },
        });
        userId = existingUser.id;
      } else {
        const created = await prisma.user.create({
          data: {
            email: identity.email,
            password: null,
            name: identity.name,
            emailVerified: identity.emailVerified,
            profile: { create: {} },
            notifications: { create: {} },
            oauthAccounts: { create: { provider: 'google', providerAccountId: identity.providerAccountId } },
          },
          select: { id: true },
        });
        userId = created.id;
      }
    }

    const token = signSessionToken(userId);
    const redirectUrl = new URL('/oauth/callback', config.appUrl);
    redirectUrl.searchParams.set('token', token);
    res.redirect(redirectUrl.href);
  },
};
