import { connection } from 'next/server';
import { StudentAuthJourney } from './student-auth-journey';

export default async function Home() {
  await connection();
  const coreUrl = process.env.CORE_URL ?? 'http://localhost:4100';
  const validatedCoreUrl = new URL(coreUrl).origin;

  return (
    <main className="student-auth-shell">
      <aside className="student-auth-brand" aria-hidden="true">
        <p>STUDENT SHOWCASE</p>
        <span>CS &amp; SOFTWARE DEVELOPMENT</span>
      </aside>
      <StudentAuthJourney coreUrl={validatedCoreUrl} />
    </main>
  );
}
