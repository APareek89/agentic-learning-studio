---
title: Graph RAG and Knowledge Graphs
category: RAG tooling
url: https://github.com/microsoft/graphrag
license: MIT
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://github.com/microsoft/graphrag", license: "MIT", kind: "oss_repo"}
  - {url: "https://microsoft.github.io/graphrag/", license: "MIT", kind: "official_docs"}
  - {url: "https://neo4j.com/docs/neo4j-graphrag-python/current/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/neo4j/neo4j-graphrag-python", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

Graph RAG augments retrieval with entities, relationships, paths, communities, or graph queries. Instead of treating every passage as an isolated text chunk, it builds or uses a knowledge graph that represents how people, concepts, tools, documents, events, and claims connect.

Microsoft GraphRAG focuses on extracting structured graph memory from unstructured text and using graph structure during querying. Neo4j GraphRAG provides Python tooling for retrieval and generation workflows over Neo4j-backed graph data.

## Why it exists / when to reach for it

Classic vector RAG works well when the answer is located in one or a few directly relevant passages. It struggles when the question asks about relationships spread across many documents: dependencies, ownership, influence, contradictions, tool compatibility, root causes, or multi-hop reasoning.

Reach for Graph RAG when relationship questions recur, when explainability needs graph paths, or when the source data already has graph shape.

## The moving parts

- Entity extraction identifies important things in text.
- Relationship extraction proposes edges between entities.
- Entity resolution merges aliases and duplicates.
- A graph store keeps nodes, edges, properties, and provenance.
- Vector indexes still retrieve source chunks or entity descriptions.
- Community detection or path expansion gathers broader context.
- Query planning decides whether to use vector search, graph traversal, or both.

## How it works

There are two common setups. In graph-from-text systems, ingestion uses an LLM or extractor to identify entities and relationships, stores them with links back to source chunks, and may create summaries for communities or neighborhoods. At query time, the system retrieves seed entities or passages, expands through graph edges, and assembles context from connected evidence.

In graph-native systems, the application already has structured data in a graph database. RAG then combines graph queries, vector search over text properties, and generation. The graph can constrain retrieval to connected facts while the text index provides natural-language evidence.

## When to use vs alternatives

Use classic RAG for straightforward lookup and simpler operations. Use hybrid search and reranking when the problem is ranking precision, not graph reasoning. Use Graph RAG when the answer depends on relationships, neighborhoods, aggregate communities, or path explanations. Use a normal database query when the graph question is exact and deterministic enough to answer without generation.

## Failure modes & gotchas

- LLM-extracted edges can be false, vague, or missing.
- Entity resolution is hard: "OpenAI", "Open AI", and "the vendor" may or may not mean the same thing.
- Graph refresh is more complex than replacing a vector index.
- Summaries can hide provenance unless edges and claims link back to source chunks.
- Multi-hop expansion can pull in too much weakly related context.
- Graph pipelines can be expensive because extraction, clustering, and summarization run during indexing.

## Minimal code shape

```ts
const chunks = splitIntoChunks(documents);
const triples = await extractEntitiesAndEdges(chunks);

await graph.upsert(triples, { sourceChunkIds: true });
await vectorStore.upsert(chunks.map(embedChunk));

const seeds = await vectorStore.search(embedQuery(question), { topK: 10 });
const neighborhood = await graph.expand({
  entities: seeds.flatMap((hit) => hit.entities),
  maxHops: 2,
});

return generateAnswer({ question, evidence: [...seeds, ...neighborhood] });
```

## Key links

- [Microsoft GraphRAG repository](https://github.com/microsoft/graphrag)
- [Microsoft GraphRAG docs](https://microsoft.github.io/graphrag/)
- [Neo4j GraphRAG for Python docs](https://neo4j.com/docs/neo4j-graphrag-python/current/)
- [Neo4j GraphRAG Python repository](https://github.com/neo4j/neo4j-graphrag-python)
