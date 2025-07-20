export const standardOutputConfiguration = {
    'document': {
        'extraction': {
            'granularity': {
                'types': [
                    'DOCUMENT', 'PAGE'
                ]
            },
            'boundingBox': {
                'state': 'DISABLED'
            }
        },
        'generativeField': {
            'state': 'DISABLED'
        },
        'outputFormat': {
            'textFormat': {
                'types': [
                    'MARKDOWN',
                ]
            },
            'additionalFileFormat': {
                'state': 'DISABLED'
            }
        }
    }
}

export const sampleBlueprints = {
    'Invoice': 'arn:aws:bedrock:us-east-1:aws:blueprint/bedrock-data-automation-public-invoice',
}

export const customBlueprint = {
    'ComprehensiveInvoice': `{
        "$schema": "http://json-schema.org/draft-07/schema#",
        "description": "A comprehensive invoice document for automated processing and data extraction",
        "class": "Comprehensive-Invoice",
        "type": "object",
        "definitions": {
            "LineItem": {
                "type": "object",
                "properties": {
                    "Description": {
                        "type": "string",
                        "inferenceType": "explicit",
                        "instruction": "Description of the product or service"
                    },
                    "Amount": {
                        "type": "number",
                        "inferenceType": "explicit",
                        "instruction": "The amount for this line item"
                    }
                }
            },
            "BankDetails": {
                "type": "object",
                "properties": {
                    "BankAccount": {
                        "type": "string",
                        "inferenceType": "explicit",
                        "instruction": "Vendor's bank account number"
                    },
                    "BankCode": {
                        "type": "string",
                        "inferenceType": "explicit",
                        "instruction": "Bank code or routing number"
                    },
                    "SwiftCode": {
                        "type": "string",
                        "inferenceType": "explicit",
                        "instruction": "SWIFT code for international transfers"
                    }
                }
            },
            "WaterMeterReading": {
                "type": "object",
                "properties": {
                    "MeterNumber": {
                        "type": "string",
                        "inferenceType": "explicit",
                        "instruction": "Water meter number"
                    },
                    "DeltaReading": {
                        "type": "number",
                        "inferenceType": "explicit",
                        "instruction": "Delta of readings on water bills (difference between current and previous reading)"
                    }
                }
            }
        },
        "properties": {
            "Vendor": {
                "type": "string",
                "inferenceType": "explicit",
                "instruction": "The name of the vendor or supplier issuing the invoice"
            },
            "InvoiceDate": {
                "type": "string",
                "inferenceType": "explicit",
                "instruction": "The date the invoice was issued"
            },
            "PaymentTerms": {
                "type": "string",
                "inferenceType": "explicit",
                "instruction": "Payment terms and conditions"
            },
            "DueDate": {
                "type": "string",
                "inferenceType": "explicit",
                "instruction": "The date payment is due"
            },
            "Currency": {
                "type": "string",
                "inferenceType": "explicit",
                "instruction": "The currency code (e.g., USD, EUR, GBP, HKD)"
            },
            "InvoiceTotalAmount": {
                "type": "number",
                "inferenceType": "explicit",
                "instruction": "The total amount due on the invoice"
            },
            "InvoiceLineItems": {
                "type": "array",
                "instruction": "List of line items on the invoice with description and amount",
                "items": {
                    "$ref": "#/definitions/LineItem"
                }
            },
            "SpecialRemarks": {
                "type": "string",
                "inferenceType": "explicit",
                "instruction": "Special remarks from vendor if any, including notes, comments, or special instructions"
            },
            "VendorBankDetails": {
                "$ref": "#/definitions/BankDetails"
            },
            "WaterMeterInfo": {
                "$ref": "#/definitions/WaterMeterReading"
            }
        }
    }`
}
