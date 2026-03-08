List of pre-installed tools for agent:

1. Agent Browser <https://github.com/vercel-labs/agent-browser>
2. Gemini Embeddings <https://ai.google.dev/gemini-api/docs/embeddings> — Free multilingual embedding API (model: `gemini-embedding-001`). Powers semantic memory search across English + Thai conversations. Vectors stored directly in SQLite as BLOB columns — no external vector DB needed. Falls back to FTS5 keyword search when API key is not configured.
3. Composio <https://github.com/ComposioHQ/composio> — 250+ pre-built tool integrations (GitHub, Slack, Telegram, Gmail, etc.) with auth handling baked in. Provides the Telegram bridge (requirement #7) and a plug-and-play tool registry for expanding agent capabilities without building each integration from scratch.
4. Tailscale <https://tailscale.com/> — VPN service that allows you to connect to your home network from anywhere in the world.
5. Cron <https://github.com/robfig/cron> — Schedule tasks to run at specific times.
6. Firecrawl <https://github.com/mendableai/firecrawl> — Turn any website into LLM-ready markdown. Powers proactive skill acquisition — automatically scraping GitHub repos, YouTube transcripts, documentation sites, and tutorials so the agent can autonomously learn new architectures and validate techniques.
