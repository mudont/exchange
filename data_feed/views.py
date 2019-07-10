from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .models import FeedSubscription


@login_required
def index(request):
    """
    Root page view. This is essentially a single-page app, if you ignore the
    login and admin parts.
    """
    #print("DEBUG !!!!!!!")
    # Get a list of rooms, ordered alphabetically
    #rooms = Room.objects.order_by("title")

    # Render that in the index template
    return render(request, "data_feed.html", {
        #"rooms": rooms,
    })
