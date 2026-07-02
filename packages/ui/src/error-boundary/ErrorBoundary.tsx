import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Localized fallback line (resolved by the caller — the boundary renders before providers mount). */
  fallbackMessage: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Root render-error net: a component that throws during render would otherwise unmount the ENTIRE
 * app tree (React 18 default), leaving a blank window with no recovery. First-party (non-fork) atom —
 * pure React + design tokens, no app coupling. The fallback copy is injected (localized by the caller,
 * since the boundary renders before i18n providers mount).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render tree crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="flex h-screen items-center justify-center bg-surface-base">
          <p role="alert" className="text-sm text-text-secondary">
            {this.props.fallbackMessage}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
