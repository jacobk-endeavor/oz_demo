export const OZ_CHAT_CONTRACT_VERSION = "2026-04-oz-chat-v1" as const;

export type OzChatScopeMode = "oz_admin" | "rep";

export interface OzChatRequest {
  contract_version?: string;
  message: string;
  conversation_id?: string;
  trace_id?: string;
  scope?: {
    mode: OzChatScopeMode;
    rep_name?: string;
  };
  ui_context?: {
    page?: string;
    attachments?: string[];
    hardcoded_action_taken?: boolean;
  };
  metadata?: Record<string, string>;
}

export interface OzChatEventEnvelope {
  type: OzChatEventType;
  contract_version: string;
  sequence: number;
  timestamp: string;
  conversation_id?: string;
  trace_id?: string;
}

export type OzChatEventType =
  | "token"
  | "tool_call"
  | "tool_result"
  | "trace"
  | "done";

export interface OzChatTokenEvent extends OzChatEventEnvelope {
  type: "token";
  delta: string;
}

export interface OzChatToolCallEvent extends OzChatEventEnvelope {
  type: "tool_call";
  tool_call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface OzChatToolResultEvent extends OzChatEventEnvelope {
  type: "tool_result";
  tool_call_id: string;
  name: string;
  ok: boolean;
  summary?: string;
  result_meta?: Record<string, unknown>;
}

export interface OzChatTraceEvent extends OzChatEventEnvelope {
  type: "trace";
  stage: string;
  decision: string;
  details?: Record<string, unknown>;
}

export interface OzChatCitation {
  kind: string;
  id: string;
  label?: string;
}

export interface OzChatDoneEvent extends OzChatEventEnvelope {
  type: "done";
  message: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  citations?: OzChatCitation[];
  finish_reason?: string;
}

export type OzChatStreamEvent =
  | OzChatTokenEvent
  | OzChatToolCallEvent
  | OzChatToolResultEvent
  | OzChatTraceEvent
  | OzChatDoneEvent;

