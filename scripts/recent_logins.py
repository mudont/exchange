import exchange_app.models as models
from datetime import timedelta

from django.utils import timezone


def run(days):
    social_logins = models.Login.objects.all().filter(timestamp__gte=timezone.now() - timedelta(days=int(days)))
    for sl in social_logins:
        print(sl)
