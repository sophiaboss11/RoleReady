import type { BooleanInput } from '@angular/cdk/coercion';
import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { BrnPopoverContent } from '@spartan-ng/brain/popover';
import { BrnSelect, BrnSelectContent } from '@spartan-ng/brain/select';
import { hlm } from '@app/ui/utils';
import type { ClassValue } from 'clsx';

@Component({
	selector: 'hlm-select-content,[hlmSelectContent]',
	imports: [BrnPopoverContent, BrnSelectContent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<!-- Preserve the ergonomic select API while the underlying brain package now requires a popover template. -->
		<ng-template brnPopoverContent>
			<div
				brnSelectContent
				[class]="_computedClass()"
				[attr.data-state]="_state()"
				data-side="bottom"
				[style.min-width.px]="_triggerWidth()"
			>
				<ng-content />
			</div>
		</ng-template>
	`,
})
export class HlmSelectContent {
	public readonly stickyLabels = input<boolean, BooleanInput>(false, {
		transform: booleanAttribute,
	});
	public readonly userClass = input<ClassValue>('', { alias: 'class' });

	private readonly _select = inject(BrnSelect, { optional: true });
	protected readonly _state = computed(() => (this._select?.isExpanded() ? 'open' : 'closed'));
	protected readonly _triggerWidth = computed(() => this._select?.triggerWidth() ?? null);
	protected readonly _computedClass = computed(() =>
		hlm(
			'border-border bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 relative z-50 max-h-96 overflow-auto rounded-md border p-1 shadow-md data-[side=bottom]:top-[2px]',
			this.userClass(),
		),
	);
}
