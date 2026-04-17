'use client';
import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'secondary', size = 'md', icon, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-all duration-150 select-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'active:scale-[0.98]',
          // variants
          variant === 'primary'   && 'bg-fluent-blue-500 text-white hover:bg-fluent-blue-600 active:bg-fluent-blue-700 shadow-fluent-2',
          variant === 'secondary' && 'bg-white text-fluent-neutral-90 border border-fluent-neutral-20 hover:bg-fluent-neutral-6 hover:border-fluent-neutral-30',
          variant === 'subtle'    && 'bg-fluent-neutral-8 text-fluent-neutral-80 hover:bg-fluent-neutral-10',
          variant === 'ghost'     && 'text-fluent-neutral-80 hover:bg-fluent-neutral-8',
          variant === 'danger'    && 'bg-fluent-accent-red text-white hover:bg-red-700',
          // sizes
          size === 'sm' && 'h-8 px-3 text-sm',
          size === 'md' && 'h-9 px-4 text-sm',
          size === 'lg' && 'h-11 px-6 text-base',
          className,
        )}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
