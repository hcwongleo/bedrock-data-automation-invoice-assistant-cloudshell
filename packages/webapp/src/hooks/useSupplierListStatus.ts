import { useQuery } from "@tanstack/react-query";
import { downloadData } from 'aws-amplify/storage';
import { QUERY_KEYS } from "../utils/types";

export interface SupplierListStatus {
    exists: boolean;
    isValid: boolean;
    recordCount?: number;
    lastModified?: Date;
    error?: string;
}

const checkSupplierListStatus = async (): Promise<SupplierListStatus> => {
    try {
        console.log('Checking for existing supplier list in S3...');
        
        // Try to download the supplier list file
        const downloadResult = await downloadData({ 
            path: 'SupplierList.csv' 
        }).result;
        
        const csvContent = await downloadResult.body.text();
        console.log('Found supplier list file, checking content...');
        
        // Check if it's the placeholder/sample file
        if (csvContent.startsWith('# Sample Supplier List Format') || csvContent.trim().length === 0) {
            console.log('Found placeholder file, no valid supplier list');
            return {
                exists: false,
                isValid: false,
                error: 'Only placeholder file found'
            };
        }
        
        // Parse CSV to count records
        const lines = csvContent.split('\n').filter(line => line.trim());
        const recordCount = Math.max(0, lines.length - 1); // Subtract header row
        
        console.log(`Valid supplier list found with ${recordCount} records`);
        
        return {
            exists: true,
            isValid: true,
            recordCount,
            lastModified: new Date() // S3 metadata would be better, but this works
        };
        
    } catch (error) {
        console.log('No supplier list found in S3:', error);
        return {
            exists: false,
            isValid: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

export const useSupplierListStatus = () => {
    return useQuery({
        queryKey: [QUERY_KEYS.SUPPLIER_LIST_STATUS],
        queryFn: checkSupplierListStatus,
        staleTime: 30000, // Cache for 30 seconds
        refetchOnMount: true,
        refetchOnWindowFocus: true,
    });
};