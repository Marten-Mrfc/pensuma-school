"use client";

import { BarChart } from "@/components/ui/charts/bar-chart";
import { useChartTheme } from "@/components/ui/charts/useChartTheme";

type Bin = { label: string; from: number; to: number; count: number };

/** Number of students per grade bin (1–2 … 9–10); bins below 5 are red. */
export function GradeDistributionChart({ bins, height = 240 }: { bins: Bin[]; height?: number }) {
  const theme = useChartTheme();
  const data = bins.map((b) => ({ x: b.label, y: b.count, fail: b.to <= 5 }));
  return (
    <BarChart
      data={data}
      height={height}
      radius={4}
      ariaLabel="Verdeling van de cijfers"
      option={{
        grid: { top: 16, bottom: 8, left: 4, right: 8 },
        yAxis: { minInterval: 1, name: "", axisLabel: { formatter: (v: number) => String(v) } },
        tooltip: {
          trigger: "item",
          formatter: (p: { name: string; value: number }) =>
            `Cijfer ${p.name}<br/><b>${p.value}</b> ${p.value === 1 ? "leerling" : "leerlingen"}`,
        },
        series: [
          {
            barMaxWidth: 40,
            itemStyle: {
              color: (p: { dataIndex: number }) => (data[p.dataIndex]?.fail ? theme.dangerColor : theme.accentColor),
            },
          },
        ],
      }}
    />
  );
}

/** Average score per question as a percentage of the points. */
export function QuestionAverageChart({
  items,
  height = 240,
}: {
  items: { label: string; title: string; percentage: number | null }[];
  height?: number;
}) {
  const theme = useChartTheme();
  const data = items.map((i) => ({ x: i.label, y: i.percentage == null ? 0 : Math.round(i.percentage * 100) }));
  return (
    <BarChart
      data={data}
      height={height}
      radius={4}
      ariaLabel="Gemiddelde score per vraag in procenten"
      option={{
        grid: { top: 16, bottom: 8, left: 4, right: 8 },
        yAxis: { max: 100, axisLabel: { formatter: (v: number) => `${v}%` } },
        tooltip: {
          trigger: "item",
          formatter: (p: { dataIndex: number; value: number }) =>
            `${items[p.dataIndex]?.label} · ${escapeHtml(items[p.dataIndex]?.title ?? "")}<br/>Gemiddeld <b>${p.value}%</b> van de punten`,
        },
        series: [
          {
            barMaxWidth: 28,
            itemStyle: {
              color: (p: { dataIndex: number }) =>
                (data[p.dataIndex]?.y ?? 0) < 50 ? theme.dangerColor : theme.accentColor,
            },
          },
        ],
      }}
    />
  );
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
