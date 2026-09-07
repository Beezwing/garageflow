"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

export interface UploadedPhoto {
  url: string;
  category?: string;
  path: string;
}

const CATEGORIES = ["Front", "Rear", "Driver side", "Passenger side", "Interior", "Odometer", "Engine bay", "Damage"];

export function PhotoUploader({
  garageId,
  folder,
  phase = "before",
  photos,
  onChange,
}: {
  garageId: string;
  folder: string;
  phase?: "before" | "after";
  photos: UploadedPhoto[];
  onChange: (p: UploadedPhoto[]) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [category, setCategory] = React.useState(CATEGORIES[0]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    const added: UploadedPhoto[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${garageId}/${folder}/${phase}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("garage-media").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) {
        toast.push(`Upload failed: ${error.message}`, "error");
        continue;
      }
      const { data } = supabase.storage.from("garage-media").getPublicUrl(path);
      added.push({ url: data.publicUrl, category, path });
    }
    onChange([...photos, ...added]);
    setBusy(false);
  }

  async function remove(p: UploadedPhoto) {
    const supabase = createClient();
    await supabase.storage.from("garage-media").remove([p.path]);
    onChange(photos.filter((x) => x.path !== p.path));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="cursor-pointer rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          {busy ? "Uploading…" : "Add photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      {photos.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <div key={p.path} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.category ?? "photo"}
                className="aspect-square w-full rounded-[var(--radius)] border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => remove(p)}
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs text-white"
              >
                ✕
              </button>
              <p className="mt-0.5 truncate text-[0.65rem] text-text-subtle">{p.category}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
