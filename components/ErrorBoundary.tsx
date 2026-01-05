import React, { ErrorInfo, ReactNode } from 'react';
import { ShieldIcon } from './icons';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined,
    errorInfo: undefined
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to the console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    const showDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <ShieldIcon className="w-16 h-16 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-red-300">Something Went Wrong</h1>
          <p className="mt-2 text-slate-400 max-w-md">
            An unexpected error occurred in the application. Please try refreshing the page. If the problem persists, please contact support.
          </p>
          {showDebug && (
            <div className="mt-4 w-full max-w-3xl text-left bg-slate-900/60 border border-slate-700 rounded-lg p-4">
              <div className="text-sm font-semibold text-slate-200 mb-2">Error details</div>
              <pre className="text-xs whitespace-pre-wrap text-slate-200">{String(this.state.error?.message || this.state.error || 'Unknown error')}</pre>
              {this.state.errorInfo?.componentStack && (
                <pre className="mt-3 text-xs whitespace-pre-wrap text-slate-400">{this.state.errorInfo.componentStack}</pre>
              )}
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default ErrorBoundary;