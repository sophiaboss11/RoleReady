import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ExportService {
  /**
   * Downloads a remote URL (image, audio, etc.) as a file.
   * Fetches the resource as a blob to force a download rather than browser navigation.
   */
  async downloadFromUrl(url: string, filename: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch resource: ${response.statusText}`);
    }
    const blob = await response.blob();
    this.triggerBlobDownload(blob, filename);
  }

  /**
   * Serializes a rendered SVG element from the DOM and downloads it as an .svg file.
   * Finds the first <svg> inside the given container selector.
   */
  downloadSvgFromDom(containerSelector: string, filename: string): void {
    const container = document.querySelector(containerSelector);
    const svg =
      container?.querySelector('svg') ?? document.querySelector(containerSelector + ' svg');
    if (!svg) {
      throw new Error('SVG element not found in the DOM.');
    }

    // Clone so we can safely add XML namespace without mutating the live DOM
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    this.triggerBlobDownload(blob, filename);
  }

  private triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Revoke after a short delay to allow the download to start
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
