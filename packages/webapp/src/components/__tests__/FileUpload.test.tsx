import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileUpload } from '../FileUpload';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock AWS Amplify
jest.mock('aws-amplify/storage', () => ({
  uploadData: jest.fn()
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('FileUpload Component', () => {
  it('renders upload area', () => {
    render(<FileUpload />, { wrapper: createWrapper() });
    
    // Using query selectors instead of toBeInTheDocument
    expect(screen.getByText('Upload Invoice Documents')).toBeTruthy();
    expect(screen.getByText('Drag and drop files here, or click to browse')).toBeTruthy();
    expect(screen.getByText('Supported formats: PDF, PNG, JPG, JPEG, GIF (Max 10MB each)')).toBeTruthy();
  });

  it('shows correct file type restrictions', () => {
    render(<FileUpload />, { wrapper: createWrapper() });
    
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.getAttribute('accept')).toBe('.pdf,.png,.jpg,.jpeg,.gif');
    expect(fileInput.hasAttribute('multiple')).toBe(true);
  });
});
