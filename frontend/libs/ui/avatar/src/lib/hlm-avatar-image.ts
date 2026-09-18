import { Directive, inject } from '@angular/core';
import { BrnAvatarImage } from '@spartan-ng/brain/avatar';
import { classes } from '@app/ui/utils';

@Directive({
	selector: 'img[hlmAvatarImage]',
	exportAs: 'avatarImage',
	hostDirectives: [BrnAvatarImage],
	host: {
		'data-slot': 'avatar-image',
		'[style.display]': 'canShow() ? null : "none"',
	},
})
export class HlmAvatarImage {
	public readonly canShow = inject(BrnAvatarImage).canShow;

	constructor() {
		classes(() => 'absolute inset-0 aspect-square size-full rounded-full object-cover');
	}
}
