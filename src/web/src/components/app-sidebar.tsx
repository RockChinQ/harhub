import * as React from "react"
import {
  Building2,
  Check,
  ChevronsUpDown,
  GalleryVerticalEnd,
  Layers3,
  Plus,
  ScrollText,
  Server,
  Sparkles,
  Settings,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
import { createWorkspace, type SessionResponse } from "@/lib/api"
import type { WorkspaceRecord } from "../../../shared/types"

type AppSidebarView = "assets" | "asset-detail" | "forge" | "workspace" | "account"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  token: string
  session: SessionResponse
  activeWorkspace?: WorkspaceRecord
  view: AppSidebarView
  onNavigate: (route: { view: AppSidebarView; assetQuery?: string }) => void
  onWorkspaceChange: (workspaceId: string) => void
  onSessionChange: (session: SessionResponse, workspace?: WorkspaceRecord) => Promise<void>
  onLogout: () => void
}

export function AppSidebar({
  token,
  session,
  activeWorkspace,
  view,
  onNavigate,
  onWorkspaceChange,
  onSessionChange,
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
          token={token}
          workspaces={session.workspaces}
          activeWorkspace={activeWorkspace}
          onNavigate={onNavigate}
          onWorkspaceChange={onWorkspaceChange}
          onSessionChange={onSessionChange}
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
        <NavMain
          label="Create"
          items={[
            {
              title: "Forge",
              url: "/forge",
              icon: Sparkles,
              isActive: view === "forge",
              onSelect: () => onNavigate({ view: "forge" }),
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
          onOpenAccount={() => onNavigate({ view: "account" })}
          onLogout={onLogout}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function WorkspaceSelect({
  token,
  workspaces,
  activeWorkspace,
  onNavigate,
  onWorkspaceChange,
  onSessionChange,
}: {
  token: string
  workspaces: WorkspaceRecord[]
  activeWorkspace?: WorkspaceRecord
  onNavigate: (route: { view: AppSidebarView; assetQuery?: string }) => void
  onWorkspaceChange: (workspaceId: string) => void
  onSessionChange: (session: SessionResponse, workspace?: WorkspaceRecord) => Promise<void>
}) {
  const [newWorkspaceName, setNewWorkspaceName] = React.useState("")
  const [isCreating, setIsCreating] = React.useState(false)
  const [message, setMessage] = React.useState<string | undefined>()

  async function createNewWorkspace(event: React.FormEvent) {
    event.preventDefault()
    const name = newWorkspaceName.trim()
    if (!name) return

    setIsCreating(true)
    setMessage(undefined)
    try {
      const result = await createWorkspace(token, {
        name,
      })
      setNewWorkspaceName("")
      await onSessionChange(result, result.workspace)
      onNavigate({ view: "assets" })
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-11 w-full justify-between rounded-lg border border-sidebar-border/80 bg-sidebar-accent/55 px-3 py-2 text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-blue-500/25 data-[state=open]:border-blue-300 data-[state=open]:bg-sidebar-accent"
            aria-label="Workspace"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/10 text-sidebar-primary">
              <Building2 className="size-4" aria-hidden="true" />
            </span>
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/55">
                Organization
              </span>
              <span className="truncate text-sm font-medium">
                {activeWorkspace?.name ?? "Select organization"}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-sidebar-foreground/55" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={6}
          className="w-[--radix-dropdown-menu-trigger-width] min-w-64 rounded-lg border-sidebar-border/80 shadow-lg"
        >
          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              className="items-start gap-2 rounded-md px-2 py-2"
              onSelect={() => {
                if (workspace.id !== activeWorkspace?.id) {
                  onWorkspaceChange(workspace.id)
                }
              }}
            >
              <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{workspace.name}</span>
                <span className="truncate text-xs text-muted-foreground">{workspace.slug}</span>
              </span>
              {workspace.id === activeWorkspace?.id ? (
                <Check className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="rounded-md px-2 py-2 text-sm font-medium"
            onSelect={() => onNavigate({ view: "workspace" })}
          >
            <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
            Workspace settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="px-2 py-2 font-normal">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Plus className="size-3.5" aria-hidden="true" />
              New workspace
            </div>
            <form className="grid gap-2" onSubmit={createNewWorkspace}>
              <Input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="New workspace"
                disabled={isCreating}
                required
              />
              <Button type="submit" size="sm" disabled={isCreating || !newWorkspaceName.trim()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add workspace
              </Button>
            </form>
            {message ? (
              <p className="mt-2 text-xs text-destructive">{message}</p>
            ) : null}
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
