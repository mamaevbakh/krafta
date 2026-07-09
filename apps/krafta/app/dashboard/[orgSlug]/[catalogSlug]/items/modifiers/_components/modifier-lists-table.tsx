"use client";

import * as React from "react";
import { Link2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/locales/dashboard/context";

import type { ModifierListRow } from "./modifiers-panel";

/**
 * Compact table of modifier lists. Each row shows:
 *   - name + internal name (subtle)
 *   - kind chip (List | Text)
 *   - modifier count (for `list`) or text-required hint (for `text`)
 *   - attached-to-N-items count
 *   - active toggle
 *   - actions menu (edit / attach / delete)
 *
 * Whole row is clickable → opens the editor sheet. The action menu and
 * the active Switch are guarded with stopPropagation so they don't open
 * the editor accidentally.
 */
export function ModifierListsTable({
  lists,
  attachedCountByList,
  onEdit,
  onAttach,
  onToggleActive,
  onDelete,
}: {
  lists: ModifierListRow[];
  attachedCountByList: Map<string, number>;
  onEdit: (list: ModifierListRow) => void;
  onAttach: (list: ModifierListRow) => void;
  onToggleActive: (list: ModifierListRow) => void;
  onDelete: (list: ModifierListRow) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">{t("modifiers.table.name")}</TableHead>
            <TableHead>{t("modifiers.table.kind")}</TableHead>
            <TableHead className="text-right">
              {t("modifiers.table.modifiers")}
            </TableHead>
            <TableHead className="text-right">
              {t("modifiers.table.attached_items")}
            </TableHead>
            <TableHead className="w-20">{t("modifiers.table.active")}</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lists.map((list) => {
            const activeModifierCount = (list.modifiers ?? []).filter(
              (m) => m.is_active,
            ).length;
            const attachedCount = attachedCountByList.get(list.id) ?? 0;
            const isList = list.modifier_type === "list";
            return (
              <TableRow
                key={list.id}
                onClick={() => onEdit(list)}
                className="cursor-pointer hover:bg-muted/40"
                data-inactive={list.is_active ? undefined : "true"}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span
                      className={
                        list.is_active
                          ? "text-sm font-medium"
                          : "text-sm font-medium text-muted-foreground line-through"
                      }
                    >
                      {list.name}
                    </span>
                    {list.internal_name ? (
                      <span className="text-[11px] text-muted-foreground">
                        {t("modifiers.table.internal", {
                          name: list.internal_name,
                        })}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className="font-mono text-[10px] uppercase tracking-wide"
                  >
                    {isList ? t("modifiers.kind.list") : t("modifiers.kind.text")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {isList ? (
                    <span className="text-sm">{activeModifierCount}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {list.text_required
                        ? t("modifiers.table.required_text")
                        : t("modifiers.table.optional_text")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={
                      attachedCount > 0
                        ? "text-sm"
                        : "text-sm text-muted-foreground/60"
                    }
                  >
                    {attachedCount}
                  </span>
                </TableCell>
                <TableCell>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={list.is_active}
                      onCheckedChange={() => onToggleActive(list)}
                      aria-label={
                        list.is_active
                          ? t("modifiers.table.disable_aria", {
                              name: list.name,
                            })
                          : t("modifiers.table.enable_aria", {
                              name: list.name,
                            })
                      }
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t("modifiers.table.more_actions_aria")}
                        >
                          <MoreHorizontal
                            className="size-4"
                            aria-hidden="true"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(list)}>
                          <Pencil
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAttach(list)}>
                          <Link2 className="size-3.5" aria-hidden="true" />
                          {t("modifiers.table.attach_action")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(list)}
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
