// Ambient type declarations for packages without bundled TypeScript types.
// `pdf-parse` ships no types; we import its inner module directly (to skip the
// package's debug self-test), so declare both paths as `any`.
declare module "pdf-parse/lib/pdf-parse.js";
declare module "pdf-parse";
