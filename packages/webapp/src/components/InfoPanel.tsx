import { 
    HelpPanel, 
    TextContent, 
    Box, 
    SpaceBetween,
    Container,
    Header
} from "@cloudscape-design/components";

export const InfoPanel = () => {
    const features = [
        {
            title: "Document Processing",
            description: "Automated invoice processing with data extraction and validation."
        },
        {
            title: "Multi-Format Support",
            description: "Supports PDF files and image formats for flexible document handling."
        },
        {
            title: "Data Extraction",
            description: "Uses Amazon Bedrock Data Automation to extract key information from invoices."
        },
        {
            title: "Real-time Status",
            description: "Real-time processing status updates and monitoring."
        },
        {
            title: "Vendor Identification",
            description: "Automatically recognizes and categorizes suppliers from invoice documents."
        },
        {
            title: "Results Visualization",
            description: "Interactive interface to view and analyze extracted data."
        },
        {
            title: "Secure Storage",
            description: "Secure document storage with data privacy and compliance."
        }
    ];

    const architecture = [
        {
            component: "Amazon API Gateway (REST API)",
            purpose: "RESTful API endpoints for document processing and data management"
        },
        {
            component: "Amazon Bedrock Data Automation",
            purpose: "Automated data extraction from invoice documents"
        },
        {
            component: "Amazon Bedrock Multi-Agent System",
            purpose: "Document verification and vendor identification"
        },
        {
            component: "AWS Lambda",
            purpose: "Serverless compute for processing workflows and API handlers"
        },
        {
            component: "Amazon S3",
            purpose: "Secure document storage and management"
        },
        {
            component: "Amazon CloudFront",
            purpose: "Content delivery and web application hosting"
        },
        {
            component: "Amazon Cognito",
            purpose: "User authentication and access control"
        }
    ];

    return (
        <HelpPanel
            footer={
                <TextContent>
                    <h3>Learn more</h3>
                    <ul>
                        <li>
                            <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html">
                                Amazon API Gateway REST API
                            </a>
                        </li>
                        <li>
                            <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/bda.html">
                                Amazon Bedrock Data Automation
                            </a>
                        </li>
                        <li>
                            <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/agents-multi-agent-collaboration.html">
                                Amazon Bedrock Multi-Agent Collaboration
                            </a>
                        </li>
                        <li>
                            <a href="https://aws.amazon.com/bedrock/">
                                Amazon Bedrock Overview
                            </a>
                        </li>
                    </ul>
                </TextContent>
            }
            header={<h2>Document Processing Assistant</h2>}
        >
            <TextContent>
                <SpaceBetween size="l">
                    <Box>
                        <h3>Solution Overview</h3>
                        <Box variant="p" color="text-body-secondary">
                            Upload invoice documents and view extraction results. Supports PDFs and images with real-time processing status.
                        </Box>
                    </Box>

                    <Container header={<Header variant="h3">Key Features</Header>}>
                        <SpaceBetween size="m">
                            {features.map((feature, index) => (
                                <Box key={index}>
                                    <Box variant="strong">{feature.title}</Box>
                                    <Box variant="p" color="text-body-secondary" padding={{ top: 'xs' }}>
                                        {feature.description}
                                    </Box>
                                </Box>
                            ))}
                        </SpaceBetween>
                    </Container>

                    <Container header={<Header variant="h3">Architecture Components</Header>}>
                        <SpaceBetween size="m">
                            {architecture.map((item, index) => (
                                <Box key={index}>
                                    <Box variant="strong">• {item.component}</Box>
                                    <Box variant="p" color="text-body-secondary" padding={{ left: 'l', top: 'xs' }}>
                                        {item.purpose}
                                    </Box>
                                </Box>
                            ))}
                        </SpaceBetween>
                    </Container>

                    <Container header={<Header variant="h3">Cost Estimation</Header>}>
                        <Box variant="p" color="text-body-secondary">
                            <strong>Approximate monthly cost:</strong> $226 for processing 1,000 pages with 28,800 requests (us-east-1 region)
                        </Box>
                        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>
                            Major cost components include Amazon Bedrock Data Automation ($40), 
                            Bedrock Agent with Claude Sonnet 3.5 v2 ($173), and supporting AWS services.
                        </Box>
                    </Container>

                    <Container header={<Header variant="h3">Getting Started</Header>}>
                        <SpaceBetween size="s">
                            <Box variant="p">
                                <strong>1. Upload Documents:</strong> Drag and drop invoice files or click to browse
                            </Box>
                            <Box variant="p">
                                <strong>2. Monitor Processing:</strong> Watch real-time processing status
                            </Box>
                            <Box variant="p">
                                <strong>3. View Results:</strong> Click "View Results" to see extracted data
                            </Box>
                            <Box variant="p">
                                <strong>4. Process Multiple Files:</strong> Upload and process multiple documents simultaneously
                            </Box>
                        </SpaceBetween>
                    </Container>
                </SpaceBetween>
            </TextContent>
        </HelpPanel>
    );
};