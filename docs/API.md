# Backend API Reference

Base URL: `http://localhost:3001`

All endpoints (except `/health`) require the `X-API-Key` header.

## Health

```
GET /health
```

Response:
```json
{ "status": "ok", "rpc": "http://localhost:8899", "uptime": 123.45 }
```

## Stablecoin Status

```
GET /api/status/:mint
```

Response:
```json
{
  "mint": "...",
  "authority": "...",
  "name": "My USD",
  "symbol": "MUSD",
  "decimals": 6,
  "preset": "SSS-1",
  "paused": false,
  "totalMinted": "1000000",
  "totalBurned": "50000",
  "supply": "950000",
  "enablePermanentDelegate": false,
  "enableTransferHook": false,
  "defaultAccountFrozen": false
}
```

## Events

```
GET /api/events?stablecoin=<PUBKEY>&limit=50&offset=0
```

Response:
```json
{
  "events": [
    {
      "id": 1,
      "event_type": "TokensMinted",
      "stablecoin": "...",
      "data": "...",
      "signature": "...",
      "slot": 12345,
      "timestamp": 1700000000
    }
  ],
  "count": 1
}
```

## Operations

```
GET /api/operations?mint=<PUBKEY>&limit=50&offset=0
```

## Webhooks

### List

```
GET /api/webhooks
```

### Register

```
POST /api/webhooks
Content-Type: application/json

{
  "url": "https://example.com/webhook",
  "events": ["TokensMinted", "AddedToBlacklist"],
  "secret": "optional-secret"
}
```

### Delete

```
DELETE /api/webhooks/:id
```

## Docker

```bash
# Start everything
docker compose up -d

# Check backend health
curl http://localhost:3001/health

# Query status (with API key)
curl -H "X-API-Key: dev-api-key" http://localhost:3001/api/status/<MINT>
```
