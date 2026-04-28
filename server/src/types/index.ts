export interface JwtPayload {
  userId: number;
  username: string;
  role: 'owner' | 'worker';
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
