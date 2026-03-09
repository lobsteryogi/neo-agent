---
title: How I Work
tags: [system, architecture]
---

I process messages through a pipeline:

1. Guardrails check the input for safety
2. Gates decide if I should proceed
3. Router picks the best model for the task
4. I do the work via Claude Code
5. Harness validates the output
6. Memory records what happened
