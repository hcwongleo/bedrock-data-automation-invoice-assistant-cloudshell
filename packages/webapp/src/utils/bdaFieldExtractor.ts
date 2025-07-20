/**
 * Dynamic BDA Field Extraction Utility
 * 
 * This utility provides centralized, dynamic field extraction from BDA inference results.
 * It automatically discovers fields without hardcoded mappings, making the system
 * adaptable to changes in BDA project schemas.
 */

// Fields to exclude from processing
const EXCLUDED_FIELD_PATTERNS = [
    'confidence',
    'similarity', 
    'score',
    'match_type',
    'alternatives',
    'top_matches'
];

// Common vendor name field variations to look for
// Prioritize "Vendor" to match our custom blueprint
const VENDOR_NAME_FIELD_PATTERNS = [
    'vendor',           // Our custom blueprint field
    'vendorname',
    'vendor_name',
    'supplier_name', 
    'company_name',
    'from',
    'bill_from',
    'seller',
    'seller_name'
];

/**
 * Check if a field should be excluded from processing
 */
export const shouldExcludeField = (fieldName: string): boolean => {
    const lowerFieldName = fieldName.toLowerCase();
    return EXCLUDED_FIELD_PATTERNS.some(pattern => lowerFieldName.includes(pattern));
};

/**
 * Convert field name to human-readable header
 */
export const formatFieldHeader = (fieldName: string): string => {
    return fieldName
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/_/g, ' ') // Replace underscores with spaces
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

/**
 * Extract field value from nested object structure
 */
export const extractFieldValue = (obj: any, key: string): string | null => {
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

/**
 * Dynamically extract all fields from BDA inference result
 */
export const extractAllBDAFields = (inferenceResult: any): Record<string, any> => {
    const fields: Record<string, any> = {};
    
    if (!inferenceResult) return fields;
    
    // Recursively extract all fields from the object
    const extractFromObject = (obj: any, prefix: string = '') => {
        if (!obj || typeof obj !== 'object') return;
        
        Object.entries(obj).forEach(([key, value]) => {
            const fullKey = prefix ? `${prefix}_${key}` : key;
            
            // Skip excluded fields
            if (shouldExcludeField(fullKey)) return;
            
            if (value && typeof value === 'object') {
                // If it has a 'value' property, extract that
                if ('value' in value) {
                    fields[fullKey] = value.value;
                }
                // If it's an array, convert to string
                else if (Array.isArray(value)) {
                    fields[fullKey] = value.join(', ');
                }
                // If it's a nested object, recurse (but limit depth to avoid infinite loops)
                else if (prefix.split('_').length < 3) {
                    extractFromObject(value, fullKey);
                }
                // Otherwise convert to string
                else {
                    fields[fullKey] = JSON.stringify(value);
                }
            } else {
                // Simple value - use directly
                fields[fullKey] = value;
            }
        });
    };
    
    extractFromObject(inferenceResult);
    return fields;
};

/**
 * Dynamically extract vendor name from BDA inference result
 * Looks for common vendor name field patterns without hardcoding specific field names
 */
export const extractVendorName = (inferenceResult: any): string | null => {
    if (!inferenceResult) return null;
    
    // Get all fields from the inference result
    const allFields = extractAllBDAFields(inferenceResult);
    
    // Look for vendor name fields using pattern matching
    for (const fieldName of Object.keys(allFields)) {
        const lowerFieldName = fieldName.toLowerCase();
        
        // Check if this field matches any vendor name pattern
        const isVendorField = VENDOR_NAME_FIELD_PATTERNS.some(pattern => 
            lowerFieldName.includes(pattern)
        );
        
        if (isVendorField && allFields[fieldName]) {
            return String(allFields[fieldName]);
        }
    }
    
    // Fallback: try direct field access with common patterns
    for (const pattern of VENDOR_NAME_FIELD_PATTERNS) {
        const value = extractFieldValue(inferenceResult, pattern);
        if (value) return value;
        
        // Also try uppercase version
        const upperValue = extractFieldValue(inferenceResult, pattern.toUpperCase());
        if (upperValue) return upperValue;
    }
    
    return null;
};

/**
 * Convert BDA result to flat key-value pairs for display
 * Used by components that need to show all extracted data
 */
export const flattenBDAResult = (bdaResult: any, prefix = ''): Array<{field: string, value: any, source: string}> => {
    const flattened: Array<{field: string, value: any, source: string}> = [];
    
    if (!bdaResult) return flattened;
    
    const processObject = (obj: any, currentPrefix: string, source: string) => {
        if (!obj || typeof obj !== 'object') return;
        
        Object.entries(obj).forEach(([key, value]) => {
            const fieldName = currentPrefix ? `${currentPrefix}.${key}` : key;
            
            // Skip excluded fields
            if (shouldExcludeField(fieldName)) return;
            
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Recursively process nested objects
                processObject(value, fieldName, source);
            } else if (Array.isArray(value)) {
                // Handle arrays
                if (value.length === 0) {
                    flattened.push({ field: fieldName, value: '[]', source });
                } else {
                    value.forEach((item, index) => {
                        if (typeof item === 'object') {
                            processObject(item, `${fieldName}[${index}]`, source);
                        } else {
                            flattened.push({ 
                                field: `${fieldName}[${index}]`, 
                                value: String(item), 
                                source 
                            });
                        }
                    });
                }
            } else {
                // Simple field
                let stringValue = '';
                if (value !== null && value !== undefined) {
                    if (typeof value === 'boolean') {
                        stringValue = value ? 'true' : 'false';
                    } else if (typeof value === 'number') {
                        stringValue = value.toString();
                    } else {
                        stringValue = String(value);
                    }
                }
                flattened.push({ field: fieldName, value: stringValue, source });
            }
        });
    };
    
    // Process inference result
    if (bdaResult.inference_result) {
        processObject(bdaResult.inference_result, 'invoice', 'BDA');
    }
    
    // Add document metadata
    if (bdaResult.document_class) {
        flattened.push({
            field: 'document_class',
            value: String(bdaResult.document_class.type || ''),
            source: 'BDA'
        });
    }
    
    if (bdaResult.matched_blueprint) {
        flattened.push({
            field: 'matched_blueprint',
            value: String(bdaResult.matched_blueprint.name || ''),
            source: 'BDA'
        });
    }
    
    return flattened;
};

/**
 * Get all unique field names from a collection of BDA results
 * Useful for generating dynamic table headers or CSV columns
 */
export const getAllFieldNames = (bdaResults: any[]): string[] => {
    const fieldSet = new Set<string>();
    
    bdaResults.forEach(result => {
        const fields = extractAllBDAFields(result.inference_result);
        Object.keys(fields).forEach(field => fieldSet.add(field));
    });
    
    return Array.from(fieldSet).sort();
};