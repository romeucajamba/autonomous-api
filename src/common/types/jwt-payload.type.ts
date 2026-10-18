import { Role } from '../../generated/prisma/client.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  profileId?: string;
  name?: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: string;
}
