import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium font-mono',
  {
    variants: {
      variant: {
        default: 'border border-primary/30 text-primary bg-primary/10',
        low: 'border border-[#6b7280]/40 text-[#6b7280] bg-[#6b728015]',
        medium: 'border border-[#3b82f6]/40 text-[#3b82f6] bg-[#3b82f615]',
        high: 'border border-[#f59e0b]/40 text-[#f59e0b] bg-[#f59e0b15]',
        critical: 'border border-[#ef4444]/40 text-[#ef4444] bg-[#ef444415]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
