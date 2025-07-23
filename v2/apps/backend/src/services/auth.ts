import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { prisma } from '../database';
import { logger } from '../utils/logger';
import { config } from '../config';
import { AppError } from '../middleware/error';
import { EmailService } from './email';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';
import type {
  User,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  OAuthProfile,
} from '@trading-exchange/shared';

export class AuthService {
  private readonly saltRounds = 12;
  private readonly tokenExpiryHours = 24;
  private readonly emailService = new EmailService();

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const { email, password, firstName, lastName } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError(
        ErrorCode.EMAIL_ALREADY_EXISTS,
        'An account with this email already exists',
        HttpStatus.CONFLICT
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    // Create user with profile
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: {
          create: {
            firstName,
            lastName,
          },
        },
        authProviders: {
          create: {
            provider: 'local',
            providerId: email,
          },
        },
      },
      include: {
        profile: true,
        authProviders: true,
      },
    });

    // Send verification email
    await this.sendVerificationEmail(user.email);

    logger.info('User registered successfully', { userId: user.id, email });

    // Generate tokens
    const { token, refreshToken } = await this.generateTokens(user.id);

    return {
      user: this.formatUser(user),
      token,
      refreshToken,
      expiresIn: this.getTokenExpirySeconds(),
    };
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const { email, password } = data;

    // Find user with auth provider
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
        authProviders: {
          where: { provider: 'local' },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw new AppError(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED
      );
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw new AppError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Please verify your email before logging in',
        HttpStatus.FORBIDDEN
      );
    }

    logger.info('User logged in successfully', { userId: user.id, email });

    // Generate tokens
    const { token, refreshToken } = await this.generateTokens(user.id);

    return {
      user: this.formatUser(user),
      token,
      refreshToken,
      expiresIn: this.getTokenExpirySeconds(),
    };
  }

  async loginWithOAuth(profile: OAuthProfile): Promise<AuthResponse> {
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: profile.email },
          {
            authProviders: {
              some: {
                provider: profile.provider,
                providerId: profile.id,
              },
            },
          },
        ],
      },
      include: {
        profile: true,
        authProviders: true,
      },
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: profile.email,
          emailVerified: true, // OAuth emails are pre-verified
          profile: {
            create: {
              firstName: profile.firstName,
              lastName: profile.lastName,
              avatar: profile.avatar,
            },
          },
          authProviders: {
            create: {
              provider: profile.provider,
              providerId: profile.id,
              profile: profile,
            },
          },
        },
        include: {
          profile: true,
          authProviders: true,
        },
      });

      logger.info('User created via OAuth', { userId: user.id, provider: profile.provider });
    } else {
      // Update existing user's OAuth provider if not already linked
      const existingProvider = user.authProviders.find(
        p => p.provider === profile.provider && p.providerId === profile.id
      );

      if (!existingProvider) {
        await prisma.authProvider.create({
          data: {
            userId: user.id,
            provider: profile.provider,
            providerId: profile.id,
            profile: profile,
          },
        });
      }

      logger.info('User logged in via OAuth', { userId: user.id, provider: profile.provider });
    }

    // Generate tokens
    const { token, refreshToken } = await this.generateTokens(user.id);

    return {
      user: this.formatUser(user),
      token,
      refreshToken,
      expiresIn: this.getTokenExpirySeconds(),
    };
  }

  async verifyEmail(token: string): Promise<void> {
    const verification = await prisma.emailVerification.findUnique({
      where: { token },
    });

    if (!verification || verification.expiresAt < new Date()) {
      throw new AppError(
        ErrorCode.INVALID_TOKEN,
        'Invalid or expired verification token',
        HttpStatus.BAD_REQUEST
      );
    }

    // Update user email verification status
    await prisma.user.update({
      where: { email: verification.email },
      data: { emailVerified: true },
    });

    // Delete verification token
    await prisma.emailVerification.delete({
      where: { token },
    });

    logger.info('Email verified successfully', { email: verification.email });
  }

  async sendVerificationEmail(email: string): Promise<void> {
    // Generate verification token
    const token = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + this.tokenExpiryHours * 60 * 60 * 1000);

    // Store verification token
    await prisma.emailVerification.upsert({
      where: { email },
      update: { token, expiresAt },
      create: { email, token, expiresAt },
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(email, token);
    
    logger.info('Verification email sent', { email });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists
      logger.warn('Password reset requested for non-existent email', { email });
      return;
    }

    // Generate reset token
    const token = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + this.tokenExpiryHours * 60 * 60 * 1000);

    // Store reset token
    await prisma.passwordReset.create({
      data: { email, token, expiresAt },
    });

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(email, token);
    
    logger.info('Password reset email sent', { email });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const reset = await prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!reset || reset.used || reset.expiresAt < new Date()) {
      throw new AppError(
        ErrorCode.INVALID_TOKEN,
        'Invalid or expired reset token',
        HttpStatus.BAD_REQUEST
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);

    // Update user password
    await prisma.user.update({
      where: { email: reset.email },
      data: { passwordHash },
    });

    // Mark reset token as used
    await prisma.passwordReset.update({
      where: { token },
      data: { used: true },
    });

    logger.info('Password reset successfully', { email: reset.email });
  }

  private async generateTokens(userId: string) {
    const payload = { userId };
    
    // Generate access token
    const token = await this.signJWT(payload);
    
    // Generate refresh token (longer expiry)
    const refreshToken = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Store refresh token
    await prisma.userSession.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
      },
    });

    return { token, refreshToken };
  }

  private async signJWT(payload: any): Promise<string> {
    // This would normally use fastify.jwt.sign, but we need access to the fastify instance
    // For now, we'll implement a basic JWT signing
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  private getTokenExpirySeconds(): number {
    // Parse JWT expiry (e.g., "7d" -> seconds)
    const match = config.jwtExpiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60; // Default 7 days

    const [, value, unit] = match;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(value) * multipliers[unit as keyof typeof multipliers];
  }

  private formatUser(user: any): User {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile,
      authProviders: user.authProviders,
    };
  }
}