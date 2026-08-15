// src/controllers/oidc.controller.ts
// "Se connecter avec Google" — Authorization Code + PKCE (OAuth2) surmonté
// d'OpenID Connect pour l'identité. Voir src/lib/oidc.ts pour le détail du
// protocole ; ce contrôleur relie le flux OIDC au modèle d'auth existant
// de l'app (un utilisateur `User` + un JWT de session applicatif).
import { Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { buildGoogleAuthorizationUrl, handleGoogleCallback, type OidcFlowState } from '../lib/oidc.js';
import { AppError, ValidationError } from '../lib/errors.js';

const OIDC_COOKIE = 'thyro_oidc_google';
// Une tentative de connexion ne dure jamais 5 minutes en pratique ; on
// borde volontairement large pour tolérer un écran de consentement Google
// laissé ouvert un moment, sans pour autant garder le cookie indéfiniment.
const OIDC_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

function googleNotConfigured(): boolean {
  return !config.googleClientId || !config.googleClientSecret;
}

function signSessionToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] });
}

export const oidcController = {
  // GET /api/auth/oidc/google — démarre le flux, redirige vers Google.
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

  // GET /api/auth/oidc/google/callback — Google revient ici avec ?code&state.
  googleCallback: async (req: AuthRequest, res: Response): Promise<void> => {
    if (googleNotConfigured()) {
      throw new AppError(501, req.t('errors.oidcNotConfigured'));
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
