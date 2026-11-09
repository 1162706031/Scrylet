/** Draft v1. JSON timestamps are epoch milliseconds. No routes are enabled here. */
export type GenerationStatus = 'accepted' | 'requesting' | 'streaming' | 'completed' | 'stopped' | 'failed' | 'interrupted';
export type InputPart = { type: 'text'; text: string } | { type: 'image'; fileId: string };
export type MessagePart = InputPart | { type: 'reasoning'; text: string };
export interface DesktopCommand { id: string; clientId: string; context: string }
interface SubmitBase { apiVersion: 1; requestId: string; chatVersion: number; parentMessageId: string | null; modelId: string; parts: InputPart[]; regenerationStyle?: 'retry' | 'detail' | 'concise' }
export type SubmitMessage = SubmitBase & ({ origin: 'manual'; command?: never } | { origin: 'desktop'; command: DesktopCommand }) &
  ({ action?: 'append'; targetMessageId?: never } | { action: 'edit' | 'regenerate'; targetMessageId: string });
export type ErrorCode = 'INVALID_CONTRACT' | 'VERSION_CONFLICT' | 'REQUEST_CONFLICT' | 'DRAFT_CONFLICT' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'PAUSED' | 'NOT_READY' | 'TOO_LARGE' | 'NOT_FOUND' | 'PROVIDER_ERROR' | 'INTERRUPTED' | 'STORAGE_FAILED' | 'MIGRATION_FAILED' | 'PROTOCOL_MISMATCH';
export interface PublicError { error: string; code: ErrorCode }
export interface Message { id: string; chatId: string; parentMessageId: string | null; role: 'system' | 'user' | 'assistant'; modelId: string | null; parts: MessagePart[]; createdAt: number; status: GenerationStatus | null }
export interface Chat { apiVersion: 1; id: string; title: string; version: number; currentMessageId: string | null; modelId: string; pinned: boolean; archived: boolean; lastReadAt: number | null; createdAt: number; updatedAt: number; messages: Message[]; activeGeneration?: Generation | null }
export interface Generation { apiVersion: 1; id: string; chatId: string; requestId: string; userMessageId: string; assistantMessageId: string; status: GenerationStatus; lastSeq: number; parts: MessagePart[]; createdAt: number; updatedAt: number; error: PublicError | null }
interface EventBase { apiVersion: 1; chatId: string; generationId: string; messageId: string; seq: number }
export type GenerationEvent = EventBase & (
  { type: 'begin' } | { type: 'delta'; partIndex: number; partType: 'text' | 'reasoning'; text: string } |
  { type: 'snapshot'; snapshot: Generation } | { type: 'finish'; status: 'completed' | 'stopped' } |
  { type: 'error' | 'interrupted'; error: PublicError });
export interface DraftSnapshot { apiVersion: 1; browserClientId: string; chatKey: string; revision: number; modelId: string; parts: InputPart[]; savedAt: number }
export interface Attachment { apiVersion: 1; id: string; name: string; mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml'; bytes: number; sha256: string; width: number; height: number; createdAt: number }
interface ProviderBase { apiVersion: 1; providerId: string; revision: number; baseUrl: string; apiType: 'chat' | 'responses'; modelIds: string[] }
export type ProviderChange = ProviderBase & ({ keyAction: 'set'; apiKey: string } | { keyAction: 'keep' | 'delete'; apiKey?: never });
export interface PublicModel { id: string; providerId: string; name: string; vision: boolean; configured: boolean }
export interface ProviderView { id: string; name: string; models: string[]; source: string; baseUrl: string; configured: boolean; revision?: number; apiType?: 'chat' | 'responses' }
export interface ProviderCatalogView { verifiedAt: string; providers: ProviderView[] }
export interface PublicStatus { apiVersion: 1; frontendBuild: string; runtimeKind: 'legacy' | 'node'; ready: boolean; paused: boolean; permission: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'; displays: { id: string; name: string; width: number; height: number; primary: boolean }[]; error: string | null; maxImages: 12; showCaptureHints: false; migration: 'not-started' | 'running' | 'validated' | 'failed' }
export interface Prompt { id: string; command: string; name: string; content: string; updatedAt: number }
export interface StoredMessage { schemaVersion: 1; message: Message; providerOutput: unknown; legacy: unknown }
export interface DesktopPoll { clientId: string; context: string; ready: boolean; active: boolean; claim?: boolean; reason?: '' | 'hidden' | 'loading' | 'draft' | 'generating' | 'busy'; activeCommandId?: string }
export type ProcessMessage = { protocolVersion: 1 } & (
  { type: 'initialize'; dataDirectory: string; legacySource: string | null; productVersion: string; catalogVersion: string; credential: string; parentPid: number; promptSeeds?: Record<string, { name: string; content: string }>; testCapabilities: ('mock-provider' | 'fault-injection')[] } |
  { type: 'shutdown' | 'stopped' } |
  { type: 'ping' | 'pong'; nonce: string } |
  { type: 'phase'; phase: 'opening-storage' | 'migrating' | 'starting-http'; completed: number; total: number } |
  { type: 'ready'; host: '127.0.0.1'; port: number; schemaVersion: number; apiVersion: 1 } |
  ({ type: 'failed' } & PublicError) |
  ({ type: 'secret-request'; requestId: string; providerId: string; secretRef?: string } & ({ operation: 'set'; value: string } | { operation: 'get' | 'delete'; value?: never })) |
  { type: 'secret-response'; requestId: string; ok: true; value: string | null } |
  ({ type: 'secret-response'; requestId: string; ok: false } & PublicError));
export type NativeEvent = { protocolVersion: 1 } & ({ type: 'ready'; coordinateSpace: 'physical' | 'dip' } | { type: 'down' | 'move' | 'up'; x: number; y: number } | { type: 'cancel' });
export interface AcceptedSubmission { apiVersion: 1; chatId: string; generationId: string; userMessageId: string; assistantMessageId: string; status: GenerationStatus; deduplicated: boolean; chatVersion: number }
export interface ChatPatch { apiVersion: 1; version: number; title?: string; pinned?: boolean; archived?: boolean; lastReadAt?: number | null; currentMessageId?: string | null; modelId?: string }
export interface DraftWrite { apiVersion: 1; browserClientId: string; expectedRevision: number; modelId: string; parts: InputPart[] }
export interface DesktopDelivery { id: string; image: string; prompt: string; showCaptureHints: false }
export interface DesktopAck extends DesktopCommand { success: boolean; error?: string }
export interface ContractMap { submitMessage: SubmitMessage; publicError: PublicError; message: Message; chat: Chat; generation: Generation; event: GenerationEvent; draft: DraftSnapshot; file: Attachment; command: DesktopCommand; nativeEvent: NativeEvent; processMessage: ProcessMessage; providerChange: ProviderChange; publicModel: PublicModel; providerCatalog: ProviderCatalogView; status: PublicStatus; prompt: Prompt; storedMessage: StoredMessage; desktopPoll: DesktopPoll; acceptedSubmission: AcceptedSubmission; chatPatch: ChatPatch; draftWrite: DraftWrite; desktopDelivery: DesktopDelivery; desktopAck: DesktopAck; requestIdentity: RequestIdentity }
export interface RequestIdentity { deviceId: string; requestId: string; commandId: string | null; fingerprint: string }
export interface CreateChat { apiVersion: 1; modelId: string; title?: string }
export interface PromptChange { apiVersion: 1; id: string; command: string; name: string; content: string; expectedUpdatedAt?: number }
export interface ContractMap { createChat: CreateChat; promptChange: PromptChange }
export interface ContractMap { legacyProviderChange: { apiKey: string; baseUrl?: string; remove?: boolean } }
export interface ContractMap { emptyOperation: { apiVersion: 1 }; versionedOperation: { apiVersion: 1; version: number }; chatPage: { apiVersion: 1; items: Chat[]; nextCursor: string | null } }
export interface ContractMap { messagePatch: { apiVersion: 1; version: number; parts: MessagePart[] } }
export interface CaptureSnapshot { displayId: string; width: number; height: number; image: string }
export interface ContractMap { capture: CaptureSnapshot; captureRequest: { displayId: string }; desktopPollResult: { command: DesktopDelivery | null; deferClaim?: boolean } }
export interface InternalRequest { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }
export interface RuntimePort {
  readonly kind: 'legacy' | 'node'; ready: boolean; error: string | null; url: string | null;
  start(): Promise<void>; stop(): Promise<void>; providers(): Promise<ProviderCatalogView>;
  saveProvider(providerId: string, value: ProviderChange): Promise<{ success: true }>; availableModels(): Promise<boolean>;
  request(path: string, options?: InternalRequest): Promise<unknown>;
}
