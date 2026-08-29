"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseMember, CaseMemberRole, Contact } from "@/types";
import {
  User,
  Heart,
  Baby,
  Users,
  Shield,
  ShieldCheck,
  Briefcase,
  UserCircle,
  MessageSquare,
  FileText,
  Trash2,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface CaseMemberCardProps {
  member: CaseMember;
  currentContactId?: string;
  onViewDocs?: (contact: Contact) => void;
  onRemove?: (memberId: string) => void;
  canRemove?: boolean;
}

export function getRoleIcon(role: string) {
  switch (role) {
    case "primary":
      return <User className="h-3 w-3" />;
    case "spouse":
      return <Heart className="h-3 w-3 text-pink-500" />;
    case "child":
      return <Baby className="h-3 w-3 text-amber-500" />;
    case "parent":
    case "co_applicant":
      return <Users className="h-3 w-3 text-blue-500" />;
    case "guarantor":
      return <Shield className="h-3 w-3 text-emerald-500" />;
    case "nominee":
      return <ShieldCheck className="h-3 w-3 text-teal-500" />;
    case "stakeholder":
    case "representative":
      return <Briefcase className="h-3 w-3 text-purple-500" />;
    default:
      return <UserCircle className="h-3 w-3 text-muted-foreground" />;
  }
}

export function CaseMemberCard({
  member,
  currentContactId,
  onViewDocs,
  onRemove,
  canRemove = false,
}: CaseMemberCardProps) {
  const t = useTranslations("Cases");
  const router = useRouter();
  const [openingChat, setOpeningChat] = useState(false);
  const [removing, setRemoving] = useState(false);

  const contact = member.contact;
  const isCurrentContact = currentContactId && member.contact_id === currentContactId;
  const contactName = contact?.name || contact?.phone || "Unknown Contact";

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleOpenChat = async () => {
    if (!member.contact_id) return;
    setOpeningChat(true);
    try {
      const supabase = createClient();
      const { data: conv, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", member.contact_id)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !conv) {
        toast.info(t("openChat") + ": " + (t("noConversation") || "No conversation found for this contact."));
        return;
      }

      router.push(`/inbox?c=${conv.id}`);
    } catch (err) {
      console.error("Failed to lookup conversation:", err);
      toast.error("Failed to open chat");
    } finally {
      setOpeningChat(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setRemoving(true);
    try {
      await onRemove(member.id);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg p-2 transition-colors border",
        isCurrentContact
          ? "bg-primary/10 border-primary/30"
          : "bg-background/80 hover:bg-muted/60 border-border/50"
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Avatar className="h-7 w-7 border border-border shrink-0">
          <AvatarFallback className="text-[10px] bg-muted text-muted-foreground font-semibold">
            {getInitials(contact?.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
              {contactName}
            </span>
            {isCurrentContact && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-primary/20 text-primary font-medium">
                You
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5 font-medium">
              {getRoleIcon(member.role)}
              <span>{t(`memberRoles.${member.role}` as `memberRoles.${CaseMemberRole}`) || member.role}</span>
            </span>
            {member.label && (
              <span className="text-muted-foreground/80 truncate max-w-[100px]">
                • {member.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onViewDocs && contact && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title={t("viewDocs")}
            onClick={() => onViewDocs(contact)}
          >
            <FileText className="h-3 w-3" />
          </Button>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-primary"
          title={t("openChat")}
          disabled={openingChat}
          onClick={handleOpenChat}
        >
          {openingChat ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <MessageSquare className="h-3 w-3" />
          )}
        </Button>

        {canRemove && member.role !== "primary" && onRemove && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            title={t("removeMember")}
            disabled={removing}
            onClick={handleRemove}
          >
            {removing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
