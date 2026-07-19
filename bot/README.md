# OneBot 11 bot worker

Standalone Node.js 22 worker for a OneBot 11 **reverse WebSocket** connection. It has no database dependency and must never import or connect Prisma. Durable deduplication, account binding, authorization, drafts, and form state belong to the application API.

## Behavior

- Connects as a WebSocket client to `ONEBOT_WS_URL` and authenticates with `Authorization: Bearer <ONEBOT_ACCESS_TOKEN>`.
- Calls `get_login_info` after connecting and stays unready until its `user_id` equals `ONEBOT_EXPECTED_SELF_ID`.
- Accepts private `message` events only. Group messages, notices, requests, and mismatched `self_id` events are dropped locally and no group/user/message details are forwarded or logged.
- Routes exact Chinese commands `帮助`, `绑定`, `状态`, `新建委托`, `取消`, and `草稿`. `绑定 <code>` carries an optional binding argument. Other text is a form answer.
- Sends every accepted input to the internal API. The API atomically deduplicates the event, advances the conversation, and returns messages. This is how a complete multi-step form works without local state.
- Sends each returned reply with the OneBot 11 `send_private_msg` action.
- After identity verification, polls the authenticated app outbox in batches of at most ten, correlates each `send_private_msg` result by an opaque OneBot `echo`, and acknowledges success or a bounded failure code. Polling stops whenever readiness is lost.
- Processes messages in arrival order, reconnects with capped exponential backoff and jitter, sends WebSocket ping frames, enforces payload limits, and never logs message text, URLs, tokens, API response bodies, or raw errors.

## Configuration

Use `.env.example` as a configuration reference. The worker does not load dotenv files; inject environment variables through the process/container runtime. The example values are placeholders, not usable secrets.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ONEBOT_WS_URL` | yes | `ws:` or `wss:` reverse-WebSocket endpoint; credentials in the URL are rejected |
| `ONEBOT_ACCESS_TOKEN` | yes | OneBot handshake bearer token |
| `ONEBOT_EXPECTED_SELF_ID` | yes | Expected bot QQ/self ID |
| `ONEBOT_ALLOWED_USER_IDS` | yes | Comma-separated QQ IDs accepted during the controlled rollout |
| `INTERNAL_API_BASE_URL` | yes | Application base URL over HTTP(S) |
| `INTERNAL_API_TOKEN` | yes | Dedicated bearer token for the bot API |
| `MAX_MESSAGE_BYTES` | no, `65536` | Maximum inbound frame, user text, API response, reply, and action size |
| `HTTP_TIMEOUT_MS` | no, `10000` | API and WebSocket handshake timeout |
| `WS_HEARTBEAT_MS` | no, `30000` | Ping interval; readiness fails after two intervals without pong |
| `RECONNECT_MIN_MS` | no, `1000` | Initial reconnect delay |
| `RECONNECT_MAX_MS` | no, `30000` | Maximum reconnect delay |
| `OUTBOX_POLL_MS` | no, `3000` | Delay between successful outbox claims |
| `OUTBOX_RETRY_MAX_MS` | no, `30000` | Maximum exponential delay after claim failures |
| `ONEBOT_ACTION_TIMEOUT_MS` | no, `10000` | Maximum wait for a correlated OneBot action result |
| `HEALTH_HOST` | no, `0.0.0.0` | Health listener address |
| `HEALTH_PORT` | no, `8081` | Health listener port |

## Internal API contract

The app APIs do not exist yet. The worker deliberately defines one versioned endpoint so the app can implement deduplication and state changes in one atomic operation.

### Request

`POST /v1/internal/onebot/messages`

Headers:

```http
Authorization: Bearer <INTERNAL_API_TOKEN>
Content-Type: application/json
Idempotency-Key: <selfId>:<OneBot message_id>
```

Command body:

```json
{
  "version": 1,
  "eventId": "1000000000:12345",
  "platform": "onebot11",
  "selfId": "1000000000",
  "userId": "2000000000",
  "occurredAt": "2026-07-19T10:00:00.000Z",
  "input": {
    "type": "command",
    "command": "新建委托"
  }
}
```

Binding can include `"argument": "one-time-code"`. A form answer uses:

```json
{
  "input": {
    "type": "text",
    "text": "这是当前问题的答案"
  }
}
```

The real request includes all top-level fields shown in the command example.

### Response

Return `200` with:

```json
{
  "duplicate": false,
  "replies": ["请填写委托标题。"],
  "conversation": {
    "state": "delegation_form",
    "revision": "opaque-revision-2",
    "prompt": "title"
  }
}
```

Contract rules:

- Authenticate the dedicated token before reading or processing the body.
- Atomically store/claim `eventId`, apply the command or answer against the latest server-side state, and store the response. A repeated event must return the original response with `duplicate: true`; it must not apply the answer twice. The worker suppresses all replies when `duplicate` is true.
- `state` is one of `idle`, `binding`, `delegation_form`, or `draft`. `revision` is an opaque non-empty application value. `prompt` is an opaque field key or `null`.
- `replies` contains zero to ten plain-text OneBot messages. The worker does not interpret form fields: prompts, validation errors, confirmation, cancellation, draft saving/resumption, binding, and status text all come from this response.
- `帮助` should return command help. `新建委托` starts/resumes the form. `取消` and `草稿` apply to current server state. `绑定` and `状态` must enforce app-side security and authorization.
- Use `401`/`403` for authentication failure, `400` for an invalid contract, `409` only for a non-idempotency conflict, `429` for rate limiting, and `5xx` for temporary failures. Any non-2xx result produces a generic private failure message; response details are never relayed or logged.
- Keep this endpoint internal. Validate QQ IDs as untrusted external identifiers and do not trust OneBot display names or message metadata for authorization.

## Outbox API contract

Both endpoints require `Authorization: Bearer <INTERNAL_API_TOKEN>` and `Content-Type: application/json`. The worker polls only after the WebSocket is open, heartbeat-current, and verified as `ONEBOT_EXPECTED_SELF_ID`. It uses one claim at a time and applies bounded exponential retry delays after claim errors.

### Claim

`POST /v1/internal/onebot/outbox/claim`

Request:

```json
{
  "selfId": "1000000000",
  "limit": 10
}
```

Return `200` with a JSON array containing zero to ten leased records:

```json
[
  {
    "id": "opaque-outbox-id",
    "userId": "2000000000",
    "content": "委托状态已更新。"
  }
]
```

The app must atomically lease records to this bot identity. A lease must remain unavailable to other claimers until acknowledged or until an app-defined lease timeout expires. `id`, `userId`, and `content` must be non-empty strings; content must fit `MAX_MESSAGE_BYTES`. Empty work is `[]`.

### Acknowledge

`POST /v1/internal/onebot/outbox/:id/ack`

The path ID is URL-encoded. Successful OneBot result (`status: "ok"`, `retcode: 0`):

```json
{
  "success": true,
  "providerMessageId": "987654"
}
```

`providerMessageId` is omitted if OneBot succeeds without returning `data.message_id`. Failed delivery:

```json
{
  "success": false,
  "errorCode": "ONEBOT_REJECTED"
}
```

`errorCode` is one of `ONEBOT_REJECTED`, `ONEBOT_TIMEOUT`, `CONNECTION_LOST`, or `ACTION_TOO_LARGE`. Return `200` with any valid JSON value or `204` after durably recording the result. Ack must be idempotent. The app decides whether a failed record is terminal or becomes eligible for a bounded application-side retry; the worker does not repeatedly send a claimed record in memory. If ack itself fails, the lease timeout provides recovery.

The worker logs only generic claim/ack/action events. It never logs outbox IDs, recipient IDs, content, provider message IDs, endpoint URLs, or credentials.

## Health

- `GET /livez` returns `200` while the process can serve HTTP.
- `GET /healthz` returns `200` only while the WebSocket is open, `get_login_info` verified the expected self ID, and heartbeat pong activity is current. It returns `503` during startup, reconnects, stale connections, and identity mismatch.
- Other paths return `404`. Health responses use `Cache-Control: no-store` and expose no configuration.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

Run those commands from `bot/`. Build the isolated image with:

```sh
docker build -t onebot-worker ./bot
```
