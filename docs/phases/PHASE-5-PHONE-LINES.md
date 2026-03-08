# Phase 5 — Phone Lines (Telegram + Channels)

> _"There is no spoon... but there are notifications."_

**Goal**: Build the multi-channel architecture and Telegram bot integration via Composio.

**Estimated time**: 4-6 hours
**Prerequisites**: Phase 1 complete (agent loop), Phase 3 (Composio integration)

---

## 5.1 — Channel Interface

### `server/src/channels/interface.ts`

All channels implement the same adapter interface:

```typescript
export interface ChannelAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(sessionId: string, response: AgentResponse): Promise<void>;
  onMessage(handler: (message: InboundMessage) => Promise<void>): void;
}

export interface InboundMessage {
  id: string;
  channelId: string;
  channel: 'telegram' | 'web' | 'cli';
  userId: string;
  content: string;
  timestamp: number;
  sessionKey: string; // Derived: channel:userId
  metadata?: Record<string, unknown>;
}
```

---

## 5.2 — Telegram Channel

### `server/src/channels/telegram.ts`

Using Composio's Telegram toolkit:

```typescript
export class TelegramChannel implements ChannelAdapter {
  name = 'telegram';

  async start() {
    const tools = await this.composio.tools.get(this.userId, { toolkits: ['TELEGRAM'] });
    // Register webhook or polling handler
    // Map Telegram chat ID → sessionKey
  }

  // Bot commands
  private commands = {
    '/doit': (msg) => this.agent.approveGate(msg.sessionKey),
    '/memory': (msg) => this.agent.searchMemory(msg.text),
    '/sessions': (msg) => this.agent.listSessions(),
    '/model': (msg) => this.agent.switchModel(msg.text),
    '/skills': (msg) => this.agent.listSkills(),
    '/neo': (msg) => this.getExistentialQuote(),
  };
}
```

---

## 5.3 — Web Channel (Dashboard WebSocket)

### `server/src/channels/web.ts`

```typescript
export class WebChannel implements ChannelAdapter {
  name = 'web';

  start() {
    this.wss.on('connection', (ws, req) => {
      // Token auth (Audit Fix M4)
      const token = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('token');
      if (token !== this.config.wsToken) return ws.close(4001);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message') this.handler(this.toInbound(msg, ws));
        if (msg.type === 'gate:approve') this.agent.approveGate(msg.sessionKey);
      });
    });
  }
}
```

---

## 5.4 — CLI Channel

### `server/src/channels/cli.ts`

Interactive terminal mode using readline:

```typescript
export class CliChannel implements ChannelAdapter {
  name = 'cli';

  async start() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt('\x1b[32mNeo>\x1b[0m '); // Green prompt
    rl.prompt();
    rl.on('line', (line) => {
      this.handler(this.toInbound(line));
      rl.prompt();
    });
  }
}
```

---

## Test Suite

### `server/tests/phase-5/channel-adapter.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TelegramChannel } from '../../src/channels/telegram';
import { WebChannel } from '../../src/channels/web';
import { CliChannel } from '../../src/channels/cli';

describe('Channel Adapter Interface', () => {
  const channels = [
    new TelegramChannel(mockConfig, mockComposio),
    new WebChannel(mockConfig, mockWss),
    new CliChannel(mockConfig),
  ];

  it('all channels implement start() and stop()', () => {
    for (const channel of channels) {
      expect(typeof channel.start).toBe('function');
      expect(typeof channel.stop).toBe('function');
    }
  });

  it('all channels implement send()', () => {
    for (const channel of channels) {
      expect(typeof channel.send).toBe('function');
    }
  });

  it('all channels have a name property', () => {
    expect(channels.map((c) => c.name)).toEqual(['telegram', 'web', 'cli']);
  });
});

describe('InboundMessage Transformation', () => {
  it('WebChannel derives sessionKey as channel:userId', () => {
    const web = new WebChannel(mockConfig, mockWss);
    const msg = web['toInbound']({ text: 'Hello', userId: 'user-123' });
    expect(msg.sessionKey).toBe('web:user-123');
    expect(msg.channel).toBe('web');
  });

  it('TelegramChannel derives sessionKey from chatId', () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const msg = tg['toInbound']({ text: 'Hello', chatId: 'chat-456' });
    expect(msg.sessionKey).toBe('telegram:chat-456');
  });

  it('CliChannel uses fixed sessionKey', () => {
    const cli = new CliChannel(mockConfig);
    const msg = cli['toInbound']('Hello');
    expect(msg.sessionKey).toBe('cli:local');
  });

  it('all messages have a unique id', () => {
    const web = new WebChannel(mockConfig, mockWss);
    const msg1 = web['toInbound']({ text: 'a', userId: '1' });
    const msg2 = web['toInbound']({ text: 'b', userId: '1' });
    expect(msg1.id).not.toBe(msg2.id);
  });

  it('timestamp is set to current time', () => {
    const web = new WebChannel(mockConfig, mockWss);
    const before = Date.now();
    const msg = web['toInbound']({ text: 'test', userId: '1' });
    const after = Date.now();
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('Telegram Bot Commands', () => {
  it('/doit triggers gate approval', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const agent = { approveGate: vi.fn() };
    tg['agent'] = agent;
    await tg['handleCommand']('/doit', { sessionKey: 'telegram:123' });
    expect(agent.approveGate).toHaveBeenCalledWith('telegram:123');
  });

  it('/memory searches memory', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const agent = { searchMemory: vi.fn().mockResolvedValue([]) };
    tg['agent'] = agent;
    await tg['handleCommand']('/memory TypeScript', { sessionKey: 'telegram:123' });
    expect(agent.searchMemory).toHaveBeenCalledWith('TypeScript');
  });

  it('/sessions returns session list', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const agent = { listSessions: vi.fn().mockResolvedValue([]) };
    tg['agent'] = agent;
    await tg['handleCommand']('/sessions', { sessionKey: 'telegram:123' });
    expect(agent.listSessions).toHaveBeenCalled();
  });

  it('unknown commands pass through as regular messages', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const handler = vi.fn();
    tg.onMessage(handler);
    await tg['handleMessage']({ text: '/notacommand test', chatId: '123' });
    expect(handler).toHaveBeenCalled();
  });
});
```

---

## Acceptance Criteria

- [ ] All 3 channels (Telegram, Web, CLI) send/receive through same agent loop
- [ ] Telegram bot responds to all 6 commands
- [ ] WebSocket has token auth
- [ ] CLI shows green Neo prompt with streaming response
- [ ] Channel-specific metadata preserved in `InboundMessage`

---

## Files Created

```
server/src/channels/
├── interface.ts       ← NEW
├── telegram.ts        ← NEW
├── web.ts             ← NEW
└── cli.ts             ← NEW
```
