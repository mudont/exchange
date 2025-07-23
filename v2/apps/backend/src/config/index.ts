import { z } from 'zod';

const configSchema = z.object({
  // Server
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.number().default(3001),
  frontendUrl: z.string().default('http://localhost:3000'),
  apiUrl: z.string().default('http://localhost:3001'),

  // Database
  databaseUrl: z.string(),

  // Redis
  redisUrl: z.string().default('redis://localhost:6379'),

  // JWT
  jwtSecret: z.string(),
  jwtExpiresIn: z.string().default('7d'),

  // Email
  smtp: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(1025),
    user: z.string().default(''),
    pass: z.string().default(''),
    from: z.string().default('noreply@tradingexchange.com'),
  }),

  // OAuth
  google: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
  }),
  facebook: z.object({
    appId: z.string().optional(),
    appSecret: z.string().optional(),
  }),

  // Rate Limiting
  rateLimit: z.object({
    max: z.number().default(100),
    windowMs: z.number().default(60000),
  }),
});

const env = {
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
  frontendUrl: process.env.FRONTEND_URL,
  apiUrl: process.env.API_URL,
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID,
    appSecret: process.env.FACEBOOK_APP_SECRET,
  },
  rateLimit: {
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : undefined,
    windowMs: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) : undefined,
  },
};

export const config = configSchema.parse(env);