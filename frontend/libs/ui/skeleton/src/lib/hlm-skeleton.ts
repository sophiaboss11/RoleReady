import { Directive } from '@angular/core';
import { classes } from '@app/ui/utils';

@Directive({
	selector: '[hlmSkeleton],hlm-skeleton',
	host: {
		'data-slot': 'skeleton',
	},
})
export class HlmSkeleton {
	constructor() {
		classes(() => 'bg-accent block rounded-md motion-safe:animate-pulse');
	}
}
