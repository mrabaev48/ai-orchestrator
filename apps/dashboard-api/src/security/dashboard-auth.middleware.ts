import { timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import type { DashboardApiConfig } from '../config/dashboard-config.ts';
import { verifyHs256Jwt } from './jwt.ts';

export function createDashboardAuthMiddleware(config: DashboardApiConfig) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.method === 'OPTIONS') {
      next();
      return;
    }
    const apiKey = readHeader(request, 'x-api-key');
    if (apiKey) {
      const match = config.security.apiKeys.find((entry) => timingSafeEqualString(entry.key, apiKey));
      if (!match) {
        response.status(401).json({ message: 'Authentication failed' });
        return;
      }

      if (!match.roles.includes('dashboard.read')) {
        response.status(403).json({ message: 'Insufficient role for endpoint' });
        return;
      }

      next();
      return;
    }

    const authorization = readHeader(request, 'authorization');
    if (!authorization || !config.security.jwtSecret) {
      response.status(401).json({ message: 'Authentication required' });
      return;
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      response.status(401).json({ message: 'Authentication failed' });
      return;
    }

    const jwtOptions = {
      ...(config.security.jwtIssuer ? { issuer: config.security.jwtIssuer } : {}),
      ...(config.security.jwtAudience ? { audience: config.security.jwtAudience } : {}),
    };
    const verified = verifyHs256Jwt(token, config.security.jwtSecret, jwtOptions);

    if (!verified) {
      response.status(401).json({ message: 'Authentication failed' });
      return;
    }

    if (!verified.roles.includes('dashboard.read')) {
      response.status(403).json({ message: 'Insufficient role for endpoint' });
      return;
    }

    delete request.headers.authorization;
    next();
  };
}

function readHeader(request: Request, key: string): string | undefined {
  const value = request.header(key);
  return typeof value === 'string' ? value : undefined;
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
