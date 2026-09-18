import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HlmSelectImports } from '@app/ui/select';

@Component({
  standalone: true,
  imports: [FormsModule, ...HlmSelectImports],
  template: `
    <hlm-select [(ngModel)]="value" [closeDelay]="0">
      <hlm-select-trigger class="w-40">
        <hlm-select-value placeholder="Pick one" />
      </hlm-select-trigger>
      <hlm-select-content>
        <hlm-option value="video">Video</hlm-option>
        <hlm-option value="audio">Audio</hlm-option>
      </hlm-select-content>
    </hlm-select>
  `,
})
class TestSelectHostComponent {
  value = 'audio';
}

describe('HlmSelect', () => {
  let fixture: ComponentFixture<TestSelectHostComponent>;
  let overlayContainer: OverlayContainer;
  let overlayRoot: HTMLElement;
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestSelectHostComponent],
    }).compileComponents();

    overlayContainer = TestBed.inject(OverlayContainer);
    overlayRoot = overlayContainer.getContainerElement();

    fixture = TestBed.createComponent(TestSelectHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    overlayContainer.ngOnDestroy();
  });

  afterAll(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('keeps the listbox closed until the trigger is activated', () => {
    expect(overlayRoot.textContent).not.toContain('Video');
    expect(overlayRoot.textContent).not.toContain('Audio');
  });

  it('opens the listbox and updates the selected value', async () => {
    const trigger = fixture.nativeElement.querySelector(
      'hlm-select-trigger button',
    ) as HTMLButtonElement;

    expect(trigger.textContent).toContain('audio');

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const videoOption = Array.from(overlayRoot.querySelectorAll('hlm-option')).find(
      (option) => option.getAttribute('data-value') === 'video',
    ) as HTMLElement | undefined;

    expect(videoOption?.textContent).toContain('Video');

    videoOption?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.value).toBe('video');
    expect(trigger.textContent).toContain('video');
  });
});
