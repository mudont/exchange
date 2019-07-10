from django.shortcuts import render
from django.contrib.auth.decorators import login_required
import json
from django.contrib.auth import logout as log_out
from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from urllib.parse import urlencode
from .models import (Order, Instrument, OrderStatus, Trade)
from .serializers import InstrumentSerializer
from .util import get_order_book_data
# Create your views here.
def index(request):
    return render(request, 'index.html')


@login_required(login_url='/login')
def dashboard(request):
    user = request.user
    auth0user = user.social_auth.get(provider='auth0')
    userdata = {
        'user_id': auth0user.uid,
        'name': user.first_name,
        'picture': auth0user.extra_data['picture']
    }

    return render(request, 'dashboard.html', {
        'auth0User': auth0user,
        'userdata': json.dumps(userdata, indent=4)
    })


def logout(request):
    log_out(request)
    return_to = urlencode({'returnTo': request.build_absolute_uri('/')})
    logout_url = 'https://%s/v2/logout?client_id=%s&%s' % \
                 (settings.SOCIAL_AUTH_AUTH0_DOMAIN, settings.SOCIAL_AUTH_AUTH0_KEY, return_to)
    return HttpResponseRedirect(logout_url)


@login_required
def recent_trades(request):
    trades = Trade.objects.all().order_by('-timestamp')[:100]
    rows_html = "".join([(
        "<tr>" +
        '<td> {}<td style="text-align:right"> {:.0f}<td style="text-align:right"> {:.0f}<td>{}<td>{}<td>{}' +
        "</tr>").format(
            t.instrument.symbol,
            t.price,
            t.quantity,
            "Buy" if t.is_buyer_taker else "Sell",
            t.buy_order.trader.user if t.buy_order else "",
            t.sell_order.trader.user if t.sell_order else "",
        )
        for t in trades
    ])
    resp = """
        <table>
        <colgroup>
        <col  width="100">
        <col  width="50">
        <col  width="50">
        </colgroup>
        {}
        </table>
    """.format(rows_html)
    return HttpResponse(resp)

def get_instruments(request):
    data = [InstrumentSerializer(o).data for o in Instrument.objects.all()]
    return JsonResponse(data, safe=False)


@login_required
def order_book(request, sym):
    ladder = get_order_book_data(sym)
        
    style = """
        <colgroup>
        <col span="1" style="background-color:palegreen" width="50">
        <col style="background-color:white;text-align:right" width="50">
        <col style="background-color:salmon;text-align:right" width="50">
        </colgroup>
    """
    tbl = "".join([
        ('<tr> <td style="text-align:right"> {}</td>' + 
        '<td style="text-align:center"> {:3.0f}</td>' +  
        '<td style="text-align:right"> {}</td> </tr>').format(
        "" if b==0 else "{:.0f}".format(b),
        p,
        "" if s==0 else "{:.0f}".format(s)
        ) 
        for b,p,s in ladder[-1::-1]
      ]
    )
    return HttpResponse('Order  book for {} <br> <table> {} {} </table>'.format(
        sym, style, tbl))
