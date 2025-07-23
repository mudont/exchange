import { Decimal } from 'decimal.js';
import { prisma } from '../../database';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/error';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';

export interface TradeSettlement {
  tradeId: string;
  buyerAccountId: string;
  sellerAccountId: string;
  instrumentSymbol: string;
  quantity: Decimal;
  price: Decimal;
  buyerFee: Decimal;
  sellerFee: Decimal;
  settlementDate: Date;
}

export interface PositionUpdate {
  accountId: string;
  instrumentSymbol: string;
  quantityChange: Decimal;
  avgPriceUpdate: Decimal;
  realizedPnL: Decimal;
}

export interface BalanceUpdate {
  accountId: string;
  currency: string;
  balanceChange: Decimal;
  reservedChange: Decimal;
  reason: string;
}

export class SettlementService {
  private readonly defaultCurrency = 'USD';
  private readonly feeRate = new Decimal(0.001); // 0.1% fee

  async settleTrade(trade: {
    id: string;
    instrumentSymbol: string;
    buyOrderId: string;
    sellOrderId: string;
    quantity: Decimal;
    price: Decimal;
    buyerUserId: string;
    sellerUserId: string;
    timestamp: Date;
  }): Promise<TradeSettlement> {
    logger.info('Settling trade', {
      tradeId: trade.id,
      symbol: trade.instrumentSymbol,
      quantity: trade.quantity.toString(),
      price: trade.price.toString(),
    });

    // Get buyer and seller accounts
    const [buyOrder, sellOrder] = await Promise.all([
      prisma.order.findUnique({
        where: { id: trade.buyOrderId },
        include: { account: true },
      }),
      prisma.order.findUnique({
        where: { id: trade.sellOrderId },
        include: { account: true },
      }),
    ]);

    if (!buyOrder || !sellOrder) {
      throw new AppError(
        ErrorCode.INVALID_ORDER,
        'Orders not found for trade settlement',
        HttpStatus.BAD_REQUEST
      );
    }

    const buyerAccountId = buyOrder.accountId;
    const sellerAccountId = sellOrder.accountId;

    // Calculate fees
    const tradeValue = trade.quantity.mul(trade.price);
    const buyerFee = tradeValue.mul(this.feeRate);
    const sellerFee = tradeValue.mul(this.feeRate);

    // Perform settlement in a transaction
    const settlement = await prisma.$transaction(async (tx) => {
      // Update positions
      await this.updatePosition(tx, buyerAccountId, trade.instrumentSymbol, trade.quantity, trade.price, 'BUY');
      await this.updatePosition(tx, sellerAccountId, trade.instrumentSymbol, trade.quantity.neg(), trade.price, 'SELL');

      // Update balances
      await this.updateBalance(tx, buyerAccountId, this.defaultCurrency, tradeValue.neg().sub(buyerFee), 'TRADE_SETTLEMENT');
      await this.updateBalance(tx, sellerAccountId, this.defaultCurrency, tradeValue.sub(sellerFee), 'TRADE_SETTLEMENT');

      // Create settlement record
      const settlement: TradeSettlement = {
        tradeId: trade.id,
        buyerAccountId,
        sellerAccountId,
        instrumentSymbol: trade.instrumentSymbol,
        quantity: trade.quantity,
        price: trade.price,
        buyerFee,
        sellerFee,
        settlementDate: new Date(),
      };

      return settlement;
    });

    logger.info('Trade settled successfully', {
      tradeId: trade.id,
      buyerAccountId,
      sellerAccountId,
      buyerFee: buyerFee.toString(),
      sellerFee: sellerFee.toString(),
    });

    return settlement;
  }

  private async updatePosition(
    tx: any,
    accountId: string,
    instrumentSymbol: string,
    quantityChange: Decimal,
    price: Decimal,
    side: 'BUY' | 'SELL'
  ): Promise<void> {
    // Get existing position
    const existingPosition = await tx.position.findUnique({
      where: {
        accountId_instrumentSymbol: {
          accountId,
          instrumentSymbol,
        },
      },
    });

    if (!existingPosition) {
      // Create new position
      await tx.position.create({
        data: {
          accountId,
          instrumentSymbol,
          quantity: quantityChange,
          avgPrice: price,
          unrealizedPnL: new Decimal(0),
          realizedPnL: new Decimal(0),
        },
      });

      logger.debug('Created new position', {
        accountId,
        instrumentSymbol,
        quantity: quantityChange.toString(),
        avgPrice: price.toString(),
      });
    } else {
      // Update existing position
      const currentQuantity = new Decimal(existingPosition.quantity);
      const currentAvgPrice = new Decimal(existingPosition.avgPrice);
      const currentRealizedPnL = new Decimal(existingPosition.realizedPnL);

      let newQuantity = currentQuantity.add(quantityChange);
      let newAvgPrice = currentAvgPrice;
      let realizedPnL = currentRealizedPnL;

      // Calculate new average price and realized P&L
      if (currentQuantity.isZero()) {
        // Position was flat, new average price is the trade price
        newAvgPrice = price;
      } else if (currentQuantity.sign() === quantityChange.sign()) {
        // Adding to existing position - update average price
        const totalValue = currentQuantity.mul(currentAvgPrice).add(quantityChange.mul(price));
        newAvgPrice = totalValue.div(newQuantity);
      } else {
        // Reducing or reversing position - realize P&L
        const closingQuantity = Decimal.min(currentQuantity.abs(), quantityChange.abs());
        const pnlPerUnit = side === 'SELL' 
          ? price.sub(currentAvgPrice) 
          : currentAvgPrice.sub(price);
        
        realizedPnL = realizedPnL.add(closingQuantity.mul(pnlPerUnit));

        // If reversing position, set new average price
        if (newQuantity.sign() !== currentQuantity.sign() && !newQuantity.isZero()) {
          newAvgPrice = price;
        }
      }

      // Calculate unrealized P&L (would need current market price)
      const currentMarketPrice = await this.getCurrentMarketPrice(instrumentSymbol);
      const unrealizedPnL = newQuantity.mul(currentMarketPrice.sub(newAvgPrice));

      await tx.position.update({
        where: {
          accountId_instrumentSymbol: {
            accountId,
            instrumentSymbol,
          },
        },
        data: {
          quantity: newQuantity,
          avgPrice: newAvgPrice,
          unrealizedPnL,
          realizedPnL,
          lastUpdated: new Date(),
        },
      });

      logger.debug('Updated position', {
        accountId,
        instrumentSymbol,
        oldQuantity: currentQuantity.toString(),
        newQuantity: newQuantity.toString(),
        avgPrice: newAvgPrice.toString(),
        realizedPnL: realizedPnL.toString(),
        unrealizedPnL: unrealizedPnL.toString(),
      });
    }
  }

  private async updateBalance(
    tx: any,
    accountId: string,
    currency: string,
    balanceChange: Decimal,
    reason: string
  ): Promise<void> {
    // Get existing balance
    const existingBalance = await tx.balance.findUnique({
      where: {
        accountId_currency: {
          accountId,
          currency,
        },
      },
    });

    if (!existingBalance) {
      // Create new balance
      await tx.balance.create({
        data: {
          accountId,
          currency,
          balance: balanceChange,
          availableBalance: balanceChange,
          reservedBalance: new Decimal(0),
        },
      });

      logger.debug('Created new balance', {
        accountId,
        currency,
        balance: balanceChange.toString(),
        reason,
      });
    } else {
      // Update existing balance
      const newBalance = new Decimal(existingBalance.balance).add(balanceChange);
      const newAvailableBalance = new Decimal(existingBalance.availableBalance).add(balanceChange);

      await tx.balance.update({
        where: {
          accountId_currency: {
            accountId,
            currency,
          },
        },
        data: {
          balance: newBalance,
          availableBalance: newAvailableBalance,
          updatedAt: new Date(),
        },
      });

      logger.debug('Updated balance', {
        accountId,
        currency,
        oldBalance: existingBalance.balance.toString(),
        newBalance: newBalance.toString(),
        change: balanceChange.toString(),
        reason,
      });
    }

    // Create audit trail
    await tx.auditLog.create({
      data: {
        userId: null, // System action
        action: 'BALANCE_UPDATE',
        resource: `account:${accountId}:balance:${currency}`,
        details: {
          change: balanceChange.toString(),
          reason,
          timestamp: new Date(),
        },
      },
    });
  }

  private async getCurrentMarketPrice(instrumentSymbol: string): Promise<Decimal> {
    // In a real implementation, this would get the current market price
    // For now, we'll use the last trade price or mid-price
    const lastTrade = await prisma.trade.findFirst({
      where: { instrumentSymbol },
      orderBy: { timestamp: 'desc' },
    });

    if (lastTrade) {
      return new Decimal(lastTrade.price);
    }

    // Fallback to instrument's mid-price or a default
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: instrumentSymbol },
    });

    if (instrument) {
      const minPrice = new Decimal(instrument.minPrice);
      const maxPrice = new Decimal(instrument.maxPrice);
      return minPrice.add(maxPrice).div(2);
    }

    return new Decimal(100); // Default fallback
  }

  async getAccountPositions(accountId: string): Promise<any[]> {
    const positions = await prisma.position.findMany({
      where: { accountId },
      include: {
        instrument: true,
      },
    });

    return positions.map(position => ({
      ...position,
      currentMarketPrice: null, // Would be populated with real-time price
      unrealizedPnL: position.unrealizedPnL,
      realizedPnL: position.realizedPnL,
    }));
  }

  async getAccountBalances(accountId: string): Promise<any[]> {
    return await prisma.balance.findMany({
      where: { accountId },
    });
  }

  async calculatePortfolioPnL(accountId: string): Promise<{
    totalRealizedPnL: Decimal;
    totalUnrealizedPnL: Decimal;
    totalPnL: Decimal;
  }> {
    const positions = await prisma.position.findMany({
      where: { accountId },
    });

    let totalRealizedPnL = new Decimal(0);
    let totalUnrealizedPnL = new Decimal(0);

    for (const position of positions) {
      totalRealizedPnL = totalRealizedPnL.add(new Decimal(position.realizedPnL));
      
      // Recalculate unrealized P&L with current market price
      const currentPrice = await this.getCurrentMarketPrice(position.instrumentSymbol);
      const quantity = new Decimal(position.quantity);
      const avgPrice = new Decimal(position.avgPrice);
      const unrealizedPnL = quantity.mul(currentPrice.sub(avgPrice));
      
      totalUnrealizedPnL = totalUnrealizedPnL.add(unrealizedPnL);

      // Update position with current unrealized P&L
      await prisma.position.update({
        where: { id: position.id },
        data: {
          unrealizedPnL,
          lastUpdated: new Date(),
        },
      });
    }

    const totalPnL = totalRealizedPnL.add(totalUnrealizedPnL);

    return {
      totalRealizedPnL,
      totalUnrealizedPnL,
      totalPnL,
    };
  }

  async settleExpiredInstrument(instrumentSymbol: string, settlementPrice: Decimal): Promise<void> {
    logger.info('Settling expired instrument', {
      instrumentSymbol,
      settlementPrice: settlementPrice.toString(),
    });

    // Get all positions for the instrument
    const positions = await prisma.position.findMany({
      where: { instrumentSymbol },
    });

    await prisma.$transaction(async (tx) => {
      for (const position of positions) {
        const quantity = new Decimal(position.quantity);
        const avgPrice = new Decimal(position.avgPrice);
        
        if (!quantity.isZero()) {
          // Calculate final P&L
          const finalPnL = quantity.mul(settlementPrice.sub(avgPrice));
          
          // Update balance with settlement
          await this.updateBalance(
            tx,
            position.accountId,
            this.defaultCurrency,
            finalPnL,
            'INSTRUMENT_SETTLEMENT'
          );

          // Close position
          await tx.position.update({
            where: { id: position.id },
            data: {
              quantity: new Decimal(0),
              unrealizedPnL: new Decimal(0),
              realizedPnL: new Decimal(position.realizedPnL).add(finalPnL),
              lastUpdated: new Date(),
            },
          });

          logger.debug('Position settled', {
            accountId: position.accountId,
            instrumentSymbol,
            quantity: quantity.toString(),
            avgPrice: avgPrice.toString(),
            settlementPrice: settlementPrice.toString(),
            finalPnL: finalPnL.toString(),
          });
        }
      }

      // Update instrument with settlement price
      await tx.instrument.update({
        where: { symbol: instrumentSymbol },
        data: {
          settlementPrice,
          isActive: false,
          updatedAt: new Date(),
        },
      });
    });

    logger.info('Instrument settlement completed', {
      instrumentSymbol,
      positionsSettled: positions.length,
    });
  }

  // Risk management functions
  async checkMarginRequirements(accountId: string): Promise<{
    marginRequired: Decimal;
    marginAvailable: Decimal;
    marginRatio: Decimal;
    marginCall: boolean;
  }> {
    const positions = await this.getAccountPositions(accountId);
    const balances = await this.getAccountBalances(accountId);

    let marginRequired = new Decimal(0);
    
    // Calculate margin requirements for all positions
    for (const position of positions) {
      const quantity = new Decimal(position.quantity);
      const currentPrice = await this.getCurrentMarketPrice(position.instrumentSymbol);
      const marginRate = new Decimal(position.instrument.marginRate);
      
      const positionValue = quantity.abs().mul(currentPrice);
      const positionMargin = positionValue.mul(marginRate);
      
      marginRequired = marginRequired.add(positionMargin);
    }

    // Calculate available margin (cash + unrealized P&L)
    const cashBalance = balances.find(b => b.currency === this.defaultCurrency);
    const availableBalance = cashBalance ? new Decimal(cashBalance.availableBalance) : new Decimal(0);
    
    const { totalUnrealizedPnL } = await this.calculatePortfolioPnL(accountId);
    const marginAvailable = availableBalance.add(totalUnrealizedPnL);

    const marginRatio = marginRequired.isZero() ? new Decimal(0) : marginAvailable.div(marginRequired);
    const marginCall = marginRatio.lt(new Decimal(1.2)); // 120% margin requirement

    return {
      marginRequired,
      marginAvailable,
      marginRatio,
      marginCall,
    };
  }
}