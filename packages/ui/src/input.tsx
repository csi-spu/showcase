import { Input as InputPrimitive } from '@base-ui/react/input';
import * as React from 'react';

import { cn } from './cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      className={cn(
        'h-11 w-full min-w-0 rounded-control border border-input bg-card px-3 py-2 text-base transition-colors duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-disabled disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm',
        className,
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
