import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || '未知错误' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI ErrorBoundary', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h2>页面遇到问题</h2>
          <p>{this.state.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
