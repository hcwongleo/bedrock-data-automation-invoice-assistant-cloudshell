import { post } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { extractVendorName } from '../utils/bdaFieldExtractor';

export interface SupplierMatch {
    supplier_code: string;
    supplier_name: string;
    similarity_score: number;
    match_type: string;
    vendor_name_extracted?: string;
}

export interface SupplierMatchResult {
    vendor: string;  // Changed from vendor_name to vendor to match blueprint
    best_match: SupplierMatch | null;
    top_matches: SupplierMatch[];
}

export interface EnhancedBDAResult {
    supplier_match: {
        vendor_name_extracted: string;
        matched_supplier: SupplierMatch | null;
        top_matches: SupplierMatch[];
    };
}

class SupplierMatchingService {
    private apiName = 'rest-api'; // Match the API name configured in App.tsx

    /**
     * Match a single vendor name against supplier database
     */
    async matchVendor(vendorName: string): Promise<SupplierMatchResult> {
        try {
            console.log('Matching vendor via Lambda:', vendorName);
            console.log('API Gateway URL:', `${this.apiName}/supplier-match`);

            // Validate vendor name
            if (!vendorName || vendorName.trim() === '') {
                console.error('Vendor name is empty or null');
                return {
                    vendor: vendorName,
                    best_match: null,
                    top_matches: []
                };
            }

            const requestBody = {
                request_type: 'match_vendor',
                vendor: vendorName.trim(),  // Changed from vendor_name to vendor
                bucket_name: 'data-bucket-761018861641-us-east-1' // Add bucket name explicitly
            };

            console.log('Request body:', JSON.stringify(requestBody, null, 2));

            const response = await post({
                apiName: this.apiName,
                path: '/supplier-match',
                options: {
                    headers: {
                        Authorization: (await fetchAuthSession()).tokens?.idToken?.toString() ?? '',
                        'Content-Type': 'application/json'
                    },
                    body: requestBody
                }
            }).response;

            console.log('API Response status:', response.statusCode);
            console.log('API Response headers:', Object.keys(response.headers || {}));

            const responseBody = await response.body.json();
            console.log('Raw API response:', responseBody);

            // Check if there's an error in the response
            if (responseBody && typeof responseBody === 'object' && 'error' in responseBody) {
                console.error('API returned error:', responseBody.error);
                throw new Error(String(responseBody.error));
            }

            const result = responseBody as unknown as SupplierMatchResult;
            console.log('Lambda match result:', result);

            return result;
        } catch (error: any) {
            console.error('Error matching vendor:', error);
            console.error('Error details:', {
                message: error?.message || 'Unknown error',
                stack: error?.stack || 'No stack trace',
                name: error?.name || 'Unknown error type'
            });

            return {
                vendor: vendorName,
                best_match: null,
                top_matches: []
            };
        }
    }

    /**
     * Enhance BDA result with supplier matching via Lambda
     */
    async enhanceBDAResult(bdaResult: any): Promise<any> {
        try {
            console.log('Enhancing BDA result via Lambda');
            console.log('BDA result keys:', Object.keys(bdaResult));

            // Extract vendor name from BDA result using dynamic extraction
            const vendorName = extractVendorName(bdaResult?.inference_result) || '';
            console.log('Extracted vendor name:', vendorName);

            const requestBody = {
                request_type: 'enhance_bda_result',
                bda_result: bdaResult,
                vendor: vendorName, // Changed from vendor_name to vendor
                bucket_name: 'data-bucket-761018861641-us-east-1' // Add bucket name explicitly
            };

            console.log('Request body structure:', {
                request_type: requestBody.request_type,
                bucket_name: requestBody.bucket_name,
                vendor: requestBody.vendor,
                bda_result_keys: Object.keys(bdaResult),
                vendor_in_bda: vendorName
            });

            const response = await post({
                apiName: this.apiName,
                path: '/supplier-match',
                options: {
                    headers: {
                        Authorization: (await fetchAuthSession()).tokens?.idToken?.toString() ?? '',
                        'Content-Type': 'application/json'
                    },
                    body: requestBody
                }
            }).response;

            console.log('Enhance API Response status:', response.statusCode);

            const responseBody = await response.body.json();
            const responseData = responseBody as any;

            console.log('Raw enhance response:', responseData);

            // Check if there's an error in the response
            if (responseData && responseData.error) {
                console.error('API returned error:', responseData.error);
                // If no vendor found, return original result with empty supplier match
                if (responseData.error.includes('vendor') || !vendorName) {
                    console.warn('No vendor found in BDA result, returning original with empty supplier match');
                    return {
                        ...bdaResult,
                        supplier_match: {
                            vendor_name_extracted: vendorName,  // Keep this for backward compatibility
                            matched_supplier: null,
                            top_matches: []
                        }
                    };
                }
                throw new Error(responseData.error);
            }

            if (responseData && responseData.enhanced_result) {
                console.log('Enhanced BDA result:', responseData.enhanced_result);
                return responseData.enhanced_result;
            } else {
                console.warn('No enhanced_result in response, using original');
                return {
                    ...bdaResult,
                    supplier_match: {
                        vendor_name_extracted: vendorName,
                        matched_supplier: null,
                        top_matches: []
                    }
                };
            }
        } catch (error: any) {
            console.error('Error enhancing BDA result:', error);
            console.error('Error details:', {
                message: error?.message || 'Unknown error',
                stack: error?.stack || 'No stack trace',
                name: error?.name || 'Unknown error type'
            });

            // Extract vendor name for fallback using dynamic extraction
            const vendorName = extractVendorName(bdaResult?.inference_result) || '';

            // Return original result with empty supplier match on error
            return {
                ...bdaResult,
                supplier_match: {
                    vendor_name_extracted: vendorName,
                    matched_supplier: null,
                    top_matches: []
                }
            };
        }
    }

    /**
     * Test if supplier matching service is available
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.matchVendor('Test Company Ltd');
            return true;
        } catch (error) {
            console.error('Supplier matching service unavailable:', error);
            return false;
        }
    }
}

// Export singleton instance
export const supplierMatchingService = new SupplierMatchingService();
