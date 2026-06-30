/**
 * Merges a component's own props with the native props of the element/component
 * specified by the `as` prop, with own props taking precedence on conflicts.
 *
 * Usage:
 *   type ButtonOwnProps = { variant?: 'primary' | 'secondary' };
 *   export function Button<C extends React.ElementType = 'button'>({
 *     as, ...rest
 *   }: PolymorphicProps<C, ButtonOwnProps>) { ... }
 */
export type PolymorphicProps<
  C extends React.ElementType,
  OwnProps = {}
> = OwnProps &
  Omit<React.ComponentPropsWithRef<C>, keyof OwnProps> & {
    as?: C;
  };
