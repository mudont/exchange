#!/usr/bin/env python
#import exchange.settings
import os, sys
PATH=os.environ['HOME'] + '/exchange'
print (PATH)
sys.path.append(PATH)
from django.core.wsgi import get_wsgi_application
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'exchange.settings')
application = get_wsgi_application()
import time

# your imports, e.g. Django models
from django.contrib.auth.models import Group, Permission, User
from django.contrib.contenttypes.models import ContentType
from django.contrib.sessions.models import Session
from exchange_app.models import Account, Balance, Currency, Instrument, InstrumentType, Login, Order, OrderStatus, OrderType, Organization, SocialAccount, Trade, Trader, TraderPermission, Unit
from guardian.models import GroupObjectPermission, UserObjectPermission
from rest_framework.authtoken.models import Token
from social_django.models import Association, Code, Nonce, Partial, UserSocialAuth
# Shell Plus Django Imports
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Avg, Case, Count, F, Max, Min, Prefetch, Q, Sum, When, Exists, OuterRef, Subquery
from django.utils import timezone
from django.urls import reverse
import exchange_app.util as eu

fair_prices = {
#  'Eng > SAF': 60,
#  'WI > Pak': 44,
#  'NZ > SL': 60,
#  'Afg > Aus': 10,
#  'SAF > Ban': 65,
#  'Eng > Pak': 60,
#  'Afg > SL': 15,
 'SAF > Ind': 40,
 'Ban > NZ': 40,
 'Aus > WI': 65,
 'Pak > SL': 60,
 'Eng > Ban': 75,
 'Afg > NZ': 10,
 'Ind > Aus': 50,
 'SAF > WI': 55,
 'Ban > SL': 50,
 'Aus > Pak': 60,
 'Ind > NZ': 60,
 'Eng > WI': 60,
 'SL > Aus': 25,
 'SAF > Afg': 85,
 'Ind > Pak': 60,
 'WI > Ban': 52,
 'Eng > Afg': 90,
 'NZ > SAF': 50,
 'Aus > Ban': 75,
 'Eng > SL': 65,
 'Ind > Afg': 90,
 'WI > NZ': 45,
 'Pak > SAF': 45,
 'Ban > Afg': 65,
 'Eng > Aus': 55,
 'NZ > Pak': 55,
 'WI > Ind': 40,
 'SL > SAF': 45,
 'Pak > Afg': 80,
 'NZ > Aus': 45,
 'Eng > Ind': 52,
 'SL > WI': 50,
 'Ban > Ind': 35,
 'Eng > NZ': 60,
 'Afg > WI': 20,
 'Pak > Ban': 60,
 'SL > Ind': 35,
 'Aus > SAF': 55,

 'EngWChamp19': 33,
 'IndWChamp19': 23,
 'AusWChamp19': 20,
 'WIWChamp19': 5,
 'AfgWChamp19': 1,
 'NZWChamp19': 8,
 'SLWChamp19': 1,
 'BanWChamp19': 1,
 'PakWChamp19': 5,
 'SAWChamp19': 9,
# eng 2/1, ind 10/3, aust 4/1, nz 10/1, wi 20/1, pak, 20/1, ban 150/1, sl 200/1 afg 200/1
 'India*': 55,
 'England*': 65,
 'Afghanistan*': 6,
 'Pakistan*': 30,
 'Bangladesh*': 25,
 'Sri Lanka*': 25,
 'Australia*': 50,
 'New Zealand*': 40,
 'South Africa*': 40,
 'West Indies*': 20,
}

half_spread = 4

template = {
'quantity': 10,
'max_show_size': 100,
}
me = User.objects.filter(email='maverickone@gmail.com').first()
for o in eu.get_my_orders(me):
    print('deleting ', o['id'])
    eu.cancel_order(me, o)
    #time.sleep(1)

for symbol in fair_prices.keys():
    print ("symbol {}".format(symbol))
    price = fair_prices[symbol] - half_spread
    if price > 0:
        buy = template.copy()
        buy['is_buy'] = True
        buy['symbol'] = symbol
        buy['limit_price'] = price
        try:
          eu.new_order(me, buy)
        except Exception as e:
          print(str(e))   

    price = fair_prices[symbol] + half_spread
    if price < 100:
        sell= template.copy()
        sell['is_buy'] = False
        sell['symbol'] = symbol
        sell['limit_price'] = price
        try:
          eu.new_order(me, sell)
        except Exception as e:
          print(str(e))   
