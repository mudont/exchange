import { UUID, AuthProvider } from './common';

// User types
export interface User {
  id: UUID;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  profile?: UserProfile;
  authProviders: UserAuthProvider[];
}

export interface UserProfile {
  id: UUID;
  userId: UUID;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAuthProvider {
  id: UUID;
  userId: UUID;
  provider: AuthProvider;
  providerId: string;
  profile?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Authentication request/response types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// OAuth types
export interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  provider: AuthProvider;
}

export interface GoogleProfile extends OAuthProfile {
  provider: AuthProvider.GOOGLE;
  googleId: string;
}

export interface FacebookProfile extends OAuthProfile {
  provider: AuthProvider.FACEBOOK;
  facebookId: string;
}

// JWT payload
export interface JWTPayload {
  userId: UUID;
  email: string;
  iat: number;
  exp: number;
}

// Session types
export interface UserSession {
  id: UUID;
  userId: UUID;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}