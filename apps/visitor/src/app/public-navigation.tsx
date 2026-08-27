'use client';

import { cn } from '@showcase/ui/cn';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpenTextIcon,
  FileTextIcon,
  HouseIcon,
  LayoutGridIcon,
  MenuIcon,
  TrophyIcon,
  UsersRoundIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { deriveNavigationScrollState, type NavigationScrollState } from './public-navigation-state';
import { QuickSearchTrigger } from './quick-search';

const WORK_CATEGORIES = [
  {
    descriptionKey: 'courseWorkDescription',
    href: '/works?category=course_work',
    icon: BookOpenTextIcon,
    titleKey: 'courseWork',
  },
  {
    descriptionKey: 'competitionEntryDescription',
    href: '/works?category=competition_entry',
    icon: TrophyIcon,
    titleKey: 'competitionEntry',
  },
  {
    descriptionKey: 'academicArticleDescription',
    href: '/works?category=academic_article',
    icon: FileTextIcon,
    titleKey: 'academicArticle',
  },
] as const;

export function PublicNavigation() {
  const t = useTranslations('Navigation');
  const pathname = usePathname();
  const isReducedMotion = useReducedMotion() ?? false;
  const previousYRef = useRef(0);
  const [scrollState, setScrollState] = useState<NavigationScrollState>({
    isAtTop: true,
    isVisible: true,
  });

  useEffect(() => {
    const syncNavigation = () => {
      const currentY = Math.max(window.scrollY, 0);
      const nextState = deriveNavigationScrollState({
        currentY,
        isReducedMotion,
        previousY: previousYRef.current,
      });

      previousYRef.current = currentY;
      setScrollState((currentState) =>
        currentState.isAtTop === nextState.isAtTop && currentState.isVisible === nextState.isVisible
          ? currentState
          : nextState,
      );
    };

    previousYRef.current = Math.max(window.scrollY, 0);
    syncNavigation();
    window.addEventListener('pageshow', syncNavigation);
    window.addEventListener('scroll', syncNavigation, { passive: true });

    return () => {
      window.removeEventListener('pageshow', syncNavigation);
      window.removeEventListener('scroll', syncNavigation);
    };
  }, [isReducedMotion]);

  const navigationState = scrollState.isAtTop
    ? 'top'
    : scrollState.isVisible
      ? 'compact'
      : 'hidden';

  return (
    <motion.header
      animate={{ opacity: scrollState.isVisible ? 1 : 0, y: scrollState.isVisible ? 0 : -72 }}
      className="pointer-events-none sticky top-0 z-20 h-16 border-b border-border/80 bg-background/95 px-[clamp(1rem,4vw,3rem)] shadow-[0_0.75rem_2rem_-1.25rem_rgba(30,18,34,0.28)] backdrop-blur-lg"
      data-navigation-state={navigationState}
      initial={false}
      transition={
        isReducedMotion
          ? { duration: 0 }
          : { damping: 26, mass: 0.75, stiffness: 280, type: 'spring' }
      }
    >
      <nav
        aria-label={t('ariaLabel')}
        className="pointer-events-auto mx-auto flex min-h-16 w-full max-w-[1344px] items-center justify-between gap-4 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      >
        <Link
          aria-label={t('homeAriaLabel')}
          className="group flex min-w-0 shrink items-center focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary md:justify-self-start"
          href="/"
        >
          <Image
            alt=""
            aria-hidden="true"
            className={cn(
              'h-auto w-[clamp(6rem,16vw,9.5rem)] origin-left transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none',
              !scrollState.isAtTop && 'scale-[0.9] group-hover:scale-[0.92]',
            )}
            height={172}
            loading="eager"
            sizes="(max-width: 640px) 112px, 192px"
            src="/brand/csi-computer-science-software-development-innovation-navy.webp"
            width={640}
          />
        </Link>

        <NavigationMenu
          align="end"
          className="hidden shrink-0 md:flex md:justify-self-center"
          closeDelay={180}
          delay={80}
        >
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                active={isNavigationItemActive(pathname, '/')}
                className={cn(navigationMenuTriggerStyle(), 'min-h-10 px-4')}
                render={<Link href="/" />}
              >
                {t('home')}
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger
                className={cn(
                  'min-h-10 px-4',
                  isNavigationItemActive(pathname, '/works') && 'bg-muted/50',
                )}
              >
                {t('works')}
              </NavigationMenuTrigger>
              <NavigationMenuContent keepMounted>
                <ul className="grid w-[22rem] list-none gap-1 p-2">
                  <NavigationCategoryLink
                    description={t('allWorksDescription')}
                    href="/works"
                    title={t('allWorks')}
                  />
                  {WORK_CATEGORIES.map((category) => (
                    <NavigationCategoryLink
                      description={t(category.descriptionKey)}
                      href={category.href}
                      key={category.href}
                      title={t(category.titleKey)}
                    />
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                active={isNavigationItemActive(pathname, '/people')}
                className={cn(navigationMenuTriggerStyle(), 'min-h-10 px-4')}
                render={<Link href="/people" />}
              >
                {t('people')}
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <QuickSearchTrigger
          className="ml-auto md:ml-0 md:justify-self-end"
          placement="navigation"
        />
        <MobileNavigation pathname={pathname} />
      </nav>
    </motion.header>
  );
}

function NavigationCategoryLink({
  description,
  href,
  title,
}: {
  description: string;
  href: string;
  title: string;
}) {
  return (
    <li>
      <NavigationMenuLink className="p-3" closeOnClick render={<Link href={href} />}>
        <span className="grid gap-1">
          <span className="font-medium">{title}</span>
          <span className="text-sm leading-relaxed text-muted-foreground">{description}</span>
        </span>
      </NavigationMenuLink>
    </li>
  );
}

function MobileNavigation({ pathname }: { pathname: string | null }) {
  const t = useTranslations('Navigation');
  const items = [
    { href: '/', icon: HouseIcon, label: t('home') },
    { href: '/works', icon: LayoutGridIcon, label: t('allWorks') },
    ...WORK_CATEGORIES.map(({ href, icon, titleKey }) => ({
      href,
      icon,
      label: t(titleKey),
    })),
    { href: '/people', icon: UsersRoundIcon, label: t('people') },
  ];

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            aria-label={t('openMenu')}
            className="md:hidden"
            size="icon-lg"
            variant="outline"
          />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent className="w-[min(22rem,calc(100vw-2rem))]" showCloseButton={false}>
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{t('menuTitle')}</SheetTitle>
          <SheetDescription>{t('menuDescription')}</SheetDescription>
        </SheetHeader>
        <SheetClose
          render={
            <Button
              aria-label={t('closeMenu')}
              className="absolute top-3 right-3"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <XIcon />
        </SheetClose>
        <nav aria-label={t('menuTitle')} className="px-3">
          <ul className="flex list-none flex-col gap-1">
            {items.map(({ href, icon, label }) => (
              <MobileNavigationLink
                href={href}
                icon={icon}
                isActive={!href.includes('?') && isNavigationItemActive(pathname, href)}
                key={href}
                label={label}
              />
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavigationLink({
  href,
  icon: Icon,
  isActive,
  label,
}: {
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  label: string;
}) {
  return (
    <li>
      <SheetClose
        render={
          <Link
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              buttonVariants({ size: 'lg', variant: isActive ? 'secondary' : 'ghost' }),
              'min-h-11 w-full justify-start',
            )}
            href={href}
          />
        }
      >
        <Icon data-icon="inline-start" />
        {label}
      </SheetClose>
    </li>
  );
}

function isNavigationItemActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
