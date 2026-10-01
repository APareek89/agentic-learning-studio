import type { Request, Response, NextFunction } from "express";

/** Only configured task tiers are selectable; never accept a raw model or key. */
export function requireAskModelTier(req: Request, res: Response, next: NextFunction): void {
  const tier = req.body?.modelTier === undefined ? "sonnet" : req.body.modelTier;
  if (tier !== "haiku" && tier !== "sonnet") {
    res.status(400).json({ error: "modelTier must be haiku or sonnet." });
    return;
  }
  res.locals.askModelTier = tier;
  next();
}
