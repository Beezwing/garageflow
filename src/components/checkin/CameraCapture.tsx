"use client";

import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function CameraCapture({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [facing, setFacing] = React.useState<"environment" | "user">("environment");

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = React.useCallback(
    async (mode: "environment" | "user") => {
      setError(null);
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (e) {
        setError(
          (e as Error).name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser and try again."
            : "No camera available on this device.",
        );
      }
    },
    [stop],
  );

  React.useEffect(() => {
    if (open) start(facing);
    else stop();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take a photo"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const next = facing === "environment" ? "user" : "environment";
              setFacing(next);
              start(next);
            }}
          >
            Flip camera
          </Button>
          <Button onClick={snap} disabled={!ready}>
            Capture
          </Button>
        </>
      }
    >
      {error ? (
        <p className="rounded-[var(--radius)] bg-[var(--tone-red-bg)] px-3 py-2 text-sm text-[var(--tone-red-fg)]">
          {error}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" />
        </div>
      )}
      <p className="mt-2 text-xs text-text-subtle">
        Snap as many as you need — each capture is added straight away.
      </p>
    </Modal>
  );
}
