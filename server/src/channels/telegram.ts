/**
 * ░▒▓ TELEGRAM CHANNEL ▓▒░
 *
 * "The phone lines are open... everywhere."
 *
 * Grammy-based Telegram bot with media downloads, bot commands,
 * and structured message dispatch. Inspired by OpenClaw's architecture.
 */

import type {
  AgentResponse,
  Attachment,
  InboundMessage,
  ModelTier,
  RoutingProfile,
} from '@neo-agent/shared';
import * as crypto from 'crypto';
import { mkdtemp, writeFile } from 'fs/promises';
import { Bot } from 'grammy';
import { tmpdir } from 'os';
import { join } from 'path';
import type { TaskRepo } from '../db/task-repo.js';
import type { LongTermMemory, MemorySearch, SessionTranscript } from '../memory/index.js';
import { getRecentLogs } from '../utils/logger.js';
import {
  VALID_MODEL_TIERS,
  VALID_ROUTING_PROFILES,
  buildTranscriptMarkdown,
} from '../utils/patterns.js';
import { formatCommandsText, getCommandsForChannel } from './command-registry.js';
import type { ChannelAdapter } from './interface.js';

import { fmtCost, fmtTokens } from '../cli/lib/format.js';
import type { SessionManager } from '../cli/lib/sessions.js';

export interface TelegramCommandDeps {
  sessionMgr: SessionManager;
  longTermMemory: LongTermMemory;
  memorySearch: MemorySearch;
  routingProfile: RoutingProfile;
  setRoutingProfile: (p: RoutingProfile) => void;
  transcript?: SessionTranscript;
  /** Key is a userKey (per-user in groups) or sessionKey (DMs). */
  setModelOverride?: (key: string, model: ModelTier) => void;
  /** Key is a userKey (per-user in groups) or sessionKey (DMs). */
  getLastInput?: (key: string) => string | undefined;
  retryLastInput?: (
    sessionKey: string,
    userId: string,
    ctx: {
      reply: (text: string, opts?: any) => Promise<unknown>;
      replyWithChatAction: (action: 'typing') => Promise<unknown>;
    },
  ) => Promise<void>;
  taskRepo?: TaskRepo;
  /** Key is a userKey. Disabled in group chats for security. */
  setNeoDevMode?: (key: string, on: boolean) => void;
  isNeoDevMode?: (key: string) => boolean;
  /** Record a group message into the transcript without triggering agent. */
  observeGroupMessage?: (message: InboundMessage) => void;
}

export class TelegramChannel implements ChannelAdapter {
  name = 'telegram';
  private bot: Bot;
  private handler!: (message: InboundMessage) => Promise<AgentResponse | void>;
  private deps?: TelegramCommandDeps;

  constructor(
    private token: string,
    deps?: TelegramCommandDeps,
  ) {
    this.bot = new Bot(token);
    this.deps = deps;
  }

  /**
   * Run handler while keeping the typing indicator alive every 4s.
   * Telegram's typing action expires after ~5s, so we refresh it.
   */
  private async runWithTyping(
    ctx: { replyWithChatAction: (action: 'typing') => Promise<unknown> },
    fn: () => Promise<AgentResponse | void>,
  ): Promise<AgentResponse | void> {
    await ctx.replyWithChatAction('typing');
    const interval = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 4000);
    try {
      return await fn();
    } finally {
      clearInterval(interval);
    }
  }

  async start(): Promise<void> {
    // Register slash command menu from command registry
    const telegramCommands = getCommandsForChannel('telegram').map((c) => ({
      command: c.command.slice(1), // strip leading /
      description: c.description,
    }));
    // Also add /start since it's not in the registry
    telegramCommands.unshift({ command: 'start', description: 'Start the bot' });
    await this.bot.api
      .setMyCommands(telegramCommands)
      .catch((err) => console.warn('[Telegram] Failed to set commands menu:', err.message));

    // Text messages
    this.bot.on('message:text', async (ctx) => {
      const text = ctx.message.text;
      const chatType = ctx.message.chat.type;
      const isGroup = chatType === 'group' || chatType === 'supergroup';

      if (isGroup) {
        console.log(
          `[Telegram] Group message received: chatType=${chatType} from=${ctx.message.from?.username ?? ctx.message.from?.id} text="${text.slice(0, 80)}" entities=${JSON.stringify(ctx.message.entities?.map((e) => e.type) ?? [])} botUsername=${ctx.me?.username}`,
        );
      }

      // Handle slash commands first (before group guard)
      if (text.startsWith('/')) {
        if (isGroup) {
          // In groups, ignore commands addressed to another bot (e.g. /help@other_bot)
          const botUsername = ctx.me?.username;
          const cmdMatch = text.match(/^\/\w+@(\w+)/);
          if (cmdMatch && botUsername && cmdMatch[1].toLowerCase() !== botUsername.toLowerCase())
            return;
        }
        const handled = await this.handleCommand(text, ctx);
        if (handled) return;
        // In groups, don't send unrecognized commands to the agent
        if (isGroup) return;
      }

      // For non-command messages in groups, require @mention or reply-to-bot
      if (this.isGroupMessageNotForUs(ctx)) {
        // Still observe the message for group context
        if (isGroup && this.deps?.observeGroupMessage) {
          this.deps.observeGroupMessage(this.toInbound(ctx));
        }
        return;
      }

      const startMs = Date.now();
      const response = await this.runWithTyping(ctx, () => this.handler(this.toInbound(ctx)));
      this.sendResponse(ctx, response, startMs);
    });

    // Voice messages
    this.bot.on('message:voice', async (ctx) => {
      if (this.isGroupMessageNotForUs(ctx)) {
        if (this.isGroupChat(ctx) && this.deps?.observeGroupMessage) {
          this.deps.observeGroupMessage(this.toInbound(ctx));
        }
        return;
      }
      const voice = ctx.message.voice;
      const attachment = await this.downloadTelegramFile(ctx, {
        fileId: voice.file_id,
        fileUniqueId: voice.file_unique_id,
        type: 'voice',
        mimeType: voice.mime_type ?? 'audio/ogg',
        fileSize: voice.file_size ?? 0,
        duration: voice.duration,
      });
      const startMs = Date.now();
      const response = await this.runWithTyping(ctx, () =>
        this.handler(this.toInbound(ctx, [attachment])),
      );
      this.sendResponse(ctx, response, startMs);
    });

    // Audio messages
    this.bot.on('message:audio', async (ctx) => {
      if (this.isGroupMessageNotForUs(ctx)) {
        if (this.isGroupChat(ctx) && this.deps?.observeGroupMessage) {
          this.deps.observeGroupMessage(this.toInbound(ctx));
        }
        return;
      }
      const audio = ctx.message.audio;
      const attachment = await this.downloadTelegramFile(ctx, {
        fileId: audio.file_id,
        fileUniqueId: audio.file_unique_id,
        type: 'audio',
        mimeType: audio.mime_type ?? 'audio/mpeg',
        fileSize: audio.file_size ?? 0,
        duration: audio.duration,
        fileName: audio.file_name,
      });
      const startMs = Date.now();
      const response = await this.runWithTyping(ctx, () =>
        this.handler(this.toInbound(ctx, [attachment])),
      );
      this.sendResponse(ctx, response, startMs);
    });

    // Photos — Telegram sends multiple sizes, use the largest
    this.bot.on('message:photo', async (ctx) => {
      if (this.isGroupMessageNotForUs(ctx)) {
        if (this.isGroupChat(ctx) && this.deps?.observeGroupMessage) {
          this.deps.observeGroupMessage(this.toInbound(ctx));
        }
        return;
      }
      const photos = ctx.message.photo;
      if (!photos || photos.length === 0) return;
      const largest = photos[photos.length - 1];
      const attachment = await this.downloadTelegramFile(ctx, {
        fileId: largest.file_id,
        fileUniqueId: largest.file_unique_id,
        type: 'image',
        mimeType: 'image/jpeg',
        fileSize: largest.file_size ?? 0,
        width: largest.width,
        height: largest.height,
      });
      const startMs = Date.now();
      const response = await this.runWithTyping(ctx, () =>
        this.handler(this.toInbound(ctx, [attachment])),
      );
      this.sendResponse(ctx, response, startMs);
    });

    // Documents
    this.bot.on('message:document', async (ctx) => {
      if (this.isGroupMessageNotForUs(ctx)) {
        if (this.isGroupChat(ctx) && this.deps?.observeGroupMessage) {
          this.deps.observeGroupMessage(this.toInbound(ctx));
        }
        return;
      }
      const doc = ctx.message.document;
      const attachment = await this.downloadTelegramFile(ctx, {
        fileId: doc.file_id,
        fileUniqueId: doc.file_unique_id,
        type: 'document',
        mimeType: doc.mime_type ?? 'application/octet-stream',
        fileSize: doc.file_size ?? 0,
        fileName: doc.file_name,
      });
      const startMs = Date.now();
      const response = await this.runWithTyping(ctx, () =>
        this.handler(this.toInbound(ctx, [attachment])),
      );
      this.sendResponse(ctx, response, startMs);
    });

    // Video
    this.bot.on('message:video', async (ctx) => {
      if (this.isGroupMessageNotForUs(ctx)) {
        if (this.isGroupChat(ctx) && this.deps?.observeGroupMessage) {
          this.deps.observeGroupMessage(this.toInbound(ctx));
        }
        return;
      }
      const video = ctx.message.video;
      const attachment = await this.downloadTelegramFile(ctx, {
        fileId: video.file_id,
        fileUniqueId: video.file_unique_id,
        type: 'video',
        mimeType: video.mime_type ?? 'video/mp4',
        fileSize: video.file_size ?? 0,
        duration: video.duration,
        width: video.width,
        height: video.height,
      });
      const startMs = Date.now();
      const response = await this.runWithTyping(ctx, () =>
        this.handler(this.toInbound(ctx, [attachment])),
      );
      this.sendResponse(ctx, response, startMs);
    });

    // Error handling
    this.bot.catch((err) => {
      console.error('[Telegram] Bot error:', err.message);
    });

    // Start polling (non-blocking)
    this.bot.start({ onStart: () => console.log('  ✓ Telegram bot started (polling)') });
  }

  async stop(): Promise<void> {
    this.bot.stop();
  }

  async send(_sessionId: string, response: AgentResponse): Promise<void> {
    // Push-initiated messages are handled here (e.g., scheduled tasks)
    // Interactive replies go through the handler context
    void response;
  }

  onMessage(handler: (message: InboundMessage) => Promise<AgentResponse | void>): void {
    this.handler = handler;
  }

  // ─── Response Delivery ──────────────────────────────────

  private async sendResponse(
    ctx: { reply: (text: string, opts?: any) => Promise<unknown> },
    response: AgentResponse | void,
    startMs: number,
  ): Promise<void> {
    if (!response) return;
    const reply = this.formatReplyWithStats(response, Date.now() - startMs);
    const html = TelegramChannel.mdToHtml(reply);
    await ctx.reply(html, { parse_mode: 'HTML' }).catch((err) => {
      console.warn('[Telegram] HTML parse failed, fallback to plain:', err.message);
      return ctx.reply(reply);
    });
  }

  // ─── Markdown → Telegram HTML ─────────────────────────

  static mdToHtml(md: string): string {
    // 1. Extract fenced code blocks to protect their content
    const codeBlocks: string[] = [];
    let text = md.replace(/```\w*\n([\s\S]*?)```/g, (_m, code) => {
      codeBlocks.push(code.trimEnd());
      return `\x00CB${codeBlocks.length - 1}\x00`;
    });

    // 2. Extract inline code
    const inlineCodes: string[] = [];
    text = text.replace(/`([^`]+)`/g, (_m, code) => {
      inlineCodes.push(code);
      return `\x00IC${inlineCodes.length - 1}\x00`;
    });

    // 3. Extract links before HTML escaping (to preserve URLs)
    const links: { text: string; url: string }[] = [];
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, linkText, url) => {
      links.push({ text: linkText, url });
      return `\x00LN${links.length - 1}\x00`;
    });

    // 4. Escape HTML entities in remaining text
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 5. Markdown headings → bold
    text = text.replace(/^#{1,3}\s+(.+)$/gm, '<b>$1</b>');

    // 6. Bold + italic: ***...*** → <b><i>...</i></b>
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');

    // 7. Bold: **...** → <b>...</b>
    text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

    // 8. Italic: *...* → <i>...</i> (single asterisk, not inside bold)
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');

    // 9. Italic: _..._ → <i>...</i>
    text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<i>$1</i>');

    // 10. Strikethrough: ~~...~~ → <s>...</s>
    text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');

    // 11. Blockquotes: > text → <blockquote>text</blockquote>
    text = text.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
    // Merge adjacent blockquote tags
    text = text.replace(/<\/blockquote>\n<blockquote>/g, '\n');

    // 12. Markdown bullet lists: - item → • item
    text = text.replace(/^[\t ]*[-*]\s+/gm, '• ');

    // 13. Restore links
    text = text.replace(/\x00LN(\d+)\x00/g, (_m, i) => {
      const link = links[Number(i)];
      const escapedText = link.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<a href="${link.url}">${escapedText}</a>`;
    });

    // 14. Restore inline code (HTML-escaped inside)
    text = text.replace(/\x00IC(\d+)\x00/g, (_m, i) => {
      const code = inlineCodes[Number(i)]
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<code>${code}</code>`;
    });

    // 15. Restore code blocks (HTML-escaped inside)
    text = text.replace(/\x00CB(\d+)\x00/g, (_m, i) => {
      const code = codeBlocks[Number(i)]
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<pre>${code}</pre>`;
    });

    return text;
  }

  // ─── Stats Formatting ─────────────────────────────────

  private formatReplyWithStats(response: AgentResponse, durationMs: number): string {
    let content = response.content || 'No response.';
    // Append any pipeline warnings
    if (response.warnings?.length) {
      content += '\n\n⚠️ ' + response.warnings.join('\n⚠️ ');
    }
    const dur = (durationMs / 1000).toFixed(1);
    const model = response.model ?? '';

    // Estimate tokens: use exact count if available, otherwise ~4 chars/token
    const estimatedTokens = response.tokensUsed || Math.ceil(content.length / 4);
    const estimatedInput = response.inputTokens ?? 0;
    const cost = response.costUsd ?? 0;

    // Update session stats
    if (this.deps) {
      const s = this.deps.sessionMgr.current;
      s.turns += 1;
      s.totalOutputTokens += estimatedTokens;
      s.totalInputTokens += estimatedInput;
      s.totalCost += cost;
      this.deps.sessionMgr.save(s);
    }

    const sessionId = this.deps ? `[${this.deps.sessionMgr.current.id}]` : '';
    const tokens = `↓${fmtTokens(estimatedTokens)}`;
    const costStr = fmtCost(cost);
    const sessionTotal = this.deps
      ? `Σ${fmtTokens(this.deps.sessionMgr.current.totalInputTokens + this.deps.sessionMgr.current.totalOutputTokens)}`
      : '';

    const parts = [sessionId, tokens, costStr, `${dur}s`, sessionTotal, model].filter(Boolean);
    const statsLine = `\n\n┗━ ${parts.join(' · ')}`;
    return content + statsLine;
  }

  // ─── Bot Commands ─────────────────────────────────────

  /** Check if a ctx is from a group chat. */
  private isGroupChat(ctx: any): boolean {
    const type = ctx.message?.chat?.type;
    return type === 'group' || type === 'supergroup';
  }

  /** Extract group context from a Telegram ctx for per-user keying. */
  private getCtxKeys(ctx: any): {
    chatId: number;
    userId: string;
    isGroup: boolean;
    sessionKey: string;
    userKey: string;
  } {
    const chatId = ctx.message?.chat?.id ?? 0;
    const userId = String(ctx.message?.from?.id ?? '');
    const chatType = ctx.message?.chat?.type;
    const isGroup = chatType === 'group' || chatType === 'supergroup';
    const sessionKey = `telegram:${chatId}`;
    const userKey = isGroup ? `${sessionKey}:${userId}` : sessionKey;
    return { chatId, userId, isGroup, sessionKey, userKey };
  }

  async handleCommand(
    text: string,
    ctx: { reply: (text: string) => Promise<unknown>; me?: { username: string } },
  ): Promise<boolean> {
    const [rawCmd, ...args] = text.split(' ');
    // Strip @botname suffix from commands in group chats (e.g. /dev@neo_bot → /dev)
    const cmd = rawCmd.replace(/@\w+$/, '');
    const arg = args.join(' ').trim();

    switch (cmd) {
      case '/help':
        await ctx.reply(`📋 Commands:\n\n${formatCommandsText('telegram')}`);
        return true;

      case '/start':
        await ctx.reply('"Welcome to the real world." 🕶️\n\nType /help to see available commands.');
        return true;

      case '/stats': {
        if (!this.deps) {
          await ctx.reply('⚠️ Commands not wired yet.');
          return true;
        }
        const s = this.deps.sessionMgr.current;
        const totalTokens = s.totalInputTokens + s.totalOutputTokens;
        const memCount = this.deps.longTermMemory.count();
        await ctx.reply(
          `📊 SESSION STATS\n\n` +
            `Session:  ${s.id}\n` +
            `Turns:    ${s.turns}\n` +
            `Tokens:   ${fmtTokens(totalTokens)}\n` +
            `Cost:     ${fmtCost(s.totalCost)}\n` +
            `Router:   ${this.deps.routingProfile}\n` +
            `Memories: ${memCount} in Déjà Vu`,
        );
        return true;
      }

      case '/sessions': {
        if (!this.deps) {
          await ctx.reply('⚠️ Commands not wired yet.');
          return true;
        }
        const all = this.deps.sessionMgr.all();
        const currentId = this.deps.sessionMgr.current.id;
        const lines = [...all.entries()].map(([id, s]) => {
          const totalTokens = s.totalInputTokens + s.totalOutputTokens;
          const marker = id === currentId ? ' ◀' : '';
          return `${id} — ${s.turns} turns, ${fmtTokens(totalTokens)}, ${fmtCost(s.totalCost)}${marker}`;
        });
        await ctx.reply(`📋 Sessions:\n\n${lines.join('\n')}`);
        return true;
      }

      case '/route': {
        if (!this.deps) {
          await ctx.reply('⚠️ Commands not wired yet.');
          return true;
        }
        if (!arg) {
          await ctx.reply(
            `Current: ${this.deps.routingProfile}\nProfiles: auto, eco, balanced, premium\nUsage: /route <profile>`,
          );
        } else if ((VALID_ROUTING_PROFILES as readonly string[]).includes(arg)) {
          this.deps.setRoutingProfile(arg as RoutingProfile);
          await ctx.reply(`✅ Routing → ${arg}`);
        } else {
          await ctx.reply(`⚠️ Unknown profile "${arg}". Use: auto, eco, balanced, premium`);
        }
        return true;
      }

      case '/memory': {
        if (!this.deps) {
          await ctx.reply('⚠️ Commands not wired yet.');
          return true;
        }
        if (!arg) {
          const recent = this.deps.longTermMemory.getRecent(10);
          if (recent.length === 0) {
            await ctx.reply("No memories yet. Talk to me and I'll remember.");
          } else {
            const lines = recent.map((m: any) => `[${m.type}] ${m.content?.slice(0, 80) ?? ''}`);
            await ctx.reply(`🧠 Recent Memories:\n\n${lines.join('\n')}`);
          }
        } else {
          const results = this.deps.memorySearch.search(arg);
          if (results.length === 0) {
            await ctx.reply(`No memories match "${arg}".`);
          } else {
            const lines = results.map((r) => `[${r.source}] ${r.content.slice(0, 80)}`);
            await ctx.reply(`🔍 "${arg}":\n\n${lines.join('\n')}`);
          }
        }
        return true;
      }

      case '/remember': {
        if (!this.deps) {
          await ctx.reply('⚠️ Commands not wired yet.');
          return true;
        }
        if (!arg) {
          await ctx.reply('Usage: /remember <fact to store>');
        } else {
          this.deps.longTermMemory.store({
            type: 'fact',
            content: arg,
            importance: 0.9,
            tags: [],
            sourceSession: this.deps.sessionMgr.current.id,
          });
          await ctx.reply(`✅ Remembered: "${arg.slice(0, 60)}" 💾`);
        }
        return true;
      }

      case '/new': {
        if (!this.deps) {
          await ctx.reply('⚠️ Commands not wired yet.');
          return true;
        }
        this.deps.sessionMgr.create();
        await ctx.reply(`✅ New session: ${this.deps.sessionMgr.current.id}`);
        return true;
      }

      case '/compact': {
        if (!this.deps) {
          await ctx.reply('⚠️ Commands not wired yet.');
          return true;
        }
        const s = this.deps.sessionMgr.current;
        const beforeTokens = s.totalInputTokens + s.totalOutputTokens;
        s.sdkSessionId = undefined;
        s.totalInputTokens = 0;
        s.totalOutputTokens = 0;
        this.deps.sessionMgr.save(s);
        await ctx.reply(
          `⚡ Context compacted\n\n${beforeTokens.toLocaleString()} tokens → 0\nNext message starts a fresh conversation.`,
        );
        return true;
      }

      case '/session': {
        if (!this.deps) {
          await ctx.reply('⚠️ Commands not wired yet.');
          return true;
        }
        if (!arg) {
          await ctx.reply('Usage: /session <name>');
        } else if (this.deps.sessionMgr.has(arg)) {
          this.deps.sessionMgr.switchTo(arg);
          await ctx.reply(`✅ Switched → ${arg} (${this.deps.sessionMgr.current.turns} turns)`);
        } else {
          this.deps.sessionMgr.create(arg);
          await ctx.reply(`✅ Created → ${arg}`);
        }
        return true;
      }

      case '/retry': {
        if (!this.deps?.retryLastInput) {
          await ctx.reply('⚠️ Retry not available.');
          return true;
        }
        const { sessionKey: sk, userId: uid, userKey: uk } = this.getCtxKeys(ctx);
        const lastInput = this.deps.getLastInput?.(uk);
        if (!lastInput) {
          await ctx.reply('Nothing to retry yet.');
          return true;
        }
        await ctx.reply(`↺ Retrying: "${lastInput.slice(0, 60)}"`);
        await this.deps.retryLastInput(sk, uid, ctx as any);
        return true;
      }

      case '/model': {
        if (!this.deps?.setModelOverride) {
          await ctx.reply('⚠️ Model override not available.');
          return true;
        }
        if (!arg) {
          await ctx.reply(
            'Usage: /model <haiku|sonnet|opus>\nForces the next message to use that model, then reverts.',
          );
          return true;
        }
        if (!(VALID_MODEL_TIERS as readonly string[]).includes(arg)) {
          await ctx.reply(`⚠️ Unknown tier "${arg}". Use: ${VALID_MODEL_TIERS.join(', ')}`);
          return true;
        }
        const { userKey: uk2 } = this.getCtxKeys(ctx);
        this.deps.setModelOverride(uk2, arg as ModelTier);
        await ctx.reply(`✅ Next message → ${arg} (one-shot)`);
        return true;
      }

      case '/debug': {
        const entries = getRecentLogs(50, arg || undefined);
        if (entries.length === 0) {
          await ctx.reply(arg ? `No logs for [${arg}]` : 'No logs captured yet.');
          return true;
        }
        const lines = entries.map((e) => {
          const data = e.data && Object.keys(e.data).length > 0 ? ` ${JSON.stringify(e.data)}` : '';
          return `[${e.timestamp.slice(11, 23)}] ${e.level.toUpperCase()} [${e.namespace}] ${e.message}${data}`;
        });
        // Telegram message limit is 4096 chars
        let text = `📋 Debug Logs${arg ? ` [${arg}]` : ''}:\n\n${lines.join('\n')}`;
        if (text.length > 4000) {
          text = text.slice(0, 3990) + '\n…(truncated)';
        }
        await ctx.reply(text);
        return true;
      }

      case '/export': {
        if (!this.deps?.transcript) {
          await ctx.reply('⚠️ Export not available.');
          return true;
        }
        const s = this.deps.sessionMgr.current;
        const history = this.deps.transcript.getHistory(s.id, 1000);
        if (history.length === 0) {
          await ctx.reply('No transcript to export.');
          return true;
        }
        const markdown = buildTranscriptMarkdown(s, history as any[], fmtTokens, fmtCost);
        const exportDate = new Date().toISOString().slice(0, 10);
        // Send as text if short enough, otherwise as document
        if (markdown.length <= 4000) {
          await ctx.reply(markdown);
        } else {
          // Send as file
          const { Buffer } = await import('buffer');
          const buf = Buffer.from(markdown, 'utf-8');
          const filename = `neo-export-${s.id}-${exportDate}.md`;
          const tgCtx = ctx as any;
          if (tgCtx.replyWithDocument) {
            await tgCtx.replyWithDocument({ source: buf, filename });
          } else {
            // Fallback: send truncated text
            await ctx.reply(markdown.slice(0, 3990) + '\n…(truncated)');
          }
        }
        return true;
      }

      case '/tasks': {
        if (!this.deps?.taskRepo) {
          await ctx.reply('⚠️ Task board not available.');
          return true;
        }
        const tasks = this.deps.taskRepo.list();
        if (tasks.length === 0) {
          await ctx.reply('No tasks yet. Create one with /task <title>');
          return true;
        }
        const statusLabels: Record<string, string> = {
          backlog: '📋 Backlog',
          in_progress: '🔨 In Progress',
          review: '🔍 Review',
          done: '✅ Done',
        };
        const statusOrder = ['backlog', 'in_progress', 'review', 'done'] as const;
        const lines: string[] = [];
        for (const s of statusOrder) {
          const col = tasks.filter((t) => t.status === s);
          if (col.length === 0) continue;
          lines.push(`${statusLabels[s]} (${col.length})`);
          for (const t of col) {
            const pri =
              t.priority === 'critical'
                ? '❗'
                : t.priority === 'high'
                  ? '⬆️'
                  : t.priority === 'low'
                    ? '⬇️'
                    : '·';
            lines.push(`  ${pri} ${t.title} [${t.id.slice(0, 8)}]`);
          }
        }
        await ctx.reply(lines.join('\n'));
        return true;
      }

      case '/task': {
        if (!this.deps?.taskRepo) {
          await ctx.reply('⚠️ Task board not available.');
          return true;
        }
        if (!arg) {
          await ctx.reply('Usage: /task <title>');
          return true;
        }
        const task = this.deps.taskRepo.create({ title: arg, createdBy: 'user' });
        await ctx.reply(`✅ Task created: ${task.title} [${task.id.slice(0, 8)}]`);
        return true;
      }

      case '/dev': {
        if (!this.deps?.setNeoDevMode || !this.deps?.isNeoDevMode) {
          await ctx.reply('⚠️ Neo-Dev mode not available.');
          return true;
        }
        const { isGroup: isGrp, userKey: uk3 } = this.getCtxKeys(ctx);
        if (isGrp) {
          await ctx.reply('🔒 Neo-Dev mode is disabled in group chats for security.');
          return true;
        }
        if (arg === 'on') {
          this.deps.setNeoDevMode(uk3, true);
          await ctx.reply('🟢 Neo-Dev mode ON — agent can freely edit neo-agent codebase');
        } else if (arg === 'off') {
          this.deps.setNeoDevMode(uk3, false);
          await ctx.reply('⚪ Neo-Dev mode OFF — back to normal permissions');
        } else {
          const current = this.deps.isNeoDevMode(uk3) ? 'ON' : 'OFF';
          await ctx.reply(
            `Neo-Dev mode: ${current}\nUsage: /dev <on|off>\nWhen ON, agent can edit the neo-agent codebase without permission prompts.`,
          );
        }
        return true;
      }

      case '/brag': {
        await ctx.reply(
          `🕶️ Neo-Agent — Your Personal AI Powerhouse\n\n` +
            `Here's what I can do:\n\n` +
            `💬 Chat Naturally — Talk to me like you'd talk to a friend. I get context, follow threads, and keep up.\n\n` +
            `🧠 Long-Term Memory — I remember your preferences, decisions, and important facts across sessions. You tell me once, I remember.\n\n` +
            `🔧 Code & Build — I read, write, and edit code. I run commands, search codebases, and debug issues end-to-end.\n\n` +
            `🌐 Web Research — I search the internet, fetch pages, and pull out what matters.\n\n` +
            `📎 Media — Send me voice notes, images, documents, or videos. I handle them all.\n\n` +
            `🤖 Smart Routing — I automatically pick the best AI model for each task — fast for quick answers, powerful for complex work.\n\n` +
            `⚡ Multi-Channel — CLI or Telegram, same brain, everywhere.\n\n` +
            `🎯 Skills & Sub-Agents — Specialized skills and sub-agents for complex multi-step workflows.\n\n` +
            `📋 Task Tracking — Manage tasks right here with /task and /tasks.\n\n` +
            `Just start chatting. I'll figure out the rest. 🕶️`,
        );
        return true;
      }

      default:
        return false;
    }
  }

  // ─── Media Download ───────────────────────────────────

  private async downloadTelegramFile(
    ctx: { getFile: () => Promise<{ file_path?: string }> },
    meta: {
      fileId: string;
      fileUniqueId: string;
      type: Attachment['type'];
      mimeType: string;
      fileSize: number;
      duration?: number;
      width?: number;
      height?: number;
      fileName?: string;
    },
  ): Promise<Attachment> {
    const file = await ctx.getFile();
    const localPath = await this.downloadFile(file.file_path!);

    return {
      id: meta.fileUniqueId,
      type: meta.type,
      mimeType: meta.mimeType,
      fileSize: meta.fileSize,
      localPath,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fileName: meta.fileName,
    };
  }

  private async downloadFile(filePath: string): Promise<string> {
    const url = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const dir = await mkdtemp(join(tmpdir(), 'neo-tg-'));
    const fileName = filePath.split('/').pop() ?? `file-${crypto.randomUUID()}`;
    const localPath = join(dir, fileName);
    await writeFile(localPath, buffer);
    return localPath;
  }

  // ─── Message Transform ────────────────────────────────

  /**
   * In group/supergroup chats, only respond if the bot is mentioned or
   * a slash command is explicitly addressed to us (e.g. /cmd@ourbot).
   * Returns true if the message should be ignored (not addressed to us).
   */
  private isGroupMessageNotForUs(ctx: {
    message?: {
      chat: { type: string };
      text?: string;
      caption?: string;
      entities?: Array<{ type: string; offset: number; length: number }>;
      reply_to_message?: { from?: { id: number } };
    };
    me?: { username: string; id: number };
  }): boolean {
    const chatType = ctx.message?.chat?.type;
    if (chatType !== 'group' && chatType !== 'supergroup') return false;

    const text = ctx.message?.text ?? ctx.message?.caption ?? '';
    const botUsername = ctx.me?.username;
    const entities = ctx.message?.entities ?? [];

    // Allow slash commands addressed to this bot (e.g. /status@neo_bot)
    if (botUsername) {
      const hasBotCommand = entities.some((e) => e.type === 'bot_command');
      if (hasBotCommand && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`))
        return false;
    }

    // Check for @mention in entities
    if (botUsername) {
      const hasMentionEntity = entities.some(
        (e) =>
          e.type === 'mention' &&
          text.slice(e.offset, e.offset + e.length).toLowerCase() ===
            `@${botUsername.toLowerCase()}`,
      );
      if (hasMentionEntity) return false;
    }

    // Fallback: check text contains @botname
    if (botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) return false;

    // Allow replies to the bot's own messages
    if (ctx.me?.id && ctx.message?.reply_to_message?.from?.id === ctx.me.id) return false;

    // Not mentioned — ignore
    return true;
  }

  /**
   * Strip the bot @mention from the message text so the agent sees clean input.
   */
  private stripBotMention(text: string, botUsername?: string): string {
    if (!botUsername) return text;
    return text.replace(new RegExp(`@${botUsername}\\b`, 'gi'), '').trim();
  }

  toInbound(
    ctx: { message: unknown; me?: { username: string } },
    attachments?: Attachment[],
  ): InboundMessage {
    const msg = ctx.message as {
      message_id: number;
      chat: { id: number; type: string };
      from?: { id: number; first_name?: string; last_name?: string; username?: string };
      text?: string;
      caption?: string;
      date: number;
    };

    const rawContent = msg.text ?? msg.caption ?? '';
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    const content = isGroup
      ? this.stripBotMention(rawContent, (ctx as any).me?.username)
      : rawContent;

    // Build sender display name for group context
    const from = msg.from;
    const senderName = from
      ? [from.first_name, from.last_name].filter(Boolean).join(' ') ||
        from.username ||
        String(from.id)
      : undefined;

    return {
      id: String(msg.message_id),
      channelId: String(msg.chat.id),
      channel: 'telegram',
      userId: String(msg.from?.id ?? ''),
      content,
      timestamp: msg.date * 1000,
      sessionKey: `telegram:${msg.chat.id}`,
      attachments: attachments?.length ? attachments : undefined,
      metadata: isGroup ? { isGroup: true, senderName } : { senderName: senderName ?? undefined },
    };
  }
}
