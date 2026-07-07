// Déclaration minimale : le paquet ne publie pas de types.
declare module 'express-xss-sanitizer' {
  import { RequestHandler } from 'express';
  export function xss(options?: Record<string, unknown>): RequestHandler;
}
