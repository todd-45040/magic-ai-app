import { useEffect, useMemo, useState } from "react"

import * as ideasService from "../services/ideasService"
import * as showsService from "../services/showsService"
import { getFeedback } from "../services/feedbackService"
import { trackClientEvent } from "../services/telemetryClient"

type SearchResult = {
  id: string
  title: string
  content: string
  type: string
  source: string
  date?: string | number
}

export default function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [showIdeas, setShowIdeas] = useState(true)
  const [showShows, setShowShows] = useState(true)
  const [showFeedback, setShowFeedback] = useState(true)
  const [showTasks, setShowTasks] = useState(true)

  const [dateRange, setDateRange] = useState("all")

  const [queryOpen, setQueryOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    void trackClientEvent({
      tool: "global_search",
      action: "search_page_opened",
      metadata: { source: "GlobalSearch" },
    })
  }, [])

  function resetSearch() {
    setQuery("")
    setResults([])
    setSelected(null)

    setShowIdeas(true)
    setShowShows(true)
    setShowFeedback(true)
    setShowTasks(true)

    setDateRange("all")

    void trackClientEvent({
      tool: "global_search",
      action: "search_reset",
      metadata: {},
    })
  }

  function matchesQuery(record: unknown) {
    if (!query.trim()) return true
    const text = JSON.stringify(record ?? {}).toLowerCase()
    return text.includes(query.trim().toLowerCase())
  }

  function withinDateRange(value?: string | number) {
    if (dateRange === "all") return true
    if (!value) return true

    const timestamp =
      typeof value === "number" ? value : new Date(value).getTime()

    if (!Number.isFinite(timestamp)) return true

    const now = Date.now()
    const diff = now - timestamp
    const days = diff / (1000 * 60 * 60 * 24)

    if (dateRange === "7") return days <= 7
    if (dateRange === "30") return days <= 30

    return true
  }

  async function runSearch() {
    setIsLoading(true)
    setSelected(null)

    try {
      const allResults: SearchResult[] = []

      let shows: any[] = []
      let ideas: any[] = []
      let feedback: any[] = []

      if (showShows || showTasks) {
        try {
          shows = await showsService.getShows()
        } catch (error) {
          console.error("Failed to load shows", error)
        }
      }

      if (showIdeas) {
        try {
          ideas = await ideasService.getSavedIdeas()
        } catch (error) {
          console.error("Failed to load ideas", error)
        }
      }

      if (showFeedback) {
        try {
          feedback = getFeedback() || []
        } catch (error) {
          console.error("Failed to load feedback", error)
        }
      }

      if (showIdeas) {
        ideas.forEach((idea: any) => {
          const recordDate = idea.timestamp

          if (matchesQuery(idea) && withinDateRange(recordDate)) {
            allResults.push({
              id: String(idea.id),
              title: idea.title || "Idea",
              content: idea.content || "",
              type: "Idea",
              source: "ideas",
              date: recordDate,
            })
          }
        })
      }

      if (showShows) {
        shows.forEach((show: any) => {
          const recordDate = show.createdAt || show.created_at

          if (matchesQuery(show) && withinDateRange(recordDate)) {
            allResults.push({
              id: String(show.id),
              title: show.title || show.name || "Show",
              content: show.description || show.notes || "",
              type: "Show",
              source: "shows",
              date: recordDate,
            })
          }
        })
      }

      if (showTasks) {
        shows.forEach((show: any) => {
          const tasks = Array.isArray(show.tasks) ? show.tasks : []

          tasks.forEach((task: any) => {
            const recordDate =
              task.createdAt || task.created_at || task.dueDate || task.due_date

            if (matchesQuery(task) && withinDateRange(recordDate)) {
              allResults.push({
                id: `${show.id}-${task.id}`,
                title: task.title || "Task",
                content: task.notes || task.description || "",
                type: "Task",
                source: "tasks",
                date: recordDate,
              })
            }
          })
        })
      }

      if (showFeedback) {
        feedback.forEach((item: any) => {
          const recordDate = item.timestamp

          if (matchesQuery(item) && withinDateRange(recordDate)) {
            allResults.push({
              id: String(item.id),
              title: item.showTitle || item.name || "Feedback",
              content: item.comment || "",
              type: "Feedback",
              source: "feedback",
              date: recordDate,
            })
          }
        })
      }

      allResults.sort((a, b) => {
        const aTime =
          typeof a.date === "number"
            ? a.date
            : a.date
              ? new Date(a.date).getTime()
              : 0

        const bTime =
          typeof b.date === "number"
            ? b.date
            : b.date
              ? new Date(b.date).getTime()
              : 0

        return bTime - aTime
      })

      setResults(allResults)

      void trackClientEvent({
        tool: "global_search",
        action: "search_query_run",
        metadata: {
          query,
          resultCount: allResults.length,
          filters: {
            showIdeas,
            showShows,
            showFeedback,
            showTasks,
            dateRange,
          },
        },
      })
    } finally {
      setIsLoading(false)
    }
  }

  function toggleResult(r: SearchResult) {
    setSelected(r)

    void trackClientEvent({
      tool: "global_search",
      action: "search_result_opened",
      metadata: {
        type: r.type,
        source: r.source,
        id: r.id,
      },
    })
  }

  const resultCountLabel = useMemo(() => {
    if (isLoading) return "Searching..."
    if (results.length === 0) return "No results"
    if (results.length === 1) return "1 result"
    return `${results.length} results`
  }, [isLoading, results.length])

  return (
    <div className="flex w-full h-full min-h-0 bg-[#0b1020] text-white">
      <div className="w-full max-w-[380px] border-r border-white/10 p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Search</h2>

          <button
            onClick={resetSearch}
            className="text-sm px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10"
          >
            Reset
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5">
          <button
            onClick={() => setQueryOpen(!queryOpen)}
            className="font-semibold w-full text-left px-4 py-3"
          >
            Search Query
          </button>

          {queryOpen && (
            <div className="px-4 pb-4">
              <input
                className="w-full p-3 rounded-xl border border-white/10 bg-black/30"
                placeholder="Search keyword..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <button
                onClick={runSearch}
                className="mt-3 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500"
              >
                {isLoading ? "Searching..." : "Search"}
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="font-semibold w-full text-left px-4 py-3"
          >
            Content Type
          </button>

          {filtersOpen && (
            <div className="px-4 pb-4 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showIdeas}
                  onChange={() => setShowIdeas(!showIdeas)}
                />
                <span>Ideas</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showShows}
                  onChange={() => setShowShows(!showShows)}
                />
                <span>Shows</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showTasks}
                  onChange={() => setShowTasks(!showTasks)}
                />
                <span>Tasks</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showFeedback}
                  onChange={() => setShowFeedback(!showFeedback)}
                />
                <span>Feedback</span>
              </label>
            </div>
          )}
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="font-semibold w-full text-left px-4 py-3"
          >
            Advanced Filters
          </button>

          {advancedOpen && (
            <div className="px-4 pb-4">
              <label className="block text-sm mb-2">Date Range</label>

              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full p-3 rounded-xl border border-white/10 bg-black/30"
              >
                <option value="all">All Time</option>
                <option value="30">Last 30 Days</option>
                <option value="7">Last 7 Days</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Search Results</h2>
          <div className="text-sm text-white/60">{resultCountLabel}</div>
        </div>

        {!isLoading && results.length === 0 && (
          <div className="text-white/50 rounded-2xl border border-white/10 bg-white/5 p-4">
            No results yet.
          </div>
        )}

        <div className="space-y-3">
          {results.map((r) => (
            <div
              key={r.id}
              className="p-4 rounded-2xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10"
              onClick={() => toggleResult(r)}
            >
              <div className="font-semibold">{r.title}</div>
              <div className="text-sm text-white/50 mt-1">{r.type}</div>
              <div className="text-sm mt-2 line-clamp-2 text-white/80">
                {r.content}
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="mt-6 p-4 rounded-2xl border border-purple-400/30 bg-purple-500/5">
            <h3 className="font-bold text-lg mb-2">{selected.title}</h3>

            <div className="text-sm text-white/50 mb-3">
              {selected.type} • {selected.source}
            </div>

            <div className="whitespace-pre-wrap text-white/90">
              {selected.content}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}