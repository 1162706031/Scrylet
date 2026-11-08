import type { SubmitMessage, ProviderChange, ProcessMessage, GenerationEvent } from '../../contracts/index.js';
import { validate, validateGraph } from '../../contracts/validate.cjs';
const submit: SubmitMessage = { apiVersion: 1, requestId: 'r1', chatVersion: 0, parentMessageId: null, modelId: 'alibaba.qwen-plus', parts: [{ type: 'image', fileId: 'f1' }], origin: 'desktop', command: { id: 'cmd1', clientId: 'receiver-session-1234', context: '/' } };
const typed: SubmitMessage = validate('submitMessage', submit);
const key: ProviderChange = { apiVersion: 1, providerId: 'fixture', revision: 0, baseUrl: 'http://127.0.0.1/v1', apiType: 'responses', modelIds: ['fixture'], keyAction: 'delete' };
const processMessage: ProcessMessage = { protocolVersion: 1, type: 'ready', host: '127.0.0.1', port: 12345, schemaVersion: 1, apiVersion: 1 };
const event: GenerationEvent = { apiVersion: 1, chatId: 'c1', generationId: 'g1', messageId: 'm1', seq: 1, type: 'finish', status: 'stopped' };
validate('providerChange', key); validate('processMessage', processMessage); validate('event', event); validateGraph({});
// @ts-expect-error Automatic sends require the page-bound command.
const missingCommand: SubmitMessage = { ...typed, origin: 'desktop', command: undefined };
// @ts-expect-error Deleted keys cannot carry a replacement secret.
const deletedKey: ProviderChange = { ...key, apiKey: 'fixture' };
// @ts-expect-error Terminal events cannot announce ongoing generation.
const ongoingFinish: GenerationEvent = { ...event, status: 'streaming' };
// @ts-expect-error Public schemas have known names.
validate('arbitrary-sql', {});
void [missingCommand, deletedKey, ongoingFinish];
