// src/controllers/auth.controller.ts
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config';
import { ConflictError, AuthenticationError, NotFoundError } from '../lib/errors';

const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe trop court (min 8 caractères)'),
  name: z.string().min(2, 'Nom trop court'),
  birthDate: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authController = {
  // POST /api/auth/register
  register: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email, password, name, birthDate } = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError('Cet email est déjà utilisé');

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        birthDate: birthDate ? new Date(birthDate) : null,
        profile: { create: {} },
        notifications: { create: {} },
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.status(201).json({ user, token });
  },

  // POST /api/auth/login
  login: async (req: AuthRequest, res: Response): Promise<void> => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AuthenticationError('Email ou mot de passe incorrect');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new AuthenticationError('Email ou mot de passe incorrect');

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  },

  // GET /api/auth/me
  me: async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        birthDate: true,
        createdAt: true,
        profile: true,
      },
    });

    if (!user) throw new NotFoundError('Utilisateur');
    res.json(user);
  },
};
