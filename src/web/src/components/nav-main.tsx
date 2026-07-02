"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
    isActive?: boolean
    disabled?: boolean
    badge?: string
    onSelect?: () => void
    items?: {
      title: string
      url: string
      isActive?: boolean
      onSelect?: () => void
    }[]
  }[]
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Library</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible key={item.title} asChild defaultOpen={item.isActive}>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={item.isActive}
                disabled={item.disabled}
                onClick={item.disabled ? undefined : item.onSelect}
                aria-current={item.isActive ? "page" : undefined}
                aria-disabled={item.disabled || undefined}
              >
                <item.icon />
                <span className="group-data-[collapsible=icon]:hidden">
                  {item.title}
                </span>
              </SidebarMenuButton>
              {item.badge ? (
                <SidebarMenuBadge className="text-[10px] uppercase tracking-wide text-sidebar-foreground/55">
                  {item.badge}
                </SidebarMenuBadge>
              ) : null}
              {item.items?.length ? (
                <>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuAction className="data-[state=open]:rotate-90">
                      <ChevronRight />
                      <span className="sr-only">Toggle</span>
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton asChild isActive={subItem.isActive}>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-7 w-full justify-start px-2 text-sidebar-foreground"
                              onClick={subItem.onSelect}
                            >
                              <span>{subItem.title}</span>
                            </Button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              ) : null}
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
