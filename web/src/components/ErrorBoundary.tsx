// ═══════════════════════════════════════════════════════
// ZYNK UI — Error Boundary (HeroUI)
// ═══════════════════════════════════════════════════════

'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-7 h-7 text-danger" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Something went wrong</h3>
            <p className="text-sm text-default-400 mb-6 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Button
              color="primary"
              variant="shadow"
              radius="lg"
              onPress={this.handleRetry}
              startContent={<RefreshCw className="w-4 h-4" />}
            >
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
