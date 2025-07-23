import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { config } from '../config';
import { AuthService } from './auth';
import { logger } from '../utils/logger';
import { AuthProvider, OAuthProfile } from '@trading-exchange/shared';

export class OAuthService {
  private authService = new AuthService();

  constructor() {
    this.setupGoogleStrategy();
    this.setupFacebookStrategy();
  }

  private setupGoogleStrategy() {
    if (!config.google.clientId || !config.google.clientSecret) {
      logger.warn('Google OAuth not configured - missing client ID or secret');
      return;
    }

    passport.use(
      new GoogleStrategy(
        {
          clientID: config.google.clientId,
          clientSecret: config.google.clientSecret,
          callbackURL: `${config.apiUrl}/api/v1/auth/google/callback`,
          scope: ['profile', 'email'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const oauthProfile: OAuthProfile = {
              id: profile.id,
              email: profile.emails?.[0]?.value || '',
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
              avatar: profile.photos?.[0]?.value,
              provider: AuthProvider.GOOGLE,
            };

            const authResult = await this.authService.loginWithOAuth(oauthProfile);
            return done(null, authResult);
          } catch (error) {
            logger.error('Google OAuth error:', error);
            return done(error, null);
          }
        }
      )
    );

    logger.info('Google OAuth strategy configured');
  }

  private setupFacebookStrategy() {
    if (!config.facebook.appId || !config.facebook.appSecret) {
      logger.warn('Facebook OAuth not configured - missing app ID or secret');
      return;
    }

    passport.use(
      new FacebookStrategy(
        {
          clientID: config.facebook.appId,
          clientSecret: config.facebook.appSecret,
          callbackURL: `${config.apiUrl}/api/v1/auth/facebook/callback`,
          profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const oauthProfile: OAuthProfile = {
              id: profile.id,
              email: profile.emails?.[0]?.value || '',
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
              avatar: profile.photos?.[0]?.value,
              provider: AuthProvider.FACEBOOK,
            };

            const authResult = await this.authService.loginWithOAuth(oauthProfile);
            return done(null, authResult);
          } catch (error) {
            logger.error('Facebook OAuth error:', error);
            return done(error, null);
          }
        }
      )
    );

    logger.info('Facebook OAuth strategy configured');
  }

  // Serialize user for session (not used in JWT setup, but required by passport)
  setupSerialization() {
    passport.serializeUser((user: any, done) => {
      done(null, user);
    });

    passport.deserializeUser((user: any, done) => {
      done(null, user);
    });
  }

  getPassportInstance() {
    return passport;
  }
}