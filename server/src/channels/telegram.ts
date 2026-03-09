/**
 * ░▒▓ TELEGRAM CHANNEL ▓▒░
 *
 * "The phone lines are open... everywhere."
 *
 * Grammy-based Telegram bot with media downloads, bot commands,
 * and structured message dispatch. Inspired by OpenClaw's architecture.
 */

import type { AgentResponse, Attachment, InboundMessage, RoutingProfile } from '@neo-agent/shared';
import * as crypto from 'crypto';
import { mkdtemp, writeFile } from 'fs/promises';
import { Bot } from 'grammy';
import { tmpdir } from 'os';
import { join } from 'path';
import type { LongTermMemory, MemorySearch } from '../memory/index.js';
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

      // Handle bot commands
      if (text.startsWith('/')) {
        const handled = await this.handleCommand(text, ctx);
        if (handled) return;
      }

      await ctx.replyWithChatAction('typing');
      const startMs = Date.now();
      const response = await this.handler(this.toInbound(ctx));
      if (response) {
        const reply = this.formatReplyWithStats(response, Date.now() - startMs);
        const html = TelegramChannel.mdToHtml(reply);
        await ctx.reply(html, { parse_mode: 'HTML' }).catch((err) => {
          console.warn('[Telegram] HTML parse failed, fallback to plain:', err.message);
          return ctx.reply(reply);
        });
      }
    });

    // Voice messages
    this.bot.on('message:voice', async (ctx) => {
      const voice = ctx.message.voice;
      const attachment = await this.downloadTelegramFile(ctx, {
        fileId: voice.file_id,
        fileUniqueId: voice.file_unique_id,
        type: 'voice',
        mimeType: voice.mime_type ?? 'audio/ogg',
        fileSize: voice.file_size ?? 0,
        duration: voice.duration,
      });
      await ctx.replyWithChatAction('typing');
      const startMs = Date.now();
      const response = await this.handler(this.toInbound(ctx, [attachment]));
      if (response) {
        const reply = this.formatReplyWithStats(response, Date.now() - startMs);
        const html = TelegramChannel.mdToHtml(reply);
        await ctx.reply(html, { parse_mode: 'HTML' }).catch(() => ctx.reply(reply));
      }
    });

    // Audio messages
    this.bot.on('message:audio', async (ctx) => {
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
      await ctx.replyWithChatAction('typing');
      const startMs = Date.now();
      const response = await this.handler(this.toInbound(ctx, [attachment]));
      if (response) {
        const reply = this.formatReplyWithStats(response, Date.now() - startMs);
        const html = TelegramChannel.mdToHtml(reply);
        await ctx.reply(html, { parse_mode: 'HTML' }).catch(() => ctx.reply(reply));
      }
    });

    // Photos — Telegram sends multiple sizes, use the largest
    this.bot.on('message:photo', async (ctx) => {
      const photos = ctx.message.photo;
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
      await ctx.replyWithChatAction('typing');
      const startMs = Date.now();
      const response = await this.handler(this.toInbound(ctx, [attachment]));
      if (response) {
        const reply = this.formatReplyWithStats(response, Date.now() - startMs);
        const html = TelegramChannel.mdToHtml(reply);
        await ctx.reply(html, { parse_mode: 'HTML' }).catch(() => ctx.reply(reply));
      }
    });

    // Documents
    this.bot.on('message:document', async (ctx) => {
      const doc = ctx.message.document;
      const attachment = await this.downloadTelegramFile(ctx, {
        fileId: doc.file_id,
        fileUniqueId: doc.file_unique_id,
        type: 'document',
        mimeType: doc.mime_type ?? 'application/octet-stream',
        fileSize: doc.file_size ?? 0,
        fileName: doc.file_name,
      });
      await ctx.replyWithChatAction('typing');
      const startMs = Date.now();
      const response = await this.handler(this.toInbound(ctx, [attachment]));
      if (response) {
        const reply = this.formatReplyWithStats(response, Date.now() - startMs);
        const html = TelegramChannel.mdToHtml(reply);
        await ctx.reply(html, { parse_mode: 'HTML' }).catch(() => ctx.reply(reply));
      }
    });

    // Video
    this.bot.on('message:video', async (ctx) => {
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
      await ctx.replyWithChatAction('typing');
      const startMs = Date.now();
      const response = await this.handler(this.toInbound(ctx, [attachment]));
      if (response) {
        const reply = this.formatReplyWithStats(response, Date.now() - startMs);
        const html = TelegramChannel.mdToHtml(reply);
        await ctx.reply(html, { parse_mode: 'HTML' }).catch(() => ctx.reply(reply));
      }
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
    const content = response.content || 'No response.';
    const dur = (durationMs / 1000).toFixed(1);
    const model = response.model ?? '';

    // Estimate tokens: use exact count if available, otherwise ~4 chars/token
    const estimatedTokens = response.tokensUsed || Math.ceil(content.length / 4);
    const tokens = `↓${fmtTokens(estimatedTokens)}`;

    // Update session stats
    if (this.deps) {
      const s = this.deps.sessionMgr.current;
      s.turns += 1;
      s.totalOutputTokens += estimatedTokens;
      this.deps.sessionMgr.save(s);
    }

    const sessionTotal = this.deps
      ? `Σ${fmtTokens(this.deps.sessionMgr.current.totalInputTokens + this.deps.sessionMgr.current.totalOutputTokens)}`
      : '';

    const parts = [tokens, `${dur}s`, sessionTotal, model].filter(Boolean);
    const statsLine = `\n\n┗━ ${parts.join(' · ')}`;
    return content + statsLine;
  }

  // ─── Bot Commands ─────────────────────────────────────

  async handleCommand(
    text: string,
    ctx: { reply: (text: string) => Promise<unknown> },
  ): Promise<boolean> {
    const [cmd, ...args] = text.split(' ');
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
        } else if (['auto', 'eco', 'balanced', 'premium'].includes(arg)) {
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

  toInbound(ctx: { message: unknown }, attachments?: Attachment[]): InboundMessage {
    const msg = ctx.message as {
      message_id: number;
      chat: { id: number };
      from?: { id: number };
      text?: string;
      caption?: string;
      date: number;
    };

    return {
      id: String(msg.message_id),
      channelId: String(msg.chat.id),
      channel: 'telegram',
      userId: String(msg.from?.id ?? ''),
      content: msg.text ?? msg.caption ?? '',
      timestamp: msg.date * 1000,
      sessionKey: `telegram:${msg.chat.id}`,
      attachments: attachments?.length ? attachments : undefined,
    };
  }
}
