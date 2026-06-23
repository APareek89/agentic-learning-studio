---
title: Chunking Strategies
category: RAG tooling
url: https://docs.langchain.com/oss/python/integrations/splitters
license: "Official docs; original synthesis only"
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.langchain.com/oss/python/integrations/splitters", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/langchain-ai/langchain", license: "MIT", kind: "oss_repo"}
  - {url: "https://developers.llamaindex.ai/python/framework/module_guides/supporting_modules/settings/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://developers.llamaindex.ai/python/framework/understanding/rag/", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

Chunking is the step that turns source material into retrievable units. A chunk may be a paragraph, heading section, table summary, code block, transcript segment, or a fixed token window. It is not just preprocessing. It defines the evidence shape that retrieval can return and the context shape an LLM can use.

Good chunks are small enough to rank precisely and large enough to carry the needed meaning. They also keep metadata such as title, heading path, source URL, version, date, tenant, permissions, and neighboring relationships.

## Why it exists / when to reach for it

LLMs and retrieval systems both operate under budgets. The model cannot read an entire corpus for every question, and vector search works best when each indexed unit has a focused semantic signal. Chunking is how a long source becomes searchable without losing structure.

Reach for chunking design whenever retrieval misses obvious answers, returns noisy context, cites only fragments, or performs differently across document types.

## The moving parts

- Structural splitters follow headings, Markdown, HTML, PDF sections, or document objects.
- Length splitters enforce token or character budgets.
- Recursive splitters try larger natural units first, then fall back to smaller units.
- Semantic splitters use embeddings or sentence boundaries to keep related text together.
- Overlap preserves continuity at boundaries.
- Parent-child retrieval indexes small children but returns a larger parent section.
- Metadata inheritance keeps each chunk connected to the source hierarchy.

## How it works

Start with document structure before raw length. For Markdown, split by headings, then by paragraphs or token windows inside long sections. For code, preserve function or class boundaries where possible. For tables, keep schema, column names, and row groups together. For transcripts, split by topic shifts or time windows.

After splitting, attach metadata that helps both retrieval and display. A chunk titled "Limitations" is weak by itself; a chunk with document title, heading path, product version, and URL is much easier to rank and cite. Then evaluate with real questions. Chunk size is an empirical setting, not a universal constant.

## When to use vs alternatives

Use simple recursive chunking for general prose and small teams. Use structure-aware chunking for docs, code, manuals, and legal text. Use parent-child retrieval when small chunks rank well but answers need broader context. Use semantic chunking when headings are absent or unreliable. Use long-context ingestion only when the corpus is small, stable, and cheap enough to pass directly.

## Failure modes & gotchas

- Tiny chunks lose definitions, caveats, and antecedents.
- Huge chunks rank broadly and waste model context.
- Overlap improves continuity but can duplicate evidence and inflate storage.
- Splitting before cleaning can index nav text, boilerplate, or repeated footers.
- Tables and code often degrade if treated as plain paragraphs.
- Permission metadata must be copied to every derived chunk, not only the source document.

## Minimal code shape

```ts
for (const doc of documents) {
  const sections = splitByStructure(doc.markdown, ["#", "##", "###"]);
  for (const section of sections) {
    const windows = splitByTokens(section.text, { size: 450, overlap: 80 });
    for (const window of windows) {
      index.add({
        text: withHeadingBreadcrumb(section, window),
        metadata: { ...doc.metadata, headingPath: section.path },
      });
    }
  }
}
```

## Key links

- [LangChain text splitter integrations](https://docs.langchain.com/oss/python/integrations/splitters)
- [LangChain repository](https://github.com/langchain-ai/langchain)
- [LlamaIndex settings for text splitters](https://developers.llamaindex.ai/python/framework/module_guides/supporting_modules/settings/)
- [LlamaIndex RAG stages](https://developers.llamaindex.ai/python/framework/understanding/rag/)
