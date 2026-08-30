import { cn } from '@showcase/ui/cn';
import { useId, type SVGProps } from 'react';

interface GridPatternProps extends SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  strokeDasharray?: string;
}

export function GridPattern({
  className,
  height = 44,
  strokeDasharray = '0',
  width = 44,
  x = -1,
  y = -1,
  ...props
}: GridPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full fill-primary/[0.04] stroke-primary/[0.08]',
        className,
      )}
      {...props}
    >
      <defs>
        <pattern height={height} id={id} patternUnits="userSpaceOnUse" width={width} x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" strokeDasharray={strokeDasharray} />
        </pattern>
      </defs>
      <rect fill={`url(#${id})`} height="100%" strokeWidth="0" width="100%" />
    </svg>
  );
}
