// src/controllers/auth.controller.ts
import crypto from 'crypto';
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { ConflictError, AuthenticationError, EmailNotVerifiedError, ValidationError, NotFoundError } from '../lib/errors.js';
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

function generateVerificationToken() {
  return {
    verificationToken: crypto.randomBytes(32).toString('hex'),
    verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  };
}

function generateResetToken() {
  return {
    resetToken: crypto.randomBytes(32).toString('hex'),
    resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}

export const authController = {
  // POST /api/auth/register
  register: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email, password, name, birthDate } = registerSchema(req.t).parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError(req.t('errors.emailInUse'));

    const hashedPassword = await bcrypt.hash(password, 12);
    const { verificationToken, verificationTokenExpiresAt } = generateVerificationToken();

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        birthDate: birthDate ? new Date(birthDate) : null,
        verificationToken,
        verificationTokenExpiresAt,
        profile: { create: {} },
        notifications: { create: {} },
      },
      select: { id: true, email: true, name: true },
    });

    // Le compte n'est pas activé tant que l'email n'est pas confirmé : pas de
    // JWT délivré ici, l'utilisateur doit cliquer le lien reçu par email.
    await sendVerificationEmail(user.email, user.name, verificationToken, req.language);

    res.status(201).json({ message: req.t('auth.verificationEmailSent') });
  },

  // POST /api/auth/login
  login: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AuthenticationError(req.t('errors.invalidCredentials'));

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new AuthenticationError(req.t('errors.invalidCredentials'));

    if (!user.emailVerified) throw new EmailNotVerifiedError(req.t('errors.emailNotVerified'));

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  },

  // POST /api/auth/verify-email
  verifyEmail: async (req: AuthRequest, res: Response): Promise<void> => {
    const { token } = verifyEmailSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { verificationToken: token } });
    if (!user || !user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      throw new ValidationError(req.t('errors.invalidOrExpiredToken'));
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null, verificationTokenExpiresAt: null },
      select: { id: true, email: true, name: true, role: true },
    });

    // Compte activé : on connecte directement l'utilisateur, pas besoin de
    // repasser par l'écran de login juste après avoir cliqué le lien.
    const jwtToken = jwt.sign({ userId: updated.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'] });
    res.json({ user: updated, token: jwtToken });
  },

  // POST /api/auth/resend-verification
  resendVerification: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email } = resendVerificationSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    // Réponse identique que le compte existe ou non, pour ne pas permettre
    // à un tiers de deviner quels emails sont inscrits (énumération de comptes).
    if (user && !user.emailVerified) {
      const { verificationToken, verificationTokenExpiresAt } = generateVerificationToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken, verificationTokenExpiresAt },
      });
      await sendVerificationEmail(user.email, user.name, verificationToken, req.language);
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
      const { resetToken, resetTokenExpiresAt } = generateResetToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiresAt },
      });
      await sendResetPasswordEmail(user.email, user.name, resetToken, req.language);
    }

    res.json({ message: req.t('auth.passwordResetEmailSent') });
  },

  // POST /api/auth/reset-password
  resetPassword: async (req: AuthRequest, res: Response): Promise<void> => {
    const { token, password } = resetPasswordSchema(req.t).parse(req.body);

    const user = await prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      throw new ValidationError(req.t('errors.invalidOrExpiredResetToken'));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, resetToken: null, resetTokenExpiresAt: null },
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
        profile: true,
      },
    });

    if (!user) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.user') }));
    res.json(user);
  },
};
