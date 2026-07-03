import * as React from "react"
import {
  GalleryVerticalEnd,
  Layers3,
  ScrollText,
  Server,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import type { SessionResponse } from "@/lib/api"
import type { WorkspaceRecord } from "../../../shared/types"

type AppSidebarView = "assets" | "asset-detail" | "workspace" | "account"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  session: SessionResponse
  activeWorkspace?: WorkspaceRecord
  view: AppSidebarView
  onNavigate: (route: { view: AppSidebarView; assetQuery?: string }) => void
  onWorkspaceChange: (workspaceId: string) => void
  onLogout: () => void
}

export function AppSidebar({
  session,
  activeWorkspace,
  view,
  onNavigate,
  onWorkspaceChange,
  onLogout,
  ...props
}: AppSidebarProps) {
  const isSkillsActive = view === "assets" || view === "asset-detail"

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Harhub"
              onClick={() => onNavigate({ view: "assets" })}
              aria-label="Harhub home"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GalleryVerticalEnd className="size-4" aria-hidden="true" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">Harhub</span>
                <span className="truncate text-xs">Asset Control</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <WorkspaceSelect
          workspaces={session.workspaces}
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={onWorkspaceChange}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={[
            {
              title: "Skills",
              url: "/skills",
              icon: Layers3,
              isActive: isSkillsActive,
              onSelect: () => onNavigate({ view: "assets" }),
            },
            {
              title: "MCPs",
              url: "/mcps",
              icon: Server,
              disabled: true,
              badge: "Soon",
            },
            {
              title: "Rules",
              url: "/rules",
              icon: ScrollText,
              disabled: true,
              badge: "Soon",
            },
          ]}
        />
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t border-sidebar-border/70">
        <NavUser
          user={{
            name: session.account.name,
            email: session.account.email,
            avatar: "",
          }}
          isActive={view === "account"}
          onOpenWorkspace={() => onNavigate({ view: "workspace" })}
          onOpenAccount={() => onNavigate({ view: "account" })}
          onLogout={onLogout}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function WorkspaceSelect({
  workspaces,
  activeWorkspace,
  onWorkspaceChange,
}: {
  workspaces: WorkspaceRecord[]
  activeWorkspace?: WorkspaceRecord
  onWorkspaceChange: (workspaceId: string) => void
}) {
  return (
    <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
      <Select
        value={activeWorkspace?.id}
        onValueChange={onWorkspaceChange}
        disabled={workspaces.length === 0}
      >
        <SelectTrigger
          className="h-11 rounded-lg border-sidebar-border/80 bg-sidebar-accent/55 px-3 py-2 text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-accent focus:ring-2 focus:ring-blue-500/25 data-[state=open]:border-blue-300 data-[state=open]:bg-sidebar-accent"
          aria-label="Workspace"
        >
          <div className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/55">
              Organization
            </span>
            <span className="truncate text-sm font-medium">
              <SelectValue placeholder="Select organization" />
            </span>
          </div>
        </SelectTrigger>
        <SelectContent className="rounded-lg border-sidebar-border/80 shadow-lg">
          {workspaces.map((workspace) => (
            <SelectItem
              key={workspace.id}
              value={workspace.id}
              className="h-9 rounded-md font-medium"
            >
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
