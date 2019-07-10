## Order matching

Incoming order

- Lookup order book(all orders for this instrument)
- check margin (can this trader afford it)
- check trader has permission for account
- check expired instr
- Is order fillable?
  + Yes
    - If self match, reject (paint the tape voilation)
    - Fill as much as possible
      + update fill size of this order
      + update fill sizes of matched orders
      + insert trade rows
      + update status of orders if completed
  + Yes/No
    - insert order
    - deal with max show size


## Cancel Order
- Lookup order
- check user. Reject if different
- update status as cnaceled

## Final settlement
 When instrument expires, book closing trades for open positions


## Auctions
- Only owner of instrument can make sell offers
- Need a job that waits for expirations and settles the instruments
- order type : Market order after some time if secret reservation price
  is met