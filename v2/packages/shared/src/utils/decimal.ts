import { Decimal } from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
  minE: -9e15,
  maxE: 9e15,
  crypto: false,
  modulo: Decimal.ROUND_DOWN,
});

export { Decimal };

// Utility functions for decimal operations
export class DecimalUtils {
  /**
   * Create a Decimal from various input types
   */
  static from(value: string | number | Decimal): Decimal {
    return new Decimal(value);
  }

  /**
   * Safely convert to number (throws if precision would be lost)
   */
  static toNumber(value: Decimal): number {
    const num = value.toNumber();
    if (!value.equals(num)) {
      throw new Error('Precision loss when converting Decimal to number');
    }
    return num;
  }

  /**
   * Convert to string with specified decimal places
   */
  static toFixed(value: Decimal, decimalPlaces: number): string {
    return value.toFixed(decimalPlaces);
  }

  /**
   * Round to specified decimal places
   */
  static round(value: Decimal, decimalPlaces: number): Decimal {
    return value.toDecimalPlaces(decimalPlaces);
  }

  /**
   * Check if value is zero
   */
  static isZero(value: Decimal): boolean {
    return value.isZero();
  }

  /**
   * Check if value is positive
   */
  static isPositive(value: Decimal): boolean {
    return value.isPositive();
  }

  /**
   * Check if value is negative
   */
  static isNegative(value: Decimal): boolean {
    return value.isNegative();
  }

  /**
   * Get absolute value
   */
  static abs(value: Decimal): Decimal {
    return value.abs();
  }

  /**
   * Get minimum of two values
   */
  static min(a: Decimal, b: Decimal): Decimal {
    return Decimal.min(a, b);
  }

  /**
   * Get maximum of two values
   */
  static max(a: Decimal, b: Decimal): Decimal {
    return Decimal.max(a, b);
  }

  /**
   * Calculate percentage
   */
  static percentage(value: Decimal, total: Decimal): Decimal {
    if (total.isZero()) {
      return new Decimal(0);
    }
    return value.div(total).mul(100);
  }

  /**
   * Calculate percentage change
   */
  static percentageChange(oldValue: Decimal, newValue: Decimal): Decimal {
    if (oldValue.isZero()) {
      return new Decimal(0);
    }
    return newValue.sub(oldValue).div(oldValue).mul(100);
  }

  /**
   * Round to tick size
   */
  static roundToTickSize(price: Decimal, tickSize: Decimal): Decimal {
    if (tickSize.isZero()) {
      return price;
    }
    return price.div(tickSize).round().mul(tickSize);
  }

  /**
   * Validate price is within bounds and tick size
   */
  static validatePrice(
    price: Decimal,
    minPrice: Decimal,
    maxPrice: Decimal,
    tickSize: Decimal
  ): { valid: boolean; error?: string } {
    if (price.lt(minPrice)) {
      return { valid: false, error: `Price ${price} is below minimum ${minPrice}` };
    }
    
    if (price.gt(maxPrice)) {
      return { valid: false, error: `Price ${price} is above maximum ${maxPrice}` };
    }
    
    if (!tickSize.isZero()) {
      const remainder = price.mod(tickSize);
      if (!remainder.isZero()) {
        return { valid: false, error: `Price ${price} is not a multiple of tick size ${tickSize}` };
      }
    }
    
    return { valid: true };
  }

  /**
   * Validate quantity is within lot size
   */
  static validateQuantity(
    quantity: Decimal,
    lotSize: Decimal
  ): { valid: boolean; error?: string } {
    if (quantity.lte(0)) {
      return { valid: false, error: `Quantity ${quantity} must be positive` };
    }
    
    if (!lotSize.isZero()) {
      const remainder = quantity.mod(lotSize);
      if (!remainder.isZero()) {
        return { valid: false, error: `Quantity ${quantity} is not a multiple of lot size ${lotSize}` };
      }
    }
    
    return { valid: true };
  }
}