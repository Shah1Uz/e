"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateUserBannerAction(userId: string, bannerUrl: string | null) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { bannerUrl },
    });

    revalidatePath(`/profile/${userId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error updating user banner:", error);
    return { success: false, error: error.message || "Xatolik yuz berdi" };
  }
}
