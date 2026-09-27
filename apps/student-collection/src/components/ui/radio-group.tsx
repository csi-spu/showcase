'use client';

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { cn } from '@showcase/ui/cn';

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      className={cn('grid w-full gap-2', className)}
      data-slot="radio-group"
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      className={cn(
        'group/radio-group-item peer relative flex aspect-square size-5 shrink-0 rounded-full border-2 border-input outline-none transition-colors duration-150 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input group-has-[:focus-visible]/field-label:data-checked:border-primary data-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      data-slot="radio-group-item"
      {...props}
    >
      <RadioPrimitive.Indicator
        className="flex size-full items-center justify-center"
        data-slot="radio-group-indicator"
      >
        {/* Mounted only while checked, so the dot scales in each time it is chosen. */}
        <span className="size-2.5 rounded-full bg-primary animate-in duration-200 zoom-in-0 motion-reduce:animate-none" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
