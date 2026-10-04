/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import {
	ILanguageModelsService,
	ILanguageModelChatProvider,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatInfoOptions,
	ILanguageModelChatRequestOptions,
	ILanguageModelChatResponse,
	IChatMessage,
	IChatResponsePart
} from '../../chat/common/languageModels.js';
import { IInfinityService } from '../common/infinity.js';

const INFINITY_VENDOR = 'infinity';
const INFINITY_MODEL_ID = 'infinity-unlimited-free';
const OMNIROUTE_URL = 'http://127.0.0.1:20128';

export class InfinityLanguageModelContribution extends Disposable implements ILanguageModelChatProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IInfinityService private readonly infinityService: IInfinityService,
	) {
		super();

		// Step 1: Register 'infinity' as a known vendor descriptor.
		// The language model service maintains a vendor allowlist; providers
		// that attempt to register against an unknown vendor are rejected.
		this.languageModelsService.deltaLanguageModelChatProviderDescriptors(
			[{ vendor: INFINITY_VENDOR, displayName: 'Infinity AI' }],
			[]
		);

		// Step 2: Now register the actual language model chat provider.
		this._register(this.languageModelsService.registerLanguageModelProvider(INFINITY_VENDOR, this));
		this._register(this.infinityService.onDidChangeProviders(() => this._onDidChange.fire()));
	}

	async provideLanguageModelChatInfo(options: ILanguageModelChatInfoOptions, token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		return [
			{
				identifier: INFINITY_MODEL_ID,
				metadata: {
					extension: new ExtensionIdentifier('infinity.core'),
					name: 'Infinity Unlimited (Auto-Cycling Free)',
					vendor: INFINITY_VENDOR,
					family: 'infinity',
					version: '1.0.0',
					maxInputTokens: 128000,
					maxOutputTokens: 8192,
					isDefault: true,
					tooltip: 'Never hit token limits. Cycles through Gemini, Groq, Cerebras, OpenCode, and Mistral with automatic 429 rate-limit fallback.'
				}
			},
			{
				identifier: 'infinity-gemini-free',
				metadata: {
					extension: new ExtensionIdentifier('infinity.core'),
					name: 'Google Gemini 2.0 Flash (Free Tier)',
					vendor: INFINITY_VENDOR,
					family: 'gemini',
					version: '2.0.0',
					maxInputTokens: 1000000,
					maxOutputTokens: 8192,
					isDefault: false,
					tooltip: 'Google Gemini 2.0 Flash with 1M context window and 15 requests/minute free.'
				}
			},
			{
				identifier: 'infinity-groq-free',
				metadata: {
					extension: new ExtensionIdentifier('infinity.core'),
					name: 'Groq Llama 3.3 70B (300+ tok/s)',
					vendor: INFINITY_VENDOR,
					family: 'llama',
					version: '3.3.0',
					maxInputTokens: 128000,
					maxOutputTokens: 8192,
					isDefault: false,
					tooltip: 'Ultra-fast 300+ tokens per second inference powered by Groq LPUs.'
				}
			},
			{
				identifier: 'infinity-cerebras-free',
				metadata: {
					extension: new ExtensionIdentifier('infinity.core'),
					name: 'Cerebras 1,800 tok/s Wafer-Scale',
					vendor: INFINITY_VENDOR,
					family: 'cerebras',
					version: '3.1.0',
					maxInputTokens: 128000,
					maxOutputTokens: 8192,
					isDefault: false,
					tooltip: 'The fastest LLM inference in the world: 1,800 tokens/sec on Cerebras CS-3.'
				}
			}
		];
	}

	async sendChatRequest(modelId: string, messages: IChatMessage[], from: ExtensionIdentifier | undefined, options: ILanguageModelChatRequestOptions, token: CancellationToken): Promise<ILanguageModelChatResponse> {
		const formattedMessages = messages.map(m => {
			let text = '';
			for (const part of m.content) {
				if (part.type === 'text') {
					text += part.value;
				}
			}
			return {
				role: m.role === 1 ? 'user' : (m.role === 2 ? 'assistant' : 'system'),
				content: text
			};
		});

		const stream = this._createStream(modelId, formattedMessages, token);

		return {
			stream,
			result: Promise.resolve({})
		};
	}

	private async * _createStream(modelId: string, messages: { role: string; content: string }[], token: CancellationToken): AsyncIterable<IChatResponsePart> {
		try {
			for await (const chunk of this.infinityService.executeChatStream(modelId, messages, token)) {
				yield {
					type: 'text',
					value: chunk
				};
			}
		} catch (err: any) {
			yield {
				type: 'text',
				value: `\n[Infinity IDE: Error] ${String(err.message || err)}`
			};
		}
	}

	async provideTokenCount(modelId: string, message: string | IChatMessage, token: CancellationToken): Promise<number> {
		const text = typeof message === 'string' ? message : message.content.map(c => c.type === 'text' ? c.value : '').join('');
		return Math.ceil(text.length / 4);
	}
}
