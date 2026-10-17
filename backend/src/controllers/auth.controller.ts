// src/controllers/auth.controller.ts
import crypto from 'crypto';
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { signSessionToken, hashOneTimeToken } from '../lib/session.js';
import { ConflictError, AuthenticationError, EmailNotVerifiedError, ValidationError, NotFoundError } from '../lib/errors.js';
import { getEntitlements } from '../lib/entitlements.js';
import { sendVerificationEmail, sendResetPasswordEmail } from '../lib/resend.js';

// Les schémas dépendent de `t` (messages traduits selon la langue de la
// requête), d'où les fonctions plutôt que des constantes de module.
const registerSchema = (t: TFunction) => z.object({
  email: z.string().email(t('validation.emailInvalid')),
  password: z.string().min(8, t('validation.passwordTooShort')),
  name: z.string().min(2, t('validation.nameTooShort')),
  birthDate: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = (t: TFunction) => z.object({
  token: z.string().min(1),
  password: z.string().min(8, t('validation.passwordTooShort')),
});

// Durée de validité du lien de vérification envoyé par email.
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Durée de validité du lien de réinitialisation de mot de passe : plus courte
// que la vérification d'email (action plus sensible, on réduit la fenêtre
// d'exploitation si l'email venait à être intercepté).
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// `token` part par email ; seule son empreinte (`tokenHash`) est stockée en
// base (voir lib/session.ts#hashOneTimeToken).
function generateOneTimeToken(ttlMs: number) {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashOneTimeToken(token), expiresAt: new Date(Date.now() + ttlMs) };
}

export const authController = {
  // POST /api/auth/register
  register: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email, password, name, birthDate } = registerSchema(req.t).parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError(req.t('errors.emailInUse'));

    const hashedPassword = await bcrypt.hash(password, 12);
    const verification = generateOneTimeToken(VERIFICATION_TOKEN_TTL_MS);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        birthDate: birthDate ? new Date(birthDate) : null,
        verificationToken: verification.tokenHash,
        verificationTokenExpiresAt: verification.expiresAt,
        profile: { create: {} },
        notifications: { create: {} },
      },
      select: { id: true, email: true, name: true },
    });

    // Le compte n'est pas activé tant que l'email n'est pas confirmé : pas de
    // JWT délivré ici, l'utilisateur doit cliquer le lien reçu par email.
    await sendVerificationEmail(user.email, user.name, verification.token, req.language);

    res.status(201).json({ message: req.t('auth.verificationEmailSent') });
  },

  // POST /api/auth/login
  login: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    // `password` est null pour un compte créé via Google (OIDC) qui n'a
    // jamais défini de mot de passe local : même erreur générique que des
    // identifiants incorrects, pour ne pas révéler comment le compte a été créé.
    if (!user || !user.password) throw new AuthenticationError(req.t('errors.invalidCredentials'));

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new AuthenticationError(req.t('errors.invalidCredentials'));

    if (!user.emailVerified) throw new EmailNotVerifiedError(req.t('errors.emailNotVerified'));

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token: signSessionToken(user),
    });
  },

  // POST /api/auth/verify-email
  verifyEmail: async (req: AuthRequest, res: Response): Promise<void> => {
    const { token } = verifyEmailSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { verificationToken: hashOneTimeToken(token) } });
    if (!user || !user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      throw new ValidationError(req.t('errors.invalidOrExpiredToken'));
    }

    const { tokenVersion, ...updated } = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null, verificationTokenExpiresAt: null },
      select: { id: true, email: true, name: true, role: true, tokenVersion: true },
    });

    // Compte activé : on connecte directement l'utilisateur, pas besoin de
    // repasser par l'écran de login juste après avoir cliqué le lien.
    res.json({ user: updated, token: signSessionToken({ id: updated.id, tokenVersion }) });
  },

  // POST /api/auth/resend-verification
  resendVerification: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email } = resendVerificationSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    // Réponse identique que le compte existe ou non, pour ne pas permettre
    // à un tiers de deviner quels emails sont inscrits (énumération de comptes).
    if (user && !user.emailVerified) {
      const verification = generateOneTimeToken(VERIFICATION_TOKEN_TTL_MS);
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken: verification.tokenHash, verificationTokenExpiresAt: verification.expiresAt },
      });
      await sendVerificationEmail(user.email, user.name, verification.token, req.language);
    }

    res.json({ message: req.t('auth.verificationEmailSent') });
  },

  // POST /api/auth/forgot-password
  forgotPassword: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email } = forgotPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    // Réponse identique que le compte existe ou non, pour ne pas permettre
    // à un tiers de deviner quels emails sont inscrits (énumération de comptes).
    if (user) {
      const reset = generateOneTimeToken(RESET_TOKEN_TTL_MS);
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: reset.tokenHash, resetTokenExpiresAt: reset.expiresAt },
      });
      await sendResetPasswordEmail(user.email, user.name, reset.token, req.language);
    }

    res.json({ message: req.t('auth.passwordResetEmailSent') });
  },

  // POST /api/auth/reset-password
  resetPassword: async (req: AuthRequest, res: Response): Promise<void> => {
    const { token, password } = resetPasswordSchema(req.t).parse(req.body);

    const user = await prisma.user.findUnique({ where: { resetToken: hashOneTimeToken(token) } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new ValidationError(req.t('errors.invalidOrExpiredResetToken'));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      // tokenVersion + 1 : toutes les sessions ouvertes avec l'ancien mot de
      // passe (dont celle d'un éventuel voleur de token) sont révoquées.
      data: { password: hashedPassword, resetToken: null, resetTokenExpiresAt: null, tokenVersion: { increment: 1 } },
    });

    // Pas de connexion automatique ici : on renvoie vers l'écran de login pour
    // forcer une confirmation explicite du nouveau mot de passe.
    res.json({ message: req.t('auth.passwordResetSuccess') });
  },

  // GET /api/auth/me
  me: async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        birthDate: true,
        createdAt: true,
        proUntil: true,
        proSource: true,
        freeImportsUsed: true,
        profile: true,
        // Comptes fédérés liés (ex: Google) — le frontend s'en sert pour
        // afficher l'état "connecté/non connecté" dans le Profil.
        oauthAccounts: { select: { provider: true } },
        // Connexion Google Health (poids/FC/sommeil) — jamais les tokens
        // eux-mêmes, seulement de quoi afficher l'état de la synchro.
        googleHealthConnection: { select: { connectedAt: true, lastSyncedAt: true } },
      },
    });

    if (!user) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.user') }));
    // Les colonnes brutes servent au calcul des droits : seul le résumé
    // `entitlements` est exposé au client.
    const { proUntil, proSource, freeImportsUsed, ...publicUser } = user;
    const entitlements = await getEntitlements({ id: user.id, role: user.role, proUntil, proSource, freeImportsUsed });
    res.json({ ...publicUser, entitlements });
  },
};
