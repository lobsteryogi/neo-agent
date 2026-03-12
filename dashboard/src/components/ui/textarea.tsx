import * as React from 'react';
import { cn } from '../../lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground font-mono',
      'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50 resize-vertical',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
export { Textarea };
