/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, ViewContainer } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { localize, localize2 } from '../../../../nls.js';

import {
	INFINITY_VIEW_CONTAINER_ID,
	INFINITY_CARDS_VIEW_ID,
	IInfinityService
} from '../common/infinity.js';
import { InfinityService } from './infinityService.js';
import { InfinityCardsViewPane } from './infinityCardsView.js';
import { InfinityLanguageModelContribution } from './infinityLanguageModel.js';
import { InfinityWelcomeContribution } from './infinityWelcome.js';
import { InfinityStatusBarItem } from './infinityStatusItem.js';

// 1. Register Singleton Service
registerSingleton(IInfinityService, InfinityService, InstantiationType.Eager);

// 2. Register Infinity View Container in Primary Sidebar
const infinityIcon = registerIcon('infinity-view-icon', Codicon.sparkle, localize('infinityViewIcon', "View icon of the Infinity view."));

const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: INFINITY_VIEW_CONTAINER_ID,
	title: localize2('infinity', "Infinity"),
	icon: infinityIcon,
	order: 0,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [INFINITY_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: INFINITY_VIEW_CONTAINER_ID,
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: false });

// 3. Register Provider Cards View inside Infinity Container
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: INFINITY_CARDS_VIEW_ID,
	name: localize2('infinityCards', "Free Provider Pool"),
	containerIcon: infinityIcon,
	canMoveView: true,
	canToggleVisibility: false,
	ctorDescriptor: new SyncDescriptor(InfinityCardsViewPane),
	order: 1,
}], VIEW_CONTAINER);

// 4. Register Workbench Contributions
registerWorkbenchContribution2('infinity.languageModel', InfinityLanguageModelContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2('infinity.welcome', InfinityWelcomeContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2('infinity.statusBar', InfinityStatusBarItem, WorkbenchPhase.AfterRestored);

// 5. Register Commands
CommandsRegistry.registerCommand('workbench.action.infinity.openCards', async (accessor) => {
	const viewsService = accessor.get(IViewsService);
	await viewsService.openView(INFINITY_CARDS_VIEW_ID, true);
});

KeybindingsRegistry.registerKeybindingRule({
	id: 'workbench.action.infinity.openCards',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
	when: undefined
});

CommandsRegistry.registerCommand('workbench.action.infinity.startVibecoding', async (accessor) => {
	const infinityService = accessor.get(IInfinityService);
	await infinityService.startVibecoding();
});
