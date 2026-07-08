// src/lib/resend.ts
// Envoi de l'email de confirmation d'inscription via Resend.
import { Resend } from 'resend';
import { config } from '../config.js';
import { logger } from './logger.js';

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

function buildVerifyUrl(token: string): string {
  return `${config.appUrl}/verify-email?token=${token}`;
}

function buildEmail(name: string, verifyUrl: string, lang: string): { subject: string; html: string } {
  const isEn = lang?.startsWith('en');

  const subject = isEn ? 'Confirm your ThyroTrack account' : 'Confirmez votre compte ThyroTrack';

  const title = isEn ? 'Welcome to ThyroTrack' : 'Bienvenue sur ThyroTrack';
  const greeting = isEn ? `Hi ${name},` : `Bonjour ${name},`;
  const body = isEn
    ? 'Confirm your email address to activate your account and start tracking your thyroid health.'
    : 'Confirmez votre adresse email pour activer votre compte et commencer à suivre votre santé thyroïdienne.';
  const cta = isEn ? 'Confirm my email' : 'Confirmer mon email';
  const expiry = isEn
    ? 'This link expires in 24 hours.'
    : 'Ce lien expire dans 24 heures.';
  const fallback = isEn
    ? "If the button doesn't work, copy this link into your browser:"
    : "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :";

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 20px; margin-bottom: 4px;">${title}</h1>
      <p>${greeting}</p>
      <p>${body}</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${verifyUrl}" style="background: #7b61ff; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
          ${cta}
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">${expiry}</p>
      <p style="font-size: 13px; color: #666;">${fallback}<br /><a href="${verifyUrl}">${verifyUrl}</a></p>
    </div>
  `;

  return { subject, html };
}

export async function sendVerificationEmail(to: string, name: string, token: string, lang: string): Promise<void> {
  const verifyUrl = buildVerifyUrl(token);
  const { subject, html } = buildEmail(name, verifyUrl, lang);

  if (!resend) {
    logger.warn('RESEND_API_KEY manquant : email de vérification non envoyé', { to, verifyUrl });
    return;
  }

  const { error } = await resend.emails.send({
    from: config.resendFromEmail,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error("Échec de l'envoi de l'email de vérification via Resend", error);
  }
}

function buildResetUrl(token: string): string {
  return `${config.appUrl}/reset-password?token=${token}`;
}

function buildResetEmail(name: string, resetUrl: string, lang: string): { subject: string; html: string } {
  const isEn = lang?.startsWith('en');

  const subject = isEn ? 'Reset your ThyroTrack password' : 'Réinitialisez votre mot de passe ThyroTrack';

  const title = isEn ? 'Password reset' : 'Réinitialisation du mot de passe';
  const greeting = isEn ? `Hi ${name},` : `Bonjour ${name},`;
  const body = isEn
    ? "We received a request to reset your password. If you didn't make this request, you can safely ignore this email."
    : "Nous avons reçu une demande de réinitialisation de votre mot de passe. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.";
  const cta = isEn ? 'Reset my password' : 'Réinitialiser mon mot de passe';
  const expiry = isEn
    ? 'This link expires in 1 hour.'
    : 'Ce lien expire dans 1 heure.';
  const fallback = isEn
    ? "If the button doesn't work, copy this link into your browser:"
    : "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :";

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h1 style="font-size: 20px; margin-bottom: 4px;">${title}</h1>
      <p>${greeting}</p>
      <p>${body}</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background: #7b61ff; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
          ${cta}
        </a>
      </p>
      <p style="font-size: 13px; color: #666;">${expiry}</p>
      <p style="font-size: 13px; color: #666;">${fallback}<br /><a href="${resetUrl}">${resetUrl}</a></p>
    </div>
  `;

  return { subject, html };
}

export async function sendResetPasswordEmail(to: string, name: string, token: string, lang: string): Promise<void> {
  const resetUrl = buildResetUrl(token);
  const { subject, html } = buildResetEmail(name, resetUrl, lang);

  if (!resend) {
    logger.warn('RESEND_API_KEY manquant : email de réinitialisation non envoyé', { to, resetUrl });
    return;
  }

  const { error } = await resend.emails.send({
    from: config.resendFromEmail,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error("Échec de l'envoi de l'email de réinitialisation via Resend", error);
  }
}
