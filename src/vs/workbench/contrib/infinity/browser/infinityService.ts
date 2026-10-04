/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import {
	IInfinityService,
	IInfinityProvider,
	IInfinityPoolStatus,
	InfinityProviderId,
	InfinityProviderStatus
} from '../common/infinity.js';
import { localize } from '../../../../nls.js';

const OMNIROUTE_URL = 'http://127.0.0.1:20128';

export class InfinityService extends Disposable implements IInfinityService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders: Event<void> = this._onDidChangeProviders.event;

	private readonly _providers: Map<InfinityProviderId, IInfinityProvider> = new Map();
	private _isDaemonOnline = false;

	constructor(
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this._initDefaultProviders();
		this._restoreSavedState();
		this.ensureDaemonRunning();
	}

	private _initDefaultProviders(): void {
		const defaults: IInfinityProvider[] = [
			{
				id: 'gemini',
				name: 'Google Gemini',
				subtitle: 'Flash 2.5 & Pro Free Tier',
				badge: '15 RPM Free',
				speedBadge: '1M Context',
				description: '15 requests per minute, 1,500 per day with Google AI Studio free tier.',
				models: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
				getKeyUrl: 'https://aistudio.google.com/app/apikey',
				requiresKey: true,
				hasKey: false,
				enabled: true,
				status: 'unconfigured'
			},
			{
				id: 'groq',
				name: 'Groq',
				subtitle: 'Llama 3.3 70B & Qwen Coder',
				badge: '300+ tok/s',
				speedBadge: 'Ultra Fast',
				description: 'Blazing inference speeds with generous free developer tier quotas.',
				models: ['llama-3.3-70b-versatile', 'qwen-2.5-coder-32b', 'mixtral-8x7b-32768'],
				getKeyUrl: 'https://console.groq.com/keys',
				requiresKey: true,
				hasKey: false,
				enabled: true,
				status: 'unconfigured'
			},
			{
				id: 'cerebras',
				name: 'Cerebras',
				subtitle: 'Llama 3.3 70B Wafer-Scale',
				badge: '1,800 tok/s',
				speedBadge: 'Fastest In The World',
				description: 'Instantaneous 1,800 tokens/sec coding completions with 1M tokens/day free.',
				models: ['llama-3.3-70b', 'llama3.1-8b'],
				getKeyUrl: 'https://cloud.cerebras.ai',
				requiresKey: true,
				hasKey: false,
				enabled: true,
				status: 'unconfigured'
			},
			{
				id: 'opencode',
				name: 'OpenCode Free / Kiro',
				subtitle: 'Free Claude & GPT Tiers',
				badge: 'Zero-Config',
				speedBadge: 'No Key Needed',
				description: 'Free community access to top-tier reasoning and coding models.',
				models: ['claude-3-5-sonnet', 'gpt-4o'],
				getKeyUrl: '',
				requiresKey: false,
				hasKey: true,
				enabled: true,
				status: 'healthy',
				statusMessage: 'Ready (Zero-Config Pool Active)'
			},
			{
				id: 'mistral',
				name: 'Mistral AI',
				subtitle: 'Codestral & Mistral Large',
				badge: 'Codestral Free',
				speedBadge: 'Code Specialist',
				description: 'State-of-the-art code generation and fill-in-the-middle completions.',
				models: ['codestral-latest', 'mistral-large-latest'],
				getKeyUrl: 'https://console.mistral.ai',
				requiresKey: true,
				hasKey: false,
				enabled: true,
				status: 'unconfigured'
			}
		];

		for (const provider of defaults) {
			this._providers.set(provider.id, provider);
		}
	}

	private async _restoreSavedState(): Promise<void> {
		for (const [id, provider] of this._providers.entries()) {
			const enabledVal = this.storageService.getBoolean(`infinity.provider.${id}.enabled`, StorageScope.APPLICATION, true);
			provider.enabled = enabledVal;

			if (provider.requiresKey) {
				const key = await this.secretStorageService.get(`infinity.provider.${id}.key`);
				if (key && key.trim().length > 0) {
					provider.hasKey = true;
					provider.status = 'healthy';
					provider.statusMessage = 'Connected & Healthy';
				} else {
					provider.hasKey = false;
					provider.status = 'unconfigured';
				}
			}
		}
		this._onDidChangeProviders.fire();
	}

	async getProviders(): Promise<IInfinityProvider[]> {
		return Array.from(this._providers.values());
	}

	async getProvider(id: InfinityProviderId): Promise<IInfinityProvider | undefined> {
		return this._providers.get(id);
	}

	async setProviderKey(id: InfinityProviderId, apiKey: string): Promise<boolean> {
		const provider = this._providers.get(id);
		if (!provider) {
			return false;
		}

		const cleanKey = apiKey.trim();
		if (!cleanKey) {
			await this.secretStorageService.delete(`infinity.provider.${id}.key`);
			provider.hasKey = false;
			provider.status = 'unconfigured';
			provider.statusMessage = undefined;
			this._onDidChangeProviders.fire();
			return true;
		}

		provider.status = 'testing';
		provider.statusMessage = 'Testing connection...';
		this._onDidChangeProviders.fire();

		// Save the secret
		await this.secretStorageService.store(`infinity.provider.${id}.key`, cleanKey);
		provider.hasKey = true;

		// Perform live validation & sync with OmniRoute
		const result = await this.testProvider(id);
		if (result.success) {
			provider.status = 'healthy';
			provider.statusMessage = 'Connected & Verified';
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('providerConnected', "{0} connected successfully to Infinity model pool!", provider.name)
			});
		} else {
			provider.status = 'warning';
			provider.statusMessage = result.message || 'Key saved, testing pending';
		}

		this._onDidChangeProviders.fire();
		return result.success;
	}

	async toggleProvider(id: InfinityProviderId, enabled: boolean): Promise<void> {
		const provider = this._providers.get(id);
		if (!provider) {
			return;
		}
		provider.enabled = enabled;
		this.storageService.store(`infinity.provider.${id}.enabled`, enabled, StorageScope.APPLICATION, StorageTarget.USER);
		this._onDidChangeProviders.fire();
	}

	async testProvider(id: InfinityProviderId): Promise<{ success: boolean; message: string }> {
		const provider = this._providers.get(id);
		if (!provider) {
			return { success: false, message: 'Provider not found' };
		}

		if (!provider.requiresKey) {
			return { success: true, message: 'Zero-config free tier active' };
		}

		const key = await this.secretStorageService.get(`infinity.provider.${id}.key`);
		if (!key || !key.trim()) {
			return { success: false, message: 'API key not configured' };
		}

		try {
			// First, test through local OmniRoute gateway if online
			if (this._isDaemonOnline) {
				const response = await fetch(`${OMNIROUTE_URL}/api/providers`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ provider: id, apiKey: key })
				}).catch(() => null);

				if (response && response.ok) {
					return { success: true, message: 'Verified through local gateway' };
				}
			}

			// Direct native live validation against provider endpoints
			let testUrl = '';
			const headers: Record<string, string> = {};

			switch (id) {
				case 'gemini':
					testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
					break;
				case 'groq':
					testUrl = 'https://api.groq.com/openai/v1/models';
					headers['Authorization'] = `Bearer ${key}`;
					break;
				case 'cerebras':
					testUrl = 'https://api.cerebras.ai/v1/models';
					headers['Authorization'] = `Bearer ${key}`;
					break;
				case 'mistral':
					testUrl = 'https://api.mistral.ai/v1/models';
					headers['Authorization'] = `Bearer ${key}`;
					break;
				default:
					return { success: true, message: 'Key saved' };
			}

			const res = await fetch(testUrl, { method: 'GET', headers }).catch(err => {
				throw new Error(`Connection error: ${err.message || err}`);
			});

			if (res.ok) {
				return { success: true, message: 'Verified & active' };
			} else if (res.status === 401 || res.status === 403) {
				return { success: false, message: 'Invalid API key (Unauthorized)' };
			} else if (res.status === 429) {
				return { success: true, message: 'Valid key (currently rate limited)' };
			} else {
				return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
			}
		} catch (err: any) {
			return { success: false, message: String(err.message || err) };
		}
	}

	async getPoolStatus(): Promise<IInfinityPoolStatus> {
		let activeCount = 0;
		for (const provider of this._providers.values()) {
			if (provider.enabled && (provider.hasKey || !provider.requiresKey)) {
				activeCount++;
			}
		}

		let monthlyEstimate = '~0 tokens';
		if (activeCount === 1) {
			monthlyEstimate = '~300M free tokens/mo';
		} else if (activeCount === 2) {
			monthlyEstimate = '~800M free tokens/mo';
		} else if (activeCount === 3) {
			monthlyEstimate = '~1.5B free tokens/mo';
		} else if (activeCount >= 4) {
			monthlyEstimate = '~2.4B free tokens/mo';
		}

		return {
			activeProvidersCount: activeCount,
			totalProvidersCount: this._providers.size,
			totalMonthlyTokensEstimate: monthlyEstimate,
			strategy: 'round-robin',
			currentActiveModel: activeCount > 0 ? 'Infinity Unlimited (Auto-Cycling)' : 'None (Configure Below)',
			isDaemonOnline: this._isDaemonOnline
		};
	}

	async ensureDaemonRunning(): Promise<boolean> {
		try {
			const res = await fetch(`${OMNIROUTE_URL}/healthz`, { method: 'GET' }).catch(() => null);
			if (res && (res.status === 200 || res.status === 204)) {
				this._isDaemonOnline = true;
				this._onDidChangeProviders.fire();
				return true;
			}
		} catch {
			// Offline
		}

		this._isDaemonOnline = false;
		return false;
	}

	async startVibecoding(): Promise<void> {
		await this.commandService.executeCommand('workbench.action.chat.open');
	}

	async * executeChatStream(
		modelId: string,
		messages: { role: string; content: string }[],
		token: import('../../../../base/common/cancellation.js').CancellationToken
	): AsyncIterable<string> {
		// 1. Try local OmniRoute gateway if online
		if (this._isDaemonOnline) {
			try {
				const omniRes = await fetch(`${OMNIROUTE_URL}/v1/chat/completions`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: 'auto', messages, stream: true })
				});

				if (omniRes.ok && omniRes.body) {
					yield* this._streamSse(omniRes.body, token);
					return;
				}
			} catch {
				// Gateway failed, fall through to native pool
			}
		}

		// 2. Direct Native Infinity Pool Auto-Cycling Router
		const pool: { id: InfinityProviderId; name: string; key?: string; endpoint: string; model: string; headers: Record<string, string> }[] = [];

		for (const provider of this._providers.values()) {
			if (!provider.enabled) {
				continue;
			}
			if (provider.requiresKey) {
				const key = await this.secretStorageService.get(`infinity.provider.${provider.id}.key`);
				if (!key || !key.trim()) {
					continue;
				}
				if (provider.id === 'gemini') {
					pool.push({
						id: 'gemini',
						name: 'Google Gemini',
						key,
						endpoint: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
						model: 'gemini-2.0-flash',
						headers: { 'Authorization': `Bearer ${key}` }
					});
				} else if (provider.id === 'groq') {
					pool.push({
						id: 'groq',
						name: 'Groq (Ultra-Fast)',
						key,
						endpoint: 'https://api.groq.com/openai/v1/chat/completions',
						model: 'llama-3.3-70b-versatile',
						headers: { 'Authorization': `Bearer ${key}` }
					});
				} else if (provider.id === 'cerebras') {
					pool.push({
						id: 'cerebras',
						name: 'Cerebras (1,800 tok/s)',
						key,
						endpoint: 'https://api.cerebras.ai/v1/chat/completions',
						model: 'llama-3.3-70b',
						headers: { 'Authorization': `Bearer ${key}` }
					});
				} else if (provider.id === 'mistral') {
					pool.push({
						id: 'mistral',
						name: 'Mistral Codestral',
						key,
						endpoint: 'https://api.mistral.ai/v1/chat/completions',
						model: 'codestral-latest',
						headers: { 'Authorization': `Bearer ${key}` }
					});
				}
			} else if (provider.id === 'opencode') {
				pool.push({
					id: 'opencode',
					name: 'OpenCode Zero-Config',
					endpoint: 'https://opencode.ai/zen/v1/chat/completions',
					model: 'claude-3-5-sonnet',
					headers: {}
				});
			}
		}

		if (pool.length === 0) {
			yield `### ⚡ Welcome to Infinity IDE (Unlimited Tokens)\n\n` +
				`To unlock unlimited free AI coding, connect one or more free provider keys:\n\n` +
				`- **[Google Gemini Free Tier](https://aistudio.google.com/app/apikey)** — 15 RPM, 1,500 requests/day, 1M context\n` +
				`- **[Groq Free Developer Cloud](https://console.groq.com/keys)** — 300+ tokens/sec, Llama 3.3 70B & Qwen Coder\n` +
				`- **[Cerebras Free Tier](https://cloud.cerebras.ai)** — 1,800 tokens/sec wafer-scale inference\n` +
				`- **[Mistral AI Console](https://console.mistral.ai)** — Codestral & Mistral Small\n\n` +
				`👉 **Open the Infinity Sidebar** (click the **∞** icon on the left or press \`Ctrl+Alt+I\`) to paste your keys and start vibecoding!`;
			return;
		}

		// Attempt each provider in the pool with automatic fallback
		let lastError = '';
		for (let i = 0; i < pool.length; i++) {
			if (token.isCancellationRequested) {
				return;
			}

			const current = pool[i];
			try {
				const response = await fetch(current.endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...current.headers
					},
					body: JSON.stringify({
						model: current.model,
						messages,
						stream: true
					})
				});

				if (response.status === 429 || response.status === 503) {
					const next = pool[(i + 1) % pool.length];
					yield `\n\n> ⚡ *Infinity Auto-Cycle: ${current.name} reached rate limit. Failing over to ${next.name}...*\n\n`;
					continue;
				}

				if (!response.ok || !response.body) {
					const errText = await response.text().catch(() => '');
					lastError = `${current.name} HTTP ${response.status}: ${errText.slice(0, 100)}`;
					continue;
				}

				// Stream SSE tokens
				yield* this._streamSse(response.body, token);
				return; // Completed successfully!
			} catch (err: any) {
				lastError = `${current.name}: ${err.message || err}`;
			}
		}

		// If all failed
		yield `\n\n[Infinity IDE: All active providers in pool encountered rate limits or errors: ${lastError}]. Please verify keys in the Infinity sidebar.`;
	}

	private async * _streamSse(body: ReadableStream<Uint8Array>, token: import('../../../../base/common/cancellation.js').CancellationToken): AsyncIterable<string> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (!token.isCancellationRequested) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed.startsWith('data: ')) {
						const dataStr = trimmed.slice(6);
						if (dataStr === '[DONE]') {
							return;
						}
						try {
							const json = JSON.parse(dataStr);
							const delta = json.choices?.[0]?.delta?.content;
							if (delta) {
								yield delta;
							}
						} catch {
							// SSE parsing error
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}

