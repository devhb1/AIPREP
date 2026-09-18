"use client";

import { useMemo, useState } from "react";
import { EmptyState, Sheet } from "@/components/ui";

export type GraphNode = {
  id: string;
  kind: "document" | "claim" | "memory" | "note" | "story" | "topic";
  column: "documents" | "claims" | "topics" | "notes";
  label: string;
  status?: string | null;
};

export type GraphEdge = {
  from: string;
  to: string;
  type: string;
};

const COLUMNS: Array<{ id: GraphNode["column"]; label: string; x: number }> = [
  { id: "documents", label: "PDFs", x: 28 },
  { id: "claims", label: "Facts", x: 208 },
  { id: "topics", label: "Topics", x: 388 },
  { id: "notes", label: "Notes", x: 568 },
];

const KIND_FILL: Record<GraphNode["kind"], string> = {
  document: "#57534e",
  claim: "#d97706",
  memory: "#0f766e",
  topic: "#1d4ed8",
  note: "#0369a1",
  story: "#7c3aed",
};

const NODE_W = 152;
const NODE_H = 40;
const ROW_H = 52;

export function MemoryGraph({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layout = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    for (const col of COLUMNS) {
      const colNodes = nodes.filter((n) => n.column === col.id);
      colNodes.forEach((node, index) => {
        positions.set(node.id, { x: col.x, y: 44 + index * ROW_H });
      });
    }
    const height = Math.max(
      180,
      ...COLUMNS.map((col) => {
        const count = nodes.filter((n) => n.column === col.id).length;
        return 60 + count * ROW_H;
      }),
    );
    return { positions, height };
  }, [nodes]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  if (nodes.length === 0) {
    return (
      <EmptyState
        title="No connections yet"
        body="Approve inbox facts or add a note with a topic to grow the graph."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <svg
          width={740}
          height={layout.height}
          viewBox={`0 0 740 ${layout.height}`}
          role="img"
          aria-label="Memory connections"
        >
          {edges.map((edge) => {
            const from = layout.positions.get(edge.from);
            const to = layout.positions.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            return (
              <path
                key={`${edge.from}-${edge.to}-${edge.type}`}
                d={`M ${x1} ${y1} C ${x1 + 36} ${y1}, ${x2 - 36} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={
                  selectedId && (selectedId === edge.from || selectedId === edge.to)
                    ? "#0f766e"
                    : "#e7e5e4"
                }
                strokeWidth={selectedId && (selectedId === edge.from || selectedId === edge.to) ? 2 : 1.2}
              />
            );
          })}
          {COLUMNS.map((col) => (
            <text
              key={col.id}
              x={col.x}
              y={22}
              className="fill-stone-500"
              fontSize="11"
              fontWeight="600"
            >
              {col.label}
            </text>
          ))}
          {nodes.map((node) => {
            const pos = layout.positions.get(node.id);
            if (!pos) return null;
            const active = selectedId === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => setSelectedId(node.id)}
                className="cursor-pointer"
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={active ? KIND_FILL[node.kind] : "#fff"}
                  stroke={KIND_FILL[node.kind]}
                  strokeWidth={1.5}
                />
                <text
                  x={10}
                  y={25}
                  fontSize="11"
                  fill={active ? "#fff" : "#1c1917"}
                >
                  {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <Sheet
        open={Boolean(selected)}
        title={selected?.kind ?? "Item"}
        onClose={() => setSelectedId(null)}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {selected?.kind}
          {selected?.status ? ` · ${selected.status}` : ""}
        </p>
        <p className="mt-2 text-sm text-ink">{selected?.label}</p>
        <p className="mt-3 text-xs text-muted">
          Approve and edit from List view — graph is a map, not a second inbox.
        </p>
      </Sheet>
    </div>
  );
}
