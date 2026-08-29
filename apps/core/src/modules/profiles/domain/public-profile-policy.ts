const BIO_MAX_LENGTH = 500;
const LINK_LABEL_MAX_LENGTH = 50;
const LINK_URL_MAX_LENGTH = 2_048;
const LINK_LIMIT = 5;

export interface PublicProfileLinkInput {
  label: string;
  url: string;
}

export interface PublicProfileDraftInput {
  bio: string | null;
  links: PublicProfileLinkInput[];
  photoId: string | null;
}

export type PublicProfileEvaluation =
  { isValid: false } | { isValid: true; profile: PublicProfileDraftInput };

export function evaluatePublicProfile(input: PublicProfileDraftInput): PublicProfileEvaluation {
  const bio = input.bio?.trim() || null;

  if ((bio !== null && bio.length > BIO_MAX_LENGTH) || input.links.length > LINK_LIMIT) {
    return { isValid: false };
  }

  const links: PublicProfileLinkInput[] = [];
  const normalizedUrls = new Set<string>();
  for (const link of input.links) {
    const label = link.label.trim();
    if (
      label.length === 0 ||
      label.length > LINK_LABEL_MAX_LENGTH ||
      link.url.length > LINK_URL_MAX_LENGTH
    ) {
      return { isValid: false };
    }

    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      return { isValid: false };
    }
    if (
      url.protocol !== 'https:' ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      normalizedUrls.has(url.href)
    ) {
      return { isValid: false };
    }
    normalizedUrls.add(url.href);
    links.push({ label, url: url.href });
  }

  return {
    isValid: true,
    profile: { bio, links, photoId: input.photoId },
  };
}
