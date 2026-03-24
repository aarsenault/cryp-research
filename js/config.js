export const CYCLES = [
  {
    name: "2011",
    athDate: "2011-06-08",
    color: "#888888",
    visibleByDefault: false,
  },
  {
    name: "2013",
    athDate: "2013-11-30",
    color: "#facc15",
    visibleByDefault: true,
  },
  {
    name: "2017",
    athDate: "2017-12-17",
    color: "#fb923c",
    visibleByDefault: true,
  },
  {
    name: "2021",
    athDate: "2021-11-10",
    color: "#f87171",
    visibleByDefault: true,
  },
  {
    name: "2025",
    athDate: "2025-10-06",
    color: "#22d3ee",
    visibleByDefault: true,
    isCurrent: true,
  },
];

// Midterm years: the year after each cycle's ATH (bear/correction year)
export const MIDTERM_YEARS = [
  { name: "2014", startDate: "2014-01-01", color: "#facc15", visibleByDefault: true },
  { name: "2018", startDate: "2018-01-01", color: "#fb923c", visibleByDefault: true },
  { name: "2022", startDate: "2022-01-01", color: "#f87171", visibleByDefault: true },
  { name: "2026", startDate: "2026-01-01", color: "#22d3ee", visibleByDefault: true, isCurrent: true },
];

export const CHART_CONFIG = {
  margin: { top: 40, right: 30, bottom: 50, left: 70 },
  bgColor: "#0a0a1a",
  gridColor: "#1a1a2e",
  textColor: "#e0e0e0",
  meanLineColor: "#ffffff",
  sd1Color: "rgba(100, 100, 255, 0.2)",
  sd2Color: "rgba(100, 100, 255, 0.1)",
  minCyclesForSD: 2,
};
