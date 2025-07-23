import { AuthService } from '../auth';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    authService = new AuthService();
    (authService as any).prisma = mockPrisma;
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const hashedPassword = 'hashed_password';
      const mockUser = {
        id: 'user-id',
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        isEmailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await authService.register(userData);

      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: userData.email },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userData.email,
          passwordHash: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw error if user already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const existingUser = {
        id: 'existing-user-id',
        email: userData.email,
        firstName: 'Existing',
        lastName: 'User',
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser as any);

      await expect(authService.register(userData)).rejects.toThrow(
        'User with this email already exists'
      );

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during registration', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockRejectedValue(new Error('Database error'));

      await expect(authService.register(userData)).rejects.toThrow('Database error');
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 'user-id',
        email: credentials.email,
        passwordHash: 'hashed_password',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
      };

      const mockTokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(authService, 'generateTokens').mockResolvedValue(mockTokens);

      const result = await authService.login(credentials);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: credentials.email },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        credentials.password,
        mockUser.passwordHash
      );
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          isEmailVerified: mockUser.isEmailVerified,
        },
        tokens: mockTokens,
      });
    });

    it('should throw error for non-existent user', async () => {
      const credentials = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.login(credentials)).rejects.toThrow(
        'Invalid email or password'
      );

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw error for invalid password', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const mockUser = {
        id: 'user-id',
        email: credentials.email,
        passwordHash: 'hashed_password',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(credentials)).rejects.toThrow(
        'Invalid email or password'
      );
    });

    it('should throw error for unverified email', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 'user-id',
        email: credentials.email,
        passwordHash: 'hashed_password',
        firstName: 'Test',
        lastName: 'User',
        isEmailVerified: false,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(authService.login(credentials)).rejects.toThrow(
        'Please verify your email before logging in'
      );
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      const userId = 'user-id';
      const accessToken = 'access_token';
      const refreshToken = 'refresh_token';

      (jwt.sign as jest.Mock)
        .mockReturnValueOnce(accessToken)
        .mockReturnValueOnce(refreshToken);

      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'token-id',
        token: refreshToken,
        userId,
        expiresAt: new Date(),
        createdAt: new Date(),
      } as any);

      const result = await authService.generateTokens(userId);

      expect(jwt.sign).toHaveBeenCalledTimes(2);
      expect(jwt.sign).toHaveBeenNthCalledWith(
        1,
        { userId, type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      expect(jwt.sign).toHaveBeenNthCalledWith(
        2,
        { userId, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken,
        refreshToken,
      });
    });

    it('should handle token generation errors', async () => {
      const userId = 'user-id';

      (jwt.sign as jest.Mock).mockImplementation(() => {
        throw new Error('Token generation failed');
      });

      await expect(authService.generateTokens(userId)).rejects.toThrow(
        'Token generation failed'
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify valid access token', async () => {
      const token = 'valid_access_token';
      const payload = {
        userId: 'user-id',
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      };

      (jwt.verify as jest.Mock).mockReturnValue(payload);

      const result = await authService.verifyToken(token);

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(result).toEqual(payload);
    });

    it('should throw error for invalid token', async () => {
      const token = 'invalid_token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyToken(token)).rejects.toThrow('Invalid token');
    });

    it('should throw error for expired token', async () => {
      const token = 'expired_token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        const error = new Error('Token expired');
        (error as any).name = 'TokenExpiredError';
        throw error;
      });

      await expect(authService.verifyToken(token)).rejects.toThrow('Token expired');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const refreshToken = 'valid_refresh_token';
      const userId = 'user-id';
      const newTokens = {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
      };

      const mockRefreshToken = {
        id: 'token-id',
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
      };

      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken as any);
      mockPrisma.refreshToken.update.mockResolvedValue(mockRefreshToken as any);
      jest.spyOn(authService, 'generateTokens').mockResolvedValue(newTokens);

      const result = await authService.refreshTokens(refreshToken);

      expect(mockPrisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: refreshToken },
      });
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockRefreshToken.id },
        data: { isRevoked: true },
      });
      expect(result).toEqual(newTokens);
    });

    it('should throw error for invalid refresh token', async () => {
      const refreshToken = 'invalid_refresh_token';

      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(
        'Invalid refresh token'
      );
    });

    it('should throw error for expired refresh token', async () => {
      const refreshToken = 'expired_refresh_token';
      const mockRefreshToken = {
        id: 'token-id',
        token: refreshToken,
        userId: 'user-id',
        expiresAt: new Date(Date.now() - 1000), // Expired
        isRevoked: false,
      };

      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken as any);

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(
        'Refresh token expired'
      );
    });

    it('should throw error for revoked refresh token', async () => {
      const refreshToken = 'revoked_refresh_token';
      const mockRefreshToken = {
        id: 'token-id',
        token: refreshToken,
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: true,
      };

      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken as any);

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(
        'Refresh token revoked'
      );
    });
  });

  describe('logout', () => {
    it('should revoke refresh token on logout', async () => {
      const refreshToken = 'valid_refresh_token';
      const mockRefreshToken = {
        id: 'token-id',
        token: refreshToken,
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
      };

      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken as any);
      mockPrisma.refreshToken.update.mockResolvedValue({
        ...mockRefreshToken,
        isRevoked: true,
      } as any);

      await authService.logout(refreshToken);

      expect(mockPrisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: refreshToken },
      });
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: mockRefreshToken.id },
        data: { isRevoked: true },
      });
    });

    it('should handle logout with invalid refresh token', async () => {
      const refreshToken = 'invalid_refresh_token';

      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      // Should not throw error, just silently handle
      await expect(authService.logout(refreshToken)).resolves.not.toThrow();
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const userId = 'user-id';
      const oldPassword = 'oldpassword';
      const newPassword = 'newpassword';
      const newHashedPassword = 'new_hashed_password';

      const mockUser = {
        id: userId,
        passwordHash: 'old_hashed_password',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue(newHashedPassword);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        passwordHash: newHashedPassword,
      } as any);

      await authService.changePassword(userId, oldPassword, newPassword);

      expect(bcrypt.compare).toHaveBeenCalledWith(oldPassword, mockUser.passwordHash);
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: newHashedPassword },
      });
    });

    it('should throw error for incorrect old password', async () => {
      const userId = 'user-id';
      const oldPassword = 'wrongpassword';
      const newPassword = 'newpassword';

      const mockUser = {
        id: userId,
        passwordHash: 'old_hashed_password',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.changePassword(userId, oldPassword, newPassword)
      ).rejects.toThrow('Current password is incorrect');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should throw error for non-existent user', async () => {
      const userId = 'non-existent-user';
      const oldPassword = 'oldpassword';
      const newPassword = 'newpassword';

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.changePassword(userId, oldPassword, newPassword)
      ).rejects.toThrow('User not found');
    });
  });

  describe('resetPassword', () => {
    it('should generate password reset token', async () => {
      const email = 'test@example.com';
      const mockUser = {
        id: 'user-id',
        email,
      };

      const resetToken = 'reset_token';

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      (jwt.sign as jest.Mock).mockReturnValue(resetToken);
      mockPrisma.passwordResetToken.create.mockResolvedValue({
        id: 'reset-token-id',
        token: resetToken,
        userId: mockUser.id,
        expiresAt: new Date(),
        createdAt: new Date(),
      } as any);

      const result = await authService.resetPassword(email);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: mockUser.id, type: 'password_reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      expect(result).toBe(resetToken);
    });

    it('should throw error for non-existent user', async () => {
      const email = 'nonexistent@example.com';

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.resetPassword(email)).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('confirmPasswordReset', () => {
    it('should reset password with valid token', async () => {
      const token = 'valid_reset_token';
      const newPassword = 'newpassword';
      const hashedPassword = 'hashed_new_password';
      const userId = 'user-id';

      const mockResetToken = {
        id: 'reset-token-id',
        token,
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isUsed: false,
      };

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(mockResetToken as any);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      mockPrisma.user.update.mockResolvedValue({} as any);
      mockPrisma.passwordResetToken.update.mockResolvedValue({
        ...mockResetToken,
        isUsed: true,
      } as any);

      await authService.confirmPasswordReset(token, newPassword);

      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: hashedPassword },
      });
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: mockResetToken.id },
        data: { isUsed: true },
      });
    });

    it('should throw error for invalid reset token', async () => {
      const token = 'invalid_reset_token';
      const newPassword = 'newpassword';

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        authService.confirmPasswordReset(token, newPassword)
      ).rejects.toThrow('Invalid or expired reset token');
    });

    it('should throw error for expired reset token', async () => {
      const token = 'expired_reset_token';
      const newPassword = 'newpassword';

      const mockResetToken = {
        id: 'reset-token-id',
        token,
        userId: 'user-id',
        expiresAt: new Date(Date.now() - 1000), // Expired
        isUsed: false,
      };

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(mockResetToken as any);

      await expect(
        authService.confirmPasswordReset(token, newPassword)
      ).rejects.toThrow('Invalid or expired reset token');
    });

    it('should throw error for already used reset token', async () => {
      const token = 'used_reset_token';
      const newPassword = 'newpassword';

      const mockResetToken = {
        id: 'reset-token-id',
        token,
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isUsed: true,
      };

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(mockResetToken as any);

      await expect(
        authService.confirmPasswordReset(token, newPassword)
      ).rejects.toThrow('Invalid or expired reset token');
    });
  });
});