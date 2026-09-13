import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type StoredImpersonation = {
  actorName: string;
  targetId: string;
  targetName: string;
  session: { access_token: string; refresh_token: string };
};

export default function ImpersonationCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const complete = async () => {
      const stored = sessionStorage.getItem("soundpub_impersonation_origin");
      if (!stored) {
        setError("Sesi superadmin untuk kembali tidak ditemukan.");
        return;
      }
      const impersonation = JSON.parse(stored) as StoredImpersonation;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || session.user.id !== impersonation.targetId) {
        setError("Login sebagai user target belum berhasil.");
        return;
      }
      sessionStorage.setItem(
        "soundpub_impersonation_active",
        JSON.stringify({
          actorName: impersonation.actorName,
          targetId: impersonation.targetId,
          targetName: impersonation.targetName,
        }),
      );
      navigate("/dashboard", { replace: true });
    };
    const timer = window.setTimeout(() => void complete(), 250);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p>Menyiapkan akses user…</p>
          </>
        )}
      </div>
    </div>
  );
}
