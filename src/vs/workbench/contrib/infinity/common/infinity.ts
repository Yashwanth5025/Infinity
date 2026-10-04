/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

import { CancellationToken } from '../../../../base/common/cancellation.js';

export const INFINITY_VIEW_CONTAINER_ID = 'workbench.view.infinity';
export const INFINITY_CARDS_VIEW_ID = 'workbench.views.infinity.cards';
export const INFINITY_WELCOME_VIEW_ID = 'workbench.views.infinity.welcome';

export type InfinityProviderId = 'gemini' | 'groq' | 'cerebras' | 'opencode' | 'mistral';

export type InfinityProviderStatus = 'healthy' | 'warning' | 'error' | 'unconfigured' | 'testing';

export interface IInfinityProvider {
	readonly id: InfinityProviderId;
	readonly name: string;
	readonly subtitle: string;
	readonly badge: string;
	readonly description: string;
	readonly speedBadge?: string;
	readonly models: string[];
	readonly getKeyUrl: string;
	readonly requiresKey: boolean;
	hasKey: boolean;
	enabled: boolean;
	status: InfinityProviderStatus;
	statusMessage?: string;
}

export interface IInfinityPoolStatus {
	readonly activeProvidersCount: number;
	readonly totalProvidersCount: number;
	readonly totalMonthlyTokensEstimate: string;
	readonly strategy: 'round-robin' | 'least-used' | 'priority';
	readonly currentActiveModel?: string;
	readonly isDaemonOnline: boolean;
}

export const IInfinityService = createDecorator<IInfinityService>('infinityService');

export interface IInfinityService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeProviders: Event<void>;

	getProviders(): Promise<IInfinityProvider[]>;
	getProvider(id: InfinityProviderId): Promise<IInfinityProvider | undefined>;
	setProviderKey(id: InfinityProviderId, apiKey: string): Promise<boolean>;
	toggleProvider(id: InfinityProviderId, enabled: boolean): Promise<void>;
	testProvider(id: InfinityProviderId): Promise<{ success: boolean; message: string }>;
	getPoolStatus(): Promise<IInfinityPoolStatus>;
	ensureDaemonRunning(): Promise<boolean>;
	startVibecoding(): Promise<void>;
	executeChatStream(
		modelId: string,
		messages: { role: string; content: string }[],
		token: CancellationToken
	): AsyncIterable<string>;
}

