import Link from 'next/link';
import Image from 'next/image';
import type { PeopleCatalogCard } from '@/lib/public-catalog-core';

export function CatalogPeopleGrid({ people }: { people: PeopleCatalogCard[] }) {
  if (people.length === 0) {
    return <p className="border-t border-border py-12 text-muted-foreground">ไม่พบผู้สร้าง</p>;
  }
  return (
    <ol className="grid list-none gap-px bg-border p-px md:grid-cols-2 xl:grid-cols-3">
      {people.map((person) => (
        <li className="grid min-h-48 content-between gap-6 bg-background p-6" key={person.publicId}>
          <div>
            {person.photo === null ? null : (
              <div className="relative mb-5 aspect-square w-24 overflow-hidden rounded-media bg-muted">
                <Image
                  alt={`รูปโปรไฟล์ของ ${person.displayName}`}
                  fill
                  loading="lazy"
                  sizes="96px"
                  src={`/people/${person.publicId}/photo`}
                  unoptimized
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground">ปีที่เข้าศึกษา {person.entryYear}</p>
            <h2 className="mt-2 text-2xl font-semibold">
              <Link
                className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                href={`/people/${person.publicId}`}
              >
                {person.displayName}
              </Link>
            </h2>
          </div>
          <p className="text-sm">ผลงานเผยแพร่ {person.publishedWorkCount} ชิ้น</p>
        </li>
      ))}
    </ol>
  );
}
