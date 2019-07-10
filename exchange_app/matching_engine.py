
from django.apps import apps
from django.utils import timezone
from decimal import Decimal
this_app = 'exchange_app'


def matching_engine(this, *args, **kwargs):
    """
    Order matching engine.
    TODO: Handle Max show size correctly. priority should reset.
    """

    class M(object):
        Order = apps.get_model(
            app_label=this_app, model_name='Order', require_ready=False)
        OrderStatus = apps.get_model(
            app_label=this_app, model_name='OrderStatus', require_ready=False)
        Trade = apps.get_model(
            app_label=this_app, model_name='Trade', require_ready=False)

        WORKING = OrderStatus.objects.get(abbrev='WORKING')
        COMPLETED = OrderStatus.objects.get(abbrev='COMPLETED')
        #print('DEBUG should print once +++++++++++++++++++++++++')
    obj_saved = False
    #import pdb; pdb.set_trace();
    # Look for Matchable orders
    if this.is_buy:
        # If Buy order, lookup all woriking Sell orders whose
        # limit price is less than or equal to this order's limit_price
        matching_orders = M.Order.objects.filter(
            instrument__symbol=this.instrument.symbol,
            limit_price__lte=this.limit_price,
            is_buy=(not this.is_buy),
            status=M.WORKING,
            expiration__gte=timezone.now(),
        ).order_by('limit_price', 'priority_time')
    else:
        # If Sell order, lookup all working Buy orders whose
        # limit price is greater than or equal to this order's limit_price
        matching_orders = M.Order.objects.filter(
            instrument__symbol=this.instrument.symbol,
            limit_price__gte=this.limit_price,
            is_buy=(not this.is_buy),
            status=M.WORKING,
            expiration__gte=timezone.now(),
        ).order_by('-limit_price', 'begin_time')
    #import pdb; pdb.set_trace()

    more_matching_size_available = False
    my_remaining_qty = this.quantity - this.filled_quantity
    if matching_orders:
        # Matched !!!
        for other in matching_orders:
            avail_qty = float(other.curr_slice)
            if avail_qty >= my_remaining_qty:
                trade_quantity = my_remaining_qty
                my_remaining_qty = 0
            else:
                trade_quantity = avail_qty
                my_remaining_qty -= trade_quantity
            # We have a trade!
            # Adjust filled quantity of both trades...
            other.filled_quantity += Decimal.from_float(trade_quantity)
            other.curr_slice -= Decimal.from_float(trade_quantity)

            if other.curr_slice == 0:
                # Slice is fully filled
                # Put another one in
                other.curr_slice = min(
                    other.max_show_size, other.quantity - other.filled_quantity)
                other.priority_time = timezone.now()
                more_matching_size_available = not not other.curr_slice

            this.filled_quantity += trade_quantity
            # Make sure no hanky panky
            assert(other.filled_quantity <= other.quantity)
            assert(this.filled_quantity <= this.quantity)
            # If this new trade completes either order, mark it as such
            if other.filled_quantity == other.quantity:
                other.status = M.COMPLETED
            if this.filled_quantity == this.quantity:
                this.status = M.COMPLETED
            # Save the matching order
            other.save()
            # save this incoming_order
            #print("DBG: args:{} kwargs:{}".format(args, kwargs))
            super(M.Order, this).save(*args, **kwargs)
            obj_saved = True
            kwargs['force_insert'] = False
            # Book the trade!
            M.Trade(
                instrument=this.instrument,
                quantity=trade_quantity,
                price=other.limit_price,
                buy_order=this if this.is_buy else other,
                sell_order=other if this.is_buy else this,
                is_buyer_taker=this.is_buy,
            ).save()
            if my_remaining_qty == 0:
                break
            elif more_matching_size_available:
                # We have more size to do and there are icebergs that would match
                # So go again
                return matching_engine(this, *args, **kwargs)
    # Done with matching this order
    # New order. Set curr_slice
    this.curr_slice = min(this.max_show_size,
                          this.quantity - this.filled_quantity)
    return obj_saved
# Bottom imports to avoid circular import issues
# Could also use get_model() approach as we did for Order
# both used for educational purposes
#from .models import (Trade, OrderStatus)
