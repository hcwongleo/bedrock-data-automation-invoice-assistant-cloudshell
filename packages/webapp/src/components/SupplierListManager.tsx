import { useState } from 'react';
import {
    Container,
    Header,
    Button,
    SpaceBetween,
    Alert,
    Box,
    StatusIndicator,
    FileUpload,
    Table,
    Modal
} from '@cloudscape-design/components';
import { uploadData, downloadData } from 'aws-amplify/storage';
import { supplierMatchingService } from '../services/supplierMatchingService';
import { useSupplierListStatus } from '../hooks/useSupplierListStatus';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../utils/types';

interface SupplierListManagerProps {
    onSupplierListUploaded?: () => void;
}

export const SupplierListManager = ({ onSupplierListUploaded }: SupplierListManagerProps) => {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<'success' | 'error' | null>(null);
    const [uploadMessage, setUploadMessage] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [showPreview, setShowPreview] = useState(false);
    const [suppliers, setSuppliers] = useState<string[][]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Check if supplier list already exists
    const { data: supplierListStatus, isLoading: isCheckingSupplierList } = useSupplierListStatus();
    const queryClient = useQueryClient();

    const handleFileUpload = async () => {
        if (selectedFiles.length === 0) {
            setUploadStatus('error');
            setUploadMessage('Please select a CSV file to upload.');
            return;
        }

        const file = selectedFiles[0];
        if (!file.name.toLowerCase().endsWith('.csv')) {
            setUploadStatus('error');
            setUploadMessage('Please select a CSV file.');
            return;
        }

        setIsUploading(true);
        setUploadStatus(null);

        try {
            // Read file content
            const fileContent = await file.text();
            
            // Upload to S3
            await uploadData({
                path: 'SupplierList.csv',
                data: fileContent,
                options: {
                    contentType: 'text/csv'
                }
            }).result;

            // Test the Lambda-based supplier matching service
            const isServiceAvailable = await supplierMatchingService.testConnection();
            
            if (isServiceAvailable) {
                setUploadStatus('success');
                setUploadMessage('Supplier list uploaded successfully! The Lambda-based matching service is ready.');
            } else {
                setUploadStatus('success');
                setUploadMessage('Supplier list uploaded successfully! Matching service will be available shortly.');
            }
            
            setSelectedFiles([]);
            
            // Refresh supplier list status
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SUPPLIER_LIST_STATUS] });
            
            // Notify parent component that supplier list has been uploaded
            if (onSupplierListUploaded) {
                onSupplierListUploaded();
            }
        } catch (error) {
            console.error('Error uploading supplier list:', error);
            setUploadStatus('error');
            setUploadMessage(`Failed to upload supplier list: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handlePreviewSuppliers = async () => {
        setIsLoading(true);
        try {
            // Try to download existing supplier list from S3
            const downloadResult = await downloadData({ 
                path: 'SupplierList.csv' 
            }).result;
            
            const csvContent = await downloadResult.body.text();
            
            // Check if it's the placeholder file
            if (csvContent.startsWith('# Sample Supplier List Format')) {
                setUploadStatus('error');
                setUploadMessage('No supplier list uploaded yet. Please upload your CSV file first.');
                return;
            }
            
            // Parse CSV content for preview
            const lines = csvContent.split('\n').filter(line => line.trim());
            
            if (lines.length === 0) {
                setUploadStatus('error');
                setUploadMessage('CSV file appears to be empty.');
                return;
            }
            
            // Parse all lines
            const allParsedData = lines.map(line => {
                // Simple CSV parsing - split by comma
                return line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
            });
            
            // Skip header row (first row) and take up to 50 data rows for preview
            const headerRow = allParsedData[0];
            const dataRows = allParsedData.slice(1, 51); // Skip header, take up to 50 data rows
            
            // Store header + data rows for table display (table will handle header separately)
            setSuppliers([headerRow, ...dataRows]);
            setShowPreview(true);
            
            console.log(`Loaded ${dataRows.length} supplier records for preview (header excluded from count)`);
        } catch (error) {
            console.error('Error loading suppliers:', error);
            setUploadStatus('error');
            setUploadMessage('Failed to load supplier list. Please ensure the CSV file is uploaded.');
        } finally {
            setIsLoading(false);
        }
    };

    const downloadTemplate = () => {
        const templateContent = `Supplier,Name 1,Name 2,Group,Group,C/R,C/R,To Send to AWS vendor
100161,Amber World Group Limited,,V001,2OITSYSSVC,HK,,Matched vendor
100199,"ASA Business Service Co., Ltd",,V001,4FAEQ,HK,,Matched vendor
100479,Core-World Limited,,V001,2DPEMFIRES,HK,,SIMILAR`;

        const blob = new Blob([templateContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'SupplierList_Template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <Container header={
                <Header 
                    variant="h2"
                    description="Manage your supplier list for automatic matching"
                >
                    Supplier List Management
                </Header>
            }>
                <SpaceBetween size="l">
                    {/* Show current supplier list status */}
                    {isCheckingSupplierList && (
                        <Alert type="info" header="Checking supplier list">
                            <Box>Loading existing supplier data...</Box>
                        </Alert>
                    )}
                    
                    {!isCheckingSupplierList && supplierListStatus?.exists && supplierListStatus?.isValid && (
                        <Alert type="success" header="Supplier List Ready">
                            <Box>
                                {supplierListStatus.recordCount} suppliers loaded. You can process invoices now or upload a new list to replace the current one.
                            </Box>
                        </Alert>
                    )}
                    
                    {!isCheckingSupplierList && (!supplierListStatus?.exists || !supplierListStatus?.isValid) && (
                        <Alert type="warning" header="No Supplier List Found">
                            <Box>
                                Upload your supplier CSV file to enable automatic matching.
                                <br/><br/>
                                <strong>CSV format:</strong> Supplier, Name 1, Name 2, Group, Group, C/R, C/R, To Send to AWS vendor
                            </Box>
                        </Alert>
                    )}

                    <SpaceBetween size="m">
                        <Box>
                            <Box variant="h3">Upload Supplier List</Box>
                            <Box variant="p" color="text-body-secondary">
                                Upload a CSV file containing your supplier information. The file should include 
                                columns for Supplier Code, Name 1, Name 2, and other relevant fields.
                            </Box>
                        </Box>

                        <FileUpload
                            onChange={({ detail }) => setSelectedFiles(detail.value)}
                            value={selectedFiles}
                            i18nStrings={{
                                uploadButtonText: e => e ? "Choose files" : "Choose file",
                                dropzoneText: e => e ? "Drop files to upload" : "Drop file to upload",
                                removeFileAriaLabel: e => `Remove file ${e + 1}`,
                                limitShowFewer: "Show fewer files",
                                limitShowMore: "Show more files",
                                errorIconAriaLabel: "Error"
                            }}
                            showFileLastModified
                            showFileSize
                            showFileThumbnail
                            tokenLimit={3}
                            accept=".csv"
                        />

                        <SpaceBetween size="s" direction="horizontal">
                            <Button 
                                variant="primary" 
                                onClick={handleFileUpload}
                                loading={isUploading}
                                disabled={selectedFiles.length === 0}
                            >
                                Upload Supplier List
                            </Button>
                            <Button 
                                variant="normal" 
                                onClick={downloadTemplate}
                            >
                                Download Template
                            </Button>
                            <Button 
                                variant="normal" 
                                onClick={handlePreviewSuppliers}
                                loading={isLoading}
                            >
                                Preview Current List
                            </Button>
                        </SpaceBetween>

                        {uploadStatus && (
                            <Alert 
                                type={uploadStatus} 
                                dismissible 
                                onDismiss={() => setUploadStatus(null)}
                            >
                                {uploadMessage}
                            </Alert>
                        )}
                    </SpaceBetween>
                </SpaceBetween>
            </Container>

            <Modal
                visible={showPreview}
                onDismiss={() => setShowPreview(false)}
                header="Supplier List Preview"
                size="large"
                footer={
                    <Box float="right">
                        <Button variant="primary" onClick={() => setShowPreview(false)}>
                            Close
                        </Button>
                    </Box>
                }
            >
                <Container>
                    <SpaceBetween size="m">
                        <Box>
                            <StatusIndicator type="success">
                                {suppliers.length > 0 ? suppliers.length - 1 : 0} suppliers loaded (showing first 50)
                            </StatusIndicator>
                        </Box>
                        
                        <Table
                            columnDefinitions={[
                                {
                                    id: "supplier",
                                    header: "Supplier Code",
                                    cell: (item: string[]) => item[0] || '-',
                                    width: 120
                                },
                                {
                                    id: "name1",
                                    header: "Name 1",
                                    cell: (item: string[]) => item[1] || '-',
                                    width: 200
                                },
                                {
                                    id: "name2",
                                    header: "Name 2",
                                    cell: (item: string[]) => item[2] || '-',
                                    width: 150
                                },
                                {
                                    id: "combined",
                                    header: "Combined Name",
                                    cell: (item: string[]) => {
                                        const name1 = item[1] || '';
                                        const name2 = item[2] || '';
                                        return name2 ? `${name1} ${name2}` : name1;
                                    },
                                    width: 250
                                }
                            ]}
                            items={suppliers.slice(1)} // Skip header row
                            variant="embedded"
                            stripedRows
                            contentDensity="compact"
                            empty={
                                <Box textAlign="center" color="inherit">
                                    <b>No suppliers found</b>
                                    <Box variant="p" color="inherit">
                                        Upload a supplier list CSV file to see suppliers here.
                                    </Box>
                                </Box>
                            }
                        />
                    </SpaceBetween>
                </Container>
            </Modal>
        </>
    );
};
