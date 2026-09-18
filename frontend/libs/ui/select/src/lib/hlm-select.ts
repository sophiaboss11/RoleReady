import { Directive } from '@angular/core';
import { BrnPopover } from '@spartan-ng/brain/popover';
import { BrnSelect } from '@spartan-ng/brain/select';
import { classes } from '@app/ui/utils';

@Directive({
	selector: 'hlm-select,[hlmSelect]',
	hostDirectives: [
		{
			directive: BrnPopover,
			inputs: ['align', 'autoFocus', 'closeDelay', 'closeOnOutsidePointerEvents', 'offsetX', 'sideOffset', 'state'],
			outputs: ['closed', 'stateChanged'],
		},
		{
			directive: BrnSelect,
			inputs: ['disabled', 'value', 'isItemEqualToValue', 'itemToString'],
			outputs: ['valueChange'],
		},
	],
})
export class HlmSelect {
	constructor() {
		classes(() => 'space-y-2');
	}
}
