import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@showcase/ui/cn';

type NativeSelectProps = Omit<React.ComponentProps<'select'>, 'size'> & {
  size?: 'sm' | 'default';
};

function NativeSelect({ className, size = 'default', ...props }: NativeSelectProps) {
  return (
    <div
      className={cn(
        'group/native-select relative w-full has-[select:disabled]:opacity-50',
        className,
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="h-12 w-full min-w-0 appearance-none rounded-control border border-input bg-card py-2 pr-10 pl-3.5 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-9"
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<'option'>) {
  return (
    <option
      data-slot="native-select-option"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOption };
