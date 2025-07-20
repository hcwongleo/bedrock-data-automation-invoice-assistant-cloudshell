import {
    Modal,
    Box,
    SpaceBetween,
    Container,
    Header,
    Button,
    Table,
    StatusIndicator,
    Tabs,
    Alert,
    Badge,
    ColumnLayout
} from "@cloudscape-design/components";
import { useState } from 'react';
import { SupplierMatch } from '../services/supplierMatchingService';
import { BDAResult } from '../hooks/useBDAResults';
import { flattenBDAResult } from '../utils/bdaFieldExtractor';

interface BDAResultModalProps {
    visible: boolean;
    onDismiss: () => void;
    bdaResult: BDAResult | null;
    fileName: string;
}

export const BDAResultModal = ({ visible, onDismiss, bdaResult, fileName }: BDAResultModalProps) => {
    const [activeTabId, setActiveTabId] = useState("csv-view");

    if (!bdaResult) return null;



    // Use dynamic field extraction for CSV format
    const flattenedData = flattenBDAResult(bdaResult);

    // Convert to CSV format with headers
    const csvData = [
        ['Field', 'Value', 'Confidence', 'Source'], // Header row
        ...flattenedData.map(item => [item.field, item.value, '', item.source])
    ];



    return (
        <Modal
            visible={visible}
            onDismiss={onDismiss}
            header={<Box variant="h1">BDA Processing Results - {fileName}</Box>}
            size="max"
            footer={
                <Box float="right">
                    <Button variant="primary" onClick={onDismiss}>
                        Close
                    </Button>
                </Box>
            }
        >
            <SpaceBetween size="l">
                <Alert type="info">
                    <Box>
                        <strong>Document:</strong> {String(fileName)}<br />
                        <strong>Processing Status:</strong> <StatusIndicator type="success">Completed</StatusIndicator><br />
                        <strong>Document Type:</strong> {String(bdaResult.document_class?.type || 'Unknown')}<br />
                        <strong>Confidence:</strong> {bdaResult.matched_blueprint?.confidence ? `${(bdaResult.matched_blueprint.confidence * 100).toFixed(1)}%` : 'N/A'}
                    </Box>
                </Alert>

                <Tabs
                    activeTabId={activeTabId}
                    onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
                    tabs={[
                        {
                            id: "csv-view",
                            label: "CSV Format View",
                            content: (
                                <Container header={<Header variant="h3">Extracted Data in CSV Format</Header>}>
                                    <Table
                                        columnDefinitions={[
                                            {
                                                id: "field",
                                                header: "Field",
                                                cell: item => String(item[0] || ''),
                                                width: 200
                                            },
                                            {
                                                id: "value",
                                                header: "Value",
                                                cell: item => {
                                                    const value = item[1];
                                                    let displayValue = '-';

                                                    try {
                                                        if (value !== null && value !== undefined) {
                                                            if (typeof value === 'object') {
                                                                displayValue = JSON.stringify(value);
                                                            } else {
                                                                displayValue = String(value);
                                                            }
                                                        }
                                                    } catch (error) {
                                                        displayValue = 'Error displaying value';
                                                        console.error('Error converting value to string:', error);
                                                    }

                                                    return displayValue;
                                                },
                                                width: 300
                                            },
                                            {
                                                id: "confidence",
                                                header: "Confidence",
                                                cell: item => {
                                                    const confidence = item[2];
                                                    if (confidence && typeof confidence === 'number') {
                                                        return `${(confidence * 100).toFixed(1)}%`;
                                                    }
                                                    return String(confidence || '-');
                                                },
                                                width: 100
                                            },
                                            {
                                                id: "source",
                                                header: "Source",
                                                cell: item => String(item[3] || 'BDA'),
                                                width: 100
                                            }
                                        ]}
                                        items={csvData.slice(1)} // Skip header row
                                        variant="embedded"
                                        wrapLines
                                        stripedRows
                                        contentDensity="compact"
                                        empty={
                                            <Box textAlign="center" color="inherit">
                                                <b>No data extracted</b>
                                                <Box variant="p" color="inherit">
                                                    The BDA processing did not extract any structured data.
                                                </Box>
                                            </Box>
                                        }
                                    />
                                </Container>
                            )
                        },
                        {
                            id: "supplier-match",
                            label: "Supplier Matching",
                            content: (
                                <Container header={
                                    <Header
                                        variant="h3"
                                        description="AI-powered supplier code matching results"
                                    >
                                        Supplier Code Matching
                                    </Header>
                                }>
                                    <SpaceBetween size="l">
                                        {/* Debug Information */}
                                        <Alert type="info" header="Matching Process Status">
                                            <Box>
                                                <strong>Supplier Match Object:</strong> {bdaResult.supplier_match ? 'Present' : 'Missing'}<br />
                                                {bdaResult.supplier_match && (
                                                    <>
                                                        <strong>Vendor Name Extracted:</strong> {bdaResult.supplier_match.vendor_name_extracted ? 'Found' : 'Not Found'}<br />
                                                        <strong>Matching Attempted:</strong> {bdaResult.supplier_match.matched_supplier !== undefined ? 'Yes' : 'No'}<br />
                                                        <strong>Top Matches Count:</strong> {bdaResult.supplier_match.top_matches?.length || 0}
                                                    </>
                                                )}
                                            </Box>
                                        </Alert>

                                        {bdaResult.supplier_match ? (
                                            <>
                                                <ColumnLayout columns={2}>
                                                    <Box>
                                                        <Box variant="awsui-key-label">Extracted Vendor Name</Box>
                                                        <Box variant="p" fontSize="heading-s">
                                                            {bdaResult.supplier_match.vendor_name_extracted ? (
                                                                <Badge color="blue">{bdaResult.supplier_match.vendor_name_extracted}</Badge>
                                                            ) : (
                                                                <Badge color="red">Not found</Badge>
                                                            )}
                                                        </Box>
                                                    </Box>
                                                    <Box>
                                                        <Box variant="awsui-key-label">Best Match</Box>
                                                        <Box variant="p" fontSize="heading-s">
                                                            {bdaResult.supplier_match.matched_supplier ? (
                                                                <SpaceBetween size="xs" direction="horizontal">
                                                                    <Badge
                                                                        color={
                                                                            bdaResult.supplier_match.matched_supplier.similarity_score >= 80 ? 'green' :
                                                                                bdaResult.supplier_match.matched_supplier.similarity_score >= 60 ? 'blue' : 'grey'
                                                                        }
                                                                    >
                                                                        {bdaResult.supplier_match.matched_supplier.supplier_code}
                                                                    </Badge>
                                                                    <Badge color="grey">
                                                                        {bdaResult.supplier_match.matched_supplier.similarity_score.toFixed(1)}% match
                                                                    </Badge>
                                                                </SpaceBetween>
                                                            ) : (
                                                                <Badge color="red">No match found</Badge>
                                                            )}
                                                        </Box>
                                                    </Box>
                                                </ColumnLayout>

                                                {bdaResult.supplier_match.matched_supplier && (
                                                    <Alert type="success" header="Supplier Match Found">
                                                        <ColumnLayout columns={2}>
                                                            <Box>
                                                                <Box variant="awsui-key-label">Supplier Code</Box>
                                                                <Box variant="p" fontSize="heading-m" color="text-status-success">
                                                                    {bdaResult.supplier_match.matched_supplier.supplier_code}
                                                                </Box>
                                                            </Box>
                                                            <Box>
                                                                <Box variant="awsui-key-label">Supplier Name</Box>
                                                                <Box variant="p">
                                                                    {bdaResult.supplier_match.matched_supplier.supplier_name}
                                                                </Box>
                                                            </Box>
                                                            <Box>
                                                                <Box variant="awsui-key-label">Match Type</Box>
                                                                <Box variant="p">
                                                                    <StatusIndicator
                                                                        type={
                                                                            bdaResult.supplier_match.matched_supplier.similarity_score >= 80 ? 'success' :
                                                                                bdaResult.supplier_match.matched_supplier.similarity_score >= 60 ? 'warning' : 'error'
                                                                        }
                                                                    >
                                                                        {bdaResult.supplier_match.matched_supplier.match_type.toUpperCase()}
                                                                    </StatusIndicator>
                                                                </Box>
                                                            </Box>
                                                            <Box>
                                                                <Box variant="awsui-key-label">Similarity Score</Box>
                                                                <Box variant="p">
                                                                    {bdaResult.supplier_match.matched_supplier.similarity_score.toFixed(1)}%
                                                                </Box>
                                                            </Box>
                                                        </ColumnLayout>
                                                    </Alert>
                                                )}

                                                {!bdaResult.supplier_match.matched_supplier && bdaResult.supplier_match.vendor_name_extracted && (
                                                    <Alert type="warning" header="No Supplier Match Found">
                                                        <Box>
                                                            No suitable supplier match was found for "<strong>{bdaResult.supplier_match.vendor_name_extracted}</strong>".
                                                            This could be because:
                                                            <ul>
                                                                <li>The vendor name doesn't exist in your supplier database</li>
                                                                <li>The vendor name format is significantly different</li>
                                                                <li>The similarity threshold wasn't met (minimum 40% required)</li>
                                                            </ul>
                                                        </Box>
                                                    </Alert>
                                                )}

                                                {bdaResult.supplier_match.top_matches && bdaResult.supplier_match.top_matches.length > 0 && (
                                                    <Container header={<Header variant="h3">Top Matching Suppliers</Header>}>
                                                        <Table
                                                            columnDefinitions={[
                                                                {
                                                                    id: "rank",
                                                                    header: "Rank",
                                                                    cell: (item: SupplierMatch) => {
                                                                        const index = bdaResult.supplier_match?.top_matches?.indexOf(item) ?? -1;
                                                                        return index + 1;
                                                                    },
                                                                    width: 60
                                                                },
                                                                {
                                                                    id: "code",
                                                                    header: "Supplier Code",
                                                                    cell: (item: SupplierMatch) => (
                                                                        <Badge
                                                                            color={
                                                                                item.similarity_score >= 80 ? 'green' :
                                                                                    item.similarity_score >= 60 ? 'blue' : 'grey'
                                                                            }
                                                                        >
                                                                            {item.supplier_code}
                                                                        </Badge>
                                                                    ),
                                                                    width: 120
                                                                },
                                                                {
                                                                    id: "name",
                                                                    header: "Supplier Name",
                                                                    cell: (item: SupplierMatch) => item.supplier_name,
                                                                    width: 300
                                                                },
                                                                {
                                                                    id: "similarity",
                                                                    header: "Similarity",
                                                                    cell: (item: SupplierMatch) => `${item.similarity_score.toFixed(1)}%`,
                                                                    width: 100
                                                                },
                                                                {
                                                                    id: "match_type",
                                                                    header: "Match Type",
                                                                    cell: (item: SupplierMatch) => (
                                                                        <StatusIndicator
                                                                            type={
                                                                                item.similarity_score >= 80 ? 'success' :
                                                                                    item.similarity_score >= 60 ? 'warning' : 'error'
                                                                            }
                                                                        >
                                                                            {item.match_type.toUpperCase()}
                                                                        </StatusIndicator>
                                                                    ),
                                                                    width: 100
                                                                }
                                                            ]}
                                                            items={bdaResult.supplier_match.top_matches}
                                                            variant="embedded"
                                                            stripedRows
                                                            contentDensity="compact"
                                                            empty={
                                                                <Box textAlign="center" color="inherit">
                                                                    <b>No matching suppliers found</b>
                                                                </Box>
                                                            }
                                                        />
                                                    </Container>
                                                )}
                                            </>
                                        ) : (
                                            <Alert type="info" header="Supplier Matching Not Available">
                                                Supplier matching could not be performed. This may be because:
                                                <ul>
                                                    <li>No vendor name was extracted from the document</li>
                                                    <li>The supplier list is not available</li>
                                                    <li>There was an error during the matching process</li>
                                                </ul>
                                            </Alert>
                                        )}
                                    </SpaceBetween>
                                </Container>
                            )
                        },
                        {
                            id: "raw-json",
                            label: "Raw JSON",
                            content: (
                                <Container header={<Header variant="h3">Raw BDA Response</Header>}>
                                    <Box>
                                        <pre style={{
                                            backgroundColor: '#f8f9fa',
                                            padding: '16px',
                                            borderRadius: '4px',
                                            overflow: 'auto',
                                            fontSize: '14px',
                                            lineHeight: '1.4',
                                            maxHeight: '400px'
                                        }}>
                                            {JSON.stringify(bdaResult, null, 2)}
                                        </pre>
                                    </Box>
                                </Container>
                            )
                        }
                    ]}
                />

                <Container header={<Header variant="h3">Next Steps</Header>}>
                    <SpaceBetween size="s">
                        <Box variant="p">
                            <strong>1. Verify the extracted data</strong> - Check the CSV format view above to ensure all important fields were captured correctly.
                        </Box>
                        <Box variant="p">
                            <strong>2. Review supplier matching</strong> - Check the supplier matching tab to verify the matched supplier code is correct.
                        </Box>
                        <Box variant="p">
                            <strong>3. Validate vendor information</strong> - Cross-reference vendor details with your master vendor list for accuracy.
                        </Box>
                        <Box variant="p">
                            <strong>4. Process the data</strong> - Use the extracted information for your accounting or ERP system integration.
                        </Box>
                    </SpaceBetween>
                </Container>
            </SpaceBetween>
        </Modal>
    );
};
