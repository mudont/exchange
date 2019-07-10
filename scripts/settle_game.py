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
import datetime as DT
from django.urls import reverse
import exchange_app.util as eu
import re

sym = sys.argv[1]

price = int(sys.argv[2])

if price not in [-1, 0, 100]  and  not re.search('\*$', sym):
    print ("invalid settle price", file=sys.stderr)

instr = Instrument.objects.get(symbol=sym)
for t in Trade.objects.filter(instrument__symbol=sym):
    if price == -1:
      t.is_valid=False
      t.invalid_reason='Rainout'
      instr.s_valid=False
      instr.invalid_reason='Rainout'

    else:
      instr.close_price = price
      instr.close_date = instr.expiration + DT.timedelta(hours=1)
    t.save()
    instr.save()
    print(t)

