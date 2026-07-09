"use client"

import { useMemo } from "react"
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    type ChartData,
    type ChartOptions,
    type ScriptableContext,
} from "chart.js"
import { Line } from "react-chartjs-2"

/*
 * Line/area pieces. Additive to the ArcElement/Tooltip the panel already
 * registers for the pies — Chart.js dedupes, so no conflict.
 */
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip
)

interface MonthBucket {
    month: number // 1–12
    leads: number
    converted: number
}

const MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
// Single-letter labels for narrow screens: J F M A M J J A S O N D
const MONTH_INITIALS = MONTH_NAMES.map((m) => m[0])

/**
 * Lightweight area line, one shape for the year:
 *   - Total leads   → filled area line (the headline shape)
 *   - Converted     → thin flat line beneath
 *
 * No gridlines, minimal axis chrome. Width-flexible: fits any container
 * with no horizontal scroll, so it works down to a narrow phone viewport.
 *
 * Expects a dense 12-slot array (same fillMonths output the table uses).
 */
export default function LeadsMonthlyChart({
    months,
}: {
    months: MonthBucket[]
}) {
    const chartData: ChartData<"line"> = useMemo(() => {
        return {
            labels: months.map((m) => MONTH_NAMES[m.month - 1]),
            datasets: [
                {
                    label: "Total leads",
                    data: months.map((m) => m.leads),
                    borderColor: "#3b82f6",
                    borderWidth: 2,
                    fill: true,
                    backgroundColor: (ctx: ScriptableContext<"line">) => {
                        // Soft vertical gradient under the total line.
                        const { chart } = ctx
                        const { ctx: c, chartArea } = chart
                        if (!chartArea) return "rgba(59,130,246,0.12)"
                        const g = c.createLinearGradient(
                            0,
                            chartArea.top,
                            0,
                            chartArea.bottom
                        )
                        g.addColorStop(0, "rgba(59,130,246,0.22)")
                        g.addColorStop(1, "rgba(59,130,246,0.00)")
                        return g
                    },
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: "#3b82f6",
                },
                {
                    label: "Converted",
                    data: months.map((m) => m.converted),
                    borderColor: "#10b981",
                    borderWidth: 1.5,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: "#10b981",
                    borderDash: [4, 3],
                },
            ],
        }
    }, [months])

    const options: ChartOptions<"line"> = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            layout: { padding: { top: 4, right: 4, bottom: 0, left: 0 } },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        font: { size: 9 },
                        color: "#94a3b8",
                        maxRotation: 0,
                        autoSkip: false,
                        // Full month name has no room on phones; the wrapper
                        // swaps to initials below md via a CSS-driven remount.
                        callback(_val, index) {
                            return MONTH_INITIALS[index]
                        },
                    },
                },
                y: {
                    display: false, // no y-axis chrome — keeps it light
                    beginAtZero: true,
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    padding: 10,
                    titleFont: { size: 12 },
                    bodyFont: { size: 12 },
                    callbacks: {
                        title: (items) => {
                            const idx = items[0]?.dataIndex ?? 0
                            return MONTH_NAMES[months[idx].month - 1]
                        },
                        afterBody: (items) => {
                            const idx = items[0]?.dataIndex ?? 0
                            const m = months[idx]
                            if (!m || m.leads === 0) return "No leads"
                            const rate = Math.round(
                                (m.converted / m.leads) * 100
                            )
                            return `${rate}% converted`
                        },
                    },
                },
            },
        }),
        [months]
    )

    return (
        <div className="h-40">
            <Line data={chartData} options={options} />
        </div>
    )
}