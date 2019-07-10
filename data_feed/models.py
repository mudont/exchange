from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model
from exchange.util import day_from_now

class FeedSubscription(models.Model):
    """
    FeedSub
    """
    feed = models.CharField(max_length=255)
    user = models.ForeignKey(to=get_user_model(), on_delete=models.PROTECT)

    begin_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField(null=True)


    def __str__(self):
        return self.user.username

