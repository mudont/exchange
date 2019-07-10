from django.urls import path

from channels.http import AsgiHandler
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import OriginValidator

from data_feed.consumers import DataFeedConsumer
#from data_feed.token_auth import TokenAuthMiddlewareStack


from .token_auth import TokenAuthMiddlewareStack

application = ProtocolTypeRouter({ 
    "websocket": OriginValidator(
         TokenAuthMiddlewareStack( 
             URLRouter([ 
            # URLRouter just takes standard Django path() or url() entries.
            path("data_feed/stream/", DataFeedConsumer),
         ]) ),
         # ["*"] means don't do any Origin validation
         ["*"] ), 
    })

