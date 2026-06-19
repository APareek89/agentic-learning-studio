/**
 * # The graph — wires the nodes into a compiled pipeline
 *
 *   START → profiler → architect ⟲(repair once) → composer → END
 *
 * Compiled with MemorySaver so a thread_id keeps conversation state (in-memory
 * for v1; a durable Postgres saver is a later upgrade).
 */

import { StateGraph, MemorySaver, START, END } from "@langchain/langgraph";
import { GraphState } from "./state";
import { profiler, retriever, architect, seedFirstModule, composer, routeAfterArchitect } from "./nodes";

export function buildGraph() {
  const graph = new StateGraph(GraphState)
    .addNode("profiler", profiler)
    .addNode("retriever", retriever)
    .addNode("architect", architect)
    .addNode("seedFirstModule", seedFirstModule)
    .addNode("composer", composer)
    .addEdge(START, "profiler")
    .addEdge("profiler", "retriever")
    .addEdge("retriever", "architect")
    // After the architect: repair once if validation failed, else write Module 1.
    .addConditionalEdges("architect", routeAfterArchitect, {
      architect: "architect",
      seedFirstModule: "seedFirstModule",
    })
    .addEdge("seedFirstModule", "composer")
    .addEdge("composer", END);

  return graph.compile({ checkpointer: new MemorySaver() });
}

/** One shared compiled graph reused across requests. */
export const compiledGraph = buildGraph();
