export function voiceKey(voice: SpeechSynthesisVoice): string;
export function voiceLabel(voice: SpeechSynthesisVoice): string;
export function speechRate(value: unknown): number;
export function chooseVoice(voices: SpeechSynthesisVoice[], preferred?: string, lang?: string): SpeechSynthesisVoice | null;
