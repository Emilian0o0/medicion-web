import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, saved) {
  const [algorithm, salt, value] = String(saved).split(':');
  if (algorithm !== 'scrypt' || !salt || !value) return false;
  const hash = await scrypt(password, salt, 64);
  const expected = Buffer.from(value, 'hex');
  return expected.length === hash.length && timingSafeEqual(hash, expected);
}
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export const pageFor = (role) =>
  role === 'supervisor' ? '/usuariosupervisor.html' : '/usuarioempleado.html';
export function passwordValid(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}
