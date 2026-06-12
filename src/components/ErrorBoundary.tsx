import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Last-resort catch for render-time crashes (e.g. a corrupt imported layout
// breaking a component): show the error instead of a blank page.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div style={{ padding: 32, fontFamily: "Inter, system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
        <p style={{ opacity: 0.8 }}>
          The app hit an unrecoverable error while rendering. Reload the page to continue; if it
          keeps happening after importing a layout file, that file is likely the cause.
        </p>
        <pre
          style={{
            padding: 12,
            background: "rgba(127,127,127,0.12)",
            borderRadius: 6,
            overflow: "auto",
            fontSize: 12,
          }}
        >
          {this.state.error.message}
        </pre>
        <button onClick={() => window.location.reload()} style={{ padding: "6px 14px" }}>
          Reload
        </button>
      </div>
    );
  }
}
