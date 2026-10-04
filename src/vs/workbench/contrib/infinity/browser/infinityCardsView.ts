/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/infinity.css';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { URI } from '../../../../base/common/uri.js';
import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { IInfinityService, IInfinityProvider } from '../common/infinity.js';
import { localize } from '../../../../nls.js';

export class InfinityCardsViewPane extends ViewPane {

	private _rootContainer: HTMLElement | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IInfinityService private readonly infinityService: IInfinityService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.infinityService.onDidChangeProviders(() => {
			this._renderContent();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._rootContainer = append(container, $('.infinity-container'));
		this._renderContent();
	}

	private async _renderContent(): Promise<void> {
		if (!this._rootContainer) {
			return;
		}

		clearNode(this._rootContainer);

		const providers = await this.infinityService.getProviders();
		const poolStatus = await this.infinityService.getPoolStatus();

		// 1. Hero Section
		const hero = append(this._rootContainer, $('.infinity-hero'));
		const heroTitleRow = append(hero, $('.infinity-hero-title-row'));

		const brand = append(heroTitleRow, $('.infinity-brand'));
		const logoIcon = append(brand, $('.infinity-logo-icon'));
		logoIcon.textContent = '∞';
		const title = append(brand, $('.infinity-title'));
		title.textContent = 'Infinity Free Pool';

		const strategyPill = append(heroTitleRow, $('.infinity-strategy-pill'));
		strategyPill.textContent = 'Auto-Cycle';

		const statsGrid = append(hero, $('.infinity-stats-grid'));

		const statBox1 = append(statsGrid, $('.infinity-stat-box'));
		const statLabel1 = append(statBox1, $('.infinity-stat-label'));
		statLabel1.textContent = localize('activeProviders', "Active Providers");
		const statValue1 = append(statBox1, $('.infinity-stat-value.green'));
		statValue1.textContent = `${poolStatus.activeProvidersCount} of ${poolStatus.totalProvidersCount} Ready`;

		const statBox2 = append(statsGrid, $('.infinity-stat-box'));
		const statLabel2 = append(statBox2, $('.infinity-stat-label'));
		statLabel2.textContent = localize('monthlyTokens', "Free Token Budget");
		const statValue2 = append(statBox2, $('.infinity-stat-value'));
		statValue2.textContent = poolStatus.totalMonthlyTokensEstimate;

		// 2. Action Bar
		const actionBar = append(this._rootContainer, $('.infinity-action-bar'));
		const startBtn = append(actionBar, $('button.infinity-vibecode-btn'));
		const btnIcon = append(startBtn, $('span'));
		btnIcon.textContent = '⚡';
		const btnText = append(startBtn, $('span'));
		btnText.textContent = 'START VIBECODING';
		startBtn.onclick = () => {
			this.infinityService.startVibecoding();
		};

		// 3. Provider Cards List
		const cardsList = append(this._rootContainer, $('.infinity-cards-list'));
		for (const provider of providers) {
			this._renderProviderCard(cardsList, provider);
		}
	}

	private _renderProviderCard(parent: HTMLElement, provider: IInfinityProvider): void {
		const isHealthy = provider.enabled && (provider.hasKey || !provider.requiresKey);
		const cardClass = isHealthy ? 'healthy' : (provider.hasKey ? '' : 'unconfigured');
		const card = append(parent, $(`.infinity-card.${cardClass}`));

		// Header
		const header = append(card, $('.infinity-card-header'));
		const titleGroup = append(header, $('.infinity-card-title-group'));

		const statusDot = append(titleGroup, $(`.infinity-status-dot.${provider.status}`));
		const cardName = append(titleGroup, $('.infinity-card-name'));
		cardName.textContent = provider.name;

		const badgesGroup = append(header, $('.infinity-badges-group'));
		const pill1 = append(badgesGroup, $('.infinity-pill.cyan'));
		pill1.textContent = provider.badge;

		if (provider.speedBadge) {
			const pill2 = append(badgesGroup, $('.infinity-pill.purple'));
			pill2.textContent = provider.speedBadge;
		}

		// Subtitle & description
		const subtitle = append(card, $('.infinity-card-subtitle'));
		subtitle.textContent = provider.subtitle;

		// API Key Input or Zero-Config status
		if (provider.requiresKey) {
			const keyGroup = append(card, $('.infinity-key-group'));

			const keyInput = append(keyGroup, $('input.infinity-key-input')) as HTMLInputElement;
			keyInput.type = 'password';
			keyInput.placeholder = provider.hasKey ? '••••••••••••••••••••••••' : localize('enterKey', "Paste API key...");

			const toggleVisibilityBtn = append(keyGroup, $('button.infinity-mini-btn'));
			toggleVisibilityBtn.textContent = '👁';
			toggleVisibilityBtn.title = localize('toggleVisibility', "Show/Hide Key");
			toggleVisibilityBtn.onclick = () => {
				keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
			};

			const pasteBtn = append(keyGroup, $('button.infinity-mini-btn'));
			pasteBtn.textContent = localize('save', "Save");
			pasteBtn.title = localize('saveKey', "Save API key");
			pasteBtn.onclick = async () => {
				if (keyInput.value) {
					await this.infinityService.setProviderKey(provider.id, keyInput.value);
				}
			};

			// Footer with Direct link & switch
			const footer = append(card, $('.infinity-card-footer'));

			const getKeyLink = append(footer, $('a.infinity-get-key-link'));
			getKeyLink.textContent = localize('getKey', "Get Free Key ↗");
			getKeyLink.onclick = (e) => {
				e.preventDefault();
				if (provider.getKeyUrl) {
					this.openerService.open(URI.parse(provider.getKeyUrl));
				}
			};

			const switchLabel = append(footer, $('label.infinity-switch'));
			const switchInput = append(switchLabel, $('input')) as HTMLInputElement;
			switchInput.type = 'checkbox';
			switchInput.checked = provider.enabled;
			switchInput.onchange = () => {
				this.infinityService.toggleProvider(provider.id, switchInput.checked);
			};
			append(switchLabel, $('.infinity-slider'));
		} else {
			// Zero-Config Provider (OpenCode Free / Kiro)
			const footer = append(card, $('.infinity-card-footer'));
			const zeroInfo = append(footer, $('span'));
			zeroInfo.textContent = localize('zeroConfigActive', "✓ Automatic Free Pool Active");
			zeroInfo.style.color = '#38ef7d';

			const switchLabel = append(footer, $('label.infinity-switch'));
			const switchInput = append(switchLabel, $('input')) as HTMLInputElement;
			switchInput.type = 'checkbox';
			switchInput.checked = provider.enabled;
			switchInput.onchange = () => {
				this.infinityService.toggleProvider(provider.id, switchInput.checked);
			};
			append(switchLabel, $('.infinity-slider'));
		}
	}
}
