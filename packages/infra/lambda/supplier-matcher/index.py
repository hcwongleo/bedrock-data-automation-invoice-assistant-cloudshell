import json
import boto3
import csv
import io
import os
import traceback
from typing import List, Dict, Optional, Tuple
from thefuzz import fuzz, process
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')

class SupplierMatcher:
    def __init__(self):
        self.suppliers = []
        self.supplier_names = []
        
    def load_suppliers_from_s3(self, bucket: str, key: str = 'SupplierList.csv') -> bool:
        """Load supplier list from S3 CSV file"""
        try:
            logger.info(f"Loading suppliers from s3://{bucket}/{key}")
            
            # Download CSV from S3
            response = s3_client.get_object(Bucket=bucket, Key=key)
            csv_content = response['Body'].read().decode('utf-8')
            
            # Check if it's the placeholder file
            if csv_content.startswith('# Sample Supplier List Format'):
                logger.warning("No supplier list uploaded yet")
                return False
            
            # Parse CSV
            csv_reader = csv.reader(io.StringIO(csv_content))
            
            # Skip header row explicitly
            try:
                headers = next(csv_reader)
                logger.info(f"CSV headers detected and skipped: {headers}")
            except StopIteration:
                logger.error("CSV file is empty")
                return False
            
            self.suppliers = []
            self.supplier_names = []
            row_count = 0
            
            for row_num, row in enumerate(csv_reader, start=2):  # Start from row 2 (after header)
                # Skip empty rows and rows that don't have enough data
                if len(row) < 2:
                    logger.info(f"Skipping row {row_num}: not enough columns - {row}")
                    continue
                    
                # Clean and check first two columns
                supplier_code = row[0].strip() if row[0] else ''
                supplier_name = row[1].strip() if row[1] else ''
                
                if not supplier_code or not supplier_name:
                    logger.info(f"Skipping row {row_num}: empty supplier code or name - {row}")
                    continue
                
                # Skip header-like rows (in case there are multiple headers)
                if supplier_code.lower() in ['supplier', 'supplier_code', 'code'] or supplier_name.lower() in ['name', 'supplier_name', 'name 1']:
                    logger.info(f"Skipping header-like row {row_num}: {row}")
                    continue
                    
                supplier_record = {
                    'supplier_code': supplier_code,
                    'name_1': supplier_name,
                    'name_2': row[2].strip() if len(row) > 2 and row[2] else '',
                    'group_1': row[3].strip() if len(row) > 3 and row[3] else '',
                    'group_2': row[4].strip() if len(row) > 4 and row[4] else '',
                    'cr_1': row[5].strip() if len(row) > 5 and row[5] else '',
                    'cr_2': row[6].strip() if len(row) > 6 and row[6] else '',
                    'aws_vendor': row[7].strip() if len(row) > 7 and row[7] else ''
                }
                
                # Create combined name for matching
                combined_name = supplier_record['name_1']
                if supplier_record['name_2']:
                    combined_name += ' ' + supplier_record['name_2']
                
                supplier_record['combined_name'] = combined_name
                self.suppliers.append(supplier_record)
                self.supplier_names.append(combined_name)
                row_count += 1
                
                logger.info(f"Added supplier {row_count}: {supplier_code} - {combined_name}")
            
            logger.info(f"Successfully loaded {len(self.suppliers)} suppliers (header row excluded)")
            return True
            
        except Exception as e:
            logger.error(f"Error loading suppliers: {str(e)}")
            return False
    
    def find_best_match(self, vendor_name: str, threshold: int = 60) -> Optional[Dict]:
        """Find best supplier match using thefuzz"""
        if not vendor_name or not self.supplier_names:
            return None
        
        logger.info(f"Finding match for vendor: {vendor_name}")
        
        # Use thefuzz to find best match
        best_match = process.extractOne(
            vendor_name, 
            self.supplier_names,
            scorer=fuzz.token_sort_ratio  # Good for company names with different word orders
        )
        
        if best_match and best_match[1] >= threshold:
            matched_name, score = best_match
            
            # Find the supplier record
            supplier_record = next(
                (s for s in self.suppliers if s['combined_name'] == matched_name), 
                None
            )
            
            if supplier_record:
                result = {
                    'supplier_code': supplier_record['supplier_code'],
                    'supplier_name': supplier_record['combined_name'],
                    'similarity_score': score,
                    'match_type': 'fuzzy',
                    'vendor_name_extracted': vendor_name
                }
                
                logger.info(f"Match found: {supplier_record['supplier_code']} ({score}%)")
                return result
        
        logger.info(f"No match found for: {vendor_name}")
        return None
    
    def find_top_matches(self, vendor_name: str, limit: int = 3, threshold: int = 50) -> List[Dict]:
        """Find top N supplier matches"""
        if not vendor_name or not self.supplier_names:
            return []
        
        # Get top matches
        top_matches = process.extract(
            vendor_name,
            self.supplier_names,
            scorer=fuzz.token_sort_ratio,
            limit=limit
        )
        
        results = []
        for matched_name, score in top_matches:
            if score >= threshold:
                supplier_record = next(
                    (s for s in self.suppliers if s['combined_name'] == matched_name),
                    None
                )
                
                if supplier_record:
                    results.append({
                        'supplier_code': supplier_record['supplier_code'],
                        'supplier_name': supplier_record['combined_name'],
                        'similarity_score': score,
                        'match_type': 'fuzzy'
                    })
        
        return results

def extract_vendor_name(inference_result: Dict) -> Optional[str]:
    """Extract vendor name from BDA inference result"""
    if not inference_result:
        return None
    
    # Common field names where vendor information might be stored (including uppercase variants)
    # Prioritize "Vendor" to match our custom blueprint
    vendor_fields = [
        'Vendor', 'VENDOR',  # Our custom blueprint field (prioritized)
        'VENDORNAME', 'VENDOR_NAME', 'SUPPLIER_NAME', 'COMPANY_NAME', 'FROM', 'BILL_FROM',
        'SELLER', 'SUPPLIER', 'INVOICE_FROM', 'BILLED_BY', 'REMIT_TO',
        'vendor_name', 'supplier_name', 'company_name', 'from', 'bill_from',
        'seller', 'vendor', 'supplier', 'invoice_from', 'billed_by', 'remit_to'
    ]
    
    def get_field_value(field_data):
        """Extract value from various field formats"""
        if isinstance(field_data, str):
            return field_data.strip()
        elif isinstance(field_data, dict):
            if 'value' in field_data:
                return str(field_data['value']).strip()
            elif 'text' in field_data:
                return str(field_data['text']).strip()
        return None
    
    # Check direct fields
    for field in vendor_fields:
        if field in inference_result:
            value = get_field_value(inference_result[field])
            if value:
                return value
    
    # Check nested fields
    if 'fields' in inference_result:
        for field in vendor_fields:
            if field in inference_result['fields']:
                value = get_field_value(inference_result['fields'][field])
                if value:
                    return value
    
    return None

def lambda_handler(event, context):
    """Lambda handler for supplier matching"""
    try:
        logger.info(f"Received event: {json.dumps(event)}")
        
        # Handle different event formats (direct invocation vs API Gateway)
        if 'body' in event:
            # API Gateway format
            if isinstance(event['body'], str):
                body = json.loads(event['body'])
            else:
                body = event['body']
            logger.info(f"Parsed body from API Gateway: {json.dumps(body)}")
        else:
            # Direct invocation format
            body = event
            logger.info(f"Direct invocation body: {json.dumps(body)}")
        
        # Get bucket name from multiple sources
        bucket_name = (
            body.get('bucket_name') or 
            event.get('bucket_name') or 
            os.environ.get('BUCKET_NAME') or 
            'data-bucket-761018861641-us-east-1'  # Fallback to known bucket
        )
        
        logger.info(f"Using bucket: {bucket_name}")
        
        # Initialize matcher and load suppliers
        matcher = SupplierMatcher()
        if not matcher.load_suppliers_from_s3(bucket_name):
            logger.error("Failed to load suppliers from S3")
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
                },
                'body': json.dumps({
                    'error': 'No supplier list found. Please upload SupplierList.csv first.',
                    'bucket_used': bucket_name
                })
            }
        
        # Handle different request types
        request_type = body.get('request_type', 'match_vendor')
        logger.info(f"Processing request type: {request_type}")
        
        if request_type == 'match_vendor':
            # Single vendor matching
            vendor_name = body.get('vendor') or body.get('vendor_name')  # Support both for backward compatibility
            if not vendor_name:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
                    },
                    'body': json.dumps({'error': 'vendor_name is required'})
                }
            
            logger.info(f"Matching vendor: {vendor_name}")
            best_match = matcher.find_best_match(vendor_name)
            top_matches = matcher.find_top_matches(vendor_name)
            
            result = {
                'vendor': vendor_name,  # Changed from vendor_name to vendor to match blueprint
                'best_match': best_match,
                'top_matches': top_matches,
                'suppliers_loaded': len(matcher.suppliers)
            }
            
            logger.info(f"Match result: {result}")
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
                },
                'body': json.dumps(result)
            }
        
        elif request_type == 'enhance_bda_result':
            # Enhance BDA result with supplier matching
            bda_result = body.get('bda_result')
            if not bda_result:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
                    },
                    'body': json.dumps({'error': 'bda_result is required'})
                }
            
            # Extract vendor name from BDA result
            vendor_name = extract_vendor_name(bda_result.get('inference_result', {}))
            
            # If extraction failed, try to get vendor from request body as fallback
            if not vendor_name:
                vendor_name = body.get('vendor') or body.get('vendor_name', '')
            
            logger.info(f"Extracted vendor name from BDA: {vendor_name}")
            
            if vendor_name:
                best_match = matcher.find_best_match(vendor_name)
                top_matches = matcher.find_top_matches(vendor_name)
                
                # Add supplier matching to BDA result
                bda_result['supplier_match'] = {
                    'vendor_name_extracted': vendor_name,
                    'matched_supplier': best_match,
                    'top_matches': top_matches
                }
            else:
                bda_result['supplier_match'] = {
                    'vendor_name_extracted': '',
                    'matched_supplier': None,
                    'top_matches': []
                }
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
                },
                'body': json.dumps({
                    'enhanced_result': bda_result
                })
            }
        
        else:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
                },
                'body': json.dumps({'error': f'Unknown request_type: {request_type}'})
            }
    
    except Exception as e:
        logger.error(f"Error in lambda_handler: {str(e)}")
        logger.error(f"Error traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
            },
            'body': json.dumps({
                'error': str(e),
                'type': 'internal_error'
            })
        }
