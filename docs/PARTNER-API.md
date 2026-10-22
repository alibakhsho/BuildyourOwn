# BuildYourOwn partner integration

What we need from a pricing or trades partner. The validation rules here are the ones in `src/partners/contracts.js`. If a record fails them, it is dropped, never shown.

All money is **integer cents, ex GST, AUD** unless `currency` says otherwise. All times are ISO 8601.

## Live material pricing

`POST {your endpoint}` with `{ items: [{ catalogueId, sku?, qty }], region }`. Respond with an array of:

```json
{
  "partnerId": "your_id",
  "sku": "PINE-90x45-MGP10",
  "gtin": "9300000000000",
  "catalogueId": "timber_mgp10_90x45",
  "description": "90x45 MGP10 pine, H2",
  "unit": "lm",
  "unitPriceCents": 650,
  "currency": "AUD",
  "region": "QLD",
  "minQty": 1,
  "leadTimeDays": 2,
  "stock": "in_stock",
  "deliveryCents": 9500,
  "validUntil": "2026-11-20T00:00:00Z",
  "exclusive": false
}
```

Rules:
- **`validUntil` is required.** We only put a price on a fixed quote while it's valid, and the quote's own validity is the earliest `validUntil` of its lines. Please hold the price until then.
- `unitPriceCents` must be a positive integer.
- `stock` is one of `in_stock | low | order_in | unknown`.
- We pick the lowest *landed* cost: `unitPriceCents × qty + deliveryCents`. Lead time breaks ties.
- We cache a price no longer than its `validUntil`.

## Tradies on demand

`POST {your endpoint}` with `{ trade, state, postcode, date }`. Respond with an array of:

```json
{
  "partnerId": "your_id",
  "tradieId": "t_123",
  "trade": "electrician",
  "businessName": "Bright Sparks Electrical",
  "abn": "51824753556",
  "licence": { "number": "123456", "state": "QLD", "expiresAt": "2027-01-01T00:00:00Z" },
  "insurance": { "publicLiabilityCents": 1000000000, "expiresAt": "2027-06-30T00:00:00Z" },
  "serviceAreas": ["4870", "4868"],
  "rate": { "type": "hourly", "amountCents": 11000 },
  "availableFrom": "2026-10-27T00:00:00Z"
}
```

A tradie is only offered to a client when:
- the licence (required for builder, plumber, electrician, HVAC, certifier) is unexpired **and issued in the job's state**;
- public liability is at least **A$5m** and unexpired;
- the job's postcode is in `serviceAreas`;
- `availableFrom` is on or before the requested date.

We also check licences against the state register ourselves.

`trade` is one of: builder, carpenter, concreter, bricklayer, roofer, plumber, electrician, plasterer, tiler, painter, landscaper, excavation, steel_fixer, glazier, cabinetmaker, hvac, waterproofer, surveyor, engineer, certifier.

## Security
- Your API key is stored on our server only, never in the browser or the mobile app.
- Requests from us carry no client personal information beyond postcode and state until a booking is confirmed.
