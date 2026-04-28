import api from './client';
import { User } from './types';

export async function login(username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/login', { username, password });
  return res.data;
}
