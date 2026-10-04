/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';

export class InfinityWelcomeContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		this._checkFirstRun();
	}

	private async _checkFirstRun(): Promise<void> {
		const completed = this.storageService.getBoolean('infinity.onboardingCompleted', StorageScope.APPLICATION, false);
		if (completed) {
			return;
		}

		// Mark first run completed
		this.storageService.store('infinity.onboardingCompleted', true, StorageScope.APPLICATION, StorageTarget.USER);

		// Reveal the Infinity Cards View in the primary sidebar
		setTimeout(() => {
			this.commandService.executeCommand('workbench.view.infinity');

			this.notificationService.notify({
				severity: Severity.Info,
				message: localize(
					'infinityWelcomeBanner',
					"Welcome to Infinity IDE — The Unlimited Token AI IDE! Connect your free AI providers in the sidebar to start vibecoding without limits."
				),
				actions: {
					primary: [
						{
							id: 'openCards',
							label: localize('setupFreeProviders', "Setup Free Providers"),
							tooltip: '',
							class: undefined,
							enabled: true,
							checked: false,
							run: () => this.commandService.executeCommand('workbench.view.infinity')
						}
					]
				}
			});
		}, 800);
	}
}
