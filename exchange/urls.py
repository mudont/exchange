"""exchange URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/2.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, re_path
from django.conf.urls import url, include
import exchange_app
from . import views
import data_feed.views as data_feed_views
from django.views.generic import TemplateView
from rest_framework_simplejwt import views as jwt_views
from rest_framework import routers, viewsets
from exchange_app import api_views

router = routers.DefaultRouter()
router.register(r'instruments', api_views.InstrumentViewSet)

urlpatterns = [
    path('data_feed/', data_feed_views.index),
    path('dashboard', views.dashboard),
    path(r'login', views.index),
    path(r'logout', views.logout),
    path('', include('django.contrib.auth.urls')),
    path('', include('social_django.urls')),
    path('admin/', admin.site.urls),
    re_path(r"^exchange/", include('exchange_app.urls')),
    path('react/', TemplateView.as_view(template_name='react.html')),
    path('', views.dashboard),

    url(r'^', include(router.urls)),
    path('api/token/', jwt_views.TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', jwt_views.TokenRefreshView.as_view(), name='token_refresh'),
    path('hello/', views.HelloView.as_view(), name='hello'),
    re_path(r'^api/public$', views.public),
    re_path(r'^api/private$', views.private),
    re_path(r'^api/private-scoped$', views.private_scoped),
    re_path(r'^api-token/', views.get_token)
]
