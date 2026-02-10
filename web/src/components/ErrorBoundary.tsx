'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import logger from '@/lib/logger';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">Something went wrong</h3>
          <p className="text-sm text-[var(--text-muted)] max-w-xs mb-4">
            {this.props.fallbackMessage || 'An unexpected error occurred. Please try again.'}
          </p>
          {this.state.error && (
            <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-wash)] rounded-lg px-3 py-2 mb-4 max-w-xs font-mono break-all">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] rounded-xl hover:bg-[var(--accent-hover)] transition-all active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
