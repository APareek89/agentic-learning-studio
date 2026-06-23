---
title: "Browser and Computer-Use Agents"
category: "Agent frameworks"
url: "https://github.com/browser-use/browser-use"
license: "MIT"
verdict: "Best for last-mile UI work when no stable API exists and side effects can be sandboxed."
as_of_date: 2026-06-22
sources:
  - {url: "https://github.com/browser-use/browser-use", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/microsoft/playwright", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://playwright.dev/docs/intro", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

Browser and computer-use agents operate existing user interfaces. They observe a page or screen, decide the next action, click, type, scroll, upload files, read results, and repeat until the task is done or blocked.

browser-use is an agent-oriented browser automation project. Playwright is a lower-level, widely used browser automation framework that can drive Chromium, Firefox, and WebKit, and is increasingly used as the control surface for AI agents.

## Why it exists / when to reach for it

Many useful systems do not expose complete APIs. A browser agent can handle procurement forms, admin consoles, internal tools, QA checks, or one-off workflows where building an integration would take longer than the task.

Reach for this pattern when the UI is the only practical interface and the task can be bounded. Prefer APIs, MCP tools, or direct database operations when they exist.

## The moving parts

- Browser controller: Playwright, browser-use, remote browser infrastructure, or desktop automation.
- Observation: DOM snapshot, accessibility tree, screenshot, OCR, or structured page state.
- Action model: click, type, select, navigate, wait, screenshot, download, or upload.
- Policy layer: allowed domains, credential handling, approval gates, and spend limits.
- State and memory: current goal, previous actions, page history, files, and recovered errors.
- Verification: assertions, screenshots, trace logs, and final evidence.
- Sandbox: isolated profile, disposable credentials, network limits, and restricted file access.

## How it works

The runtime opens a browser and captures a representation of the current page. The agent chooses an action from a constrained set. The controller executes it, waits for the UI to settle, records the result, and sends a new observation to the agent.

Playwright-style locators and accessibility snapshots reduce ambiguity because actions can target named controls rather than raw screen coordinates. Vision-based control is useful for unstructured desktops, but it is more brittle and needs stronger human review.

## When to use vs alternatives

Use browser agents for UI-only workflows, exploratory QA, data entry, and automation across third-party sites with no API. Use Playwright scripts when the path is known and deterministic. Use an API client when correctness, speed, and auditability matter. Use a human-in-the-loop flow for payments, account changes, legal submissions, or irreversible actions.

For production, keep the agent's autonomy narrow: known domains, explicit task templates, read-only mode by default, and approval before high-impact clicks.

## Failure modes & gotchas

UIs drift. Buttons move, modals appear, CAPTCHAs interrupt, and A/B tests change labels. Browser sessions can expose secrets through cookies, screenshots, downloads, or logs. Agents can click the wrong element with real consequences. Some sites prohibit automation or scraping in their terms, and automation should not be used to bypass access controls.

Test with traces and screenshots. Add action allowlists, idempotency, dry runs, and human approval for side effects. Keep credentials scoped to the task.

## Minimal code shape (pseudocode/short snippet you write)

```python
browser = Browser(profile=isolated_profile, allowed_domains=["admin.example.com"])
state = browser.observe()

while not task.done():
    action = agent.choose_action(goal, state, allowed_actions=[
        "navigate", "click", "type", "select", "screenshot"
    ])
    if policy.requires_approval(action):
        ask_human(action, state.screenshot)
    state = browser.execute(action).observe()
    verifier.record(action, state)

return verifier.final_report()
```

## Key links

- browser-use repository: https://github.com/browser-use/browser-use
- Playwright repository: https://github.com/microsoft/playwright
- Playwright docs: https://playwright.dev/docs/intro
