"use client";

import { useEffect } from "react";

const URL_RE = /https?:\/\/[^\s<]+/i;
const PREVIEW_CLASS = "posting-desk-link-preview";

type PreviewData = {
  url: string;
  destinationUrl?: string;
  title?: string;
  image?: string;
  error?: string;
};

function cleanUrl(value: string) {
  const match = value.match(URL_RE)?.[0];
  return match?.replace(/[),.;!?]+$/, "") || "";
}

function previewElement(source: HTMLElement) {
  const container = source.parentElement;
  if (!container) return null;
  let preview = container.querySelector<HTMLElement>(`:scope > .${PREVIEW_CLASS}`);
  if (!preview) {
    preview = document.createElement("div");
    preview.className = `${PREVIEW_CLASS} mt-2 hidden overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80`;
    source.insertAdjacentElement("afterend", preview);
  }
  return preview;
}

function renderLoading(preview: HTMLElement) {
  preview.classList.remove("hidden");
  preview.innerHTML = '<div class="px-3 py-2 text-xs font-semibold text-zinc-500">Checking link…</div>';
}

function renderUnavailable(preview: HTMLElement, url: string) {
  preview.classList.remove("hidden");
  preview.innerHTML = "";
  const row = document.createElement("div");
  row.className = "px-3 py-2";
  const label = document.createElement("div");
  label.className = "text-xs font-bold text-zinc-500";
  label.textContent = "Preview unavailable";
  const link = document.createElement("div");
  link.className = "mt-1 truncate text-xs text-zinc-600";
  link.textContent = url;
  row.append(label, link);
  preview.append(row);
}

function renderPreview(preview: HTMLElement, data: PreviewData) {
  if (data.error || (!data.image && !data.title)) {
    renderUnavailable(preview, data.url);
    return;
  }

  preview.classList.remove("hidden");
  preview.innerHTML = "";
  const row = document.createElement("div");
  row.className = "flex min-w-0 items-center gap-3 p-2";

  if (data.image) {
    const image = document.createElement("img");
    image.src = data.image;
    image.alt = "Link preview";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.className = "h-16 w-16 shrink-0 rounded-lg bg-white object-contain";
    row.append(image);
  }

  const copy = document.createElement("div");
  copy.className = "min-w-0 flex-1";
  const label = document.createElement("div");
  label.className = "text-[10px] font-bold uppercase tracking-wider text-emerald-300";
  label.textContent = "Link check";
  const title = document.createElement("div");
  title.className = "mt-0.5 line-clamp-2 text-xs font-semibold text-zinc-200";
  title.textContent = data.title || "Amazon product";
  const link = document.createElement("div");
  link.className = "mt-1 truncate text-[11px] text-zinc-600";
  link.textContent = data.url;
  copy.append(label, title, link);
  row.append(copy);
  preview.append(row);
}

function isCommentTextarea(element: Element): element is HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement &&
    element.placeholder.startsWith("Add the link, coupon, or follow-up comment");
}

function copyModeCommentSources(root: ParentNode) {
  const sources: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>("span").forEach((label) => {
    if (!/^Comment \d+$/.test(label.textContent?.trim() || "")) return;
    const card = label.closest<HTMLElement>(".rounded-xl.bg-zinc-950\\/70");
    const text = card?.querySelector<HTMLElement>("p.whitespace-pre-wrap");
    if (text && cleanUrl(text.textContent || "")) sources.push(text);
  });
  return sources;
}

export function CommentLinkPreviews() {
  useEffect(() => {
    const controllers = new WeakMap<HTMLElement, AbortController>();
    const timers = new WeakMap<HTMLElement, number>();

    function sourceText(source: HTMLElement) {
      return source instanceof HTMLTextAreaElement ? source.value : source.textContent || "";
    }

    async function update(source: HTMLElement) {
      const preview = previewElement(source);
      if (!preview) return;
      const url = cleanUrl(sourceText(source));
      const previous = preview.dataset.previewUrl || "";
      if (!url) {
        preview.dataset.previewUrl = "";
        preview.classList.add("hidden");
        preview.innerHTML = "";
        return;
      }
      if (url === previous && preview.dataset.previewState === "done") return;

      controllers.get(source)?.abort();
      const controller = new AbortController();
      controllers.set(source, controller);
      preview.dataset.previewUrl = url;
      preview.dataset.previewState = "loading";
      renderLoading(preview);

      try {
        const response = await fetch(`/api/admin/link-preview?url=${encodeURIComponent(url)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as PreviewData;
        if (controller.signal.aborted || cleanUrl(sourceText(source)) !== url) return;
        preview.dataset.previewState = "done";
        renderPreview(preview, { ...data, url });
      } catch {
        if (controller.signal.aborted) return;
        preview.dataset.previewState = "done";
        renderUnavailable(preview, url);
      }
    }

    function schedule(source: HTMLElement, delay = 100) {
      const oldTimer = timers.get(source);
      if (oldTimer) window.clearTimeout(oldTimer);
      const timer = window.setTimeout(() => update(source), delay);
      timers.set(source, timer);
    }

    function sync() {
      document.querySelectorAll("textarea").forEach((element) => {
        if (!isCommentTextarea(element)) return;
        if (element.dataset.linkPreviewListener !== "true") {
          element.dataset.linkPreviewListener = "true";
          element.addEventListener("input", () => schedule(element, 350));
        }
        // React may remove a previously injected sibling during a controlled-input
        // rerender. Always verify the preview still exists instead of relying on an
        // attached flag.
        const preview = previewElement(element);
        if (preview && cleanUrl(element.value) && preview.dataset.previewState !== "done") {
          schedule(element);
        }
      });

      copyModeCommentSources(document).forEach((source) => {
        const preview = previewElement(source);
        if (preview && preview.dataset.previewState !== "done") schedule(source);
      });
    }

    sync();
    let syncTimer = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(sync, 25);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(syncTimer);
      observer.disconnect();
    };
  }, []);

  return null;
}
