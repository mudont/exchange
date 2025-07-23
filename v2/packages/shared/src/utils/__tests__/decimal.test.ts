import {
  add,
  subtract,
  multiply,
  divide,
  compare,
  isZero,
  isPositive,
  isNegative,
  abs,
  min,
  max,
  round,
  floor,
  ceil,
  toFixed,
  fromString,
  toString,
} from '../decimal';

describe('Decimal Utilities', () => {
  describe('basic arithmetic operations', () => {
    describe('add', () => {
      it('should add two positive numbers', () => {
        expect(add('10.5', '5.25')).toBe('15.75');
      });

      it('should add positive and negative numbers', () => {
        expect(add('10.5', '-3.25')).toBe('7.25');
      });

      it('should add two negative numbers', () => {
        expect(add('-10.5', '-5.25')).toBe('-15.75');
      });

      it('should handle zero addition', () => {
        expect(add('10.5', '0')).toBe('10.5');
        expect(add('0', '5.25')).toBe('5.25');
        expect(add('0', '0')).toBe('0');
      });

      it('should handle very small numbers', () => {
        expect(add('0.00000001', '0.00000002')).toBe('0.00000003');
      });

      it('should handle very large numbers', () => {
        expect(add('999999999999.99', '0.01')).toBe('1000000000000');
      });
    });

    describe('subtract', () => {
      it('should subtract two positive numbers', () => {
        expect(subtract('10.5', '5.25')).toBe('5.25');
      });

      it('should subtract negative from positive', () => {
        expect(subtract('10.5', '-3.25')).toBe('13.75');
      });

      it('should subtract positive from negative', () => {
        expect(subtract('-10.5', '3.25')).toBe('-13.75');
      });

      it('should handle zero subtraction', () => {
        expect(subtract('10.5', '0')).toBe('10.5');
        expect(subtract('0', '5.25')).toBe('-5.25');
      });

      it('should handle equal numbers', () => {
        expect(subtract('10.5', '10.5')).toBe('0');
      });
    });

    describe('multiply', () => {
      it('should multiply two positive numbers', () => {
        expect(multiply('10.5', '2')).toBe('21');
      });

      it('should multiply positive and negative numbers', () => {
        expect(multiply('10.5', '-2')).toBe('-21');
      });

      it('should multiply two negative numbers', () => {
        expect(multiply('-10.5', '-2')).toBe('21');
      });

      it('should handle zero multiplication', () => {
        expect(multiply('10.5', '0')).toBe('0');
        expect(multiply('0', '5.25')).toBe('0');
      });

      it('should handle decimal multiplication', () => {
        expect(multiply('2.5', '4.2')).toBe('10.5');
      });

      it('should handle very small numbers', () => {
        expect(multiply('0.00000001', '1000000')).toBe('0.01');
      });
    });

    describe('divide', () => {
      it('should divide two positive numbers', () => {
        expect(divide('21', '2')).toBe('10.5');
      });

      it('should divide positive and negative numbers', () => {
        expect(divide('21', '-2')).toBe('-10.5');
      });

      it('should divide two negative numbers', () => {
        expect(divide('-21', '-2')).toBe('10.5');
      });

      it('should handle zero dividend', () => {
        expect(divide('0', '5.25')).toBe('0');
      });

      it('should throw error for division by zero', () => {
        expect(() => divide('10.5', '0')).toThrow();
      });

      it('should handle decimal division', () => {
        expect(divide('10.5', '2.5')).toBe('4.2');
      });

      it('should handle recurring decimals with precision', () => {
        const result = divide('1', '3');
        expect(result).toMatch(/^0\.3333333/);
      });
    });
  });

  describe('comparison operations', () => {
    describe('compare', () => {
      it('should return 0 for equal numbers', () => {
        expect(compare('10.5', '10.5')).toBe(0);
        expect(compare('0', '0')).toBe(0);
        expect(compare('-5.25', '-5.25')).toBe(0);
      });

      it('should return 1 when first number is greater', () => {
        expect(compare('10.5', '5.25')).toBe(1);
        expect(compare('0', '-1')).toBe(1);
        expect(compare('-1', '-2')).toBe(1);
      });

      it('should return -1 when first number is smaller', () => {
        expect(compare('5.25', '10.5')).toBe(-1);
        expect(compare('-1', '0')).toBe(-1);
        expect(compare('-2', '-1')).toBe(-1);
      });

      it('should handle very small differences', () => {
        expect(compare('1.00000001', '1.00000002')).toBe(-1);
      });
    });

    describe('isZero', () => {
      it('should return true for zero', () => {
        expect(isZero('0')).toBe(true);
        expect(isZero('0.0')).toBe(true);
        expect(isZero('0.00000000')).toBe(true);
      });

      it('should return false for non-zero numbers', () => {
        expect(isZero('0.1')).toBe(false);
        expect(isZero('-0.1')).toBe(false);
        expect(isZero('1')).toBe(false);
      });
    });

    describe('isPositive', () => {
      it('should return true for positive numbers', () => {
        expect(isPositive('1')).toBe(true);
        expect(isPositive('0.1')).toBe(true);
        expect(isPositive('1000')).toBe(true);
      });

      it('should return false for zero and negative numbers', () => {
        expect(isPositive('0')).toBe(false);
        expect(isPositive('-1')).toBe(false);
        expect(isPositive('-0.1')).toBe(false);
      });
    });

    describe('isNegative', () => {
      it('should return true for negative numbers', () => {
        expect(isNegative('-1')).toBe(true);
        expect(isNegative('-0.1')).toBe(true);
        expect(isNegative('-1000')).toBe(true);
      });

      it('should return false for zero and positive numbers', () => {
        expect(isNegative('0')).toBe(false);
        expect(isNegative('1')).toBe(false);
        expect(isNegative('0.1')).toBe(false);
      });
    });
  });

  describe('utility functions', () => {
    describe('abs', () => {
      it('should return absolute value of positive numbers', () => {
        expect(abs('10.5')).toBe('10.5');
      });

      it('should return absolute value of negative numbers', () => {
        expect(abs('-10.5')).toBe('10.5');
      });

      it('should return zero for zero', () => {
        expect(abs('0')).toBe('0');
      });
    });

    describe('min', () => {
      it('should return minimum of two numbers', () => {
        expect(min('10.5', '5.25')).toBe('5.25');
        expect(min('5.25', '10.5')).toBe('5.25');
        expect(min('-1', '1')).toBe('-1');
        expect(min('-2', '-1')).toBe('-2');
      });

      it('should handle equal numbers', () => {
        expect(min('10.5', '10.5')).toBe('10.5');
      });
    });

    describe('max', () => {
      it('should return maximum of two numbers', () => {
        expect(max('10.5', '5.25')).toBe('10.5');
        expect(max('5.25', '10.5')).toBe('10.5');
        expect(max('-1', '1')).toBe('1');
        expect(max('-2', '-1')).toBe('-1');
      });

      it('should handle equal numbers', () => {
        expect(max('10.5', '10.5')).toBe('10.5');
      });
    });

    describe('round', () => {
      it('should round to specified decimal places', () => {
        expect(round('10.555', 2)).toBe('10.56');
        expect(round('10.554', 2)).toBe('10.55');
        expect(round('10.5', 2)).toBe('10.5');
      });

      it('should round to integer when no decimal places specified', () => {
        expect(round('10.6')).toBe('11');
        expect(round('10.4')).toBe('10');
        expect(round('-10.6')).toBe('-11');
      });

      it('should handle zero decimal places', () => {
        expect(round('10.555', 0)).toBe('11');
        expect(round('10.444', 0)).toBe('10');
      });
    });

    describe('floor', () => {
      it('should floor positive numbers', () => {
        expect(floor('10.9')).toBe('10');
        expect(floor('10.1')).toBe('10');
        expect(floor('10')).toBe('10');
      });

      it('should floor negative numbers', () => {
        expect(floor('-10.1')).toBe('-11');
        expect(floor('-10.9')).toBe('-11');
        expect(floor('-10')).toBe('-10');
      });
    });

    describe('ceil', () => {
      it('should ceil positive numbers', () => {
        expect(ceil('10.1')).toBe('11');
        expect(ceil('10.9')).toBe('11');
        expect(ceil('10')).toBe('10');
      });

      it('should ceil negative numbers', () => {
        expect(ceil('-10.9')).toBe('-10');
        expect(ceil('-10.1')).toBe('-10');
        expect(ceil('-10')).toBe('-10');
      });
    });

    describe('toFixed', () => {
      it('should format to specified decimal places', () => {
        expect(toFixed('10.555', 2)).toBe('10.56');
        expect(toFixed('10', 2)).toBe('10.00');
        expect(toFixed('10.1', 3)).toBe('10.100');
      });

      it('should handle zero decimal places', () => {
        expect(toFixed('10.555', 0)).toBe('11');
      });
    });
  });

  describe('conversion functions', () => {
    describe('fromString', () => {
      it('should parse valid decimal strings', () => {
        expect(fromString('10.5').toString()).toBe('10.5');
        expect(fromString('-10.5').toString()).toBe('-10.5');
        expect(fromString('0').toString()).toBe('0');
      });

      it('should handle scientific notation', () => {
        expect(fromString('1e-8').toString()).toBe('0.00000001');
        expect(fromString('1e2').toString()).toBe('100');
      });

      it('should throw error for invalid strings', () => {
        expect(() => fromString('invalid')).toThrow();
        expect(() => fromString('')).toThrow();
        expect(() => fromString('10.5.5')).toThrow();
      });
    });

    describe('toString', () => {
      it('should convert decimal to string', () => {
        expect(toString(fromString('10.5'))).toBe('10.5');
        expect(toString(fromString('-10.5'))).toBe('-10.5');
        expect(toString(fromString('0'))).toBe('0');
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty strings', () => {
      expect(() => add('', '1')).toThrow();
      expect(() => add('1', '')).toThrow();
    });

    it('should handle null and undefined', () => {
      expect(() => add(null as any, '1')).toThrow();
      expect(() => add('1', undefined as any)).toThrow();
    });

    it('should handle invalid number formats', () => {
      expect(() => add('abc', '1')).toThrow();
      expect(() => add('1', 'xyz')).toThrow();
      expect(() => add('1.2.3', '1')).toThrow();
    });

    it('should handle very large numbers', () => {
      const largeNumber = '999999999999999999999999999999.99';
      expect(() => add(largeNumber, '1')).not.toThrow();
    });

    it('should handle very small numbers', () => {
      const smallNumber = '0.000000000000000000000000000001';
      expect(() => add(smallNumber, '1')).not.toThrow();
    });

    it('should maintain precision with many decimal places', () => {
      const result = add('0.123456789012345678', '0.987654320987654321');
      expect(result).toBe('1.111111109999999999');
    });
  });

  describe('performance considerations', () => {
    it('should handle operations on many numbers efficiently', () => {
      const start = performance.now();
      
      let result = '0';
      for (let i = 0; i < 1000; i++) {
        result = add(result, '0.001');
      }
      
      const end = performance.now();
      const duration = end - start;
      
      expect(result).toBe('1');
      expect(duration).toBeLessThan(100); // Should complete in less than 100ms
    });

    it('should handle complex calculations efficiently', () => {
      const start = performance.now();
      
      let result = '1000';
      for (let i = 0; i < 100; i++) {
        result = multiply(result, '1.01');
        result = divide(result, '1.005');
        result = add(result, '10');
        result = subtract(result, '5');
      }
      
      const end = performance.now();
      const duration = end - start;
      
      expect(duration).toBeLessThan(50); // Should complete in less than 50ms
    });
  });
});