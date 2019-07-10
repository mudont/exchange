from datetime import datetime, timedelta
from django.utils import timezone


def day_from_now():
    now = timezone.now()
    #start = now.replace(hour=22, minute=0, second=0, microsecond=0)
    return now + timedelta(days=1)


def long_time_in_future():
    now = timezone.now()
    #start = now.replace(hour=22, minute=0, second=0, microsecond=0)
    return now + timedelta(days=11000)
