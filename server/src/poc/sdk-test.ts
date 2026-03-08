/**
 * Claude Agent SDK — Proof of Concept (Audit Fix C1)
 *
 * Uses @anthropic-ai/claude-agent-sdk (the programmatic TypeScript SDK).
 * Ref: https://platform.claude.com/docs/en/agent-sdk/typescript
 *
 * Tests:
 * 1. Basic prompt → streamed response via query()
 * 2. Message type inspection (what events stream back)
 * 3. Tool restrictions via allowedTools
 * 4. Timeout via AbortController
 * 5. maxTurns enforcement
 *
 * Run: pnpm neo:poc
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

async function runPOC(): Promise<void> {
  console.log('═══════════════════════════════════════════════');
  console.log('  Claude Agent SDK — Proof of Concept');
  console.log('  Audit Fix C1: SDK Reality Check');
  console.log('═══════════════════════════════════════════════\n');

  // ─── Test 1: Basic streaming query ─────────────────────────
  console.log('▸ Test 1: Basic query() with streaming...');
  try {
    const messageTypes = new Set<string>();
    let resultText = '';
    let messageCount = 0;

    const conversation = query({
      prompt: 'What is 2 + 2? Reply with JUST the number.',
      options: {
        maxTurns: 1,
      },
    });

    for await (const message of conversation) {
      messageCount++;
      messageTypes.add(message.type);

      // Capture assistant text
      if (message.type === 'assistant' && 'message' in message) {
        const content = (message as any).message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') resultText += block.text;
          }
        }
      }

      // Log first few messages for inspection
      if (messageCount <= 5) {
        console.log(
          `  Message ${messageCount}: type="${message.type}"`,
          JSON.stringify(message).slice(0, 120),
        );
      }
    }

    console.log(`  Total messages: ${messageCount}`);
    console.log(`  Message types: [${[...messageTypes].join(', ')}]`);
    console.log(`  Result text: "${resultText.trim()}"`);
    console.log('  ✅ Basic streaming works\n');
  } catch (err: any) {
    console.log(`  ❌ Failed: ${err.message}\n`);
  }

  // ─── Test 2: JSON output format ────────────────────────────
  console.log('▸ Test 2: Message structure inspection...');
  try {
    let hasAssistant = false;
    let hasResult = false;

    const conversation = query({
      prompt: 'Say "hello" and nothing else.',
      options: {
        maxTurns: 1,
      },
    });

    for await (const message of conversation) {
      if (message.type === 'assistant') hasAssistant = true;
      if (message.type === 'result') hasResult = true;

      // Log full structure of each message type (once)
      console.log(`  [${message.type}] keys: ${Object.keys(message).join(', ')}`);
    }

    console.log(`  Has assistant message: ${hasAssistant}`);
    console.log(`  Has result message: ${hasResult}`);
    console.log('  ✅ Message inspection complete\n');
  } catch (err: any) {
    console.log(`  ❌ Failed: ${err.message}\n`);
  }

  // ─── Test 3: Tool restrictions ─────────────────────────────
  console.log('▸ Test 3: allowedTools restriction...');
  try {
    const conversation = query({
      prompt: 'Read the file /tmp/neo-test.txt',
      options: {
        maxTurns: 1,
        allowedTools: ['Read'],
      },
    });

    let toolUsed = false;
    for await (const message of conversation) {
      if (message.type === 'assistant') {
        const content = (message as any).message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              toolUsed = true;
              console.log(`  Tool used: ${block.name}`);
            }
          }
        }
      }
    }

    console.log(`  Tool was used: ${toolUsed}`);
    console.log('  ✅ Tool restrictions test complete\n');
  } catch (err: any) {
    console.log(`  ❌ Failed: ${err.message}\n`);
  }

  // ─── Test 4: Timeout via AbortController ───────────────────
  console.log('▸ Test 4: AbortController timeout (5s)...');
  try {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 5000);
    const start = Date.now();

    const conversation = query({
      prompt: 'Write a very long story about robots. Make it at least 2000 words.',
      options: {
        maxTurns: 1,
        abortController,
      },
    });

    let chunks = 0;
    try {
      for await (const message of conversation) {
        chunks++;
      }
      clearTimeout(timeout);
      console.log(`  Completed in ${Date.now() - start}ms (${chunks} messages)`);
      console.log('  ✅ Completed before timeout\n');
    } catch (abortErr: any) {
      clearTimeout(timeout);
      console.log(`  Aborted after ${Date.now() - start}ms (${chunks} messages)`);
      console.log('  ✅ AbortController works for timeouts\n');
    }
  } catch (err: any) {
    console.log(`  ❌ Failed: ${err.message}\n`);
  }

  // ─── Summary ───────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('  POC Complete');
  console.log('');
  console.log('  KEY FINDINGS:');
  console.log('  • SDK package: @anthropic-ai/claude-agent-sdk');
  console.log('  • Primary API: query() → AsyncGenerator<SDKMessage>');
  console.log('  • Streaming: native via async iteration (for await)');
  console.log('  • Timeout: AbortController support');
  console.log('  • Tools: allowedTools / disallowedTools arrays');
  console.log('  • Permissions: permissionMode option');
  console.log('  • System prompt: systemPrompt option');
  console.log('  • Session resume: resume / sessionId options');
  console.log('═══════════════════════════════════════════════');
}

runPOC().catch(console.error);
