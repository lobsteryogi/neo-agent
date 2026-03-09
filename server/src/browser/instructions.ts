/**
 * ░▒▓ BROWSER INSTRUCTIONS ▓▒░
 *
 * "Welcome to the desert of the real."
 *
 * System prompt instructions injected when browser automation is available.
 * Teaches the agent how to use agent-browser via Bash tool calls.
 */

export const BROWSER_SYSTEM_INSTRUCTIONS = `## Browser Automation (agent-browser)

You have access to a full browser automation toolkit via the \`agent-browser\` CLI.
Use it through the Bash tool. The browser daemon auto-starts on first use.

### Core Workflow
1. **Navigate**: \`npx agent-browser open <url>\`
2. **Read the page**: \`npx agent-browser snapshot -i\` — returns an accessibility tree with element refs like \`@e1\`, \`@e2\`
3. **Interact**: Use refs from the snapshot to click, fill, etc.
4. **Re-snapshot after navigation** — refs are invalidated when the page changes

### Common Commands

**Navigation:**
- \`npx agent-browser open <url>\` — navigate to URL
- \`npx agent-browser back\` / \`forward\` / \`reload\`
- \`npx agent-browser get url\` — current URL
- \`npx agent-browser get title\` — page title

**Reading:**
- \`npx agent-browser snapshot -i\` — accessibility tree (interactive elements)
- \`npx agent-browser snapshot\` — full accessibility tree
- \`npx agent-browser get text [selector]\` — text content
- \`npx agent-browser get html [selector]\` — HTML content
- \`npx agent-browser screenshot\` — take a screenshot
- \`npx agent-browser screenshot --full\` — full page screenshot

**Interaction:**
- \`npx agent-browser click @e1\` — click element by ref
- \`npx agent-browser fill @e2 "search term"\` — fill input field
- \`npx agent-browser type "text"\` — type text via keyboard
- \`npx agent-browser press Enter\` — press a key (Enter, Tab, Escape, etc.)
- \`npx agent-browser select @e3 "option"\` — select dropdown option
- \`npx agent-browser hover @e4\` — hover over element
- \`npx agent-browser check @e5\` / \`uncheck @e5\` — toggle checkbox

**Waiting:**
- \`npx agent-browser wait "selector"\` — wait for element
- \`npx agent-browser wait --load networkidle\` — wait for network idle
- \`npx agent-browser wait --url "pattern"\` — wait for URL change

**Tabs:**
- \`npx agent-browser tab\` — list open tabs
- \`npx agent-browser tab new\` — open new tab
- \`npx agent-browser tab 2\` — switch to tab 2
- \`npx agent-browser tab close\` — close current tab

**Debugging:**
- \`npx agent-browser console\` — get browser console output
- \`npx agent-browser errors\` — get page errors
- \`npx agent-browser get styles @e1\` — computed styles

**Auth & State:**
- \`npx agent-browser auth save <name>\` — save auth cookies
- \`npx agent-browser auth login <name>\` — restore auth cookies
- \`npx agent-browser state save <name>\` — save full browser state
- \`npx agent-browser state load <name>\` — restore browser state

### Best Practices
- Always \`snapshot -i\` after navigation to see what's on the page
- Use element refs (@e1, @e2) from snapshots — they are the most reliable way to target elements
- If a ref doesn't work, re-snapshot first — refs expire on page changes
- Use \`wait\` commands after actions that trigger navigation or loading
- For forms: \`fill\` to set values, then \`click\` the submit button
- Use \`screenshot\` when you need visual confirmation of the page state
`;
