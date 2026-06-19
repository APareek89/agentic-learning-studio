# Agentic Learning Studio — START HERE

An app that **generates interactive HTML learning artifacts** about agentic AI —
mental-map-first, click-to-deep-dive, an `(i)` popover on every term, personalized
to your industry, grounded in a knowledge base (RAG). Replaces video with
structured reading. Full design in **`DESIGN_SPEC.md`**.

## Run it

```bash
cp .env.example .env          # then set ANTHROPIC_API_KEY (others optional)
npm install
npm run migrate               # creates the RAG tables in Supabase (needs DATABASE_URL)
npm run dev                   # open http://localhost:5070
```

Only `ANTHROPIC_API_KEY` is required. Everything else (Supabase/RAG, Langfuse,
embeddings) is **graceful-optional** — the app boots and runs without it.

## Build status

| Step | What | State |
|---|---|---|
| 1 | Skeleton (config, reused lib, server, UI shell) | ✅ done — UI + stub flow verified |
| 2 | Blueprint schema (`src/render/schema.ts`) + local embedder (`src/rag/embed.ts`) | ✅ done — embeds 384-dim, gates implemented |
| 3 | Supabase RAG migration (`supabase/migrations/0001_rag.sql`) | ✅ done — pgvector + HNSW live |
| 4 | Ingestion (loaders, chunkers, store, ingest) | ⏳ next |
| 5 | Retrieval (hybrid vector+keyword, coverage) | ⏳ |
| 6 | Graph nodes (Profiler → … → Composer) — replaces the `/api/learn` stub | ⏳ |
| 7 | Template/render system (Blueprint → interactive HTML) | ⏳ |
| 8 | UI polish (already scaffolded) | ⏳ |
| 9 | Lazy per-module deep-dive + cache | ⏳ |
| 10 | Web-search + daily-scan stubs | ⏳ |

## Useful commands

```bash
npm run embed:test    # verify the local embedding model works (downloads ~130MB once)
npm run migrate       # (re-)apply supabase/migrations/*.sql (idempotent)
npm run ingest -- "/path/to/docs"   # (step 4) load documents into the RAG store
```

## Notes

- Port is **5070** (5060 is blocked by Chrome).
- First embedder run downloads ~130 MB of model weights to `.transformers-cache/`.
  Behind a corporate proxy, set `NODE_EXTRA_CA_CERTS` to your CA bundle.
- The model emits a **Blueprint (JSON) only** — a deterministic renderer makes all
  HTML/JS. That's the core reliability guarantee.
