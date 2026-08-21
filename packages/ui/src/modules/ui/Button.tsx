'use client';
import { cn } from '../../libs/utils/cn';
import type { PolymorphicProps } from '../../libs/utils/polymorphic';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  secondary: 'bg-secondary text-secondary-fg hover:bg-secondary-hover',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-overlay',
  danger: 'bg-error text-text-inverse hover:opacity-90',
  outline: 'border border-border text-text-primary hover:bg-surface-overlay',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
  xl: 'px-6 py-3 text-lg',
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  xs: 'p-1 text-xs',
  sm: 'p-1.5 text-sm',
  md: 'p-2 text-sm',
  lg: 'p-2.5 text-base',
  xl: 'p-3 text-lg',
};

type ButtonOwnProps = {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
  selected?: boolean;
  type?: 'button' | 'submit' | 'reset';
  'data-testid'?: string;
  className?: string;
};

export function Button<C extends React.ElementType = 'button'>({
  as,
  children,
  variant = 'primary',
  size = 'md',
  loading,
  iconLeft,
  iconRight,
  iconOnly = false,
  fullWidth = false,
  selected = false,
  type = 'button',
  'data-testid': testId,
  className,
  ...rest
}: PolymorphicProps<C, ButtonOwnProps>) {
  const Tag = (as ?? 'button') as React.ElementType;
  const isNativeButton = Tag === 'button';

  return (
    <Tag
      {...(isNativeButton && { type })}
      aria-busy={loading || undefined}
      aria-pressed={selected ? true : undefined}
      data-testid={testId}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
        fullWidth && 'w-full',
        selected && 'ring-2 ring-border-focus',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full shrink-0"
          aria-hidden="true"
        />
      )}
      {!loading && iconLeft && (
        <span aria-hidden="true" className="shrink-0">
          {iconLeft}
        </span>
      )}
      {children}
      {!loading && iconRight && (
        <span aria-hidden="true" className="shrink-0">
          {iconRight}
        </span>
      )}
    </Tag>
  );
}
