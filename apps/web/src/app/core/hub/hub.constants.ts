/**
 * Model identifiers the upstream API expects. They are protocol values, never
 * shown to a customer: the pages render the translated labelKey instead, so the
 * operator's own brand is the only one the workspace displays.
 */
export interface HubModelOption {
  readonly value: string;
  readonly labelKey: string;
}

/** Speech synthesis models. An unset value lets the platform pick by language. */
export const TTS_MODEL_OPTIONS: readonly HubModelOption[] = [
  { value: 'echocall-flash-lite', labelKey: 'user.models.tts.fastest' },
  { value: 'echocall-flash', labelKey: 'user.models.tts.fast' },
  { value: 'echocall-ultra', labelKey: 'user.models.tts.premium' },
  { value: 'echocall-multilingual', labelKey: 'user.models.tts.multilingual' },
];

/** Reasoning models available to agents and chatbots. */
export const LLM_MODEL_OPTIONS: readonly HubModelOption[] = [
  { value: 'EchoCall-Voice', labelKey: 'user.models.llm.conversation' },
  { value: 'EchoCall-Smart', labelKey: 'user.models.llm.knowledge' },
];

export const DEFAULT_VOICE_LLM_MODEL = 'EchoCall-Voice';
export const DEFAULT_CHAT_LLM_MODEL = 'EchoCall-Smart';
