import { createHmac, timingSafeEqual } from 'node:crypto';

interface JwtHeader {
  alg?: string;
  typ?: string;
}

interface JwtPayload {
  sub?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  roles?: string[] | string;
}

export interface JwtVerificationOptions {
  issuer?: string;
  audience?: string;
}

export interface VerifiedJwt {
  subject: string;
  roles: string[];
}

export function verifyHs256Jwt(
  token: string,
  secret: string,
  options: JwtVerificationOptions,
): VerifiedJwt | null {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }

  const encodedHeader = segments[0];
  const encodedPayload = segments[1];
  const encodedSignature = segments[2];
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }

  const header = decodeJsonSegment(encodedHeader) as JwtHeader | null;
  const payload = decodeJsonSegment(encodedPayload) as JwtPayload | null;

  if (!header || !payload || header.alg !== 'HS256' || header.typ !== 'JWT') {
    return null;
  }

  const expected = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  const actual = decodeBase64Url(encodedSignature);
  if (actual?.length !== expected.length) {
    return null;
  }

  if (!timingSafeEqual(actual, expected)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.nbf === 'number' && now < payload.nbf) {
    return null;
  }
  if (typeof payload.exp === 'number' && now >= payload.exp) {
    return null;
  }

  if (options.issuer && payload.iss !== options.issuer) {
    return null;
  }

  if (options.audience && !audienceMatches(payload.aud, options.audience)) {
    return null;
  }

  const subject = typeof payload.sub === 'string' && payload.sub.trim().length > 0 ? payload.sub : null;
  if (!subject) {
    return null;
  }

  return {
    subject,
    roles: normalizeRoles(payload.roles),
  };
}

function audienceMatches(claim: string | string[] | undefined, expectedAudience: string): boolean {
  if (typeof claim === 'string') {
    return claim === expectedAudience;
  }

  return claim?.includes(expectedAudience) ?? false;
}

function normalizeRoles(claim: string[] | string | undefined): string[] {
  if (Array.isArray(claim)) {
    return claim.filter((role): role is string => typeof role === 'string' && role.trim().length > 0);
  }

  if (typeof claim === 'string' && claim.trim().length > 0) {
    return claim.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
  }

  return [];
}

function decodeJsonSegment(segment: string): unknown {
  const buffer = decodeBase64Url(segment);
  if (!buffer) {
    return null;
  }

  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Buffer | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}
