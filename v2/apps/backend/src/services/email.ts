import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user && config.smtp.pass ? {
        user: config.smtp.user,
        pass: config.smtp.pass,
      } : undefined,
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: config.smtp.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: info.messageId,
      });
    } catch (error) {
      logger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${config.frontendUrl}/verify-email?token=${token}`;
    
    const html = this.generateVerificationEmailHtml(verificationUrl);
    const text = this.generateVerificationEmailText(verificationUrl);

    await this.sendEmail({
      to: email,
      subject: 'Verify your email address - Trading Exchange',
      html,
      text,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
    
    const html = this.generatePasswordResetEmailHtml(resetUrl);
    const text = this.generatePasswordResetEmailText(resetUrl);

    await this.sendEmail({
      to: email,
      subject: 'Reset your password - Trading Exchange',
      html,
      text,
    });
  }

  async sendWelcomeEmail(email: string, firstName?: string): Promise<void> {
    const name = firstName || 'Trader';
    
    const html = this.generateWelcomeEmailHtml(name);
    const text = this.generateWelcomeEmailText(name);

    await this.sendEmail({
      to: email,
      subject: 'Welcome to Trading Exchange!',
      html,
      text,
    });
  }

  private generateVerificationEmailHtml(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px 20px; }
            .button { 
              display: inline-block; 
              background: #2563eb; 
              color: white; 
              padding: 12px 30px; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0; 
            }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Trading Exchange</h1>
            </div>
            <div class="content">
              <h2>Verify Your Email Address</h2>
              <p>Thank you for registering with Trading Exchange! To complete your registration and start trading, please verify your email address by clicking the button below:</p>
              
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>
              
              <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #2563eb;">${verificationUrl}</p>
              
              <p><strong>This link will expire in 24 hours.</strong></p>
              
              <p>If you didn't create an account with Trading Exchange, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Trading Exchange. All rights reserved.</p>
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private generateVerificationEmailText(verificationUrl: string): string {
    return `
Trading Exchange - Verify Your Email Address

Thank you for registering with Trading Exchange! To complete your registration and start trading, please verify your email address by visiting the following link:

${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account with Trading Exchange, you can safely ignore this email.

---
© 2024 Trading Exchange. All rights reserved.
This is an automated email. Please do not reply to this message.
    `.trim();
  }

  private generatePasswordResetEmailHtml(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px 20px; }
            .button { 
              display: inline-block; 
              background: #dc2626; 
              color: white; 
              padding: 12px 30px; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0; 
            }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Trading Exchange</h1>
            </div>
            <div class="content">
              <h2>Reset Your Password</h2>
              <p>We received a request to reset the password for your Trading Exchange account. Click the button below to create a new password:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              
              <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #dc2626;">${resetUrl}</p>
              
              <div class="warning">
                <strong>Security Notice:</strong>
                <ul>
                  <li>This link will expire in 24 hours</li>
                  <li>This link can only be used once</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                </ul>
              </div>
              
              <p>For security reasons, we recommend choosing a strong password that includes:</p>
              <ul>
                <li>At least 8 characters</li>
                <li>A mix of uppercase and lowercase letters</li>
                <li>Numbers and special characters</li>
              </ul>
            </div>
            <div class="footer">
              <p>&copy; 2024 Trading Exchange. All rights reserved.</p>
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private generatePasswordResetEmailText(resetUrl: string): string {
    return `
Trading Exchange - Reset Your Password

We received a request to reset the password for your Trading Exchange account. Visit the following link to create a new password:

${resetUrl}

SECURITY NOTICE:
- This link will expire in 24 hours
- This link can only be used once
- If you didn't request this reset, please ignore this email

For security reasons, we recommend choosing a strong password that includes:
- At least 8 characters
- A mix of uppercase and lowercase letters
- Numbers and special characters

---
© 2024 Trading Exchange. All rights reserved.
This is an automated email. Please do not reply to this message.
    `.trim();
  }

  private generateWelcomeEmailHtml(name: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Trading Exchange</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #059669; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px 20px; }
            .button { 
              display: inline-block; 
              background: #059669; 
              color: white; 
              padding: 12px 30px; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0; 
            }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
            .feature { background: #f0f9ff; padding: 15px; margin: 10px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Trading Exchange!</h1>
            </div>
            <div class="content">
              <h2>Hello ${name}!</h2>
              <p>Congratulations! Your Trading Exchange account has been successfully created and verified. You're now ready to start your trading journey with us.</p>
              
              <h3>What you can do now:</h3>
              
              <div class="feature">
                <h4>🏦 Fund Your Account</h4>
                <p>Add funds to your trading account to start placing orders</p>
              </div>
              
              <div class="feature">
                <h4>📊 Explore Markets</h4>
                <p>Browse available instruments and market data</p>
              </div>
              
              <div class="feature">
                <h4>📈 Start Trading</h4>
                <p>Place your first buy or sell orders</p>
              </div>
              
              <div class="feature">
                <h4>📱 Real-time Updates</h4>
                <p>Get live market data and order updates</p>
              </div>
              
              <div style="text-align: center;">
                <a href="${config.frontendUrl}/dashboard" class="button">Go to Dashboard</a>
              </div>
              
              <h3>Need Help?</h3>
              <p>If you have any questions or need assistance, our support team is here to help:</p>
              <ul>
                <li>📧 Email: support@tradingexchange.com</li>
                <li>📚 Documentation: ${config.frontendUrl}/docs</li>
                <li>❓ FAQ: ${config.frontendUrl}/faq</li>
              </ul>
              
              <p>Happy trading!</p>
              <p><strong>The Trading Exchange Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; 2024 Trading Exchange. All rights reserved.</p>
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private generateWelcomeEmailText(name: string): string {
    return `
Trading Exchange - Welcome!

Hello ${name}!

Congratulations! Your Trading Exchange account has been successfully created and verified. You're now ready to start your trading journey with us.

What you can do now:

🏦 Fund Your Account
Add funds to your trading account to start placing orders

📊 Explore Markets
Browse available instruments and market data

📈 Start Trading
Place your first buy or sell orders

📱 Real-time Updates
Get live market data and order updates

Visit your dashboard: ${config.frontendUrl}/dashboard

Need Help?
If you have any questions or need assistance, our support team is here to help:

📧 Email: support@tradingexchange.com
📚 Documentation: ${config.frontendUrl}/docs
❓ FAQ: ${config.frontendUrl}/faq

Happy trading!
The Trading Exchange Team

---
© 2024 Trading Exchange. All rights reserved.
This is an automated email. Please do not reply to this message.
    `.trim();
  }
}