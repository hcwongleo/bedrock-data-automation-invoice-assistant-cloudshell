import { useQuery } from "@tanstack/react-query";
import { downloadData, list } from 'aws-amplify/storage';
import { QUERY_KEYS } from "../utils/types";
import { supplierMatchingService, SupplierMatch } from "../services/supplierMatchingService";

export interface BDAResult {
    matched_blueprint?: {
        arn?: string;
        name?: string;
        confidence?: number;
    };
    document_class?: {
        type?: string;
    };
    inference_result?: any;
    // Enhanced with supplier matching from Lambda
    supplier_match?: {
        matched_supplier?: SupplierMatch;
        top_matches?: SupplierMatch[];
        vendor_name_extracted?: string;
    };
}

export interface BDAResultFile {
    fileName: string;
    path: string;
    lastModified?: Date;
    result?: BDAResult;
}

// Cache for enhanced results to avoid redundant API calls
const enhancedResultsCache = new Map<string, { result: BDAResult; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const fetchBDAResults = async (): Promise<BDAResultFile[]> => {
    try {
        // List all files in the bda-result folder
        const result = await list({
            path: 'bda-result/',
            options: {
                listAll: true
            }
        });

        if (!result.items) {
            return [];
        }

        // Filter for JSON result files
        const resultFiles = result.items.filter(item => 
            item.path && item.path.endsWith('-result.json')
        );

        // Fetch the content of each result file and enhance with supplier matching
        const bdaResults = await Promise.all(
            resultFiles.map(async (item) => {
                try {
                    const downloadResult = await downloadData({ 
                        path: item.path! 
                    }).result;
                    
                    const text = await downloadResult.body.text();
                    const jsonResult = JSON.parse(text) as BDAResult;
                    
                    // Create cache key based on file path and last modified time
                    const cacheKey = `${item.path}_${item.lastModified?.getTime() || 0}`;
                    const now = Date.now();
                    
                    // Check if we have a cached enhanced result
                    const cached = enhancedResultsCache.get(cacheKey);
                    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
                        console.log(`Using cached supplier match for ${item.path}`);
                        return {
                            fileName: item.path!.split('/').pop() || '',
                            path: item.path!,
                            lastModified: item.lastModified,
                            result: cached.result
                        };
                    }
                    
                    // Only call supplier matching API if not cached
                    console.log(`Fetching fresh supplier match for ${item.path}`);
                    const enhancedResult = await supplierMatchingService.enhanceBDAResult(jsonResult);
                    
                    // Cache the enhanced result
                    enhancedResultsCache.set(cacheKey, {
                        result: enhancedResult,
                        timestamp: now
                    });
                    
                    return {
                        fileName: item.path!.split('/').pop() || '',
                        path: item.path!,
                        lastModified: item.lastModified,
                        result: enhancedResult
                    };
                } catch (error) {
                    console.error(`Error fetching BDA result for ${item.path}:`, error);
                    return {
                        fileName: item.path!.split('/').pop() || '',
                        path: item.path!,
                        lastModified: item.lastModified,
                        result: undefined
                    };
                }
            })
        );

        return bdaResults;
    } catch (error) {
        console.error('Error fetching BDA results:', error);
        return [];
    }
};

export const useBDAResults = () => {
    return useQuery({
        queryKey: [QUERY_KEYS.BDA_RESULTS],
        queryFn: fetchBDAResults,
        refetchInterval: false, // No automatic polling - controlled by smart polling hook
        staleTime: 1000,
        enabled: true,
    });
};

// Helper function to match uploaded file with BDA result - only returns results created after upload time
export const findBDAResultForFile = (fileName: string, bdaResults: BDAResultFile[], uploadTime?: Date): BDAResult | undefined => {
    // Extract base name without extension and timestamp
    const baseName = fileName.replace(/^\d+_/, '').split('.')[0];
    const normalizedBaseName = baseName.replace(/_/g, '-');
    
    // Filter results that match the filename and were created after upload time
    const matchingResults = bdaResults
        .filter(result => {
            const resultBaseName = result.fileName.replace('-result.json', '');
            const filenameMatches = resultBaseName.includes(normalizedBaseName);
            
            // If we have an upload time, only include results created after the upload
            if (uploadTime && result.lastModified) {
                const resultTime = new Date(result.lastModified).getTime();
                const uploadTimeMs = new Date(uploadTime).getTime();
                return filenameMatches && resultTime > uploadTimeMs;
            }
            
            return filenameMatches;
        })
        .sort((a, b) => {
            if (!a.lastModified || !b.lastModified) return 0;
            return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
        });
    
    // Return the most recent result that was created after upload
    return matchingResults[0]?.result;
};
