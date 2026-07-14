---
title: "Streaming LLM Responses Token-by-Token (SSE)"
category: "Deployment & serving / gateways"
url: "https://docs.claude.com/en/docs/build-with-claude/streaming"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-07-14"
sources:
  - {url: "https://docs.claude.com/en/docs/build-with-claude/streaming", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://platform.openai.com/docs/api-reference/streaming", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://ai-sdk.dev/docs/ai-sdk-ui/streaming", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

Streaming delivers a model's response incrementally — token by token, or in small deltas — as it is generated, instead of waiting for the whole message and returning it in one block. Over HTTP this is almost always Server-Sent Events (SSE): the provider sends a `text/event-stream` of `data:` chunks, and your server relays those deltas to the browser so text appears as it's produced. It is the difference between a five-second blank wait and words that start flowing in a few hundred milliseconds.

## Why it exists / when to reach for it

Generation is output-bound: a long answer takes seconds because the tokens are produced serially, not because of a slow lookup. Streaming doesn't make it finish sooner, but it slashes *perceived* latency — the user sees progress immediately and can start reading (or stop a wrong answer early). Reach for streaming for any user-facing chat or long-form generation UI. Skip it for short, machine-consumed responses (a JSON classification you parse in one shot) where partial output has no value.

## The moving parts

- Provider stream: the model API called with `stream=true`, returning an SSE event stream of deltas.
- Delta events: incremental pieces (`content_block_delta` on Anthropic, `chat.completion.chunk` on OpenAI) plus start/stop and usage events.
- Server relay: your backend consumes the provider stream and re-emits SSE (or a fetch `ReadableStream`) to the client — never expose your API key to the browser.
- Client consumer: `EventSource` or `fetch()` reading `response.body` as a stream, appending each delta to the UI.
- Backpressure/abort: an `AbortController` so a user who navigates away or hits stop cancels the upstream call (saving tokens).
- Framing for tools: tool-call arguments also arrive as deltas — accumulate them before executing.

## How it works

Your server calls the model with streaming on and gets an async iterator of events. For each text delta it writes an SSE frame (`data: {"delta":"..."}\n\n`) to the open HTTP response and flushes. The browser opens the stream (via `EventSource` for GET, or `fetch` + a `ReadableStream` reader for POST/auth headers), reads frames as they arrive, and appends the text to the message being rendered. On the final event you close the stream and can read token-usage totals. Keep the connection alive (disable proxy buffering, e.g. `X-Accel-Buffering: no`), send periodic keep-alives on idle, and wire an abort so closing the tab cancels the upstream generation. A gateway (LiteLLM, a proxy) can sit in the middle and must pass the stream through unbuffered.

## When to use vs alternatives

SSE is the default for one-way server→client token streams — simple, HTTP-native, auto-reconnecting. Use WebSockets only when you need full-duplex (live voice, collaborative). Use a plain non-streamed request for short structured outputs where partial text is useless. Higher-level UI libraries (e.g. the Vercel AI SDK) wrap all of this so you handle a stream, not raw SSE frames.

## Failure modes & gotchas

- Proxy/CDN buffering holds the whole response and defeats streaming → disable buffering and flush per chunk.
- Leaking the API key: calling the provider directly from the browser exposes it — always relay through your server.
- No abort: a user who leaves keeps generating tokens you pay for → wire `AbortController` to the request lifecycle.
- Parsing text as JSON mid-stream: structured/tool output is only valid once complete — accumulate deltas, then parse.
- Dropped reconnects: `EventSource` auto-retries and may replay — make appends idempotent or track an offset.
- Error mid-stream: a failure after some tokens needs an in-band error event, not a silent stop.

## Minimal code shape (what you write)

```js
// server (Express): relay the provider stream as SSE
res.set({ "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" });
const stream = await anthropic.messages.stream({ model, messages, max_tokens: 1024 });
for await (const ev of stream)
  if (ev.type === "content_block_delta")
    res.write(`data: ${JSON.stringify({ delta: ev.delta.text })}\n\n`);
res.end();
```

```js
// client: read the stream and append
const r = await fetch("/chat", { method: "POST", body });
const reader = r.body.getReader(), dec = new TextDecoder();
for (let x; !(x = await reader.read()).done; )
  ui.append(dec.decode(x.value));   // parse SSE frames → delta
```

## Key links

- Anthropic streaming — https://docs.claude.com/en/docs/build-with-claude/streaming
- OpenAI streaming — https://platform.openai.com/docs/api-reference/streaming
- Vercel AI SDK streaming — https://ai-sdk.dev/docs/ai-sdk-ui/streaming
