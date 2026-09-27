import { AppShell } from '../../app-shell';
import { UnentitledFormDialog } from '../../unentitled-form-dialog';

/*
 * Rendered by this page's `notFound()`, which runs before anything streams,
 * so the response keeps its 404 status while the Student gets an explanation
 * and a way home instead of a bare error page.
 */
export default function UnentitledFormNotFound() {
  return (
    <AppShell>
      <UnentitledFormDialog />
    </AppShell>
  );
}
