'use client';

import { useState, type SVGProps } from 'react';

import { cn } from '@showcase/ui/cn';

/**
 * InteractiveGridPattern is a component that renders a grid pattern with interactive squares.
 *
 * @param width - The width of each square.
 * @param height - The height of each square.
 * @param squares - The number of squares in the grid. The first element is the number of horizontal squares, and the second element is the number of vertical squares.
 * @param className - The class name of the grid.
 * @param squaresClassName - The class name of the squares.
 */
interface InteractiveGridPatternProps extends SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  squares?: [number, number]; // [horizontal, vertical]
  className?: string;
  squaresClassName?: string;
}

/**
 * The InteractiveGridPattern component.
 *
 * @see InteractiveGridPatternProps for the props interface.
 * @returns A React component.
 */
export function InteractiveGridPattern({
  width = 40,
  height = 40,
  squares = [24, 24],
  className,
  squaresClassName,
  ...props
}: InteractiveGridPatternProps) {
  const [horizontal, vertical] = squares;
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null);
  const gridWidth = width * horizontal;
  const gridHeight = height * vertical;
  const gridPath = [
    ...Array.from({ length: horizontal + 1 }, (_, index) => `M ${index * width} 0 V ${gridHeight}`),
    ...Array.from({ length: vertical + 1 }, (_, index) => `M 0 ${index * height} H ${gridWidth}`),
  ].join(' ');

  return (
    <svg
      width={gridWidth}
      height={gridHeight}
      viewBox={`0 0 ${gridWidth} ${gridHeight}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn('absolute inset-0 h-full w-full border border-border/30', className)}
      {...props}
    >
      <path
        className={cn('fill-none stroke-border/30', squaresClassName)}
        d={gridPath}
        data-grid-lines
        vectorEffect="non-scaling-stroke"
      />
      {Array.from({ length: horizontal * vertical }).map((_, index) => {
        const x = (index % horizontal) * width;
        const y = Math.floor(index / horizontal) * height;
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={width}
            height={height}
            className={cn(
              'stroke-none transition-[fill] duration-100 ease-out not-[&:hover]:duration-700 motion-reduce:transition-none',
              hoveredSquare === index ? 'fill-primary/15' : 'fill-transparent',
            )}
            onMouseEnter={() => setHoveredSquare(index)}
            onMouseLeave={() => setHoveredSquare(null)}
          />
        );
      })}
    </svg>
  );
}
