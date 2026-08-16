// src/controllers/googleHealth.controller.ts
// Connexion/déconnexion de la Google Health API (synchro poids/rythme
// cardiaque/sommeil, voir lib/googleHealth.ts). Même architecture que le
// flux de liaison Google dans oidc.controller.ts (cookie httpOnly de
// state/PKCE, navigation plein-page vers Google, callback qui redirige vers
// le Profil), mais toujours en mode "liaison" — il n'existe pas de "login
// avec Google Health", cette connexion n'a de sens que pour un compte
// ThyroTrack déjà authentifié.
import crypto from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import {
  buildGoogleHealthAuthorizationUrl,
  handleGoogleHealthCallback,
  subscribeToWebhook,
  type GoogleHealthFlowState,
} from '../lib/googleHealth.js';
import { encrypt } from '../lib/crypto.js';
import { recordAuthEvent } from '../lib/authEvents.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

const GOOGLE_HEALTH_COOKIE = 'thyro_google_health_link';
const GOOGLE_HEALTH_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;
const GOOGLE_HEALTH_COOKIE_PATH = '/api/integrations/google-health';

type GoogleHealthLinkFlowState = GoogleHealthFlowState & { userId: string };

function googleHealthNotConfigured(): boolean {
  return !config.googleHealthClientId || !config.googleHealthClientSecret;
}

export const googleHealthController = {
  // POST /api/integrations/google-health/link — démarre le flux (utilisateur
  // déjà connecté). Comme oidc.controller.ts#googleLinkStart, appelé en XHR
  // pour transporter le header Authorization, la redirection plein-page
  // vers Google est ensuite faite par le frontend lui-même.
  linkStart: async (req: AuthRequest, res: Response): Promise<void> => {
    if (googleHealthNotConfigured()) {
      throw new AppError(501, req.t('errors.googleHealthNotConfigured'));
    }

    const { url, flow } = await buildGoogleHealthAuthorizationUrl();
    const linkFlow: GoogleHealthLinkFlowState = { ...flow, userId: req.userId! };

    res.cookie(GOOGLE_HEALTH_COOKIE, JSON.stringify(linkFlow), {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: GOOGLE_HEALTH_COOKIE_MAX_AGE_MS,
      path: GOOGLE_HEALTH_COOKIE_PATH,
    });

    res.json({ url });
  },

  // GET /api/integrations/google-health/callback — Google revient ici avec
  // ?code&state. Navigation plein-page : toute erreur redirige proprement
  // vers le Profil plutôt que de répondre en JSON brut.
  callback: async (req: AuthRequest, res: Response): Promise<void> => {
    const profileUrl = new URL('/profile', config.appUrl);
    const rawCookie = req.cookies?.[GOOGLE_HEALTH_COOKIE];
    res.clearCookie(GOOGLE_HEALTH_COOKIE, { path: GOOGLE_HEALTH_COOKIE_PATH });

    let flow: GoogleHealthLinkFlowState | undefined;

    try {
      if (googleHealthNotConfigured()) throw new Error('Google Health non configuré');
      if (!rawCookie) throw new Error('Cookie de flux Google Health absent/expiré');

      flow = JSON.parse(rawCookie);
      const callbackUrl = new URL(req.originalUrl, config.googleHealthRedirectUri);
      const tokens = await handleGoogleHealthCallback(callbackUrl, flow!);

      // Abonnement aux notifications webhook pour la synchro en arrière-plan
      // (voir controllers/googleHealthWebhook.controller.ts). Best-effort :
      // un échec ici ne doit pas faire échouer la connexion elle-même —
      // l'utilisateur reste connecté, seule la synchro automatique est absente
      // jusqu'à un futur réessai.
      const webhookUrl = new URL('/api/webhooks/google-health', config.googleHealthRedirectUri).href;
      const webhookChannelToken = crypto.randomBytes(24).toString('hex');
      const webhookSubscriptionId = await subscribeToWebhook(tokens.accessToken, webhookUrl, webhookChannelToken).catch(
        (err) => {
          logger.error('Échec abonnement webhook Google Health', err);
          return null;
        }
      );

      await prisma.googleHealthConnection.upsert({
        where: { userId: flow!.userId },
        create: {
          userId: flow!.userId,
          accessTokenEnc: encrypt(tokens.accessToken),
          refreshTokenEnc: encrypt(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
          scope: tokens.scope,
          webhookSubscriptionId,
          webhookChannelToken: webhookSubscriptionId ? webhookChannelToken : null,
        },
        update: {
          accessTokenEnc: encrypt(tokens.accessToken),
          refreshTokenEnc: encrypt(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
          scope: tokens.scope,
          webhookSubscriptionId,
          webhookChannelToken: webhookSubscriptionId ? webhookChannelToken : null,
        },
      });

      await recordAuthEvent(prisma, { userId: flow!.userId, provider: 'google-health', type: 'LINKED', req });
      profileUrl.searchParams.set('googleHealthLinked', '1');
    } catch (err) {
      logger.error('Échec liaison Google Health', err);
      await recordAuthEvent(prisma, { userId: flow?.userId ?? null, provider: 'google-health', type: 'LINK_FAILED', req });
      profileUrl.searchParams.set('googleHealthLinkError', '1');
    }

    res.redirect(profileUrl.href);
  },

  // DELETE /api/integrations/google-health/link — dissocie Google Health du
  // compte connecté. Contrairement au login Google (oidc.controller.ts), il
  // n'y a pas de restriction "pas de mot de passe local" ici : cette
  // connexion ne sert jamais à s'authentifier, seulement à synchroniser des
  // données.
  unlink: async (req: AuthRequest, res: Response): Promise<void> => {
    await prisma.googleHealthConnection.deleteMany({ where: { userId: req.userId } });
    await recordAuthEvent(prisma, { userId: req.userId!, provider: 'google-health', type: 'UNLINKED', req });
    res.json({ message: req.t('auth.googleHealthAccountUnlinked') });
  },
};
