import { useState, useRef } from 'react';
import { 
    Box, 
    Button, 
    SpaceBetween, 
    Alert, 
    ProgressBar,
    Container,
    Header,
    Icon
} from "@cloudscape-design/components";
import { uploadData } from 'aws-amplify/storage';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../utils/types';

interface FileUploadProps {
    onUploadComplete?: (fileName: string) => void;
    onUploadError?: (error: string) => void;
    disabled?: boolean;
}

export const FileUpload = ({ onUploadComplete, onUploadError, disabled = false }: FileUploadProps) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();

    const acceptedFileTypes = '.pdf,.png,.jpg,.jpeg,.gif';
    const maxFileSize = 10 * 1024 * 1024; // 10MB

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        
        // Validate files
        const validFiles = files.filter(file => {
            if (file.size > maxFileSize) {
                setErrorMessage(`File ${file.name} is too large. Maximum size is 10MB.`);
                setUploadStatus('error');
                return false;
            }
            
            const fileType = file.type;
            const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
            if (!validTypes.includes(fileType)) {
                setErrorMessage(`File ${file.name} is not a supported format. Please upload PDF or image files.`);
                setUploadStatus('error');
                return false;
            }
            
            return true;
        });

        if (validFiles.length > 0) {
            setSelectedFiles(validFiles);
            setUploadStatus('idle');
            setErrorMessage('');
        }
    };

    const handleUpload = async () => {
        if (selectedFiles.length === 0) return;

        setIsUploading(true);
        setUploadProgress(0);
        setUploadStatus('idle');

        try {
            const uploadPromises = selectedFiles.map(async (file, index) => {
                const fileName = `${Date.now()}_${file.name}`;
                const path = `datasets/documents/${fileName}`;

                const result = await uploadData({
                    path,
                    data: file,
                    options: {
                        onProgress: ({ transferredBytes, totalBytes }) => {
                            if (totalBytes) {
                                const progress = Math.round((transferredBytes / totalBytes) * 100);
                                setUploadProgress(prev => Math.max(prev, progress));
                            }
                        }
                    }
                });

                return { fileName, result };
            });

            await Promise.all(uploadPromises);

            // Invalidate queries to refresh document list and BDA results
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.DOCUMENTS] });
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.BDA_RESULTS] });

            setUploadStatus('success');
            setSelectedFiles([]);
            setUploadProgress(100);

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }

            // Call success callback
            if (onUploadComplete) {
                selectedFiles.forEach(file => onUploadComplete(file.name));
            }

        } catch (error) {
            console.error('Upload failed:', error);
            const errorMsg = error instanceof Error ? error.message : 'Upload failed';
            setErrorMessage(errorMsg);
            setUploadStatus('error');
            
            if (onUploadError) {
                onUploadError(errorMsg);
            }
        } finally {
            setIsUploading(false);
            setTimeout(() => {
                setUploadProgress(0);
                setUploadStatus('idle');
            }, 3000);
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) {
            // Create a synthetic event that handleFileSelect can process
            const syntheticEvent = {
                target: {
                    files: files
                }
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            
            handleFileSelect(syntheticEvent);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <Container
            header={<Header>Upload Invoice Documents</Header>}
        >
            <SpaceBetween size="m">
                {/* Upload Status Messages */}
                {uploadStatus === 'success' && (
                    <Alert type="success" dismissible onDismiss={() => setUploadStatus('idle')}>
                        Files uploaded successfully!
                    </Alert>
                )}
                
                {uploadStatus === 'error' && (
                    <Alert type="error" dismissible onDismiss={() => setUploadStatus('idle')}>
                        {errorMessage}
                    </Alert>
                )}

                {/* Drag & Drop Area */}
                <div
                    onDragOver={disabled ? undefined : handleDragOver}
                    onDrop={disabled ? undefined : handleDrop}
                    onClick={() => !disabled && fileInputRef.current?.click()}
                    style={{
                        border: '2px dashed #d1d5db',
                        borderRadius: '8px',
                        backgroundColor: disabled ? '#f5f5f5' : '#f9fafb',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        padding: '2rem',
                        textAlign: 'center',
                        opacity: disabled ? 0.6 : 1
                    }}
                >
                    <SpaceBetween size="m">
                        <Icon name="upload" size="big" />
                        <Box>
                            {disabled ? 'Upload supplier list first to enable invoice processing' : 
                             'Drag and drop files here, or click to browse'}
                        </Box>
                        <Box color="text-body-secondary">
                            Supported formats: PDF, PNG, JPG, JPEG, GIF (Max 10MB each)
                        </Box>
                    </SpaceBetween>
                </div>

                {/* Hidden File Input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={acceptedFileTypes}
                    onChange={handleFileSelect}
                    disabled={disabled}
                    style={{ display: 'none' }}
                />

                {/* Selected Files List */}
                {selectedFiles.length > 0 && (
                    <Container header={<Header>Selected Files</Header>}>
                        <SpaceBetween size="s">
                            {selectedFiles.map((file, index) => (
                                <div key={index} style={{ 
                                    border: '1px solid #e5e7eb', 
                                    borderRadius: '4px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.5rem'
                                }}>
                                    <SpaceBetween direction="horizontal" size="s">
                                        <Icon name="file" />
                                        <div>
                                            <Box fontWeight="bold">{file.name}</Box>
                                            <Box color="text-body-secondary">
                                                <span style={{ fontSize: 'small' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                                            </Box>
                                        </div>
                                    </SpaceBetween>
                                    <Button
                                        variant="icon"
                                        iconName="close"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(index);
                                        }}
                                        ariaLabel={`Remove ${file.name}`}
                                    />
                                </div>
                            ))}
                        </SpaceBetween>
                    </Container>
                )}

                {/* Upload Progress */}
                {isUploading && (
                    <div>
                        <Box padding={{ bottom: 's' }}>
                            Uploading files... {uploadProgress}%
                        </Box>
                        <ProgressBar value={uploadProgress} />
                    </div>
                )}

                {/* Upload Button */}
                <Box textAlign="center">
                    <Button
                        variant="primary"
                        onClick={handleUpload}
                        disabled={disabled || selectedFiles.length === 0 || isUploading}
                        loading={isUploading}
                    >
                        {disabled ? 'Upload Supplier List First' : 
                         isUploading ? 'Uploading...' : 
                         `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`}
                    </Button>
                </Box>
            </SpaceBetween>
        </Container>
    );
};
