import { toast } from 'react-hot-toast';

export interface NotificationOptions {
  title?: string;
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  sound?: boolean;
}

export class NotificationService {
  private static instance: NotificationService;
  private soundEnabled = true;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private constructor() {
    // Request notification permission if supported
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  private playSound(type: 'success' | 'error' | 'info' | 'warning') {
    if (!this.soundEnabled) return;

    // Create audio context for different notification sounds
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Different frequencies for different notification types
    const frequencies = {
      success: 800,
      error: 400,
      info: 600,
      warning: 500,
    };

    oscillator.frequency.setValueAtTime(frequencies[type], audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  }

  private showBrowserNotification(title: string, body: string, type: 'success' | 'error' | 'info' | 'warning') {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `trading-${type}`,
        requireInteraction: type === 'error',
      });

      // Auto-close after 5 seconds for non-error notifications
      if (type !== 'error') {
        setTimeout(() => notification.close(), 5000);
      }
    }
  }

  success(message: string, options: NotificationOptions = {}) {
    const { title = 'Success', duration = 4000, sound = true } = options;
    
    toast.success(message, { duration });
    
    if (sound) {
      this.playSound('success');
    }
    
    this.showBrowserNotification(title, message, 'success');
  }

  error(message: string, options: NotificationOptions = {}) {
    const { title = 'Error', duration = 6000, sound = true } = options;
    
    toast.error(message, { duration });
    
    if (sound) {
      this.playSound('error');
    }
    
    this.showBrowserNotification(title, message, 'error');
  }

  info(message: string, options: NotificationOptions = {}) {
    const { title = 'Information', duration = 4000, sound = false } = options;
    
    toast(message, { 
      duration,
      icon: 'ℹ️',
    });
    
    if (sound) {
      this.playSound('info');
    }
    
    this.showBrowserNotification(title, message, 'info');
  }

  warning(message: string, options: NotificationOptions = {}) {
    const { title = 'Warning', duration = 5000, sound = true } = options;
    
    toast(message, { 
      duration,
      icon: '⚠️',
      style: {
        background: '#f59e0b',
        color: '#fff',
      },
    });
    
    if (sound) {
      this.playSound('warning');
    }
    
    this.showBrowserNotification(title, message, 'warning');
  }

  // Trading-specific notifications
  orderPlaced(symbol: string, side: string, quantity: number, price: number) {
    this.success(
      `${side} order placed: ${quantity} ${symbol} @ $${price.toFixed(2)}`,
      { title: 'Order Placed' }
    );
  }

  orderFilled(symbol: string, side: string, quantity: number, price: number) {
    this.success(
      `Order filled: ${side} ${quantity} ${symbol} @ $${price.toFixed(2)}`,
      { title: 'Order Filled', sound: true }
    );
  }

  orderCancelled(symbol: string, side: string) {
    this.info(
      `${side} order cancelled for ${symbol}`,
      { title: 'Order Cancelled' }
    );
  }

  tradeExecuted(symbol: string, side: string, quantity: number, price: number) {
    this.success(
      `Trade executed: ${side} ${quantity} ${symbol} @ $${price.toFixed(2)}`,
      { title: 'Trade Executed', sound: true }
    );
  }

  positionUpdate(symbol: string, pnl: number) {
    const message = `Position updated: ${symbol} P&L ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
    
    if (pnl >= 0) {
      this.success(message, { title: 'Position Update' });
    } else {
      this.warning(message, { title: 'Position Update' });
    }
  }

  balanceUpdate(amount: number, currency: string = 'USD') {
    this.info(
      `Balance updated: ${amount >= 0 ? '+' : ''}$${amount.toFixed(2)} ${currency}`,
      { title: 'Balance Update' }
    );
  }

  connectionStatus(connected: boolean) {
    if (connected) {
      this.success('Connected to real-time data feed', { 
        title: 'Connection Restored',
        duration: 2000 
      });
    } else {
      this.error('Lost connection to real-time data feed', { 
        title: 'Connection Lost',
        duration: 0 // Don't auto-dismiss
      });
    }
  }

  marketAlert(symbol: string, message: string) {
    this.warning(`${symbol}: ${message}`, { 
      title: 'Market Alert',
      sound: true 
    });
  }

  riskAlert(message: string) {
    this.error(message, { 
      title: 'Risk Alert',
      sound: true,
      duration: 0 // Don't auto-dismiss
    });
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();