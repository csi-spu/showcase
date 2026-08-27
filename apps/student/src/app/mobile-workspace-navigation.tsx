'use client';

import { Button } from '@showcase/ui/button';
import { MenuIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function MobileWorkspaceNavigation({
  children,
  closeLabel,
  description,
  label,
  title,
}: {
  children: ReactNode;
  closeLabel: string;
  description: string;
  label: string;
  title: string;
}) {
  return (
    <Sheet>
      <header className="flex min-h-16 items-center justify-between border-b border-border px-4 lg:hidden">
        <p className="text-sm font-semibold tracking-[0.12em]">STUDENT SHOWCASE</p>
        <SheetTrigger render={<Button aria-label={label} size="default" variant="outline" />}>
          <MenuIcon data-icon="inline-start" />
          {label}
        </SheetTrigger>
      </header>
      <SheetContent className="w-[min(20rem,88vw)] gap-0 p-0" closeLabel={closeLabel} side="left">
        <SheetHeader className="border-b border-border p-6 pr-14">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
