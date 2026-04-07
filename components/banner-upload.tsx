"use client";

import React, { useState } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { updateUserBannerAction } from "@/server/actions/user.action";
import { toast } from "sonner";

interface BannerUploadProps {
  userId: string;
  currentBannerUrl?: string | null;
}

export default function BannerUpload({ userId, currentBannerUrl }: BannerUploadProps) {
  const { t } = useLocale();
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Rasm hajmi 5MB dan kam bo'lishi kerak");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      
      const data = await res.json();
      const result = await updateUserBannerAction(userId, data.url);
      
      if (result.success) {
        toast.success(t("common.saved") || "Saqlandi");
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error(error);
      toast.error("Xatolik yuz berdi");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("profile.delete_banner") + "?")) return;
    
    setIsUploading(true);
    try {
      const result = await updateUserBannerAction(userId, null);
      if (result.success) {
        toast.success(t("profile.delete_banner") + " muvaffaqiyatli");
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error("Xatolik yuz berdi");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="absolute top-6 right-6 flex gap-2">
      <label className="cursor-pointer">
        <div className="h-10 px-4 bg-background/60 dark:bg-black/60 backdrop-blur-xl border border-border/50 dark:border-white/10 rounded-xl flex items-center gap-2 text-foreground dark:text-white hover:bg-background/80 dark:hover:bg-black/80 transition-all text-sm font-bold shadow-2xl ring-1 ring-black/5 dark:ring-white/5">
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {t("profile.edit_banner")}
        </div>
        <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={isUploading} />
      </label>
      
      {currentBannerUrl && (
        <Button 
          variant="outline" 
          size="icon" 
          className="h-10 w-10 bg-background/60 dark:bg-black/60 backdrop-blur-xl border border-border/50 dark:border-white/10 rounded-xl text-foreground dark:text-white hover:bg-red-500/10 hover:text-red-500 dark:hover:bg-red-500/20 dark:hover:text-red-400 transition-all shadow-2xl ring-1 ring-black/5 dark:ring-white/5"
          onClick={handleDelete}
          disabled={isUploading}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
