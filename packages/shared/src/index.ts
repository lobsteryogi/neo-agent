// ─── Neo-Agent Shared Types ─────────────────────────────────────
// Imported by both server and dashboard packages

// ─── Sessions ──────────────────────────────────────────────────

export type Channel = 'telegram' | 'web' | 'cli';
export type SessionStatus = 'active' | 'ended' | 'faded';
export type ModelTier = 'haiku' | 'sonnet' | 'opus';
export type VerbosityLevel = 'concise' | 'balanced' | 'detailed';

export interface Session {
  id: string;
  channel: Channel;
  userId?: string;
  model: ModelTier;
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  totalTokens: number;
  sdkSessionId?: string;
  lastModelTier?: ModelTier;
  turns?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCost?: number;
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

// ─── Attachments ──────────────────────────────────────────────

export type AttachmentType = 'voice' | 'image' | 'document' | 'video' | 'audio';

export interface Attachment {
  id: string;
  type: AttachmentType;
  mimeType: string;
  fileName?: string;
  fileSize: number;
  url?: string; // Remote URL (Telegram CDN etc.)
  localPath?: string; // After download to temp storage
  duration?: number; // For voice/audio/video (seconds)
  width?: number; // For images/video
  height?: number; // For images/video
  transcription?: string; // Populated after voice transcription
  analysis?: string; // Populated after image/document analysis
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
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
  currentContextTokens?: number;
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
  requiresExecution?: boolean;
  plannedActions?: PlannedAction[];
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
  resumeSessionId?: string;
}

export interface ClaudeResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

// ─── SDK Stream Message ────────────────────────────────────────

/** Lightweight type covering the shapes emitted by the Claude Agent SDK stream. */
export interface SDKStreamMessage {
  type: 'assistant' | 'system' | 'result' | 'tool_use' | 'tool_result' | string;
  message?: {
    model?: string;
    content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  session_id?: string;
  result?: string;
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      input_tokens?: number;
      outputTokens?: number;
      output_tokens?: number;
      costUSD?: number;
    }
  >;
  [key: string]: unknown;
}

// ─── Harness Response ──────────────────────────────────────────

/** Response flowing through the harness pipeline (Architect → Simulation → … → Historian). */
export interface HarnessResponse {
  content?: string;
  validatedContent?: string;
  model?: ModelTier;
  tokensUsed?: number;
  data?: {
    content?: string;
    result?: string;
    messages?: SDKStreamMessage[];
    [key: string]: unknown;
  };
  dryRun?: boolean;
  _deadline?: { maxMs: number; timestamp: number };
  _persistence?: { maxRetries: number; baseDelayMs: number };
  [key: string]: unknown;
}

// ─── Agent Response ────────────────────────────────────────────

export interface AgentResponse {
  content: string;
  model: ModelTier;
  tokensUsed?: number;
  inputTokens?: number;
  costUsd?: number;
  neoQuip?: string;
  retryable?: boolean;
  gateBlocked?: GateVerdict;
  warnings?: string[];
  /** File paths written/created by the agent during this turn. */
  files?: string[];
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

// ─── Skills ────────────────────────────────────────────────────

export interface SkillMeta {
  name: string;
  description: string;
  tags: string[];
}

export interface Skill extends SkillMeta {
  instructions: string; // markdown body of SKILL.md
  path: string; // absolute path to skill directory
  scripts: string[]; // files in scripts/ subdirectory
  examples: string[]; // files in examples/ subdirectory
}

// ─── Agents (Phase 7) ──────────────────────────────────────────

export interface AgentBlueprint {
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
  model?: ModelTier;
  workingDir?: string;
  claudeMd?: string;
}

export type OrchestrationPattern = 'sequential' | 'parallel' | 'supervisor';
export type TeamStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SubAgentTask {
  id: string;
  blueprintName: string;
  prompt: string;
  dependsOn?: string[];
  context?: string;
}

export interface SubAgentResult {
  agentName: string;
  taskId: string;
  success: boolean;
  output: unknown;
  artifacts?: AgentArtifact[];
  tokensUsed?: number;
  durationMs?: number;
  error?: string;
}

export interface AgentArtifact {
  name: string;
  path: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
}

export interface AgentTeam {
  id: string;
  pattern: OrchestrationPattern;
  tasks: SubAgentTask[];
  status: TeamStatus;
  results: SubAgentResult[];
  parentSession?: string;
  createdAt: number;
  completedAt?: number;
}

export interface AgentConfig {
  maxConcurrentAgents: number;
  defaultSubAgentTimeout: number;
  defaultSubAgentMaxTurns: number;
  agentWorkspaceDir: string;
  autoDecompose: boolean;
  decompositionThreshold: number;
  blueprintsDir: string;
}

export interface DecomposeDecision {
  shouldDecompose: boolean;
  suggestedPattern: OrchestrationPattern;
  signals: Record<string, boolean>;
}

// ─── Kanban Tasks ─────────────────────────────────────────

export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done' | 'error';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  labels: string[];
  sessionId?: string;
  teamId?: string;
  agentResult?: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  notes?: string;
  startedAt?: number;
  createdBy: 'user' | 'agent';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ─── Agent Activity Events ─────────────────────────────────

export type AgentEventType = 'assigned' | 'progress' | 'completed' | 'failed';

export interface AgentActivityEvent {
  type: AgentEventType;
  taskId: string;
  agentName: string;
  timestamp: number;
  message: string;
  durationMs?: number;
  error?: string;
  eventKind?: 'text' | 'tool_use' | 'system';
  toolName?: string;
}

export const KANBAN_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
  { id: 'error', label: 'Error' },
];

// ─── Browser ──────────────────────────────────────────────────

export interface BrowserAction {
  type:
    | 'navigate'
    | 'click'
    | 'fill'
    | 'type'
    | 'press'
    | 'screenshot'
    | 'snapshot'
    | 'wait'
    | 'scroll'
    | 'select'
    | 'hover'
    | 'back'
    | 'forward'
    | 'reload'
    | 'tab'
    | 'close';
  target?: string; // URL, ref (@e1), selector, or key
  value?: string; // Text to fill/type, option to select
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  snapshot: string; // Accessibility tree text
  refs: Record<string, { selector: string; role: string; name: string }>;
  timestamp: number;
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
  memory: { dbSizeMb: number; heapUsedMb?: number; ftsEntries: number };
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
  verbosity: VerbosityLevel;
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
  verbosity: VerbosityLevel;
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
  telegramBotToken?: string;
  syncRepo?: string;
  tailscaleEnabled?: boolean;
  enableDashboard: boolean;
}

export const WIZARD_DEFAULTS: WizardAnswers = {
  userName: 'Human',
  agentName: 'Neo',
  personalityIntensity: 'full-existential-crisis',
  verbosity: 'balanced',
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
