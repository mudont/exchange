from channels.db import database_sync_to_async

from .exceptions import ClientError
from .models import FeedSubscription
from exchange_app.models import Instrument, Order, Trader, Account, OrderType, OrderStatus
import exchange_app.util as ea_util
from django.contrib.auth import get_user_model
from exchange_app.util import get_order_book_data
from django.utils import timezone
# This decorator turns this function from a synchronous function into an async one
# we can call from our async consumers, that handles Django DBs correctly.
# For more, see http://channels.readthedocs.io/en/latest/topics/databases.html
@database_sync_to_async
def get_room_or_error(room_id, user):
    """
    Tries to fetch a room for the user, checking permissions along the way.
    """
    # Check if the user is logged in
    if not user.is_authenticated:
        raise ClientError("USER_HAS_TO_LOGIN")
    # Find the room they requested (by ID)
    try:
        room = FeedSubscription.objects.get(pk=room_id)
    except FeedSubscription.DoesNotExist:
        raise ClientError("ROOM_INVALID")
    # Check permissions
    #if room.staff_only and not user.is_staff:
     #   raise ClientError("ROOM_ACCESS_DENIED")
    return room

@database_sync_to_async
def get_default_user():
    # Using guardian app's anonymous user a/c
    print("WARNING: Websocket autheticating with anonymous user")
    return get_user_model().objects.get(username='AnonymousUser')

@database_sync_to_async
def get_user(id):
    # Using guardian app's anonymous user a/c
    #print("WARNING: Websocket autheticating woht anonymous user")
    return get_user_model().objects.get(id=id)

@database_sync_to_async
def get_instruments(id):
    # Using guardian app's anonymous user a/c
    #print("WARNING: Websocket autheticating woht anonymous user")
    return Instrument.objects.get(id=id)

@database_sync_to_async
def get_order_books(user):

    try:
      obs= [{
            '_type': 'Depth',
            'ts': str(timezone.now()),
            i.symbol: get_order_book_data(i.symbol)
        } for i in Instrument.objects.all()]
    except Exception as e:
        print("exception get_order_books()", e)
        return []
    print("DEBUG 2 gob")
    return obs

@database_sync_to_async
def run_command(user, command):
    action=command['command']
    if action == "hello":
        return ea_util.get_hello(user)
    if action == "order":
        return ea_util.new_order(user, command)
    elif action == "cancel":
        return ea_util.cancel_order(user, command)
    elif action == 'get_my_orders':
        return ea_util.get_my_orders(user)
    elif action == 'get_my_positions':
        return ea_util.get_my_positions(user)
    elif action == 'get_instruments':
        return ea_util.get_instruments(user)
    elif action == 'get_leaderboard':
        return ea_util.get_leaderboard()
    else:
        print("Unknown command. Not executing")
