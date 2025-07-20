import { useState, useEffect, useCallback } from 'react';
import { useBDAResults, findBDAResultForFile, BDAResultFile } from './useBDAResults';

interface PendingUpload {
    fileName: string;
    uploadTime: Date;
    found: boolean;
}

// Global state to track pending uploads across components
let pendingUploads: PendingUpload[] = [];
let pollStateChangeCallbacks: (() => void)[] = [];

const notifyPollStateChange = () => {
    pollStateChangeCallbacks.forEach(callback => callback());
};

export const useSmartBDAResults = () => {
    const [shouldPoll, setShouldPoll] = useState(false);
    const [localPendingUploads, setLocalPendingUploads] = useState<PendingUpload[]>([]);
    
    // Subscribe to poll state changes
    useEffect(() => {
        const callback = () => {
            const activePendingUploads = pendingUploads.filter(upload => !upload.found);
            setLocalPendingUploads([...activePendingUploads]);
            setShouldPoll(activePendingUploads.length > 0);
        };
        
        pollStateChangeCallbacks.push(callback);
        callback(); // Initial call
        
        return () => {
            pollStateChangeCallbacks = pollStateChangeCallbacks.filter(cb => cb !== callback);
        };
    }, []);

    const { data: bdaResults, refetch, isLoading, error } = useBDAResults();

    // Start/stop polling based on shouldPoll state
    useEffect(() => {
        if (!shouldPoll) return;

        const pollInterval = setInterval(() => {
            console.log('Smart polling: Checking for new BDA results...');
            refetch();
        }, 5000); // Poll every 5 seconds when needed

        return () => {
            clearInterval(pollInterval);
        };
    }, [shouldPoll, refetch]);

    // Check for completed uploads when BDA results change
    useEffect(() => {
        if (!bdaResults || pendingUploads.length === 0) return;

        let hasChanges = false;
        pendingUploads.forEach(upload => {
            if (!upload.found) {
                const result = findBDAResultForFile(upload.fileName, bdaResults, upload.uploadTime);
                if (result) {
                    console.log(`Found BDA result for ${upload.fileName}, stopping poll for this file`);
                    upload.found = true;
                    hasChanges = true;
                }
            }
        });

        if (hasChanges) {
            // Clean up old found uploads (keep them for 5 minutes for reference)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            pendingUploads = pendingUploads.filter(upload => 
                !upload.found || upload.uploadTime > fiveMinutesAgo
            );
            
            notifyPollStateChange();
        }
    }, [bdaResults]);

    // Function to start polling for a specific file
    const startPollingForFile = useCallback((fileName: string) => {
        console.log(`Starting to poll for BDA result of: ${fileName}`);
        
        const existingUpload = pendingUploads.find(upload => 
            upload.fileName === fileName && !upload.found
        );
        
        if (!existingUpload) {
            pendingUploads.push({
                fileName,
                uploadTime: new Date(),
                found: false
            });
            
            notifyPollStateChange();
        }
    }, []);

    // Function to stop polling for a specific file
    const stopPollingForFile = useCallback((fileName: string) => {
        console.log(`Stopping poll for: ${fileName}`);
        
        const upload = pendingUploads.find(upload => upload.fileName === fileName);
        if (upload) {
            upload.found = true;
            notifyPollStateChange();
        }
    }, []);

    // Function to manually trigger a refresh
    const refreshResults = useCallback(() => {
        refetch();
    }, [refetch]);

    return {
        bdaResults: bdaResults || [],
        isLoading,
        error,
        shouldPoll,
        pendingUploads: localPendingUploads,
        startPollingForFile,
        stopPollingForFile,
        refreshResults,
        // Helper function to check if a specific file has a result
        getResultForFile: useCallback((fileName: string, uploadTime?: Date) => {
            return findBDAResultForFile(fileName, bdaResults || [], uploadTime);
        }, [bdaResults])
    };
};

// Export helper functions for use in other components
export const addPendingUpload = (fileName: string) => {
    console.log(`Adding pending upload: ${fileName}`);
    const existingUpload = pendingUploads.find(upload => 
        upload.fileName === fileName && !upload.found
    );
    
    if (!existingUpload) {
        pendingUploads.push({
            fileName,
            uploadTime: new Date(),
            found: false
        });
        
        notifyPollStateChange();
    }
};

export const removePendingUpload = (fileName: string) => {
    console.log(`Removing pending upload: ${fileName}`);
    const upload = pendingUploads.find(upload => upload.fileName === fileName);
    if (upload) {
        upload.found = true;
        notifyPollStateChange();
    }
};

// Get current polling status (useful for debugging)
export const getPollingStatus = () => {
    const activePendingUploads = pendingUploads.filter(upload => !upload.found);
    return {
        isPolling: activePendingUploads.length > 0,
        pendingCount: activePendingUploads.length,
        pendingFiles: activePendingUploads.map(upload => upload.fileName)
    };
};