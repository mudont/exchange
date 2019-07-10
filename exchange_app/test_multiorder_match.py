from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.contrib.auth.models import Group
from exchange_app.models import *
from datetime import timedelta
# Create your tests here.


class CurrencyTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        now = timezone.now()
        fut = now + timedelta(days=100)
        user = get_user_model().objects.create(
            username='murali', email='maverickone@gmail.com')
        anu = get_user_model().objects.create(
            username='anu', email='GayamTech@gmail.com')
        group = Group.objects.create(name='Test group')
        unit = Unit.objects.create(abbrev='TEST', name='Test unit')
        curr = Currency.objects.create(
            abbrev='TEST', name='Australian Dollar')
        instr_type = InstrumentType.objects.create(
            abbrev='TEST', name='Test Instrument type')
        order_type = OrderType.objects.create(
            abbrev='TEST', name='Test Order Type')
        order_status = OrderStatus.objects.create(
            abbrev='WORKING', name='Test Order Status')
        completed = OrderStatus.objects.create(
            abbrev='COMPLETED', name='Test Order Status')
        org = Organization.objects.create(
            abbrev='TEST', name='Test Organization')
        org2 = Organization.objects.create(
            abbrev='Anu', name='Test Anu Organization')
        soc_acc = SocialAccount.objects.create(sub='TEST', nickname='NN', name='Soc Name',
                                               email='maverickone@gmail.com', user=user)
        login = Login.objects.create(social_account=soc_acc, timestamp=now)

        instr = Instrument.objects.create(
            symbol='TEST',
            name='Test instrument',
            type=instr_type,
            owner=user,
            allowed_bidders=None,
            allowed_offerers=None,
            currency=curr,
            qty_unit=unit,
            price_unit=unit,
            qty_mult=1,
            price_mult=0.01,
            min_price=0,
            max_price=100,
            price_incr=0.01,
            qty_incr=0.01,
            begin_time=now,
            expiration=fut,
        )
        trader = Trader.objects.create(user=user, org=org, credit_limit=1e6)
        trader_anu = Trader.objects.create(
            user=anu, org=org2, credit_limit=1e6)
        acc = Account.objects.create(name='Test account', org=org)
        acc_anu = Account.objects.create(name='Anu Test account', org=org2)
        bal = Balance.objects.create(account=acc, currency=curr,
                                     balance=-100, overdraft_limit=10000)
        trader_perm = TraderPermission.objects.create(
            account=acc, trader=trader)

        sell_order_A = Order.objects.create(
            instrument=instr,
            account=acc_anu,
            trader=trader_anu,
            type=order_type,
            begin_time=timezone.now(),
            priority_time=timezone.now(),
            expiration=fut,
            is_buy=False,
            quantity=100,
            max_show_size=25,
            limit_price=55,
            curr_slice=25,
            filled_quantity=0,
            status=order_status,
        )
        # import time
        # print('sleeping')
        # time.sleep(5)
        # print('woken')
        sell_order_B = Order.objects.create(
            instrument=instr,
            account=acc_anu,
            trader=trader_anu,
            type=order_type,
            begin_time=timezone.now(),
            priority_time=timezone.now(),
            expiration=fut,
            is_buy=False,
            quantity=20,
            max_show_size=7,
            limit_price=55,
            curr_slice=25,
            filled_quantity=0,
            status=order_status,
        )
        order_C = Order.objects.create(
            instrument=instr,
            account=acc,
            trader=trader,
            type=order_type,
            begin_time=timezone.now(),
            priority_time=timezone.now(),
            expiration=fut,
            is_buy=True,
            quantity=100,
            max_show_size=11,
            limit_price=56,
            curr_slice=25,
            filled_quantity=0,
            status=order_status,
        )
        #print('order A:', sell_order_A.begin_time)

        #print('order B:', sell_order_B.begin_time)

    def setUp(self):
        Currency.objects.create(abbrev='XYZ', name='Australian Dollar')

    def test_ccy_name(self):
        xyz = Currency.objects.get(abbrev='XYZ')
        self.assertEqual(xyz.name, "Australian Dollar")

    def test_fills(self):
        fills = [f for f in Trade.objects.all()]
        self.assertEqual(len(fills), 7)
        for f in fills:
            # print("Fill", f.quantity, f.price, f.buy_order.id, f.sell_order.id)
            self.assertTrue(f.is_buyer_taker)
            self.assertEqual(f.price, 55)
            self.assertEqual(f.instrument.symbol, 'TEST')

        self.assertEqual(fills[0].quantity, 25)
        self.assertEqual(fills[1].quantity, 7)
        self.assertEqual(fills[2].quantity, 25)
        self.assertEqual(fills[3].quantity, 7)
        self.assertEqual(fills[4].quantity, 25)
        self.assertEqual(fills[5].quantity, 6)
        self.assertEqual(fills[6].quantity, 5)
        #f.delete()


    def test_matched_orders(self):
        orders = [o for o in Order.objects.all().order_by('id')]
        self.assertEqual(len(orders), 3)

        for o in orders[1:]:
            self.assertEqual(o.status.abbrev, 'COMPLETED')
            self.assertEqual(o.filled_quantity, o.quantity)
            #o.delete()

        self.assertEqual(orders[0].status.abbrev, 'WORKING')
        self.assertEqual(orders[0].filled_quantity, 80)
