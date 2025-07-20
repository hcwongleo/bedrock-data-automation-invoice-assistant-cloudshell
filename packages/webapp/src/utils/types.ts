export enum QUERY_KEYS {
    APPLICATIONS = 'APPLICATIONS',
    BDA_RESULTS = 'BDA_RESULTS',
    DOCUMENTS = 'DOCUMENTS',
    SUPPLIER_LIST_STATUS = 'SUPPLIER_LIST_STATUS',
}

// AWS S3 folder prefixes mapped to React Query keys
// trailing / is required for folder prefixes
export const DatasetPrefix = {
    [QUERY_KEYS.APPLICATIONS]: 'applications/',
    [QUERY_KEYS.BDA_RESULTS]: 'bda-result/',
    [QUERY_KEYS.DOCUMENTS]: 'documents/',
}

export type ItemType = { itemName: string; path: string; url: string; lastModified?: Date; }

export type S3ItemsType = {
    eTag: string | undefined,
    lastModified: Date | undefined,
    size: number | undefined,
    path: string,
}

export type AuthedUserType = {
    userID: string;
    userName: string;
}