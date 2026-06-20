# Prebuilt Lesson Library Report

Generated: 2026-06-20

## Output

- Index: `prebuilt/index.json`
- Lessons: `prebuilt/lessons/*.json`
- Validator: `prebuilt/validate.tsx`
- Total index entries: 100
- Total lesson files: 100
- Duplicate slugs: 0
- Descriptions over 140 characters: 0

## Counts by Category

- Foundations: 10
- LLMs: 10
- RAG: 10
- Agents: 10
- Frameworks: 10
- Generative: 10
- Evaluation: 10
- Safety: 10
- Infrastructure: 10
- Build Projects: 10

## Topics Skipped

None.

## Validation

Pilot batch: `Blueprint validation passed: 10/10`.

Full library: `Blueprint validation passed: 100/100` via:

```bash
npx tsx prebuilt/validate.tsx
```

## Grounding Notes

Lessons cite the local AI Knowledge base through `kind: "kb"` citation records and include canonical documentation links where the lesson references official tools or standards. Every lesson is a complete Blueprint with full modules, mental map nodes, glossary terms, synthesis, citations, decision blocks, active-recall quizzes, and no stub modules.
