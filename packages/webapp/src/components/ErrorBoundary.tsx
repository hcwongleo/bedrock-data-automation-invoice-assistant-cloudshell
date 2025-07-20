import React from 'react';
import { Alert, Box, Button, SpaceBetween } from '@cloudscape-design/components';

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
    errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        console.error('ErrorBoundary - getDerivedStateFromError:', error);
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary - componentDidCatch error:', error);
        console.error('ErrorBoundary - componentDidCatch errorInfo:', errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <Alert
                    type="error"
                    header="Something went wrong"
                    action={
                        <Button onClick={() => window.location.reload()}>
                            Reload Page
                        </Button>
                    }
                >
                    <SpaceBetween size="s">
                        <Box>
                            An error occurred while rendering the application. Please check the browser console for more details.
                        </Box>
                        {this.state.error && (
                            <Box>
                                <strong>Error:</strong> {this.state.error.message}
                            </Box>
                        )}
                        {this.state.errorInfo && (
                            <Box>
                                <strong>Component Stack:</strong>
                                <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </Box>
                        )}
                    </SpaceBetween>
                </Alert>
            );
        }

        return this.props.children;
    }
}
