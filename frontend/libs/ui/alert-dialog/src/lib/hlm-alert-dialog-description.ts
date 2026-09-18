import { Directive } from '@angular/core';
import { BrnAlertDialogDescription } from '@spartan-ng/brain/alert-dialog';
import { classes } from '@app/ui/utils';

@Directive({
	selector: '[hlmAlertDialogDescription]',
	hostDirectives: [BrnAlertDialogDescription],
	host: {
		'data-slot': 'alert-dialog-description',
	},
})
export class HlmAlertDialogDescription {
	constructor() {
		classes(() => 'text-muted-foreground text-sm');
	}
}
