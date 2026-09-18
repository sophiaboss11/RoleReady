import { TestBed } from '@angular/core/testing';
import { MarkdownRendererService } from './markdown-renderer.service';

describe('MarkdownRendererService', () => {
  let service: MarkdownRendererService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MarkdownRendererService);
  });

  it('renders markdown with zenn-markdown-html', async () => {
    const html = await service.render('## Heading\n\n- Item');

    expect(html).toContain('<h2 id="heading"');
    expect(html).toContain('<li');
    expect(html).toContain('Item');
  });

  it('returns an empty string for blank markdown', async () => {
    await expect(service.render('   ')).resolves.toBe('');
  });
});
