from exchange_app.models import (
    Instrument, Order, Trader, Account, OrderType, OrderStatus, Trade)
from django.utils import timezone
from django.db.models import Q
import itertools as it


def get_hello(user):
    t = Trader.objects.filter(user__username=user.username).first()
    if t:
        credit_limit = float(t.credit_limit)
    else:
        credit_limit = 0.0
    return [{
        '_type': 'Hello',
        'username': user.username,
        'credit_limit': credit_limit
    }]


def get_order_book_data(sym):
    instr = Instrument.objects.get(symbol=sym)
    minp = float(instr.min_price)
    maxp = float(instr.max_price)
    orders = Order.objects.filter(
        instrument__symbol=sym,
        expiration__gte=timezone.now(),
        limit_price__gte=instr.min_price,
        limit_price__lte=instr.max_price,
        status=OrderStatus.objects.get(abbrev='WORKING')
    ).order_by('-limit_price')
    if orders:
        max_price = float(orders[0].limit_price) + 5
        min_price = float(orders[len(orders)-1].limit_price) - 5
        max_price = min(maxp, max_price)
        min_price = max(min_price, minp)
    else:
        min_price = (maxp+minp)/2 - 5
        max_price = (maxp+minp)/2 + 5
    ladder = [[0, p, 0] for p in range(int(min_price), int(max_price) + 1)]
    #import pdb;pdb.set_trace()
    for o in orders:
        price, qty, mss, curr_slice = float(o.limit_price), float(
            o.quantity), float(o.max_show_size), float(o.curr_slice)
        if curr_slice:
            show_qty = curr_slice
        else:
            show_qty = min(mss, qty - float(o.filled_quantity))

        ix = int(price - min_price)
        #assert ix >= 0, 'bad order price {} for sym {}'.format(price, sym)
        #assert(max_price - ix > -0.1)

        side_ix = 0 if o.is_buy else 2
        ladder[ix][side_ix] += float(show_qty)
    ###
    # Remove the 0 entries
    # We no longer need them
    ladder = [[a, b, c] for a, b, c in ladder if a != 0 or c != 0]
    #print('Filterd ladder = ', ladder)
    return sorted(ladder, key=lambda x: x[1], reverse=True)


def has_credit_for(trader, instrument, is_buy, quantity, price):
    credit_limit = trader.credit_limit
    pnl, crash_risk = get_my_pnl(trader.user)
    order_risk = quantity * (instrument.min_price - price) * instrument.price_mult * instrument.qty_mult \
        if is_buy else quantity * (price-instrument.max_price) * instrument.price_mult * instrument.qty_mult
    order_risk = min(0, order_risk)
    print("credit check: ", credit_limit, pnl, crash_risk, order_risk)
    return credit_limit + pnl + crash_risk + order_risk > 0


def new_order(user, data):
    trader = Trader.objects.get(user=user)
    is_buy = bool(data['is_buy'])
    quantity = float(data['quantity'])
    symbol = data['symbol']
    instrument = Instrument.objects.get(symbol=symbol)
    type = OrderType.objects.get(abbrev='LMT')
    max_show_size = data.get('max_show_size', quantity)
    status = OrderStatus.objects.get(abbrev='WORKING')
    limit_price = data.get('limit_price')
    if not has_credit_for(trader, instrument, is_buy, quantity, limit_price):
        return [{'_type': 'Error', 'message': 'Insufficient Credit limit for Order'}]
    acc = Account.objects.get(name=user.get_full_name() + ' a/c')
    o = Order(instrument=instrument, account=acc, trader=trader,
              type=type, is_buy=is_buy, quantity=quantity, max_show_size=max_show_size,
              limit_price=limit_price, status=status)
    o.save()
    res = data.copy()
    res.update({'_type': 'Success', 'id': o.id})
    return([res])


def cancel_order(user, data):
    o = Order.objects.filter(trader__user=user, id=data['id']).first()
    res = data.copy()
    if o:
        o.status = OrderStatus.objects.get(abbrev='CANCELED')
        o.save()
        res['_type'] = 'Success'
    else:
        res['_type'] = 'Error'
        res['message'] = 'Order id {} not found under {}'.format(
            data['id'], user.username)
    return [res]


def get_instruments(user):
    return [
        {
            '_type': 'Instrument',
            'symbol': o.symbol,
            'name': o.name,
        } for o in Instrument.objects.filter(
            expiration__gt=timezone.now()
        ).order_by('expiration')
    ]


def get_my_orders(user):
    return [
        {
            '_type': 'my_orders',
            'id': o.id,
            'begin_time': str(o.begin_time),
            'symbol': o.instrument.symbol,
            'is_buy': o.is_buy,
            'quantity': int(o.quantity),
            'limit_price': float(o.limit_price),
            'filled_quantity': int(o.filled_quantity),
            'curr_slice': float(o.curr_slice),
            'max_show_size': int(o.max_show_size),
            'status': o.status.abbrev,
        } for o in Order.objects.filter(
            trader__user=user,
            status__abbrev='WORKING',
            expiration__gt=timezone.now()
        ).order_by('-status', 'id')
    ]


def get_mkt_price(sym):
    from django.db.models import Min, Max
    instr = Instrument.objects.get(symbol=sym)
    if instr.close_date and instr.close_date >= instr.expiration:
        return instr.close_price
    minp = float(instr.min_price)
    maxp = float(instr.max_price)
    try:
        ask = Order.objects.filter(
            instrument__symbol=sym,
            status=OrderStatus.objects.get(abbrev='WORKING'),
            expiration__gt=timezone.now(),
            is_buy=False).aggregate(Min('limit_price'))['limit_price__min']
    except:
        ask = maxp

    try:
        bid = Order.objects.filter(
            instrument__symbol=sym,
            status=OrderStatus.objects.get(abbrev='WORKING'),
            expiration__gt=timezone.now(),
            is_buy=True).aggregate(Max('limit_price'))['limit_price__max']
    except:
        bid = minp
    price = ((float(bid or 0) or minp) + (float(ask or 0) or maxp))/2.0
    #print ('DEBUG price of {} is {}'.format(sym, price))
    return price


def get_my_pnl(user):
    pnl = 0
    crash_risk = 0
    for p in get_my_positions(user):
        pnl += p['pnl']
        crash_risk += p['crash_risk']
    return pnl, crash_risk


def _crash_risk(curr_price, min_price, max_price, px, pos, qx):
    if pos > 0:
        crash_risk = (float(min_price) - curr_price)*px * pos * qx
    else:
        crash_risk = (float(max_price) -
                      curr_price)*px * pos * qx
    crash_risk = min(0, crash_risk)
    return crash_risk


def get_my_positions(user):
    def get_pos_info(sym, iterable):
        instr = Instrument.objects.get(symbol=sym)
        is_live = instr.expiration > timezone.now()
        #tickunit = instr.price_mult * instr.qty_mult
        pos = 0
        cost_basis = 0
        curr_price = get_mkt_price(sym)
        for (sym, qty, qx, price, px) in iterable:
            #print("dbg",sym,qty, price)
            pos += qty
            cost_basis += qty*qx * price*px
        mkt_val = pos*qx * curr_price*px
        pnl = mkt_val - cost_basis
        if is_live:
            crash_risk = _crash_risk(curr_price, instr.min_price, instr.max_price, px, pos, qx)
        else:
            crash_risk = 0

        return {
            '_type': 'my_positions',
            'symbol': sym,
            'position': pos,
            'price': curr_price,
            'cost_basis': cost_basis,
            'mkt_val': mkt_val,
            'pnl': pnl,
            'crash_risk': crash_risk,
        }
    import itertools as it
    buys = [
        (t.instrument.symbol, float(t.quantity), t.instrument.qty_mult,
         float(t.price), t.instrument.price_mult) for t in
        Trade.objects.filter(buy_order__trader__user=user, is_valid=True)
    ]
    sells = [
        (t.instrument.symbol, -1 * float(t.quantity), t.instrument.qty_mult,
         float(t.price), t.instrument.price_mult) for t in
        Trade.objects.filter(sell_order__trader__user=user, is_valid=True)
    ]

    return [get_pos_info(sym, i) for (sym, i) in
            it.groupby(sorted(buys+sells), lambda x: x[0])]

    # | Q(sell_order__trader__user=user)


def get_all_positions():
    def get_pos_info(username, sym, iterable):
        instr = Instrument.objects.get(symbol=sym)
        is_live = instr.expiration > timezone.now()
        #tickunit = instr.price_mult * instr.qty_mult
        pos = 0
        cost_basis = 0
        curr_price = get_mkt_price(sym)
        for (user, sym, qty, qx, price, px) in iterable:
            #print("dbg",sym,qty, price)
            pos += qty
            cost_basis += qty*qx * price*px
        mkt_val = pos*qx * curr_price*px
        pnl = mkt_val - cost_basis
        if is_live:
            crash_risk = _crash_risk(curr_price, instr.min_price, instr.max_price, px, pos, qx)
        else:
            crash_risk = 0

        return {
            '_type': 'my_positions',
            'username': username,
            'symbol': sym,
            'position': pos,
            'price': curr_price,
            'cost_basis': cost_basis,
            'mkt_val': mkt_val,
            'pnl': pnl,
            'crash_risk': crash_risk,
        }

    buys = [
        (t.buy_order.trader.user.username, t.instrument.symbol, float(t.quantity), t.instrument.qty_mult,
         float(t.price), t.instrument.price_mult) for t in
        Trade.objects.filter(is_valid=True)
    ]
    sells = [
        (t.sell_order.trader.user.username, t.instrument.symbol, -1 * float(t.quantity), t.instrument.qty_mult,
         float(t.price), t.instrument.price_mult) for t in
        Trade.objects.filter(is_valid=True)
    ]

    return [get_pos_info(user, sym, i) for ((user, sym), i) in
            it.groupby(sorted(buys+sells), lambda x: (x[0], x[1]))]

    # | Q(sell_order__trader__user=user)


def get_leaderboard():
    leaderboard = []
    for username, userPos in it.groupby(get_all_positions(), lambda pos: (pos['username'])):
        pnl = 0.0
        crash_risk = 0.0
        for pos in userPos:
            pnl += pos['pnl']
            crash_risk += pos['crash_risk']
        leaderboard.append(
            {'_type': 'leaderboard', 'username': username, 'pnl': pnl, 'crash_pnl': crash_risk})
    sorted_lb = sorted(leaderboard, key=lambda x: x['pnl'], reverse=True)
    for i, lb in enumerate(sorted_lb):
        lb['rank'] = i+1
    return sorted_lb
