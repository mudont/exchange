from data_feed.models import FeedSubscription
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Group, Permission, User
from django.contrib.contenttypes.models import ContentType
from django.contrib.sessions.models import Session
from exchange_app.models import Account, Balance, Currency, Instrument, InstrumentType, Login, Order, OrderStatus, OrderType, Organization, SocialAccount, Trade, Trader, TraderPermission, Unit
from guardian.models import GroupObjectPermission, UserObjectPermission
from rest_framework.authtoken.models import Token
from social_django.models import Association, Code, Nonce, Partial, UserSocialAuth
# Shell Plus Django Imports
from django.core.cache import cache
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Avg, Case, Count, F, Max, Min, Prefetch, Q, Sum, When, Exists, OuterRef, Subquery
from django.utils import timezone
from django.urls import reverse

o = User.objects.filter(email='maverickone@gmail.com').first()
#Currency(name='Runs', abbrev='RUN').save() 
ccy=Currency.objects.get(abbrev='RUN')              
qty_unit = Unit.objects.get(abbrev='%Prob')
tp = InstrumentType.objects.get(abbrev='Event')   
perf_type = InstrumentType.objects.get(abbrev='Perf')   
price_unit= qty_unit
qty_mult = 1
price_mult = 0.01
min_price = 0
max_price = 100
price_incr = 1
qty_incr = 1
d=dict(qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1, type=tp)
#i=Instrument(expiration='2019-05-30 17:00', owner=o, symbol='Eng > SAF', name='Eng > SAF', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
#i.type=tp
#i.save()
import re

games = [
    ['2019-05-30 22:00', 'Eng > SAF'],
    ['2019-05-31 22:00', 'WI > Pak'],
    ['2019-06-01 22:00', 'NZ > SL'],
    ['2019-06-01 22:00', 'Afg > Aus'],
    ['2019-06-02 22:00', 'SAF > Ban'],
    ['2019-06-03 22:00', 'Eng > Pak'],
    ['2019-06-04 22:00', 'Afg > SL'],
    ['2019-06-05 22:00', 'SAF > Ind'],
    ['2019-06-05 22:00', 'Ban > NZ'],
    ['2019-06-06 22:00', 'Aus > WI'],
    ['2019-06-07 22:00', 'Pak > SL'],
    ['2019-06-08 22:00', 'Eng > Ban'],
    ['2019-06-08 22:00', 'Afg > NZ'],
    ['2019-06-09 22:00', 'Ind > Aus'],
    ['2019-06-10 22:00', 'SAF > WI'],
    ['2019-06-11 22:00', 'Ban > SL'],
    ['2019-06-12 22:00', 'Aus > Pak'],
    ['2019-06-13 22:00', 'Ind > NZ'],
    ['2019-06-14 22:00', 'Eng > WI'],
    ['2019-06-15 22:00', 'SL > Aus'],
    ['2019-06-15 22:00', 'SAF > Afg'],
    ['2019-06-16 22:00', 'Ind > Pak'],
    ['2019-06-17 22:00', 'WI > Ban'],
]
for expiration, symbol in games:
    i = Instrument(expiration=expiration, symbol=symbol, name=re.sub('>', 'to beat', symbol), 
                   qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1,
                   price_mult=.01, min_price=0, max_price=100, price_incr=1,qty_incr=1)
    i.type=tp
    i.save()
for team in ('India', 'England', 'Afghanistan', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Australia', 'New Zealand', 'South Africa', 'West Indies'):
    i = Instrument(expiration='2019-07-14 22:22', symbol=team+"*", name=team + ' performance', 
                   qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1,
                   price_mult=.01, min_price=0, max_price=100, price_incr=1,qty_incr=1)
    i.type=perf_type
    i.save()

i=Instrument(expiration='2019-06-18 17:00',	symbol='Eng > Afg', name='Eng > Afg', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-19 17:00',	symbol='NZ > SAF', name='NZ > SAF', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-20 17:00',	symbol='Aus > Ban', name='Aus > Ban', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-21 17:00',	symbol='Eng > SL', name='Eng > SL', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-22 17:00',	symbol='Ind > Afg', name='Ind > Afg', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-22 17:00',	symbol='WI > NZ', name='WI > NZ', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-23 17:00',	symbol='Pak > SAF', name='Pak > SAF', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-24 17:00',	symbol='Ban > Afg', name='Ban > Afg', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-25 17:00',	symbol='Eng > Aus', name='Eng > Aus', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-26 17:00',	symbol='NZ > Pak', name='NZ > Pak', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-27 17:00',	symbol='WI > Ind', name='WI > Ind', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-28 17:00',	symbol='SL > SAF', name='SL > SAF', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-29 17:00',	symbol='Pak > Afg', name='Pak > Afg', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-29 17:00',	symbol='NZ > Aus', name='NZ > Aus', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-06-30 17:00',	symbol='Eng > Ind', name='Eng > Ind', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-07-01 17:00',	symbol='SL > WI', name='SL > WI', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-07-02 17:00',	symbol='Ban > Ind', name='Ban > Ind', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-07-03 17:00',	symbol='Eng > NZ', name='Eng > NZ', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-07-04 17:00',	symbol='Afg > WI', name='Afg > WI', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-07-05 17:00',	symbol='Pak > Ban', name='Pak > Ban', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-07-06 17:00',	symbol='SL > Ind', name='SL > Ind', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
i=Instrument(expiration='2019-07-06 17:00',	symbol='Aus > SAF', name='Aus > SAF', qty_unit=qty_unit, currency=ccy, owner=o, price_unit=price_unit,qty_mult=1, price_mult=1, min_price=0, max_price=100, price_incr=1,qty_incr=1)
i.type=tp
i.save()
