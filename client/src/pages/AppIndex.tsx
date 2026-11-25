import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { redirectToLogin } from "@/lib/auth-utils";
import Dashboard from "@/pages/Dashboard";

export default function AppIndex() {
  const { isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLoc] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        redirectToLogin(toast as any);
        setLoc("/");
      } else {
        setLoc("/markets/BTCUSD");
      }
    }
  }, [isLoading, isAuthenticated, toast, setLoc]);

  return null;
}
