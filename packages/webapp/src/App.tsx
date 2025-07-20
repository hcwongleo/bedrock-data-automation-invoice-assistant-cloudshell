import { useEffect, } from 'react'
import { Amplify, } from 'aws-amplify';
import { Spinner, } from "@cloudscape-design/components"
import { useAuthenticator, } from '@aws-amplify/ui-react';

// pages
import { AppBase } from "./pages/AppBase";
import { Login } from "./pages/Login";


// Localhost detection removed as it's not used

// https://docs.amplify.aws/react/build-a-backend/storage/storage-v5-to-v6-migration-guide/#using-a-custom-prefix
const libraryOptions = {
  Storage: {
    S3: {
      prefixResolver: () => import.meta.env.VITE_PROJECT_NAME
    }
  }
};
Amplify.configure({
  Auth: {
    Cognito: {
      // OPTIONAL - Amazon Cognito Usser Pool ID
      userPoolId: import.meta.env
        .VITE_CONFIG_COGNITO_USERPOOL_ID,
      // OPTIONAL - Amazon Cognito Web Client ID (26-char alphanumeric string)
      userPoolClientId: import.meta.env
        .VITE_CONFIG_COGNITO_APPCLIENT_ID,
      identityPoolId: import.meta.env
        .VITE_CONFIG_COGNITO_IDENTITYPOOL_ID,
      allowGuestAccess: false,

    },
  },
  API: {
    REST: {
      "http-api": {
        endpoint: import.meta.env.VITE_CONFIG_HTTP_API_URL,
        region: import.meta.env.VITE_REGION // Optional
      },
      "rest-api": {
        // remove the trailing / as we will attach it to the request call
        endpoint: String(import.meta.env.VITE_CONFIG_REST_API_URL).slice(0, -1),
        region: import.meta.env.VITE_REGION // Optional
      },
    },
  },
  Storage: {
    S3: {
      region: import.meta.env.VITE_REGION,
      bucket: import.meta.env.VITE_CONFIG_S3_DATA_BUCKET_NAME,
    },
  },
}, libraryOptions)


function App() {
  // hook below is only reevaluated when `user` changes
  const { route, authStatus } = useAuthenticator((context) => [context.route, context.authStatus]);

  useEffect(() => {
    // Configuration and auth status tracking for debugging if needed
  }, [route, authStatus])



  return (
    <div>
      {authStatus === "configuring" && <Spinner />}
      {authStatus === "unauthenticated" && <Login />}
      {authStatus === "authenticated" && <AppBase />}
    </div>
  )
}

export default App


