// ─── Neo-Agent Shared Types ─────────────────────────────────────
// Imported by both server and dashboard packages

// ─── Sessions ──────────────────────────────────────────────────

export type Channel = 'telegram' | 'web' | 'cli';
export type SessionStatus = 'active' | 'ended' | 'faded';
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export interface Session {
  id: string;
  channel: Channel;
  userId?: string;
  model: ModelTier;
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  totalTokens: number;
}

// ─── Messages ──────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  tokens: number;
  timestamp: number;
}

// ─── Inbound ──────────────────────────────────────────────────

export interface InboundMessage {
  id: string;
  channelId: string;
  channel: Channel;
  userId: string;
  content: string;
  timestamp: number;
  sessionKey: string;
  metadata?: Record<string, unknown>;
}

export interface SanitizedMessage extends InboundMessage {
  originalContent?: string; // Set if redactor modified content
}

// ─── Gates ─────────────────────────────────────────────────────

export interface PlannedAction {
  type: 'write' | 'read' | 'delete' | 'execute';
  path?: string;
  command?: string;
}

export interface GateVerdict {
  blocked: boolean;
  gate?: string;
  reason?: string;
  neoQuip?: string;
  confidence?: number;
  pendingAction?: PlannedAction[];
}

// ─── Guardrails ────────────────────────────────────────────────

export interface GuardrailVerdict {
  blocked: boolean;
  guard?: string;
  reason?: string;
  confidence?: number;
  sanitized?: SanitizedMessage;
}

// ─── Router ────────────────────────────────────────────────────

export type RoutingProfile = 'auto' | 'eco' | 'balanced' | 'premium';

export interface TaskClassification {
  complexity: number; // 0-1
  tokenEstimate: number;
  contextNeeds: number; // 0-1
  precisionRequired: number; // 0-1
  toolUsage: boolean;
  speedPriority: number; // 0-1
}

export interface RouteDecision {
  selectedModel: ModelTier;
  score: number;
  classification: TaskClassification;
  allowedTools?: string[];
  maxTurns?: number;
}

// ─── Claude Bridge ─────────────────────────────────────────────

export interface ClaudeBridgeOptions {
  cwd: string;
  model?: ModelTier;
  permissionMode?: string;
  allowedTools?: string[];
  systemPrompt?: string;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface ClaudeResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

// ─── Agent Response ────────────────────────────────────────────

export interface AgentResponse {
  content: string;
  model: ModelTier;
  tokensUsed?: number;
  neoQuip?: string;
  retryable?: boolean;
  gateBlocked?: GateVerdict;
}

// ─── Memory ────────────────────────────────────────────────────

export type MemoryType = 'fact' | 'preference' | 'decision' | 'learning' | 'correction';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  importance: number; // 0-1
  tags: string[];
  sourceSession: string;
}

export interface MemorySearchResult extends MemoryEntry {
  relevance: number;
  source: 'long-term' | 'handoff' | 'daily-log' | 'story';
}

export interface HandoffSnapshot {
  id: string;
  decisions: string[];
  keyFacts: string[];
  openQuestions: string[];
  workInProgress: string[];
  userPreferences: string[];
  timestamp: number;
}

export interface FadeCheck {
  fading: boolean;
  ratio: number;
  snapshotId?: string;
}

// ─── Health ────────────────────────────────────────────────────

export interface ToolHealth {
  available: boolean;
  degraded?: string;
}

export interface HealthStatus {
  status: 'operational' | 'degraded' | 'down';
  uptime: number;
  claude: { responsive: boolean; lastLatencyMs?: number };
  memory: { dbSizeMb: number; ftsEntries: number };
  activeSession?: { tokensUsed: number; fadeRisk: number };
  gates: { blockedLast1h: number };
  sync: { lastSyncAt?: string; behind: boolean };
  tools: Record<string, ToolHealth>;
}

// ─── Config ────────────────────────────────────────────────────

export interface NeoConfig {
  port: number;
  wsPort: number;
  wsToken: string;
  workspacePath: string;
  dbPath: string;
  permissionMode: string;
  defaultModel: ModelTier;
  userName: string;
  agentName: string;
  personalityIntensity: string;
  fadeThreshold: number;
  dailyLogCron: string;
  maxStories: number;
  gatePhrase: string;
  protectedPaths: string[];
  routingProfile: RoutingProfile;
}

// ─── Wizard ────────────────────────────────────────────────────

export interface WizardAnswers {
  userName: string;
  agentName: string;
  personalityIntensity: string;
  permissionMode: string;
  defaultModel: ModelTier;
  port: number;
  wsPort: number;
  fadeThreshold: number;
  dailyLogCron: string;
  maxStories: number;
  gatePhrase: string;
  protectedPaths: string[];
  routingProfile: RoutingProfile;
  composioApiKey?: string;
  telegramBotToken?: string;
  syncRepo?: string;
  tailscaleEnabled?: boolean;
  enableDashboard: boolean;
}

export const WIZARD_DEFAULTS: WizardAnswers = {
  userName: 'Human',
  agentName: 'Neo',
  personalityIntensity: 'full-existential-crisis',
  permissionMode: 'default',
  defaultModel: 'sonnet',
  port: 3141,
  wsPort: 3142,
  fadeThreshold: 0.85,
  dailyLogCron: '0 23 * * *',
  maxStories: 5,
  gatePhrase: 'do it',
  protectedPaths: ['~/.ssh/', '~/.gnupg/', '.env'],
  routingProfile: 'auto',
  enableDashboard: true,
};
