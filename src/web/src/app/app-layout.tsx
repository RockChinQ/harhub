import type { ReactNode } from "react";

import type { WorkspaceRecord } from "../../../shared/types";
import { AppSidebar } from "../components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "../components/ui/breadcrumb";
import { Separator } from "../components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "../components/ui/sidebar";
import type { SessionResponse } from "../lib/api";
import { viewTitle } from "./routing";
import type { AppRoute, View } from "./types";

type AppLayoutView = Exclude<View, "landing">;

export function AppLayout({
  token,
  session,
  activeWorkspace,
  view,
  onNavigate,
  onWorkspaceChange,
  onSessionChange,
  onLogout,
  children
}: {
  token: string;
  session: SessionResponse;
  activeWorkspace?: WorkspaceRecord;
  view: AppLayoutView;
  onNavigate: (route: AppRoute) => void;
  onWorkspaceChange: (workspaceId: string) => void;
  onSessionChange: (session: SessionResponse, workspace?: WorkspaceRecord) => Promise<void>;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        token={token}
        session={session}
        activeWorkspace={activeWorkspace}
        view={view}
        onNavigate={onNavigate}
        onWorkspaceChange={onWorkspaceChange}
        onSessionChange={onSessionChange}
        onLogout={onLogout}
      />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <header className="flex h-16 min-w-0 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList>
              <BreadcrumbItem>
                <span className="block max-w-[40vw] truncate font-medium text-foreground">
                  {activeWorkspace?.name ?? "Workspace"}
                </span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{viewTitle(view)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
