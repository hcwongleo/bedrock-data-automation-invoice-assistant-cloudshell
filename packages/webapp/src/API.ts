/* tslint:disable */
/* eslint-disable */
// REST API Types for Bedrock Agentic Invoice Assistant

/**
 * Common API Response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Lambda Resolver Request/Response types
 */
export interface LambdaResolverRequest {
  args: string;
}

export interface LambdaResolverResponse {
  result: string;
  timestamp: string;
}

/**
 * Test API Request/Response types
 */
export interface TestApiRequest {
  message: string;
}

export interface TestApiResponse {
  message: string;
  timestamp: string;
  requestId: string;
}

/**
 * BDA (Bedrock Data Automation) related types
 */
export interface BDAProcessRequest {
  documentPath: string;
  documentType?: string;
  userId: string;
}

export interface BDAProcessResponse {
  jobId: string;
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  documentPath: string;
  resultPath?: string;
  error?: string;
}

/**
 * File Upload related types
 */
export interface FileUploadRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  userId: string;
}

export interface FileUploadResponse {
  uploadUrl: string;
  fileKey: string;
  expiresIn: number;
}

/**
 * Supplier Management types
 */
export interface SupplierData {
  id: string;
  name: string;
  code?: string;
  address?: string;
  contactInfo?: string;
  category?: string;
}

export interface SupplierListRequest {
  suppliers: SupplierData[];
  userId: string;
}

export interface SupplierListResponse {
  success: boolean;
  suppliersProcessed: number;
  errors?: string[];
}

/**
 * Document Processing types
 */
export interface DocumentProcessingStatus {
  documentId: string;
  status: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  fileName: string;
  uploadTime: string;
  completionTime?: string;
  resultData?: any;
  errorMessage?: string;
}

export interface ProcessingStatusRequest {
  documentIds: string[];
  userId: string;
}

export interface ProcessingStatusResponse {
  documents: DocumentProcessingStatus[];
}

/**
 * Error types
 */
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

/**
 * Authentication types
 */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  email?: string;
  groups?: string[];
}

/**
 * Generic pagination types
 */
export interface PaginationRequest {
  limit?: number;
  nextToken?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  total?: number;
}

/**
 * Health check types
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    [serviceName: string]: 'up' | 'down';
  };
}

export default {
  // Export all types for easy importing
};
