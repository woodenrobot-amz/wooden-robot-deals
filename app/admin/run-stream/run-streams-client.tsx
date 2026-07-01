"use client";

import { useState } from "react";

type Stream = {
  id: string;
  name: string;
  category_id: string;
};

type RunResult = {
  stream: string;
  category: string;
  found: number;
  processed?: number;
  totalResults: number;
  tokensLeft: number;
  asins: string[];
};

export function RunStreamsClient({ streams }: { streams: Stream[] }) {
  const [loadingStream, setLoadingStream] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runStream(streamName: string) {
    setLoadingStream(streamName);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/run-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to run stream.");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoadingStream(null);
    }
  }

  return (
    <>
      <div className="mt-6 space-y-4">
        {streams.map((stream) => (
          <StreamCard
            key={stream.id}
            label={stream.name}
            description={`${stream.category_id} feed`}
            streamName={stream.id}
            loadingStream={loadingStream}
            onRun={runStream}
          />
        ))}
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-900 bg-red-950 p-6 text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Latest Run</h2>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <Stat label="Stream" value={result.stream} />
            <Stat label="Category" value={result.category} />
            <Stat label="Found" value={result.found} />
            <Stat label="Processed" value={result.processed ?? result.found} />
            <Stat label="Total Results" value={result.totalResults} />
            <Stat label="Keepa Tokens" value={result.tokensLeft} />
          </div>

          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-amber-400">
              View ASINs
            </summary>

            <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-zinc-950 p-4 text-xs text-zinc-300">
              {JSON.stringify(result.asins, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </>
  );
}

function StreamCard({
  label,
  description,
  streamName,
  loadingStream,
  onRun,
}: {
  label: string;
  description: string;
  streamName: string;
  loadingStream: string | null;
  onRun: (streamName: string) => void;
}) {
  const isLoading = loadingStream === streamName;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{label}</h2>
          <p className="mt-2 text-sm text-zinc-400">{description}</p>
        </div>

        <button
          type="button"
          disabled={Boolean(loadingStream)}
          onClick={() => onRun(streamName)}
          className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Running..." : "Run"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-zinc-950 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
