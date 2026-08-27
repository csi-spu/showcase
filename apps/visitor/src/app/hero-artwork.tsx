'use client';

import { gsap } from 'gsap';
import Image from 'next/image';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

interface HeroArtworkProps {
  alt: string;
}

const HERO_PIECES = [
  { clipPath: 'polygon(0 0, 25% 0, 21% 100%, 0 100%)', depth: 0.45 },
  { clipPath: 'polygon(25% 0, 45% 0, 42% 100%, 21% 100%)', depth: 0.7 },
  { clipPath: 'polygon(45% 0, 63% 0, 65% 100%, 42% 100%)', depth: 1 },
  { clipPath: 'polygon(63% 0, 79% 0, 83% 100%, 65% 100%)', depth: 1.2 },
  { clipPath: 'polygon(79% 0, 100% 0, 100% 68%, 83% 100%)', depth: 1.4 },
  { clipPath: 'polygon(83% 100%, 100% 68%, 100% 100%)', depth: 1.6 },
] as const;

const HERO_IMAGES = [
  '/images/showcase-hero-digital-students.png',
  '/images/showcase-hero-digital-students-2.png',
  '/images/showcase-hero-digital-students-3.png',
] as const;

const HERO_IMAGE_DISPLAY_SECONDS = 4.5;

export function HeroArtwork({ alt }: HeroArtworkProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const artworkRefs = useRef<Array<HTMLImageElement | null>>([]);
  const loadedArtwork = useRef(new Set<number>());
  const [loadedArtworkCount, setLoadedArtworkCount] = useState(0);

  const markArtworkLoaded = useCallback((index: number) => {
    if (loadedArtwork.current.has(index)) return;

    loadedArtwork.current.add(index);
    setLoadedArtworkCount(loadedArtwork.current.size);
  }, []);

  useLayoutEffect(() => {
    artworkRefs.current.forEach((artwork, index) => {
      if (artwork?.complete && artwork.naturalWidth > 0) markArtworkLoaded(index);
    });
  }, [markArtworkLoaded]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || loadedArtworkCount !== HERO_IMAGES.length) return;

    const slides = Array.from(root.querySelectorAll<HTMLElement>('[data-hero-slide]'));
    const piecesBySlide = slides.map((slide) =>
      Array.from(slide.querySelectorAll<HTMLElement>('[data-hero-piece]')),
    );
    const motionPieces = Array.from(root.querySelectorAll<HTMLElement>('[data-hero-motion]'));
    const interactionSurface = root.parentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

    if (reducedMotion.matches) {
      gsap.set(slides, { autoAlpha: (index) => (index === 0 ? 1 : 0) });
      gsap.set(motionPieces, { clearProps: 'all' });
      return;
    }

    const context = gsap.context(() => {
      gsap.set(slides, { autoAlpha: (index) => (index === 0 ? 1 : 0) });

      gsap.from(piecesBySlide[0] ?? [], {
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        scale: 0.96,
        stagger: 0.1,
        y: (index) => 34 + index * 5,
      });

      const loop = gsap.timeline({ repeat: -1 });

      HERO_IMAGES.forEach((_, outgoingIndex) => {
        const incomingIndex = (outgoingIndex + 1) % HERO_IMAGES.length;
        const outgoingPieces = piecesBySlide[outgoingIndex] ?? [];
        const incomingPieces = piecesBySlide[incomingIndex] ?? [];

        loop
          .to({}, { duration: HERO_IMAGE_DISPLAY_SECONDS })
          .set(slides[incomingIndex] ?? [], { autoAlpha: 1 })
          .to(outgoingPieces, {
            autoAlpha: 0,
            duration: 0.65,
            ease: 'power2.inOut',
            scale: 1.02,
            stagger: 0.045,
            y: -20,
          })
          .fromTo(
            incomingPieces,
            { autoAlpha: 0, scale: 0.97, y: 28 },
            {
              autoAlpha: 1,
              duration: 0.85,
              ease: 'power3.out',
              scale: 1,
              stagger: 0.065,
              y: 0,
            },
            '<0.2',
          )
          .set(slides[outgoingIndex] ?? [], { autoAlpha: 0 });
      });
    }, root);

    if (!precisePointer.matches || !interactionSurface) return () => context.revert();

    const movePiece = motionPieces.map((piece) => ({
      x: gsap.quickTo(piece, 'x', { duration: 0.65, ease: 'power3.out' }),
      y: gsap.quickTo(piece, 'y', { duration: 0.65, ease: 'power3.out' }),
    }));

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      const normalizedX = (event.clientX - bounds.left) / bounds.width - 0.5;
      const normalizedY = (event.clientY - bounds.top) / bounds.height - 0.5;

      movePiece.forEach((move, index) => {
        const depth = HERO_PIECES[index % HERO_PIECES.length]?.depth ?? 1;
        move.x(normalizedX * 12 * depth);
        move.y(normalizedY * 8 * depth);
      });
    };

    const handlePointerLeave = () => {
      movePiece.forEach((move) => {
        move.x(0);
        move.y(0);
      });
    };

    interactionSurface.addEventListener('pointermove', handlePointerMove);
    interactionSurface.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      interactionSurface.removeEventListener('pointermove', handlePointerMove);
      interactionSurface.removeEventListener('pointerleave', handlePointerLeave);
      context.revert();
    };
  }, [loadedArtworkCount]);

  return (
    <div
      aria-label={alt}
      className="pointer-events-none absolute inset-0 -z-20 overflow-hidden bg-[#130f19]"
      ref={rootRef}
      role="img"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_78%_38%,color-mix(in_oklch,var(--primary),transparent_55%),transparent_38%),radial-gradient(circle_at_92%_82%,rgba(8,145,178,0.14),transparent_34%),linear-gradient(115deg,#17111d_0%,#21162d_48%,#101525_100%)]"
      />

      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-[-12%] w-[112%] sm:right-[-5%] sm:w-[100%] lg:right-[-8%] lg:w-[72%]"
      >
        {HERO_IMAGES.map((src, slideIndex) => (
          <div
            className="absolute inset-0"
            data-hero-slide={slideIndex + 1}
            key={src}
            style={{ opacity: slideIndex === 0 ? 1 : 0 }}
          >
            {HERO_PIECES.map((piece, pieceIndex) => (
              <div
                className="absolute inset-0"
                data-hero-piece={pieceIndex + 1}
                key={piece.clipPath}
                style={{ clipPath: piece.clipPath }}
              >
                <div className="absolute inset-0" data-hero-motion>
                  <Image
                    alt=""
                    className="object-contain object-right-bottom"
                    data-hero-asset={pieceIndex === 0 ? 'students' : undefined}
                    fill
                    onLoad={pieceIndex === 0 ? () => markArtworkLoaded(slideIndex) : undefined}
                    priority={slideIndex === 0 && pieceIndex === 0}
                    ref={
                      pieceIndex === 0
                        ? (element) => {
                            artworkRefs.current[slideIndex] = element;
                          }
                        : undefined
                    }
                    sizes="(max-width: 1023px) 100vw, 72vw"
                    src={src}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
