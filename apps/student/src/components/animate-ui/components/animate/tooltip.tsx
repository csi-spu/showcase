'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '@showcase/ui/cn';

type TooltipContentPrimitiveProps = React.ComponentProps<typeof TooltipPrimitive.Content>;

type TooltipPosition = {
  align?: TooltipContentPrimitiveProps['align'] | undefined;
  alignOffset?: number | undefined;
  side?: TooltipContentPrimitiveProps['side'] | undefined;
  sideOffset?: number | undefined;
};

const TooltipPositionContext = React.createContext<TooltipPosition>({});

type TooltipProviderProps = Omit<
  React.ComponentProps<typeof TooltipPrimitive.Provider>,
  'delayDuration'
> & {
  openDelay?: number;
};

function TooltipProvider({ openDelay = 0, ...props }: TooltipProviderProps) {
  return <TooltipPrimitive.Provider delayDuration={openDelay} {...props} />;
}

type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root> & TooltipPosition;

function Tooltip({ align, alignOffset, side, sideOffset, ...props }: TooltipProps) {
  const position = React.useMemo(
    () => ({ align, alignOffset, side, sideOffset }),
    [align, alignOffset, side, sideOffset],
  );

  return (
    <TooltipPositionContext.Provider value={position}>
      <TooltipPrimitive.Root {...props} />
    </TooltipPositionContext.Provider>
  );
}

type TooltipTriggerProps = Omit<React.ComponentProps<typeof TooltipPrimitive.Trigger>, 'asChild'>;

function TooltipTrigger(props: TooltipTriggerProps) {
  return <TooltipPrimitive.Trigger asChild {...props} />;
}

type TooltipContentProps = TooltipContentPrimitiveProps;

function TooltipContent({
  align,
  alignOffset,
  className,
  side,
  sideOffset,
  ...props
}: TooltipContentProps) {
  const position = React.useContext(TooltipPositionContext);

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        align={align ?? position.align ?? 'center'}
        alignOffset={alignOffset ?? position.alignOffset ?? 0}
        side={side ?? position.side ?? 'top'}
        sideOffset={sideOffset ?? position.sideOffset ?? 10}
        className={cn(
          'z-50 w-fit rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground',
          'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  type TooltipProviderProps,
  type TooltipProps,
  type TooltipTriggerProps,
  type TooltipContentProps,
};
