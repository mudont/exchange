import { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth';
import { OAuthService } from '../services/oauth';
import { AppError } from '../middleware/error';
import {
  LoginSchema,
  RegisterSchema,
  VerifyEmailSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ErrorCode,
  HttpStatus,
} from '@trading-exchange/shared';

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService();
  const oauthService = new OAuthService();
  const passport = oauthService.getPassportInstance();

  // Register
  fastify.post('/register', {
    schema: {
      body: RegisterSchema,
    },
  }, async (request, reply) => {
    const result = await authService.register(request.body);
    
    return reply.status(HttpStatus.CREATED).send({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  });

  // Login
  fastify.post('/login', {
    schema: {
      body: LoginSchema,
    },
  }, async (request, reply) => {
    const result = await authService.login(request.body);
    
    return reply.send({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  });

  // Verify email
  fastify.post('/verify-email', {
    schema: {
      body: VerifyEmailSchema,
    },
  }, async (request, reply) => {
    await authService.verifyEmail(request.body.token);
    
    return reply.send({
      success: true,
      data: { message: 'Email verified successfully' },
      timestamp: new Date().toISOString(),
    });
  });

  // Forgot password
  fastify.post('/forgot-password', {
    schema: {
      body: ForgotPasswordSchema,
    },
  }, async (request, reply) => {
    await authService.requestPasswordReset(request.body.email);
    
    return reply.send({
      success: true,
      data: { message: 'Password reset email sent if account exists' },
      timestamp: new Date().toISOString(),
    });
  });

  // Reset password
  fastify.post('/reset-password', {
    schema: {
      body: ResetPasswordSchema,
    },
  }, async (request, reply) => {
    await authService.resetPassword(request.body.token, request.body.password);
    
    return reply.send({
      success: true,
      data: { message: 'Password reset successfully' },
      timestamp: new Date().toISOString(),
    });
  });

  // Get current user (protected route)
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    return reply.send({
      success: true,
      data: { user: request.user },
      timestamp: new Date().toISOString(),
    });
  });

  // Logout (protected route)
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    // TODO: Invalidate refresh token
    
    return reply.send({
      success: true,
      data: { message: 'Logged out successfully' },
      timestamp: new Date().toISOString(),
    });
  });

  // Refresh token
  fastify.post('/refresh', async (request, reply) => {
    // TODO: Implement refresh token logic
    throw new AppError(
      ErrorCode.SERVICE_UNAVAILABLE,
      'Refresh token endpoint not yet implemented',
      HttpStatus.SERVICE_UNAVAILABLE
    );
  });

  // Google OAuth routes
  fastify.get('/google', async (request, reply) => {
    return new Promise((resolve, reject) => {
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
      })(request.raw, reply.raw, (err: any) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
  });

  fastify.get('/google/callback', async (request, reply) => {
    return new Promise((resolve, reject) => {
      passport.authenticate('google', {
        session: false,
      }, (err: any, authResult: any) => {
        if (err) {
          return reply.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_error`);
        }
        
        if (!authResult) {
          return reply.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_cancelled`);
        }

        // Redirect to frontend with token
        const token = authResult.token;
        return reply.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
      })(request.raw, reply.raw, (err: any) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
  });

  // Facebook OAuth routes
  fastify.get('/facebook', async (request, reply) => {
    return new Promise((resolve, reject) => {
      passport.authenticate('facebook', {
        scope: ['email'],
        session: false,
      })(request.raw, reply.raw, (err: any) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
  });

  fastify.get('/facebook/callback', async (request, reply) => {
    return new Promise((resolve, reject) => {
      passport.authenticate('facebook', {
        session: false,
      }, (err: any, authResult: any) => {
        if (err) {
          return reply.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_error`);
        }
        
        if (!authResult) {
          return reply.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_cancelled`);
        }

        // Redirect to frontend with token
        const token = authResult.token;
        return reply.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
      })(request.raw, reply.raw, (err: any) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
  });
}