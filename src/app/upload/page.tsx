"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { useSnackbar } from "notistack";
import { putImage, deleteImage } from "@/lib/idb";
import { apiFetch } from "@/lib/api-client";
import { friendlyError } from "@/lib/friendly-error";
import PageHeader from "@/components/page-header";
import StylingOverlay from "@/components/styling-overlay";
import { BRAND_GRADIENT } from "@/lib/theme";
import type { AnalyzedTags } from "@/lib/types";

type Status =
  | "pending"
  | "compressing"
  | "storing"
  | "analyzing"
  | "throttled"
  | "saving"
  | "done"
  | "error";

type Job = {
  id: string;
  file: File;
  previewUrl: string;
  status: Status;
  error?: string;
  tags?: AnalyzedTags;
  sizeKbBefore: number;
  sizeKbAfter?: number;
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Queued",
  compressing: "Compressing to WebP",
  storing: "Storing locally (IndexedDB)",
  analyzing: "Tagging with Gemini",
  throttled: "Rate limit — waiting to retry",
  saving: "Saving tags",
  done: "Done",
  error: "Failed",
};

// Pace the *start* of consecutive analyze calls at least this far apart so
// we don't burst past Gemini's RPM ceiling. The value is conservative on
// purpose — bumping it lower trades smoothness for a small speedup.
const MIN_ANALYZE_GAP_MS = 6500;

// We send up to this many images per Gemini call to amortize request
// overhead — one network round trip handles a whole batch. Must stay
// ≤ the server's MAX_BATCH_SIZE.
const ANALYZE_BATCH_SIZE = 5;

// Maximum times we'll silently retry one batch when the server says
// RATE_LIMITED. After this we surface a real error so the user can decide.
const MAX_RATE_LIMIT_RETRIES = 3;

// Per-image size ceiling before compression. Modern phone cameras already
// hover at 3-6 MB per shot, so 5 MB lets typical uploads through while
// blocking obvious abuse (4K RAW dumps, screenshots of full PDFs, etc.)
// before they ever touch the compression worker.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

type AnalyzeBatchResult =
  | { id: string; ok: true; tags: AnalyzedTags }
  | { id: string; ok: false; code: "NOT_CLOTHING" | "MISSING"; error: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function blobToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default function UploadPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const updateJob = (id: string, patch: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Bucket dropped files into three groups so we can both keep valid
    // ones AND surface a single toast summarizing what was rejected.
    const accepted: File[] = [];
    let nonImageCount = 0;
    let oversizedCount = 0;

    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        nonImageCount += 1;
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        oversizedCount += 1;
        continue;
      }
      accepted.push(f);
    }

    if (nonImageCount > 0 || oversizedCount > 0) {
      const parts: string[] = [];
      if (oversizedCount > 0) {
        parts.push(
          `${oversizedCount} over ${MAX_IMAGE_MB} MB`,
        );
      }
      if (nonImageCount > 0) {
        parts.push(`${nonImageCount} not an image`);
      }
      enqueueSnackbar(`Skipped ${parts.join(" · ")}`, { variant: "warning" });
    }

    if (accepted.length === 0) return;

    const next: Job[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "pending" as Status,
      sizeKbBefore: Math.round(file.size / 1024),
    }));
    setJobs((prev) => [...prev, ...next]);
  };

  const removeJob = (id: string) => {
    setJobs((prev) => {
      const target = prev.find((j) => j.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((j) => j.id !== id);
    });
  };

  // Prepare a single job for analysis: compress, store locally, return the
  // base64 payload. Throws on compression / IDB failures so the caller can
  // mark the job as errored without dragging the whole batch down.
  const prepareJob = async (job: Job): Promise<string> => {
    updateJob(job.id, { status: "compressing", error: undefined });
    const compressed = await imageCompression(job.file, {
      maxSizeMB: 0.1,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: 0.8,
    });
    const sizeKbAfter = Math.round(compressed.size / 1024);
    updateJob(job.id, { sizeKbAfter });

    updateJob(job.id, { status: "storing" });
    await putImage(job.id, compressed);

    return blobToBase64(compressed);
  };

  // Analyze a group of jobs in a single Gemini call with bounded retries on
  // RATE_LIMITED / MODEL_BUSY. Returns per-job results keyed by job id; if the
  // batch itself blew up (network / parsing / quota exhausted) we throw and
  // the caller marks each participant as failed.
  const analyzeBatchWithRetry = async (
    batch: { id: string; base64: string }[],
  ): Promise<AnalyzeBatchResult[]> => {
    const payload = {
      images: batch.map((b) => ({
        id: b.id,
        imageBase64: b.base64,
        mimeType: "image/webp",
      })),
    };

    for (let attempt = 1; attempt <= MAX_RATE_LIMIT_RETRIES + 1; attempt++) {
      batch.forEach((b) =>
        updateJob(b.id, { status: "analyzing", error: undefined }),
      );

      const res = await apiFetch("/api/analyze", {
        method: "POST",
        json: payload,
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && Array.isArray(json.results)) {
        return json.results as AnalyzeBatchResult[];
      }

      const retryable =
        (res.status === 429 && json.code === "RATE_LIMITED") ||
        (res.status === 503 && json.code === "MODEL_BUSY");

      if (retryable && attempt <= MAX_RATE_LIMIT_RETRIES) {
        const wait = Math.min(
          30_000,
          (json.retryAfterMs as number | undefined) ?? 8_000 * attempt,
        );
        batch.forEach((b) => updateJob(b.id, { status: "throttled" }));
        await sleep(wait);
        continue;
      }

      throw new Error(json.error || "Gemini analyze failed");
    }
    throw new Error("Gemini quota exhausted, try again in a minute.");
  };

  // Mark one job as failed and clean up its local blob. NOT_CLOTHING jobs
  // get removed entirely (the warning toast already told the user).
  const failJob = async (
    jobId: string,
    code: string | undefined,
    rawMsg: string,
  ) => {
    try {
      await deleteImage(jobId);
    } catch {
      // ignore
    }
    if (code === "NOT_CLOTHING") {
      removeJob(jobId);
      return;
    }
    updateJob(jobId, { status: "error", error: friendlyError(rawMsg) });
  };

  // Save Gemini's tags for one job. Runs after the batched analyze.
  const saveJob = async (jobId: string, tags: AnalyzedTags) => {
    updateJob(jobId, { status: "saving", tags });
    const sRes = await apiFetch("/api/wardrobe", {
      method: "POST",
      json: { id: jobId, ...tags },
    });
    const sJson = await sRes.json().catch(() => ({}));
    if (!sRes.ok) throw new Error(sJson.error || "Save failed");
    updateJob(jobId, { status: "done" });
  };

  const processAll = async () => {
    setBusy(true);
    try {
      const pending = jobs.filter(
        (j) => j.status === "pending" || j.status === "error",
      );

      // Slice into batches of up to ANALYZE_BATCH_SIZE.
      const batches: Job[][] = [];
      for (let i = 0; i < pending.length; i += ANALYZE_BATCH_SIZE) {
        batches.push(pending.slice(i, i + ANALYZE_BATCH_SIZE));
      }

      let lastBatchStart = 0;
      // We tally outcomes here (rather than off `jobs` at the end) because
      // NOT_CLOTHING jobs get removed by `failJob` and the rest go through
      // the friendlyError mapper — much simpler to just count as we go.
      let skippedCount = 0;
      let failedCount = 0;

      for (const batch of batches) {
        // 1) Compress + store every image in the batch in parallel. Drop any
        //    job whose local prep failed so it doesn't pollute the Gemini call.
        const prepared: { job: Job; base64: string }[] = [];
        await Promise.all(
          batch.map(async (job) => {
            try {
              const base64 = await prepareJob(job);
              prepared.push({ job, base64 });
            } catch (err) {
              const rawMsg = err instanceof Error ? err.message : "Failed";
              await failJob(job.id, undefined, rawMsg);
              failedCount += 1;
            }
          }),
        );
        if (prepared.length === 0) continue;

        // 2) Pace the batch start to stay under the per-minute quota.
        const sinceLast = Date.now() - lastBatchStart;
        if (lastBatchStart && sinceLast < MIN_ANALYZE_GAP_MS) {
          prepared.forEach(({ job }) =>
            updateJob(job.id, { status: "throttled" }),
          );
          await sleep(MIN_ANALYZE_GAP_MS - sinceLast);
        }
        lastBatchStart = Date.now();

        // 3) One Gemini call for the whole prepared group.
        let results: AnalyzeBatchResult[];
        try {
          results = await analyzeBatchWithRetry(
            prepared.map((p) => ({ id: p.job.id, base64: p.base64 })),
          );
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : "Failed";
          await Promise.all(
            prepared.map(({ job }) => failJob(job.id, undefined, rawMsg)),
          );
          failedCount += prepared.length;
          continue;
        }

        // 4) Dispatch per-job results: save success rows, mark non-clothing
        //    and other failures so the per-row UI shows the reason inline.
        //    We deliberately do NOT toast per-row here — a single summary
        //    toast at the end keeps the UI calm (see below).
        await Promise.all(
          results.map(async (r) => {
            if (r.ok) {
              try {
                await saveJob(r.id, r.tags);
              } catch (err) {
                const rawMsg = err instanceof Error ? err.message : "Failed";
                await failJob(r.id, undefined, rawMsg);
                failedCount += 1;
              }
              return;
            }
            await failJob(r.id, r.code, r.error);
            if (r.code === "NOT_CLOTHING") {
              skippedCount += 1;
            } else {
              failedCount += 1;
            }
          }),
        );
      }

      // One summary toast at the end. Skipped/failed rolls into the same
      // message so the user gets a single piece of feedback per
      // "Process all" action instead of one toast per non-clothing image.
      setJobs((latest) => {
        const done = latest.filter((j) => j.status === "done").length;
        if (done === 0 && skippedCount === 0 && failedCount === 0) {
          return latest;
        }
        const parts: string[] = [];
        if (done > 0) {
          parts.push(`Added ${done} item${done === 1 ? "" : "s"}`);
        }
        if (skippedCount > 0) {
          parts.push(`Skipped ${skippedCount} non-clothing`);
        }
        if (failedCount > 0) {
          parts.push(`${failedCount} failed`);
        }
        const variant = done > 0 ? "success" : "warning";
        enqueueSnackbar(parts.join(" · "), { variant });
        return latest;
      });
    } finally {
      setBusy(false);
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
  };

  // Translate the current mix of job statuses into a single user-facing
  // message for the overlay. We pick the "most advanced" active step so the
  // copy reads as forward progress instead of flickering between states.
  const overlayMessage = React.useMemo(() => {
    const active = jobs.filter(
      (j) =>
        j.status === "compressing" ||
        j.status === "storing" ||
        j.status === "analyzing" ||
        j.status === "throttled" ||
        j.status === "saving",
    );
    if (active.length === 0) return "Getting your closet ready…";

    if (active.some((j) => j.status === "throttled"))
      return "Pacing requests so Gemini stays happy…";
    if (active.some((j) => j.status === "saving"))
      return "Saving the new pieces to your closet…";
    if (active.some((j) => j.status === "analyzing"))
      return "Tagging your pieces with Gemini…";
    if (active.some((j) => j.status === "storing"))
      return "Storing photos locally in your browser…";
    return "Compressing your photos…";
  }, [jobs]);

  const totalCount = jobs.length;
  const doneCount = jobs.filter((j) => j.status === "done").length;
  const overlayTitle =
    totalCount > 0
      ? `Styling ${doneCount}/${totalCount} pieces`
      : "Styling in progress";

  return (
    <Box>
      <StylingOverlay
        open={busy}
        title={overlayTitle}
        subtitle={overlayMessage}
      />
      <PageHeader
        eyebrow="Upload"
        title="Add to your closet"
        subtitle="Pick multiple photos. We compress them to WebP under ~100 KB, then ask Gemini to tag them — batched up to 5 per request for speed."
      />

      <Card
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => inputRef.current?.click()}
        sx={{
          p: { xs: 4, sm: 6 },
          border: "2px dashed",
          borderColor: "rgba(99,102,241,0.3)",
          textAlign: "center",
          cursor: "pointer",
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(168,85,247,0.05) 100%)",
          transition: "all 150ms ease",
          ":hover": {
            borderColor: "secondary.main",
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(168,85,247,0.10) 100%)",
          },
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            mx: "auto",
            mb: 2,
            borderRadius: 3,
            background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 12px 28px rgba(99,102,241,0.35)",
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 32 }} />
        </Box>
        <Typography variant="h6" sx={{ fontSize: { xs: 17, sm: 20 }, mb: 0.5 }}>
          Drop images here or click to choose
        </Typography>
        <Typography variant="body2" color="text.secondary">
          PNG, JPG, HEIC, WebP — up to {MAX_IMAGE_MB} MB per image
        </Typography>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </Card>

      <Button
        fullWidth
        size="large"
        startIcon={<AutoFixHighIcon />}
        component={Link}
        href="/dress-me"
        sx={{
          mt: { xs: 2.5, sm: 3 },
          py: 1.5,
          background: BRAND_GRADIENT,
          color: "white",
          fontWeight: 700,
          fontSize: { xs: 15, sm: 16 },
          boxShadow: "0 12px 28px rgba(99,102,241,0.35)",
          ":hover": {
            background: BRAND_GRADIENT,
            filter: "brightness(0.95)",
          },
        }}
      >
        Style me now
      </Button>

      {jobs.length > 0 && (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{
            mt: 3,
            mb: 2,
            alignItems: { xs: "stretch", sm: "center" },
          }}
        >
          <Typography variant="subtitle1" sx={{ flex: 1 }}>
            {jobs.length} item{jobs.length === 1 ? "" : "s"} in queue
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => {
                jobs.forEach((j) => URL.revokeObjectURL(j.previewUrl));
                setJobs([]);
              }}
              disabled={busy}
              sx={{
                flex: { xs: 1, sm: "0 0 auto" },
                borderColor: "rgba(15,23,42,0.18)",
                color: "text.primary",
                bgcolor: "background.paper",
                ":hover": {
                  borderColor: "rgba(15,23,42,0.32)",
                  bgcolor: "rgba(15,23,42,0.04)",
                },
              }}
            >
              Clear
            </Button>
            <Button
              variant="contained"
              startIcon={
                busy ? <CircularProgress size={16} /> : <CloudUploadIcon />
              }
              onClick={processAll}
              disabled={busy || jobs.every((j) => j.status === "done")}
              sx={{ flex: { xs: 1, sm: "0 0 auto" } }}
            >
              {busy ? "Processing…" : "Process all"}
            </Button>
          </Stack>
        </Stack>
      )}

      <Box
        sx={{
          display: "grid",
          gap: { xs: 1.25, sm: 2 },
          gridTemplateColumns: {
            xs: "repeat(2, 1fr)",
            sm: "repeat(3, 1fr)",
            md: "repeat(4, 1fr)",
          },
        }}
      >
        {jobs.map((job) => (
          <Card key={job.id} sx={{ overflow: "hidden" }}>
            <Box
              sx={{
                width: "100%",
                aspectRatio: "1 / 1",
                backgroundImage: `url(${job.previewUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                position: "relative",
              }}
            >
              <Tooltip title="Remove">
                <IconButton
                  size="small"
                  onClick={() => removeJob(job.id)}
                  sx={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    bgcolor: "rgba(255,255,255,0.85)",
                    ":hover": { bgcolor: "white" },
                  }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ p: { xs: 1, sm: 1.5 } }}>
              <Stack
                direction="row"
                spacing={0.75}
                sx={{ mb: 1, alignItems: "center" }}
              >
                <StatusIcon status={job.status} />
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontSize: { xs: 12, sm: 14 },
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {STATUS_LABEL[job.status]}
                </Typography>
              </Stack>
              {(job.status === "compressing" ||
                job.status === "storing" ||
                job.status === "analyzing" ||
                job.status === "throttled" ||
                job.status === "saving") && (
                <LinearProgress
                  color={job.status === "throttled" ? "warning" : "primary"}
                  sx={{ mb: 1, borderRadius: 1 }}
                />
              )}
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
              >
                {job.sizeKbBefore} KB
                {job.sizeKbAfter ? ` → ${job.sizeKbAfter} KB (WebP)` : ""}
              </Typography>
              {job.tags && (
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.5 }}
                >
                  {job.tags.category && (
                    <Chip
                      size="small"
                      color="primary"
                      label={job.tags.category}
                    />
                  )}
                  {job.tags.color && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={job.tags.color}
                    />
                  )}
                  {job.tags.style && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={job.tags.style}
                    />
                  )}
                  {job.tags.vibe && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="secondary"
                      label={job.tags.vibe}
                    />
                  )}
                </Stack>
              )}
              {job.status === "error" && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {job.error}
                </Alert>
              )}
            </Box>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "done")
    return <CheckCircleIcon fontSize="small" color="success" />;
  if (status === "error")
    return <ErrorOutlineIcon fontSize="small" color="error" />;
  if (status === "pending")
    return <HourglassTopIcon fontSize="small" color="disabled" />;
  if (status === "throttled")
    return <HourglassTopIcon fontSize="small" color="warning" />;
  return <CircularProgress size={14} />;
}
