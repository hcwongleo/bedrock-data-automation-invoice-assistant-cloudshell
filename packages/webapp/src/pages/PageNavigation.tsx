import { SideNavigation } from "@cloudscape-design/components";
import { useLocation, useNavigate, Routes, Route, } from "react-router-dom";
import { FileProcessor } from "./FileProcessor";
import { appName } from "../atoms/AppAtoms";
import { InfoPanel } from "../components/InfoPanel";

export const AppRoutes = {
    fileProcessor: {
        text: "Document Processor",
        href: "/",
    }
}

export const AppSideNavigation = () => {
    const location = useLocation();
    const navigate = useNavigate();
    return (

        <SideNavigation
            activeHref={location.pathname}
            header={{ href: "/", text: appName }}
            onFollow={(event) => {
                if (!event.detail.external) {
                    event.preventDefault();
                    navigate(event.detail.href);
                }
            }}
            items={[
                { type: "link", text: AppRoutes.fileProcessor.text, href: AppRoutes.fileProcessor.href },
                {
                    type: 'divider'
                },
                {
                    type: "link",
                    text: "Version 1.0",
                    href: "#"
                }
            ]}
        />
    );
}

export const PageContent = () => {
    return (
        <Routes>
            <Route path={AppRoutes.fileProcessor.href} element={<FileProcessor />} />
            {/* Redirect any other routes to the main document processor */}
            <Route path="*" element={<FileProcessor />} />
        </Routes>
    )
}

export const InfoContent = () => {
    return (
        <Routes>
            {/* you can dynamically change help panel content based on route/page */}
            <Route path="*" element={<InfoPanel />} />
        </Routes>)
}
