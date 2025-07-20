import { useState, useEffect } from 'react';
import { 
    Box, 
    SpaceBetween, 
    Container,
    Header,
    ColumnLayout,
    StatusIndicator,
    Button,
    Tabs,
    TabsProps,
    Alert
} from "@cloudscape-design/components";
import { FileUpload } from '../components/FileUpload';
import { SupplierListManager } from '../components/SupplierListManager';
import { BDAResultModal } from '../components/BDAResultModal';
import { BDAResult } from '../hooks/useBDAResults';
import { useSmartBDAResults } from '../hooks/useSmartBDAResults';
import { useSupplierListStatus } from '../hooks/useSupplierListStatus';
import { generateCSVFromBDAResults, downloadCSV, enhanceBDAResultForExport } from '../utils/csvExport';

interface ProcessedFile {
    fileName: string;
    uploadTime: Date;
    status: 'uploaded' | 'processing' | 'completed' | 'error';
    bdaResult?: BDAResult;
    errorMessage?: string;
}

export const FileProcessor = () => {
    const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
    const [selectedResult, setSelectedResult] = useState<BDAResult | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string>('');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [activeTabId, setActiveTabId] = useState('suppliers'); // Always start with supplier management tab
    const [supplierListUploaded, setSupplierListUploaded] = useState(false);

    // Use the smart BDA results hook and supplier list status
    const { 
        bdaResults, 
        startPollingForFile, 
        getResultForFile 
    } = useSmartBDAResults();
    const { data: supplierListStatus, isLoading: isCheckingSupplierList } = useSupplierListStatus();
    
    // Determine if supplier list is available (either uploaded in this session or exists in S3)
    const hasSupplierList = supplierListUploaded || (supplierListStatus?.exists && supplierListStatus?.isValid);
    
    // Helper to get completed files with results
    const completedFiles = processedFiles.filter(f => f.status === 'completed' && f.bdaResult);
    const processingFiles = processedFiles.filter(f => f.status === 'processing');
    




    // Handle file upload completion
    const handleUploadComplete = (fileName: string) => {
        const newFile: ProcessedFile = {
            fileName,
            uploadTime: new Date(),
            status: 'processing'
        };
        
        setProcessedFiles(prev => [...prev, newFile]);
        
        // Start polling for this specific file
        startPollingForFile(fileName);
    };

    // Handle upload errors
    const handleUploadError = (error: string) => {
        console.error('Upload error:', error);
    };

    // Handle CSV export
    const handleExportResults = () => {
        if (completedFiles.length === 0) {
            alert('No completed files to export');
            return;
        }

        const enhancedResults = completedFiles.map(file => 
            enhanceBDAResultForExport(file.bdaResult!, file.fileName, file.uploadTime.toISOString().split('T')[0])
        );
        
        const csvContent = generateCSVFromBDAResults(enhancedResults);
        const today = new Date().toISOString().split('T')[0];
        downloadCSV(csvContent, `invoice-processing-results-${today}.csv`);
    };

    // Handle viewing results
    const viewResult = (result: BDAResult, fileName: string) => {
        setSelectedResult(result);
        setSelectedFileName(fileName);
        setIsModalVisible(true);
    };

    // Update file status based on BDA results
    useEffect(() => {
        if (bdaResults && bdaResults.length > 0) {
            setProcessedFiles(prev => 
                prev.map(file => {
                    if (file.status === 'processing') {
                        const bdaResult = getResultForFile(file.fileName, file.uploadTime);
                        return bdaResult ? { ...file, status: 'completed' as const, bdaResult } : file;
                    }
                    return file;
                })
            );
        }
    }, [bdaResults, getResultForFile]);

    const getStatusIndicator = (status: ProcessedFile['status']) => {
        const statusMap = {
            uploaded: { type: 'pending', text: 'Uploaded' },
            processing: { type: 'in-progress', text: 'Processing' },
            completed: { type: 'success', text: 'Completed' },
            error: { type: 'error', text: 'Error' }
        } as const;
        
        const config = statusMap[status] || { type: 'pending', text: 'Unknown' };
        return <StatusIndicator type={config.type as any}>{config.text}</StatusIndicator>;
    };

    const tabs: TabsProps.Tab[] = [
        {
            label: "Supplier Management",
            id: "suppliers",
            content: <SupplierListManager onSupplierListUploaded={() => setSupplierListUploaded(true)} />
        },
        {
            label: "Invoice Processing",
            id: "processing",
            content: (
                <SpaceBetween size="l">
                    {/* Document Processing Summary - Embedded at top */}
                    <Container 
                        header={
                            <Header 
                                variant="h2" 
                                description="Summary of document processing results"
                                actions={
                                    <Button
                                        variant="primary"
                                        iconName="download"
                                        onClick={handleExportResults}
                                        disabled={completedFiles.length === 0}
                                    >
                                        Export Processing Results (CSV)
                                    </Button>
                                }
                            >
                                Document Processing Summary
                            </Header>
                        }
                    >
                        {!hasSupplierList && !isCheckingSupplierList && (
                            <Alert type="warning" header="Supplier List Required">
                                <Box>
                                    Upload your supplier list first to enable automatic supplier matching.
                                </Box>
                            </Alert>
                        )}
                        {hasSupplierList && supplierListStatus?.recordCount && (
                            <Alert type="success" header="Supplier List Ready">
                                <Box>
                                    {supplierListStatus.recordCount} suppliers loaded. Invoices will be matched automatically.
                                </Box>
                            </Alert>
                        )}
                        <ColumnLayout columns={3}>
                            <div>
                                <Box variant="awsui-key-label">Total Files</Box>
                                <Box fontSize="display-l">{String(processedFiles.length)}</Box>
                            </div>
                            <div>
                                <Box variant="awsui-key-label">Completed</Box>
                                <Box fontSize="display-l" color="text-status-success">
                                    {String(completedFiles.length)}
                                </Box>
                            </div>
                            <div>
                                <Box variant="awsui-key-label">Processing</Box>
                                <Box fontSize="display-l" color="text-status-info">
                                    {String(processingFiles.length)}
                                </Box>
                            </div>
                        </ColumnLayout>
                    </Container>

                    {/* Invoice Upload Section */}
                    <Container
                        header={
                            <Header 
                                variant="h2"
                                description="Upload invoices for processing"
                            >
                                Upload Invoices
                            </Header>
                        }
                    >
                        {!hasSupplierList && !isCheckingSupplierList && (
                            <Alert type="warning" header="Supplier List Required">
                                <Box>
                                    Upload your supplier list first in the Supplier Management tab.
                                </Box>
                            </Alert>
                        )}
                        {isCheckingSupplierList && (
                            <Alert type="info" header="Checking for supplier list">
                                <Box>Looking for existing supplier data...</Box>
                            </Alert>
                        )}
                        
                        <SpaceBetween size="m">
                            <Box>
                                <strong>Supported formats: PDF, PNG, JPG, JPEG, GIF</strong>
                                <br/>
                                Documents will be processed and matched against your supplier list.
                            </Box>
                            
                            <FileUpload
                                onUploadComplete={handleUploadComplete}
                                onUploadError={handleUploadError}
                                disabled={!hasSupplierList}
                            />
                        </SpaceBetween>
                    </Container>

                    {/* Processing Status & Results */}
                    <Container
                        header={<Header variant="h2">Processing Status & Results</Header>}
                    >
                        <SpaceBetween size="s">
                            {processedFiles.length === 0 ? (
                                <Box textAlign="center" color="text-body-secondary">
                                    No files uploaded yet. Upload some documents above to get started.
                                </Box>
                            ) : (
                                processedFiles.map((file, index) => (
                                    <Container key={index}>
                                        <SpaceBetween direction="horizontal" size="m">
                                            <div style={{ flex: 1 }}>
                                                <Box fontWeight="bold">{String(file.fileName || 'Unknown file')}</Box>
                                                <Box color="text-body-secondary" fontSize="body-s">
                                                    Uploaded: {file.uploadTime ? file.uploadTime.toLocaleString() : 'Unknown time'}
                                                </Box>
                                            </div>
                                            <div>
                                                {getStatusIndicator(file.status)}
                                            </div>
                                            {file.status === 'completed' && file.bdaResult && (
                                                <Button
                                                    variant="primary"
                                                    onClick={() => viewResult(file.bdaResult!, file.fileName)}
                                                >
                                                    View Results
                                                </Button>
                                            )}
                                        </SpaceBetween>
                                    </Container>
                                ))
                            )}
                        </SpaceBetween>
                    </Container>
                </SpaceBetween>
            )
        }
    ];

    return (
        <SpaceBetween size="l">
            {/* Header */}
            <Container
                header={
                    <Header 
                        variant="h1"
                        description="Process invoices and match suppliers automatically"
                    >
                        Invoice Processor
                    </Header>
                }
            >
                <Box>
                    Upload your supplier list, then process invoices to automatically extract data and match vendors.
                </Box>
            </Container>

            {/* Main Content Tabs */}
            <Container>
                <Tabs
                    activeTabId={activeTabId}
                    onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
                    tabs={tabs}
                />
            </Container>

            {/* Enhanced Results Modal */}
            <BDAResultModal
                visible={isModalVisible}
                onDismiss={() => setIsModalVisible(false)}
                bdaResult={selectedResult}
                fileName={selectedFileName}
            />
        </SpaceBetween>
    );
};
