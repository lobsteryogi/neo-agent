# Phase 4 — The Construct (Dashboard)

> _"A white void where I can show you anything. Except meaning."_

**Goal**: Build the Matrix-themed React dashboard with streaming chat, session browser, memory explorer, and system controls.

**Estimated time**: 10-14 hours
**Prerequisites**: Phase 3 complete (API endpoints, WebSocket, all backend systems)

---

## 4.1 — Scaffold Dashboard

```bash
cd dashboard
pnpm create vite . --template react-ts
pnpm add @neo-agent/shared  # Shared types from monorepo
```

### State Management Decision (Audit Fix M7)

Use **Zustand** for global state — lightweight, no boilerplate, works well with WebSocket:

```typescript
// dashboard/src/stores/useNeoStore.ts
import { create } from 'zustand';

interface NeoStore {
  sessions: Session[];
  activeSession: Session | null;
  messages: Message[];
  health: HealthStatus | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  // actions
  setActiveSession: (s: Session) => void;
  addMessage: (m: Message) => void;
  appendStreamDelta: (delta: string) => void;
}
```

---

## 4.2 — Design System (Matrix Theme)

### `dashboard/src/index.css`

Full Matrix design system: digital rain background, glassmorphism cards, CRT scanlines, green glow effects.

Key components to style:

- `.neo-card` — Glassmorphism panels with green border glow
- `.neo-button` — Green pill-shaped buttons with hover glow
- `.neo-input` — Dark inputs with green focus outline
- `.neo-sidebar` — Fixed sidebar with digital rain overlay
- `.neo-badge` — Status indicators (green=active, amber=warning, red=error)
- `.neo-scanline` — CRT scanline overlay (pseudo-element, 3% opacity)
- `.digital-rain` — Canvas-based matrix rain background component

---

## 4.3 — Key Components

### Layout

| Component                | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `Layout/Sidebar.tsx`     | Navigation between views, Neo avatar, connection status |
| `Layout/TopBar.tsx`      | Active session info, model indicator, Fade risk meter   |
| `Layout/DigitalRain.tsx` | Animated Matrix rain canvas background                  |

### Chat View (Primary)

| Component                | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `Chat/ChatView.tsx`      | Main chat interface with streaming                          |
| `Chat/MessageBubble.tsx` | User/assistant message rendering with markdown              |
| `Chat/DoItButton.tsx`    | Green pill "Do It" approval button (triggers gate approval) |
| `Chat/StreamingText.tsx` | Character-by-character text reveal animation                |
| `Chat/FadeWarning.tsx`   | Warning banner when approaching context limit               |

### Other Views

| View            | Components                                 | Data Source              |
| --------------- | ------------------------------------------ | ------------------------ |
| **Realities**   | Session list, model badge, duration        | `GET /api/sessions`      |
| **Déjà Vu**     | Memory browser, FTS5 search bar, tier tabs | `GET /api/memory/search` |
| **Free Will**   | Gate log, pending approval cards           | `GET /api/gates/pending` |
| **Dodge This**  | Model distribution chart, routing log      | `GET /api/router/stats`  |
| **Kung Fu**     | Skill cards, SKILL.md preview              | `GET /api/skills`        |
| **Armory**      | Composio tool browser                      | `GET /api/tools`         |
| **Matrix Sync** | Sync status, last push/pull times          | `GET /api/sync/status`   |
| **Vital Signs** | Health dashboard (Audit Fix S6)            | `GET /api/health`        |
| **Settings**    | Re-run any wizard step                     | `PUT /api/config`        |

---

## 4.4 — WebSocket Hook

### `dashboard/src/hooks/useWebSocket.ts`

```typescript
export function useWebSocket(token: string) {
  const store = useNeoStore();

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}?token=${token}`);

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      switch (event.type) {
        case 'stream:delta':
          store.appendStreamDelta(event.data);
          break;
        case 'stream:end':
          store.finalizeMessage();
          break;
        case 'gate:blocked':
          store.showGatePrompt(event.data);
          break;
        case 'fade:warning':
          store.showFadeWarning(event.data);
          break;
        case 'sibling:update':
          store.updateSiblings(event.data);
          break;
      }
    };

    return () => ws.close();
  }, [token]);
}
```

---

## Test Suite

### `dashboard/tests/stores/useNeoStore.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useNeoStore } from '../../src/stores/useNeoStore';

describe('useNeoStore', () => {
  beforeEach(() => useNeoStore.setState(useNeoStore.getInitialState()));

  it('initial state has no active session', () => {
    expect(useNeoStore.getState().activeSession).toBeNull();
  });

  it('setActiveSession updates state', () => {
    useNeoStore.getState().setActiveSession({ id: 's1', model: 'sonnet', status: 'active' });
    expect(useNeoStore.getState().activeSession?.id).toBe('s1');
  });

  it('addMessage appends to messages array', () => {
    useNeoStore.getState().addMessage({ id: 'm1', role: 'user', content: 'Hello' });
    useNeoStore.getState().addMessage({ id: 'm2', role: 'assistant', content: 'Hi' });
    expect(useNeoStore.getState().messages).toHaveLength(2);
  });

  it('appendStreamDelta concatenates to last assistant message', () => {
    useNeoStore.getState().addMessage({ id: 'm1', role: 'assistant', content: '' });
    useNeoStore.getState().appendStreamDelta('Hel');
    useNeoStore.getState().appendStreamDelta('lo');
    const last = useNeoStore.getState().messages.at(-1);
    expect(last?.content).toBe('Hello');
  });

  it('connectionStatus defaults to disconnected', () => {
    expect(useNeoStore.getState().connectionStatus).toBe('disconnected');
  });
});
```

### `dashboard/tests/hooks/useWebSocket.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import WS from 'jest-websocket-mock';

describe('useWebSocket', () => {
  it('connects to WebSocket with token', async () => {
    const server = new WS('ws://localhost:3001?token=test-token');
    renderHook(() => useWebSocket('test-token'));
    await server.connected;
    expect(server).toHaveReceivedMessages([]);
    server.close();
  });

  it('dispatches stream:delta events to store', async () => {
    const server = new WS('ws://localhost:3001?token=t');
    renderHook(() => useWebSocket('t'));
    await server.connected;
    server.send(JSON.stringify({ type: 'stream:delta', data: 'Hello' }));
    // Check store received the delta
    expect(useNeoStore.getState().messages.at(-1)?.content).toContain('Hello');
    server.close();
  });

  it('handles gate:blocked event', async () => {
    const server = new WS('ws://localhost:3001?token=t');
    renderHook(() => useWebSocket('t'));
    await server.connected;
    server.send(
      JSON.stringify({ type: 'gate:blocked', data: { reason: 'Free Will', neoQuip: 'Say do it' } }),
    );
    expect(useNeoStore.getState().gatePrompt).toBeTruthy();
    server.close();
  });

  it('handles fade:warning event', async () => {
    const server = new WS('ws://localhost:3001?token=t');
    renderHook(() => useWebSocket('t'));
    await server.connected;
    server.send(JSON.stringify({ type: 'fade:warning', data: { ratio: 0.87 } }));
    expect(useNeoStore.getState().fadeWarning).toBeTruthy();
    server.close();
  });

  it('sets connectionStatus to disconnected on close', async () => {
    const server = new WS('ws://localhost:3001?token=t');
    renderHook(() => useWebSocket('t'));
    await server.connected;
    server.close();
    expect(useNeoStore.getState().connectionStatus).toBe('disconnected');
  });
});
```

### `dashboard/tests/components/views.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('ChatView', () => {
  it('renders message bubbles for user and assistant', () => {
    render(<ChatView messages={[
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there' },
    ]} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('displays streaming indicator during active stream', () => {
    render(<ChatView messages={[]} isStreaming={true} />);
    expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument();
  });
});

describe('FadeWarning', () => {
  it('does not render below 85% threshold', () => {
    const { container } = render(<FadeWarning ratio={0.5} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders warning at 85%+', () => {
    render(<FadeWarning ratio={0.87} />);
    expect(screen.getByText(/context/i)).toBeInTheDocument();
  });

  it('shows critical variant at 95%+', () => {
    render(<FadeWarning ratio={0.96} />);
    expect(screen.getByTestId('fade-warning')).toHaveClass('critical');
  });
});

describe('DoItButton', () => {
  it('is disabled when no gate prompt is pending', () => {
    render(<DoItButton pending={false} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onApprove when clicked with pending gate', () => {
    const onApprove = vi.fn();
    render(<DoItButton pending={true} onApprove={onApprove} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});

describe('VitalSigns', () => {
  it('renders operational status as green', () => {
    render(<VitalSigns health={{ status: 'operational', claude: { responsive: true }, memory: { dbSizeMb: 5, ftsEntries: 100 } }} />);
    expect(screen.getByTestId('status-badge')).toHaveClass('operational');
  });

  it('renders degraded status as amber', () => {
    render(<VitalSigns health={{ status: 'degraded' }} />);
    expect(screen.getByTestId('status-badge')).toHaveClass('degraded');
  });

  it('renders down status as red', () => {
    render(<VitalSigns health={{ status: 'down' }} />);
    expect(screen.getByTestId('status-badge')).toHaveClass('down');
  });
});
```

---

## Acceptance Criteria

- [ ] Dashboard loads with full Matrix theme (green, dark, scanlines, rain)
- [ ] Chat view streams responses in real-time via WebSocket
- [ ] "Do It" button sends gate approval and unblocks execution
- [ ] Fade warning appears when context approaches 85%
- [ ] All 9 views render data from API
- [ ] Memory search returns FTS5 results
- [ ] Settings page allows re-running wizard steps
- [ ] Vital Signs shows health status of all systems
- [ ] Responsive layout (sidebar collapses on mobile)

---

## Files Created

```
dashboard/src/
├── main.tsx                     ← NEW
├── App.tsx                      ← NEW
├── index.css                    ← NEW (Matrix design system)
├── stores/useNeoStore.ts        ← NEW
├── hooks/
│   ├── useWebSocket.ts          ← NEW
│   └── useApi.ts                ← NEW
├── components/
│   ├── Layout/                  ← NEW (3 files)
│   ├── Chat/                    ← NEW (5 files)
│   ├── Realities/               ← NEW
│   ├── DejaVu/                  ← NEW
│   ├── FreeWill/                ← NEW
│   ├── DodgeThis/               ← NEW
│   ├── KungFu/                  ← NEW
│   ├── Armory/                  ← NEW
│   ├── MatrixSync/              ← NEW
│   ├── VitalSigns/              ← NEW (S6)
│   └── Settings/                ← NEW
└── types/index.ts               ← imports from @neo-agent/shared
```
