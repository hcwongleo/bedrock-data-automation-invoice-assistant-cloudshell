import { BDAResult } from '../hooks/useBDAResults';
import { extractAllBDAFields, formatFieldHeader } from './bdaFieldExtractor';

export interface EnhancedBDAResult extends BDAResult {
    fileName?: string;
    processedDate?: string;
}

// Helper function to extract field value from nested object
const extractFieldValue = (obj: any, key: string): string | null => {
    if (!obj) return null;
    
    // Direct property access
    if (obj[key]) {
        return typeof obj[key] === 'object' && obj[key].value ? obj[key].value : String(obj[key]);
    }
    
    // Check in fields object
    if (obj.fields && obj.fields[key]) {
        const field = obj.fields[key];
        return typeof field === 'object' && field.value ? field.value : String(field);
    }
    
    // Check in nested structures
    for (const [objKey, objValue] of Object.entries(obj)) {
        if (typeof objValue === 'object' && objValue !== null) {
            const nestedValue = extractFieldValue(objValue, key);
            if (nestedValue) return nestedValue;
        }
    }
    
    return null;
};

// Generate CSV content from BDA results
export const generateCSVFromBDAResults = (results: EnhancedBDAResult[]): string => {
    if (results.length === 0) {
        return 'No data available';
    }
    
    // Discover all unique fields across all results
    const allFieldsSet = new Set<string>();
    const processedResults = results.map(result => {
        const bdaFields = extractAllBDAFields(result.inference_result);
        const supplierMatch = result.supplier_match;
        
        // Add all BDA fields
        Object.keys(bdaFields).forEach(field => allFieldsSet.add(field));
        
        // Add supplier matching fields (only the ones we want)
        if (supplierMatch?.matched_supplier) {
            allFieldsSet.add('matched_supplier_code');
            allFieldsSet.add('matched_supplier_name');
        }
        if (supplierMatch?.vendor_name_extracted) {
            allFieldsSet.add('vendor_name_extracted');
        }
        
        return { bdaFields, supplierMatch };
    });
    
    // Convert to sorted array and create headers
    const allFields = Array.from(allFieldsSet).sort();
    const headers = allFields.map(field => formatFieldHeader(field));
    
    // Generate CSV rows
    const rows = processedResults.map(({ bdaFields, supplierMatch }) => {
        return allFields.map(field => {
            // Handle supplier matching fields
            if (field === 'matched_supplier_code') {
                return supplierMatch?.matched_supplier?.supplier_code || '';
            }
            if (field === 'matched_supplier_name') {
                return supplierMatch?.matched_supplier?.supplier_name || '';
            }
            if (field === 'vendor_name_extracted') {
                return supplierMatch?.vendor_name_extracted || '';
            }
            
            // Handle BDA fields
            return bdaFields[field] || '';
        });
    });
    
    // Combine headers and rows
    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    
    return csvContent;
};

// Download CSV file
export const downloadCSV = (csvContent: string, filename: string = 'bda-results-with-suppliers.csv'): void => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

// Generate enhanced BDA result with supplier data appended
export const enhanceBDAResultForExport = (
    result: BDAResult, 
    fileName: string, 
    processedDate?: string
): EnhancedBDAResult => {
    const enhanced: EnhancedBDAResult = {
        ...result,
        fileName,
        processedDate: processedDate || new Date().toISOString().split('T')[0]
    };
    
    // Ensure supplier matching data is properly structured
    if (result.supplier_match?.matched_supplier) {
        // Add supplier code to the main inference result for easy access
        if (enhanced.inference_result) {
            enhanced.inference_result.matched_supplier_code = result.supplier_match.matched_supplier.supplier_code;
            enhanced.inference_result.matched_supplier_name = result.supplier_match.matched_supplier.supplier_name;
            enhanced.inference_result.supplier_match_type = result.supplier_match.matched_supplier.match_type;
            enhanced.inference_result.supplier_match_similarity = result.supplier_match.matched_supplier.similarity_score;
        }
    }
    
    return enhanced;
};
