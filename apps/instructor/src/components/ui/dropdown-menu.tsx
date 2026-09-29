'use client';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from '@showcase/ui/cn';

/*
 * A row or page action menu. Items stay reachable by keyboard while disabled
 * so a disabled action can still explain why it is unavailable.
 */
function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = 'end',
  className,
  side = 'bottom',
  ...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, 'align' | 'side'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} className="z-50" side={side} sideOffset={4}>
        <MenuPrimitive.Popup
          className={cn(
            'min-w-44 rounded-control border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none transition duration-150 motion-reduce:transition-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
            className,
          )}
          data-slot="dropdown-menu-content"
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & { variant?: 'default' | 'destructive' }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex min-h-9 cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 outline-none select-none data-disabled:cursor-not-allowed data-disabled:text-disabled-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === 'destructive' &&
          'text-destructive data-highlighted:bg-destructive-background data-highlighted:text-destructive data-disabled:text-disabled-foreground',
        className,
      )}
      data-slot="dropdown-menu-item"
      data-variant={variant}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger };
