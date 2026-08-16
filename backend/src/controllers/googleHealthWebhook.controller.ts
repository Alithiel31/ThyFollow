// src/controllers/googleHealthWebhook.controller.ts
// Réception des notifications de changement de la Google Health API (voir
// lib/googleHealth.ts#subscribeToWebhook) : c'est le seul déclencheur de
// synchro, il n'y a pas de polling de secours (choix du plan).
//
// ⚠️ Comme le reste de l'intégration webhook, le format exact du payload
// envoyé par Google (noms de champs, regroupement par utilisateur/plage de
// dates...) n'a pas pu être vérifié depuis cet environnement (accès réseau
// à developers.google.com bloqué). Cet endpoint attend un payload
// `{ subscriptionId, channelToken, dates? }` — à ajuster au format réel une
// fois la doc consultée. Ce qui NE dépend PAS du format Google et est donc
// fiable dès maintenant : la vérification d'authenticité par `channelToken`
// (partagé à l'abonnement, voir googleHealth.controller.ts) et la logique
// de fusion dans DailyEntry (lib/googleHealthSync.ts).
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { syncDailyMetricsBySubscription } from '../lib/googleHealthSync.js';
import { logger } from '../lib/logger.js';

const notificationSchema = z.object({
  subscriptionId: z.string().min(1),
  channelToken: z.string().min(1),
  // Dates ISO (YYYY-MM-DD) concernées par le changement. À défaut, on
  // resynchronise uniquement la date du jour (UTC).
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const googleHealthWebhookController = {
  // GET /api/webhooks/google-health — poignée de main de vérification lors
  // de la création de l'abonnement (mécanisme "echo challenge", courant
  // pour ce type de webhook — à confirmer avec la doc Google Health API).
  verify: (req: Request, res: Response): void => {
    const challenge = req.query.challenge;
    if (typeof challenge === 'string') {
      res.status(200).type('text/plain').send(challenge);
      return;
    }
    res.status(200).json({ status: 'ok' });
  },

  // POST /api/webhooks/google-health — notification de changement.
  notify: async (req: Request, res: Response): Promise<void> => {
    const parsed = notificationSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn('Notification Google Health au format inattendu', parsed.error.flatten());
      res.status(400).json({ error: 'invalid payload' });
      return;
    }

    const { subscriptionId, channelToken, dates } = parsed.data;

    const connection = await prisma.googleHealthConnection.findFirst({ where: { webhookSubscriptionId: subscriptionId } });
    if (!connection || !connection.webhookChannelToken || connection.webhookChannelToken !== channelToken) {
      // Ni 404 ni détail : ne pas confirmer/infirmer l'existence d'un
      // abonnement à quelqu'un qui ne connaît pas déjà le bon channelToken.
      res.status(403).json({ error: 'invalid subscription or token' });
      return;
    }

    // Réponse immédiate à Google (qui retente sinon), synchro en fond.
    res.status(202).json({ status: 'accepted' });

    const targetDates = dates?.length ? dates : [new Date().toISOString().slice(0, 10)];
    await syncDailyMetricsBySubscription(subscriptionId, targetDates).catch((err) => {
      logger.error('Échec traitement notification Google Health', err);
    });
  },
};
