import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  setupIntegrationTests,
  teardownIntegrationTests,
  cleanupTestData,
  seedTestData,
  createAuthenticatedRequest,
} from './setup';

describe('Authentication Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await setupIntegrationTests());
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@test.com',
        password: 'SecurePassword123!',
        firstName: 'New',
        lastName: 'User',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: userData,
      });

      expect(response.statusCode).toBe(201);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(userData.email);
      expect(body.data.user.firstName).toBe(userData.firstName);
      expect(body.data.user.lastName).toBe(userData.lastName);
      expect(body.data.user.isEmailVerified).toBe(false);
      expect(body.data.user.id).toBeDefined();

      // Verify user was created in database
      const dbUser = await prisma.user.findUnique({
        where: { email: userData.email },
      });
      expect(dbUser).toBeTruthy();
      expect(dbUser?.email).toBe(userData.email);
    });

    it('should reject registration with existing email', async () => {
      const userData = {
        email: 'existing@test.com',
        password: 'SecurePassword123!',
        firstName: 'Existing',
        lastName: 'User',
      };

      // Create user first
      await prisma.user.create({
        data: {
          email: userData.email,
          passwordHash: 'hashed_password',
          firstName: userData.firstName,
          lastName: userData.lastName,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: userData,
      });

      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('USER_EXISTS');
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid-email',
          // Missing password, firstName, lastName
        },
      });

      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate password strength', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: '123', // Weak password
          firstName: 'Test',
          lastName: 'User',
        },
      });

      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await seedTestData();
    });

    it('should login with valid credentials', async () => {
      const credentials = {
        email: 'trader1@test.com',
        password: 'password123',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: credentials,
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(credentials.email);
      expect(body.data.tokens.accessToken).toBeDefined();
      expect(body.data.tokens.refreshToken).toBeDefined();

      // Verify refresh token was stored in database
      const refreshToken = await prisma.refreshToken.findFirst({
        where: { token: body.data.tokens.refreshToken },
      });
      expect(refreshToken).toBeTruthy();
    });

    it('should reject login with invalid email', async () => {
      const credentials = {
        email: 'nonexistent@test.com',
        password: 'password123',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: credentials,
      });

      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with invalid password', async () => {
      const credentials = {
        email: 'trader1@test.com',
        password: 'wrongpassword',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: credentials,
      });

      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for unverified email', async () => {
      // Create unverified user
      await prisma.user.create({
        data: {
          email: 'unverified@test.com',
          passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G',
          firstName: 'Unverified',
          lastName: 'User',
          isEmailVerified: false,
        },
      });

      const credentials = {
        email: 'unverified@test.com',
        password: 'password123',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: credentials,
      });

      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      const { users } = await seedTestData();
      userId = users[0].id;

      // Create a refresh token
      const jwt = require('jsonwebtoken');
      refreshToken = jwt.sign(
        { userId, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });

    it('should refresh tokens with valid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.tokens.accessToken).toBeDefined();
      expect(body.data.tokens.refreshToken).toBeDefined();
      expect(body.data.tokens.refreshToken).not.toBe(refreshToken); // Should be new token

      // Verify old refresh token was revoked
      const oldToken = await prisma.refreshToken.findFirst({
        where: { token: refreshToken },
      });
      expect(oldToken?.isRevoked).toBe(true);
    });

    it('should reject invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'invalid.refresh.token' },
      });

      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should reject expired refresh token', async () => {
      // Update token to be expired
      await prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const { users } = await seedTestData();
      const userId = users[0].id;

      // Login to get tokens
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'trader1@test.com',
          password: 'password123',
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      accessToken = loginBody.data.tokens.accessToken;
      refreshToken = loginBody.data.tokens.refreshToken;
    });

    it('should logout successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify refresh token was revoked
      const token = await prisma.refreshToken.findFirst({
        where: { token: refreshToken },
      });
      expect(token?.isRevoked).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      const { users } = await seedTestData();
      userId = users[0].id;

      // Login to get access token
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'trader1@test.com',
          password: 'password123',
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      accessToken = loginBody.data.tokens.accessToken;
    });

    it('should change password successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          currentPassword: 'password123',
          newPassword: 'NewSecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Verify can login with new password
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'trader1@test.com',
          password: 'NewSecurePassword123!',
        },
      });

      expect(loginResponse.statusCode).toBe(200);
    });

    it('should reject incorrect current password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: {
          currentPassword: 'wrongpassword',
          newPassword: 'NewSecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        payload: {
          currentPassword: 'password123',
          newPassword: 'NewSecurePassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Authentication middleware integration', () => {
    let accessToken: string;

    beforeEach(async () => {
      const { users } = await seedTestData();

      // Login to get access token
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'trader1@test.com',
          password: 'password123',
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      accessToken = loginBody.data.tokens.accessToken;
    });

    it('should allow access to protected routes with valid token', async () => {
      const authRequest = createAuthenticatedRequest(app, accessToken);
      
      const response = await authRequest.get('/api/v1/accounts/balance');
      
      expect(response.statusCode).toBe(200);
    });

    it('should reject access to protected routes without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts/balance',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject access with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts/balance',
        headers: {
          authorization: 'Bearer invalid.token.here',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject access with expired token', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: 'user-id', type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts/balance',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});