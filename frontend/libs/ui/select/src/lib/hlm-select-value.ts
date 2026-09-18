import { Directive } from '@angular/core';
import { BrnSelectValue } from '@spartan-ng/brain/select';
import { classes } from '@app/ui/utils';

@Directive({
	selector: 'hlm-select-value,[hlmSelectValue]',
	hostDirectives: [{ directive: BrnSelectValue, inputs: ['placeholder'] }],
})
export class HlmSelectValue {
	constructor() {
		classes(() => 'data-[placeholder]:text-muted-foreground line-clamp-1 flex items-center gap-2 truncate');
	}
}
