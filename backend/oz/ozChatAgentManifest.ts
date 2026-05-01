import { OZ_CHAT_CONTRACT_VERSION } from './chatRuntime'
import {
  OZ_CHAT_SYSTEM_PROMPT,
  OZ_CHAT_SYSTEM_PROMPT_VERSION,
  ozChatOpenAiToolDefinitions,
  OZ_CHAT_TOOL_NAMES_ORDERED,
} from './ozChatToolRegistry'

/** Portable bundle for external OpenAI-style chat agents and integration tests. */
export type OzChatAgentManifest = {
  contract_version: typeof OZ_CHAT_CONTRACT_VERSION
  registry_prompt_version: typeof OZ_CHAT_SYSTEM_PROMPT_VERSION
  system_prompt: string
  tools: ReturnType<typeof ozChatOpenAiToolDefinitions>
  tool_names_ordered: ReadonlyArray<string>
}

export function buildOzChatAgentManifest(): OzChatAgentManifest {
  return {
    contract_version: OZ_CHAT_CONTRACT_VERSION,
    registry_prompt_version: OZ_CHAT_SYSTEM_PROMPT_VERSION,
    system_prompt: OZ_CHAT_SYSTEM_PROMPT,
    tools: ozChatOpenAiToolDefinitions(),
    tool_names_ordered: OZ_CHAT_TOOL_NAMES_ORDERED,
  }
}
