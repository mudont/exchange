from django.db import models
from django.contrib.auth.models import User, Group
from django.utils import timezone
from exchange.util import day_from_now, long_time_in_future
from .matching_engine import matching_engine


class Unit(models.Model):
    abbrev = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=255)

    def __str__(self):
        return "{0}".format(self.abbrev)


class Currency(models.Model):
    abbrev = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=255)

    def __str__(self):
        return "{0}".format(self.abbrev)

    class Meta:
        verbose_name_plural = "currencies"


class InstrumentType(models.Model):
    abbrev = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=255)

    def __str__(self):
        return "{0}".format(self.abbrev)


class OrderType(models.Model):
    abbrev = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=255)

    def __str__(self):
        return "{0}".format(self.abbrev)


class OrderStatus(models.Model):
    abbrev = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=255)

    def __str__(self):
        return "{0}".format(self.abbrev)

    class Meta:
        verbose_name_plural = "order statuses"


class Organization(models.Model):
    abbrev = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=255)

    def __str__(self):
        return "{0}".format(self.abbrev)


class SocialAccount(models.Model):
    sub = models.CharField(primary_key=True, max_length=64)
    nickname = models.CharField(max_length=64)
    name = models.CharField(max_length=64)
    email = models.CharField(max_length=255)
    user = models.ForeignKey(to=User, on_delete=models.PROTECT, null=True)

    def __str__(self):
        return "{0}".format(self.name)


class Login(models.Model):
    social_account = models.ForeignKey(
        to=SocialAccount, on_delete=models.PROTECT, default=0)
    timestamp = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return "{0} logged in at {1}".format(self.social_account.name, self.timestamp)

    class Meta:
        unique_together = (('social_account', 'timestamp'),)


class Instrument(models.Model):
    symbol = models.CharField(primary_key=True, max_length=32)
    name = models.CharField(max_length=255)
    type = models.ForeignKey(
        to=InstrumentType, on_delete=models.PROTECT, default=0)
    owner = models.ForeignKey(to=User, on_delete=models.PROTECT)
    allowed_bidders = models.ForeignKey(to=Group, on_delete=models.PROTECT,
                                        default=None, blank=True, null=True, related_name='instruments_on_which_we_can_bid')
    allowed_offerers = models.ForeignKey(to=Group, on_delete=models.PROTECT,
                                         default=None, blank=True, null=True, related_name='instruments_on_which_we_can_offer')
    currency = models.ForeignKey(
        to=Currency, on_delete=models.PROTECT, default=0)
    qty_unit = models.ForeignKey(
        to=Unit, related_name='instrument_qty', on_delete=models.PROTECT, default=0)
    price_unit = models.ForeignKey(
        to=Unit, related_name='instrument_price', on_delete=models.PROTECT, default=0)
    qty_mult = models.FloatField(default=1)
    price_mult = models.FloatField(default=1)
    min_price = models.FloatField(default=0)
    max_price = models.FloatField(default=100)
    price_incr = models.FloatField(default=1)
    qty_incr = models.FloatField(default=1)
    begin_time = models.DateTimeField(default=timezone.now)
    expiration = models.DateTimeField(blank=True, null=True)
    close_date = models.DateTimeField(blank=True, null=True)
    close_price = models.FloatField(default=0)
    is_valid = models.BooleanField(default=True)
    invalid_reason = models.TextField(null=True)

    def __str__(self):
        return "{0}".format(self.symbol)


class Trader(models.Model):
    user = models.OneToOneField(
        to=User, primary_key=True, on_delete=models.PROTECT)
    org = models.ForeignKey(to=Organization, on_delete=models.PROTECT)
    credit_limit = models.FloatField(default=0.99)

    def __str__(self):
        return "Trader {0}".format(self.user)


class Account(models.Model):
    name = models.CharField(max_length=255)
    org = models.ForeignKey(to=Organization, on_delete=models.PROTECT)

    def __str__(self):
        return "{0}".format(self.name)


class Balance(models.Model):
    account = models.ForeignKey(to=Account, on_delete=models.PROTECT)
    currency = models.ForeignKey(to=Currency, on_delete=models.PROTECT)
    balance = models.DecimalField(max_digits=12, decimal_places=4)
    overdraft_limit = models.DecimalField(max_digits=12, decimal_places=4)

    class Meta:
        unique_together = (('account', 'currency'),)


class TraderPermission(models.Model):
    account = models.ForeignKey(to=Account, on_delete=models.PROTECT)
    trader = models.ForeignKey(to=Trader, on_delete=models.PROTECT)
    #
    # XXX: Speculative. Not sure if this is needed
    # We can store things like 'view', 'trade'
    permission = models.CharField(max_length=10)

    def __str__(self):
        return "{0}->{1}: {2}".format(self.trader, self.account, self.permission)


class Order(models.Model):
    instrument = models.ForeignKey(to=Instrument, on_delete=models.PROTECT)
    account = models.ForeignKey(to=Account, on_delete=models.PROTECT)
    trader = models.ForeignKey(to=Trader, on_delete=models.PROTECT)
    type = models.ForeignKey(to=OrderType, on_delete=models.PROTECT)
    begin_time = models.DateTimeField(default=timezone.now)
    priority_time = models.DateTimeField(default=timezone.now)
    expiration = models.DateTimeField(default=long_time_in_future)
    is_buy = models.BooleanField()
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    max_show_size = models.DecimalField(
        max_digits=12, decimal_places=1, blank=True, null=True)
    limit_price = models.DecimalField(max_digits=12, decimal_places=4)
    curr_slice = models.DecimalField(
        max_digits=12, decimal_places=4, default=0)
    filled_quantity = models.DecimalField(
        max_digits=12, decimal_places=4, default=0)
    status = models.ForeignKey(to=OrderStatus, on_delete=models.PROTECT)

    def __str__(self):
        return "{0} {1}@{2} {3} {4} filled={5}".format(
            self.instrument,
            (1 if self.is_buy else -1) * self.quantity,
            self.limit_price,
            self.trader,
            self.status.abbrev,
            self.filled_quantity,
        )

    def save(self, *args, **kwargs):

        from .util import get_order_book_data
        # TODO: Add all the Order processing logic
        #print("DEBUG ******* in order save(self) args={}, kwargs{} ".format(args, kwargs))
        obj_saved = False
        # If order is being marked as COMPLETED, we don't need to match
        if self._state.adding and self.status == OrderStatus.objects.get(abbrev='WORKING'):
            obj_saved = matching_engine(self, *args, **kwargs)
        if obj_saved:
            kwargs['force_insert'] = False
            kwargs['force_update'] = True

        super(Order, self).save(*args, **kwargs)
        notify_clients({
            '_type': "Order",
            'ts': str(timezone.now()),
            'id': self.id,
            'begin_time': str(self.begin_time),
            'symbol': self.instrument.symbol,
            'account': self.account.name,
            'trader': self.trader.user.username,
            'is_buy': self.is_buy,
            'quantity': float(self.quantity),
            'limit_price': float(self.limit_price),
            'filled_quantity': float(self.filled_quantity),
            'curr_slice': float(self.curr_slice),
            'max_show_size': float(self.max_show_size),
            'status': self.status.abbrev,
        })
        notify_clients({
            '_type': 'Depth',
            'ts': str(timezone.now()),
            self.instrument.symbol: get_order_book_data(self.instrument.symbol)
        })


class Trade(models.Model):
    instrument = models.ForeignKey(to=Instrument, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    price = models.DecimalField(max_digits=12, decimal_places=4)
    buy_order = models.ForeignKey(
        Order, related_name="buy_order_fills", null=True, on_delete=models.PROTECT)
    sell_order = models.ForeignKey(
        Order, related_name="sell_order_fills", null=True, on_delete=models.PROTECT)
    is_buyer_taker = models.BooleanField()
    timestamp = models.DateTimeField(auto_now_add=True)
    is_valid = models.BooleanField(default=True)
    invalid_reason = models.TextField(null=True)

    def __str__(self):
        return "{buyer} {buy_text} {seller} {instr} {qty}@{price} {valid}".format(
            buyer=self.buy_order.trader.user.username,
            instr=self.instrument,
            qty=self.quantity,
            price=self.price,
            seller=self.sell_order.trader.user.username,
            buy_text="lifted from" if self.is_buyer_taker else "was hit by",
            valid="" if self.is_valid else "Invalidated: " + self.invalid_reason
        )

    def save(self, *args, **kwargs):
        # TODO: Add all the Order processing logic
        #print("DEBUG ******* in trade save(self) args={}, kwargs{} ".format(args, kwargs))
        super(Trade, self).save(*args, **kwargs)
        notify_clients({
            '_type': "Trade",
            'ts': str(timezone.now()),
            'buyer': self.buy_order.trader.user.username,
            'seller': self.sell_order.trader.user.username,
            'symbol': self.instrument.symbol,
            'is_buy': True if self.is_buyer_taker else False,
            'quantity': float(self.quantity),
            'price': float(self.price),
        })


def notify_clients(data):
    # Required for channel communication
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    #print("DBG Sending client notify: {}".format(data))
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        "1",  # "ExchangeInfo",
        {
            'type': 'exchange.notification',
            'command': 'send',
            'data': data
        }
    )
