/** Renders any answer shape the field types can produce as readable text. */
export function formatAnswer(value: unknown, emptyLabel: string): string {
  if (value === null || value === undefined || value === '') return emptyLabel;
  if (Array.isArray(value)) {
    return value.length === 0 ? emptyLabel : value.map(String).join(', ');
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }
  return emptyLabel;
}

/** The extension a Student's file was uploaded with, as a short type label. */
export function fileTypeLabel(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return null;
  const extension = filename.slice(dot + 1);
  return extension.length <= 5 ? extension.toUpperCase() : null;
}
