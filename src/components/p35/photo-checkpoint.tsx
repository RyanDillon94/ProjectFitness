import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getActiveBlockCountdown, getProgramWeekNumber } from "@/lib/project35";
import {
  usePhotos,
  type ArchivedBlockPhotos,
  type PhotoAngle,
  type PhotoSlot,
} from "@/lib/p35-cloud";
import {
  Archive,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderArchive,
  ImagePlus,
  Loader2,
  Maximize2,
  Trash2,
  X,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

const ANGLES: Array<{ id: PhotoAngle; label: string }> = [
  { id: "front", label: "Front" },
  { id: "side", label: "Side" },
  { id: "back", label: "Back" },
];

export function PhotoCheckpoint({ userId }: { userId: string | null }) {
  const [selectedAngle, setSelectedAngle] = useState<PhotoAngle>("front");
  const [modalImage, setModalImage] = useState<{ src: string; title: string } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveAngle, setArchiveAngle] = useState<PhotoAngle>("front");
  
  const [isCleared, setIsCleared] = useState(false);
  const [hasDebt, setHasDebt] = useState(false);

  const { photos, archive = [], upload, removePhoto, closeAndArchiveBlock } = usePhotos(userId);
  const pending = useRef<PhotoSlot>("baseline");
  const inputRef = useRef<HTMLInputElement>(null);

  const { currentWeek, totalWeeks, blockName, phaseTitle } = getActiveBlockCountdown();
  const isFinalWeek = currentWeek >= totalWeeks;
  const isPhotoWeek = currentWeek % 4 === 0;

  const requiresAttention = (isPhotoWeek && !isCleared) || hasDebt;
  const activeAnglePhotos = photos?.[selectedAngle] || { baseline: null, current: null };

  useEffect(() => {
    const checkStatus = () => {
      const clearedWeek = localStorage.getItem(`p35_photo_cleared_week_${currentWeek}`) === "true";
      const debtActive = localStorage.getItem("p35_photo_checkpoint_pending") === "true";
      setIsCleared(clearedWeek);
      setHasDebt(debtActive);
    };
    checkStatus();
    window.addEventListener("p35-photo-pending-updated", checkStatus);
    return () => window.removeEventListener("p35-photo-pending-updated", checkStatus);
  }, [currentWeek]);

  const pick = (slot: PhotoSlot) => {
    pending.current = slot;
    inputRef.current?.click();
  };

  const onFile = (file?: File) => {
    if (!file) return;
    if (file.size > 10_000_000) {
      toast.error("Image too large. Use one under 10 MB.");
      return;
    }
    
    upload.mutate(
      { angle: selectedAngle, slot: pending.current, file },
      {
        onSuccess: () => {
          toast.success(
            `${pending.current === "baseline" ? "Baseline" : "Current"} (${selectedAngle.toUpperCase()}) saved.`
          );

          localStorage.setItem(`p35_photo_cleared_week_${currentWeek}`, "true");

          if (localStorage.getItem("p35_photo_checkpoint_pending") === "true") {
            localStorage.setItem("p35_photo_checkpoint_pending", "false");
            localStorage.setItem("p35_photo_was_pending_debt", "true");
          }
          
          window.dispatchEvent(new Event("p35-photo-pending-updated"));
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Upload failed."),
      }
    );
  };

  const handleCloseBlock = () => {
    const hasCurrent = Boolean(
      photos?.front?.current || photos?.side?.current || photos?.back?.current,
    );

    if (!hasCurrent) {
      toast.error("Upload at least one final photo in 'Current' before closing the block.");
      return;
    }

    closeAndArchiveBlock.mutate(
      {
        blockId: `${phaseTitle}-${blockName}`,
        blockName: `${phaseTitle} • ${blockName}`,
      },
      {
        onSuccess: () => toast.success("Block closed! Baseline populated for next block."),
        onError: () => toast.error("Could not archive block photos."),
      }
    );
  };

  const slots: Array<{ slot: PhotoSlot; label: string; sublabel: string }> = [
    { slot: "baseline", label: "Block Baseline", sublabel: "Day 1 Anchor" },
    { slot: "current", label: "Current / Final", sublabel: "Latest Checkpoint" },
  ];

  return (
    <section className={`panel p-5 space-y-4 transition-all duration-500 ${requiresAttention ? "border-amber-500/50 bg-amber-500/5 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.15)]" : "border-primary/30 bg-surface-2/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Camera className={`size-5 transition-colors ${requiresAttention ? "text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" : "text-primary"}`} />
          <h2 className="text-lg font-bold">Photo Checkpoint</h2>
          {upload.isPending && <Loader2 className="size-4 animate-spin text-primary" />}
        </div>

        <div className="flex items-center gap-2">
          {(archive?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setArchiveOpen(true)}
              className="flex items-center gap-1 rounded-md border border-border bg-surface-2/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <FolderArchive className="size-3.5 text-primary" />
              Archive ({archive.length})
            </button>
          )}

          <div className="flex rounded-lg border border-border bg-surface-2/60 p-1">
            {ANGLES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAngle(a.id)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  selectedAngle === a.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DYNAMIC CONTEXT BANNER */}
      {requiresAttention && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-3">
          <AlertCircle className="size-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-amber-500">
              {hasDebt ? "Photos Overdue" : "Photo Checkpoint Week"}
            </p>
            <p className="text-muted-foreground">
              {hasDebt 
                ? "You locked in without uploading photos. Upload your checkpoint photos now to clear this requirement." 
                : "It's photo week. Remember to take and upload your photos in prep for Sunday's lock-in."}
            </p>
          </div>
        </div>
      )}

      {isFinalWeek && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs">
            <CheckCircle2 className="size-4" />
            <span>Final Week of {blockName}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Lock in your final Friday check-in photos. Closing this block archives your progress and automatically seeds your final photos as the baseline for the next block.
          </p>
          <Button
            size="sm"
            className="w-full font-semibold"
            disabled={closeAndArchiveBlock.isPending}
            onClick={handleCloseBlock}
          >
            {closeAndArchiveBlock.isPending ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <Archive className="size-4 mr-1.5" />
            )}
            Finalize & Close Block
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {slots.map(({ slot, label, sublabel }) => {
          const photoSrc = activeAnglePhotos[slot];
          return (
            <div key={slot} className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="stat-label font-semibold text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{sublabel}</p>
                </div>
                {photoSrc && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setModalImage({
                          src: photoSrc,
                          title: `${label} (${selectedAngle.toUpperCase()})`,
                        })
                      }
                      aria-label={`View ${label}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removePhoto.mutate(
                          { angle: selectedAngle, slot },
                          {
                            onSuccess: () => {
                              if (slot === "current") {
                                const hasOtherCurrent = ANGLES.some(
                                  (a) => a.id !== selectedAngle && photos?.[a.id]?.current
                                );

                                if (!hasOtherCurrent) {
                                  localStorage.removeItem(`p35_photo_cleared_week_${currentWeek}`);
                                  
                                  const wasPendingDebt = localStorage.getItem("p35_photo_was_pending_debt") === "true";
                                  if (wasPendingDebt) {
                                    localStorage.setItem("p35_photo_checkpoint_pending", "true");
                                    localStorage.removeItem("p35_photo_was_pending_debt");
                                  }
                                  
                                  window.dispatchEvent(new Event("p35-photo-pending-updated"));
                                }
                              }
                            },
                          }
                        );
                      }}
                      aria-label={`Delete ${label}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => pick(slot)}
                className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition-all ${
                  photoSrc
                    ? "border-border bg-surface-2/50 active:border-primary"
                    : "border-border/70 bg-surface-2/20 hover:border-primary/50 hover:bg-surface-2/40 active:border-primary"
                }`}
              >
                {photoSrc ? (
                  <img
                    src={photoSrc}
                    alt={`${label} (${selectedAngle})`}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="grid size-9 place-items-center rounded-lg bg-surface-2 text-primary">
                      <ImagePlus className="size-4" />
                    </div>
                    Tap to upload
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <Button
        variant={requiresAttention ? "default" : "secondary"}
        className={`w-full transition-colors ${requiresAttention ? "bg-amber-500 text-black hover:bg-amber-400 font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)]" : ""}`}
        disabled={upload.isPending}
        onClick={() => pick("current")}
      >
        <ImagePlus className="size-4 mr-2" /> 
        {requiresAttention ? "Upload Checkpoint Photos" : `Upload current (${selectedAngle})`}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {modalImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={() => setModalImage(null)}>
          <div className="relative max-h-[90vh] max-w-sm w-full overflow-hidden rounded-2xl border border-border bg-surface-2 p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs font-semibold text-primary">{modalImage.title}</p>
              <button type="button" onClick={() => setModalImage(null)} className="rounded-full bg-surface-2/80 p-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <img src={modalImage.src} alt={modalImage.title} className="max-h-[75vh] w-full rounded-xl object-contain" />
          </div>
        </div>
      )}

      {archiveOpen && (
        <ArchiveModal archive={archive} angle={archiveAngle} onAngleChange={setArchiveAngle} onClose={() => setArchiveOpen(false)} />
      )}
    </section>
  );
}

function ArchiveModal({
  archive = [],
  angle,
  onAngleChange,
  onClose,
}: {
  archive: ArchivedBlockPhotos[];
  angle: PhotoAngle;
  onAngleChange: (a: PhotoAngle) => void;
  onClose: () => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-lg w-full flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <FolderArchive className="size-4 text-primary" />
            <h3 className="text-sm font-bold">Historical Block Archive</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-1 border-b border-border/60 bg-surface-2/30 p-2">
          {ANGLES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAngleChange(a.id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${angle === a.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-4 space-y-3">
          {archive.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No archived blocks yet.</p>
          ) : (
            archive.map((record, idx) => {
              const angleData = record[angle] || { baseline: null, final: null };
              const isOpen = openIndex === idx;

              return (
                <div key={record.blockId + record.dateClosed} className="rounded-xl border border-border bg-surface-2/30 overflow-hidden transition-all">
                  <button type="button" onClick={() => setOpenIndex(isOpen ? null : idx)} className="w-full flex items-center justify-between p-3.5 text-left hover:bg-surface-2/50 transition-colors">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-foreground">{record.blockName}</p>
                      <p className="text-[10px] text-muted-foreground">Closed {record.dateClosed}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                      <span>{isOpen ? "Hide" : "View"}</span>
                      {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="p-3 border-t border-border/60 bg-surface-2/20">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="stat-label text-center">Baseline</p>
                          <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border bg-surface-2">
                            {angleData.baseline ? (
                              <img src={angleData.baseline} alt="Baseline" className="size-full object-cover" />
                            ) : (
                              <div className="grid size-full place-items-center text-[10px] text-muted-foreground">No Photo</div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="stat-label text-center">Final Result</p>
                          <div className="aspect-[3/4] overflow-hidden rounded-lg border border-border bg-surface-2">
                            {angleData.final ? (
                              <img src={angleData.final} alt="Final" className="size-full object-cover" />
                            ) : (
                              <div className="grid size-full place-items-center text-[10px] text-muted-foreground">No Photo</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
