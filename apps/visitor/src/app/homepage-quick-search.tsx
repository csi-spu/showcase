import { QuickSearchTrigger } from './quick-search';

export function HomepageQuickSearch({
  placeholderWords,
}: {
  placeholderWords: readonly [string, ...string[]];
}) {
  return (
    <div
      className="mx-auto mt-4 w-full max-w-4xl px-3 sm:px-6"
      data-homepage-quick-search="true"
      data-homepage-quick-search-position="below-hero"
    >
      <QuickSearchTrigger placement="homepage" placeholderWords={placeholderWords} />
    </div>
  );
}
