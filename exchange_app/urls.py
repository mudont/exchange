
from django.conf.urls import include, url
import exchange_app.views as views
from django.urls import path
urlpatterns = [

    path('order_book/<str:sym>', views.order_book),
    path('recent_trades/', views.recent_trades),
    path('get_instruments/', views.get_instruments),
]
