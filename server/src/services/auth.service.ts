import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { JwtPayload } from '../types';

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  const payload: JwtPayload = { userId: user.id, username: user.username, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '24h' });

  return { token, user: { id: user.id, username: user.username, role: user.role } };
}
