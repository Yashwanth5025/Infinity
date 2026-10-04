/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment, IStatusbarEntry } from '../../../services/statusbar/browser/statusbar.js';
import { IInfinityService } from '../common/infinity.js';
import { localize } from '../../../../nls.js';

export class InfinityStatusBarItem extends Disposable {

	private readonly _entry = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IInfinityService private readonly infinityService: IInfinityService
	) {
		super();

		this._update();
		this._register(this.infinityService.onDidChangeProviders(() => this._update()));
	}

	private async _update(): Promise<void> {
		const status = await this.infinityService.getPoolStatus();

		let text: string;
		if (status.activeProvidersCount > 0) {
			text = `$(sparkle) Infinity: ${status.activeProvidersCount} Free Active`;
		} else {
			text = `$(sparkle) Infinity: Setup Free Models`;
		}

		const tooltip = localize(
			'infinityStatusTooltip',
			"Infinity IDE Model Pool\n• Active Providers: {0} of {1}\n• Strategy: {2}\n• Free Token Budget: {3}\n• Auto 429 Rate-Limit Fallback: Enabled\n\nClick to manage free providers & cards",
			status.activeProvidersCount,
			status.totalProvidersCount,
			status.strategy,
			status.totalMonthlyTokensEstimate
		);

		const entry: IStatusbarEntry = {
			name: localize('infinityStatusBarName', "Infinity AI Pool"),
			text,
			tooltip,
			ariaLabel: text,
			command: 'workbench.action.infinity.openCards',
			showInAllWindows: true
		};

		if (!this._entry.value) {
			this._entry.value = this.statusbarService.addEntry(entry, 'status.infinity.pool', StatusbarAlignment.RIGHT, 100);
		} else {
			this._entry.value.update(entry);
		}
	}
}
