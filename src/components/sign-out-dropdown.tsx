"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SignOutDropdown({
  trigger,
  align = "end",
  contentClassName,
}: {
  trigger: React.ReactNode;
  align?: "end" | "center";
  contentClassName?: string;
}) {
  const router = useRouter();
  const { signOut } = useAuth();
  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={contentClassName}>
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Sign out?</p>
        <DropdownMenuItem onClick={handleSignOut}>Yes, sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
