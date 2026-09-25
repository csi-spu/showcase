/*
 * Sends one file's bytes straight to storage with a Core-issued URL.
 *
 * This uses XMLHttpRequest rather than fetch because upload progress is the
 * point: a Student on a slow connection sending a 10 MB document needs to see
 * that something is happening, and fetch cannot report how much of a request
 * body has been sent.
 *
 * Nothing here decides whether a file is acceptable. A completed send only
 * means the bytes arrived; Core must finalize and inspect it before the UI can
 * present the file as received or safe.
 */

export type UploadOutcome = 'aborted' | 'failed' | 'sent';

export function uploadFileBytes(input: {
  file: File;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
  url: string;
}): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open('PUT', input.url);
    request.setRequestHeader('Content-Type', input.file.type);

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total === 0) return;
      input.onProgress(event.loaded / event.total);
    });

    request.addEventListener('load', () => {
      resolve(request.status >= 200 && request.status < 300 ? 'sent' : 'failed');
    });
    request.addEventListener('error', () => resolve('failed'));
    request.addEventListener('timeout', () => resolve('failed'));
    request.addEventListener('abort', () => resolve('aborted'));

    /* Leaving the page or choosing another file must stop the transfer. */
    input.signal.addEventListener('abort', () => request.abort(), { once: true });
    if (input.signal.aborted) {
      request.abort();
      return;
    }

    request.send(input.file);
  });
}
