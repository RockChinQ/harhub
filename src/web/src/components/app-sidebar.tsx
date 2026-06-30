import * as React from "react"
import {
  Building2,
  Check,
  ChevronsUpDown,
  GalleryVerticalEnd,
  Layers3,
  Settings2,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import type { SessionResponse } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { WorkspaceMembership, WorkspaceRecord } from "../../../types"

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
          ]}
        />
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t border-sidebar-border/70">
        <WorkspaceSwitcher
          workspaces={session.workspaces}
          activeWorkspace={activeWorkspace}
          role={roleForWorkspace(session.memberships, activeWorkspace?.id)}
          isActive={view === "workspace"}
          onWorkspaceChange={onWorkspaceChange}
          onOpenSettings={() => onNavigate({ view: "workspace" })}
        />
        <NavUser
          user={{
            name: session.account.name,
            email: session.account.email,
            avatar: "",
          }}
          isActive={view === "account"}
          onOpenAccount={() => onNavigate({ view: "account" })}
          onLogout={onLogout}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  role,
  isActive,
  onWorkspaceChange,
  onOpenSettings,
}: {
  workspaces: WorkspaceRecord[]
  activeWorkspace?: WorkspaceRecord
  role: string
  isActive: boolean
  onWorkspaceChange: (workspaceId: string) => void
  onOpenSettings: () => void
}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={cn(
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
              aria-label="Workspace menu"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 className="size-4" aria-hidden="true" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">
                  {activeWorkspace?.name ?? "Workspace"}
                </span>
                <span className="truncate text-xs">{role}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onSelect={() => onWorkspaceChange(workspace.id)}
              >
                <Building2 className="text-muted-foreground" />
                <span>{workspace.name}</span>
                {workspace.id === activeWorkspace?.id ? (
                  <Check className="ml-auto" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenSettings}>
              <Settings2 className="text-muted-foreground" />
              <span>Workspace settings</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function roleForWorkspace(
  memberships: WorkspaceMembership[],
  workspaceId?: string
): string {
  if (!workspaceId) return "No workspace"
  const membership = memberships.find((item) => item.workspaceId === workspaceId)
  return membership ? `Role: ${membership.role}` : "No role"
}
