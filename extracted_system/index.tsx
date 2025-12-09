import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Simple Error Boundary
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: Readonly<ErrorBoundaryProps>;
  public state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Tajawal, sans-serif',
            backgroundColor: '#f8fafc',
            color: '#334155',
            padding: '20px',
            textAlign: 'center'
        }}>
          <div style={{
              padding: '20px',
              backgroundColor: '#fee2e2',
              borderRadius: '50%',
              marginBottom: '20px',
              color: '#dc2626'
          }}>
             <AlertTriangle size={48} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>عذراً، حدث خطأ غير متوقع</h1>
          <p style={{ maxWidth: '500px', marginBottom: '20px' }}>
            واجه النظام مشكلة تقنية تمنعه من العرض. يرجى إعادة تحميل الصفحة.
          </p>
          <div style={{
              padding: '15px',
              backgroundColor: '#e2e8f0',
              borderRadius: '8px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#475569',
              maxWidth: '600px',
              overflow: 'auto',
              direction: 'ltr'
          }}>
            {this.state.error?.toString()}
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{
                marginTop: '30px',
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
            }}
          >
            إعادة تحميل النظام
          </button>
        </div>
      );
    }

    return <>{this.props?.children}</>;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);
