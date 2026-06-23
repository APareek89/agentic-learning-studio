---
title: Retrieval Evaluation
category: RAG tooling
url: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/
license: Apache-2.0
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.ragas.io/en/stable/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.ragas.io/en/stable/references/evaluate/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/explodinggradients/ragas", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

Retrieval evaluation measures whether the search layer returns useful evidence before the LLM writes an answer. It is narrower than full answer evaluation: the main question is whether the retrieved chunks contain the information needed, whether irrelevant chunks crowd out relevant ones, and whether the ranking puts the best evidence early enough to fit in context.

Ragas is a common evaluation library for RAG and agentic applications. Its metrics include context precision, context recall, response relevancy, faithfulness, and related measures that help diagnose retrieval and generation together.

## Why it exists / when to reach for it

RAG quality can look like a prompt problem when it is really a retrieval problem. If the right evidence is absent, the model may guess. If the evidence is noisy, it may cite weak support. If the evidence is ranked too low, it may be trimmed away before generation.

Reach for retrieval evaluation before changing embedding models, chunk sizes, rerankers, metadata filters, or KB source content. It should run as a regression check whenever the index is rebuilt.

## The moving parts

- Evaluation queries that represent real user tasks.
- Expected sources, expected chunks, or ground-truth answer facts.
- A retrieval runner that captures top-k candidates and scores.
- Metrics such as hit rate, recall at k, precision at k, MRR, nDCG, and context relevance.
- Optional LLM-as-judge metrics for relevance and faithfulness.
- Error buckets for misses, stale content, bad chunking, permission filters, and ambiguous queries.
- Thresholds that block unsafe retrieval changes.

## How it works

Create a small but representative dataset. Each case should include a user-style query and either expected source IDs or facts that must be supported. Run the retriever exactly as production would: same query preprocessing, filters, embedding model, hybrid search, reranker, and top-k. Record whether expected evidence appears and how high it ranks.

For qualitative metrics, pass generated answers, retrieved contexts, and references into an evaluator such as Ragas. Keep raw retrieval metrics separate from answer metrics. A faithful answer can still be incomplete because retrieval missed a source; a good retrieval set can still produce a bad answer if prompting or synthesis fails.

## When to use vs alternatives

Use exact source-based retrieval eval when you know which document should answer each query. Use graded relevance judgments when several chunks are partially useful. Use Ragas-style metrics when you need end-to-end RAG signals across context and answer quality. Use manual review for ambiguous, high-impact, or policy-sensitive questions. Use production analytics to find query patterns, but do not let them replace a curated regression suite.

## Failure modes & gotchas

- Synthetic questions can be too clean and overstate quality.
- A high hit rate at 20 may still fail if the prompt only uses top 5.
- LLM judges can be inconsistent and should be spot-checked.
- Ground truth goes stale after documentation changes.
- Aggregate metrics can hide category-specific regressions.
- Evaluation must include negative cases where the correct answer is "not enough evidence."

## Minimal code shape

```ts
for (const testCase of evalSet) {
  const hits = await retrieve(testCase.query, { topK: 8 });
  const retrievedIds = hits.map((hit) => hit.sourceId);

  report.add({
    query: testCase.query,
    hitAt8: intersects(retrievedIds, testCase.expectedSourceIds),
    reciprocalRank: firstExpectedRank(retrievedIds, testCase.expectedSourceIds),
    topTitles: hits.map((hit) => hit.title),
  });
}

assert(report.hitRateAt8 >= 0.9);
```

## Key links

- [Ragas docs](https://docs.ragas.io/en/stable/)
- [Ragas available metrics](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [Ragas evaluate reference](https://docs.ragas.io/en/stable/references/evaluate/)
- [Ragas repository](https://github.com/explodinggradients/ragas)
