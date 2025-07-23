import { requireAuth, optionalAuth } from '../auth';
import { AuthService } from '../../services/auth';
import { createMockRequest, createMockReply } from '../../__tests__/test-utils';

// Mock AuthService
jest.mock('../../services/auth');

describe('Auth Middleware', () => {
  let mockAuthService: jest.Mocked<AuthService>;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockAuthService = new AuthService() as jest.Mocked<AuthService>;
    (AuthService as jest.Mock).mockImplementation(() => mockAuthService);
    
    mockRequest = createMockRequest();
    mockReply = createMockReply();
  });

  describe('requireAuth', () => {
    it('should authenticate user with valid token', async () => {
      const token = 'valid.jwt.token';
      const payload = { userId: 'user-123', type: 'access' };
      
      mockRequest.headers.authorization = `Bearer ${token}`;
      mockAuthService.verifyToken.mockResolvedValue(payload);

      await requireAuth(mockRequest, mockReply);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRequest.user).toEqual({ id: 'user-123' });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      await requireAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization token required',
        },
      });
    });

    it('should reject request with invalid token format', async () => {
      mockRequest.headers.authorization = 'InvalidFormat token';

      await requireAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization token required',
        },
      });
    });

    it('should reject request with invalid token', async () => {
      const token = 'invalid.jwt.token';
      
      mockRequest.headers.authorization = `Bearer ${token}`;
      mockAuthService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      await requireAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
        },
      });
    });

    it('should reject request with expired token', async () => {
      const token = 'expired.jwt.token';
      const error = new Error('Token expired');
      (error as any).name = 'TokenExpiredError';
      
      mockRequest.headers.authorization = `Bearer ${token}`;
      mockAuthService.verifyToken.mockRejectedValue(error);

      await requireAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired',
        },
      });
    });

    it('should reject non-access token types', async () => {
      const token = 'refresh.jwt.token';
      const payload = { userId: 'user-123', type: 'refresh' };
      
      mockRequest.headers.authorization = `Bearer ${token}`;
      mockAuthService.verifyToken.mockResolvedValue(payload);

      await requireAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN_TYPE',
          message: 'Invalid token type',
        },
      });
    });
  });

  describe('optionalAuth', () => {
    it('should authenticate user with valid token', async () => {
      const token = 'valid.jwt.token';
      const payload = { userId: 'user-123', type: 'access' };
      
      mockRequest.headers.authorization = `Bearer ${token}`;
      mockAuthService.verifyToken.mockResolvedValue(payload);

      await optionalAuth(mockRequest, mockReply);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRequest.user).toEqual({ id: 'user-123' });
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should continue without authentication when no token provided', async () => {
      await optionalAuth(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should continue without authentication when token is invalid', async () => {
      const token = 'invalid.jwt.token';
      
      mockRequest.headers.authorization = `Bearer ${token}`;
      mockAuthService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      await optionalAuth(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should handle malformed authorization header gracefully', async () => {
      mockRequest.headers.authorization = 'Malformed';

      await optionalAuth(mockRequest, mockReply);

      expect(mockRequest.user).toBeUndefined();
      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle missing headers object', async () => {
      mockRequest.headers = undefined;

      await requireAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle empty authorization header', async () => {
      mockRequest.headers.authorization = '';

      await requireAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle authorization header with only Bearer', async () => {
      mockRequest.headers.authorization = 'Bearer';

      await requireAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should handle authorization header with extra spaces', async () => {
      const token = 'valid.jwt.token';
      const payload = { userId: 'user-123', type: 'access' };
      
      mockRequest.headers.authorization = `Bearer   ${token}   `;
      mockAuthService.verifyToken.mockResolvedValue(payload);

      await requireAuth(mockRequest, mockReply);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRequest.user).toEqual({ id: 'user-123' });
    });

    it('should handle case-insensitive Bearer keyword', async () => {
      const token = 'valid.jwt.token';
      const payload = { userId: 'user-123', type: 'access' };
      
      mockRequest.headers.authorization = `bearer ${token}`;
      mockAuthService.verifyToken.mockResolvedValue(payload);

      await requireAuth(mockRequest, mockReply);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRequest.user).toEqual({ id: 'user-123' });
    });
  });
});