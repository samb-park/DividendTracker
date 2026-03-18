"use client";

import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const label = this.props.label ?? "COMPONENT";
      return (
        <div className="border border-negative/30 bg-card p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 text-negative">
            <AlertTriangle size={12} />
            <span className="tracking-wide">{label} ERROR</span>
          </div>
          <div className="text-muted-foreground truncate">
            {this.state.error?.message ?? "Unknown error"}
          </div>
          <button
            className="btn-retro text-xs flex items-center gap-1 mt-2"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCw size={11} />
            RETRY
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
