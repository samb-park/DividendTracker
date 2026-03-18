---
name: security-audit
description: Audit authentication, API security, broker API key storage, and OWASP compliance. Activates when reviewing auth flows, handling API credentials, implementing route protection, or checking for security vulnerabilities.
---

# Security Audit Skill

Security guidance for DividendTracker covering NextAuth sessions, API authentication, broker API key management, and OWASP top 10 compliance.

## When This Skill Activates

- Keywords: "security", "auth", "API key", "session", "OWASP", "vulnerability"
- Tasks: Adding new API routes, handling broker credentials, reviewing auth middleware
- Reviews: Any code that touches user data, tokens, or external API calls

## Authentication & Session Security

### NextAuth Configuration Checklist

```typescript
// auth.ts — critical settings
export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,   // REQUIRED: prevents XSS token theft
        sameSite: 'lax',  // CSRF protection
        secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
      },
    },
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.userId = user.id; // embed userId, not role/perms
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      return session;
    },
  },
};
```

### Route Protection Patterns

```typescript
// middleware.ts — protect all app routes
export { auth as middleware } from '@/auth';

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|public).*)'],
};

// Server component — always verify session server-side
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function ProtectedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  // ...
}

// API route — never trust client-provided userId
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  // Always use session.user.id, never req body/query userId
  const data = await prisma.holding.findMany({
    where: { userId: session.user.id }, // scoped to authenticated user
  });
}
```

## Broker API Key Storage

### Encryption at Rest

```typescript
// NEVER store broker API keys in plaintext
// Use AES-256-GCM encryption before DB storage

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptApiKey(ciphertext: string): string {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':');
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
}
```

### Environment Variable Requirements

```env
# .env — NEVER commit these
ENCRYPTION_KEY=<64-char hex string>  # openssl rand -hex 32
NEXTAUTH_SECRET=<random string>       # openssl rand -base64 32
DATABASE_URL=<connection string>

# Broker credentials stored encrypted in DB, not env
# Only the encryption key goes in env
```

## API Security

### Input Validation

```typescript
import { z } from 'zod';

const AddHoldingSchema = z.object({
  ticker: z.string().regex(/^[A-Z.]{1,10}$/), // whitelist chars
  shares: z.number().positive().max(1_000_000),
  costBasis: z.number().positive(),
  accountType: z.enum(['TFSA', 'RRSP', 'FHSA', 'CASH']),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const result = AddHoldingSchema.safeParse(body);
  if (!result.success) return Response.json({ error: result.error }, { status: 400 });

  // Use result.data (validated), never raw body
}
```

### Rate Limiting

```typescript
// Apply to broker sync and external API routes
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 req/min per user
});

const { success } = await ratelimit.limit(session.user.id);
if (!success) return new Response('Too Many Requests', { status: 429 });
```

## OWASP Top 10 Checklist for DividendTracker

| # | Risk | Check |
|---|------|-------|
| A01 | Broken Access Control | All queries scoped to `session.user.id`? |
| A02 | Cryptographic Failures | API keys encrypted? HTTPS enforced? Secure cookies? |
| A03 | Injection | All DB access via Prisma (parameterized)? Zod validation? |
| A05 | Security Misconfiguration | `NEXTAUTH_SECRET` set? Debug logs disabled in prod? |
| A06 | Vulnerable Components | `npm audit` clean? Dependencies up to date? |
| A07 | Auth Failures | Session verified server-side? No client-provided userId? |
| A09 | Logging Failures | Sensitive data (tokens, keys) excluded from logs? |

## Security Review Triggers

Flag for security review when:
- Adding any new API route that handles user financial data
- Changing session/JWT callback logic
- Storing or retrieving broker credentials
- Adding new environment variables
- Implementing any user input that reaches the database
