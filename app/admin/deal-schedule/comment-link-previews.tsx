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

function previewElement(textarea: HTMLTextAreaElement) {
  let preview = textarea.parentElement?.querySelector<HTMLElement>(`:scope > .${PREVIEW_CLASS}`);
  if (!preview) {
    preview = document.createElement("div");
    preview.className = `${PREVIEW_CLASS} mt-2 hidden overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80`;
    textarea.insertAdjacentElement("afterend", preview);
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

export function CommentLinkPreviews() {
  useEffect(() => {
    const controllers = new WeakMap<HTMLTextAreaElement, AbortController>();
    const timers = new WeakMap<HTMLTextAreaElement, number>();

    function isCommentTextarea(element: Element): element is HTMLTextAreaElement {
      return element instanceof HTMLTextAreaElement &&
        element.placeholder.startsWith("Add the link, coupon, or follow-up comment");
    }

    async function update(textarea: HTMLTextAreaElement) {
      const preview = previewElement(textarea);
      const url = cleanUrl(textarea.value);
      const previous = preview.dataset.previewUrl || "";
      if (!url) {
        preview.dataset.previewUrl = "";
        preview.classList.add("hidden");
        preview.innerHTML = "";
        return;
      }
      if (url === previous && preview.dataset.previewState === "done") return;

      controllers.get(textarea)?.abort();
      const controller = new AbortController();
      controllers.set(textarea, controller);
      preview.dataset.previewUrl = url;
      preview.dataset.previewState = "loading";
      renderLoading(preview);

      try {
        const response = await fetch(`/api/admin/link-preview?url=${encodeURIComponent(url)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as PreviewData;
        if (controller.signal.aborted || cleanUrl(textarea.value) !== url) return;
        preview.dataset.previewState = "done";
        renderPreview(preview, { ...data, url });
      } catch (error) {
        if (controller.signal.aborted) return;
        preview.dataset.previewState = "done";
        renderUnavailable(preview, url);
      }
    }

    function schedule(textarea: HTMLTextAreaElement) {
      const oldTimer = timers.get(textarea);
      if (oldTimer) window.clearTimeout(oldTimer);
      const timer = window.setTimeout(() => update(textarea), 350);
      timers.set(textarea, timer);
    }

    function attach(root: ParentNode = document) {
      root.querySelectorAll("textarea").forEach((element) => {
        if (!isCommentTextarea(element) || element.dataset.linkPreviewAttached === "true") return;
        element.dataset.linkPreviewAttached = "true";
        element.addEventListener("input", () => schedule(element));
        schedule(element);
      });
    }

    attach();
    const observer = new MutationObserver(() => attach());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
