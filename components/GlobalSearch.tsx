import { useEffect, useMemo, useState } from "react"

import * as ideasService from "../services/ideasService"
import * as showsService from "../services/showsService"
import { getFeedback } from "../services/feedbackService"
import { trackClientEvent } from "../services/telemetryClient"

type SearchResultType = "Idea" | "Show" | "Task" | "Feedback"

type SearchResult = {
  id: string
  title: string
  content: string
  type: SearchResultType
  source: string
  date?: string | number
  score: number
}

type ResultGroups = {
  ideas: SearchResult[]
  shows: SearchResult[]
  tasks: SearchResult[]
  feedback: SearchResult[]
}

const GROUP_ORDER: Array<keyof ResultGroups> = ["ideas", "shows", "tasks", "feedback"]

const GROUP_LABELS: Record<keyof ResultGroups, string> = {
  ideas: "Ideas",
  shows: "Shows",
  tasks: "Tasks",
  feedback: "Feedback",
}

export default function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const [showIdeas, setShowIdeas] = useState(true)
  const [showShows, setShowShows] = useState(true)
  const [showFeedback, setShowFeedback] = useState(true)
  const [showTasks, setShowTasks] = useState(true)

  const [dateRange, setDateRange] = useState("all")

  const [queryOpen, setQueryOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [ideasGroupOpen, setIdeasGroupOpen] = useState(true)
  const [showsGroupOpen, setShowsGroupOpen] = useState(true)
  const [tasksGroupOpen, setTasksGroupOpen] = useState(true)
  const [feedbackGroupOpen, setFeedbackGroupOpen] = useState(true)

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
    setHasSearched(false)

    setShowIdeas(true)
    setShowShows(true)
    setShowFeedback(true)
    setShowTasks(true)

    setDateRange("all")

    setIdeasGroupOpen(true)
    setShowsGroupOpen(true)
    setTasksGroupOpen(true)
    setFeedbackGroupOpen(true)

    void trackClientEvent({
      tool: "global_search",
      action: "search_reset",
      metadata: {},
    })
  }

  function normalizeText(value: unknown) {
    return String(value ?? "").toLowerCase().trim()
  }

  function tokenizeQuery(value: string) {
    return normalizeText(value)
      .split(/\s+/)
      .filter(Boolean)
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

  function scoreRecord(title: string, content: string, fullRecord: unknown, date?: string | number) {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      return 1
    }

    const normalizedQuery = normalizeText(trimmedQuery)
    const tokens = tokenizeQuery(trimmedQuery)

    const titleText = normalizeText(title)
    const contentText = normalizeText(content)
    const fullText = normalizeText(JSON.stringify(fullRecord ?? {}))

    let score = 0

    if (titleText === normalizedQuery) {
      score += 1000
    }

    if (titleText.includes(normalizedQuery)) {
      score += 500
    }

    if (contentText.includes(normalizedQuery)) {
      score += 250
    }

    if (fullText.includes(normalizedQuery)) {
      score += 150
    }

    for (const token of tokens) {
      if (titleText.includes(token)) score += 40
      if (contentText.includes(token)) score += 20
      if (fullText.includes(token)) score += 10
    }

    if (date) {
      const timestamp =
        typeof date === "number" ? date : new Date(date).getTime()

      if (Number.isFinite(timestamp)) {
        const ageInDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24))

        if (ageInDays <= 7) score += 25
        else if (ageInDays <= 30) score += 15
        else if (ageInDays <= 90) score += 8
      }
    }

    return score
  }

  async function runSearch() {
    setIsLoading(true)
    setSelected(null)
    setHasSearched(true)

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
          const title = idea.title || "Idea"
          const content = idea.content || ""

          if (!withinDateRange(recordDate)) return

          const score = scoreRecord(title, content, idea, recordDate)
          if (query.trim() && score <= 0) return

          allResults.push({
            id: String(idea.id),
            title,
            content,
            type: "Idea",
            source: "ideas",
            date: recordDate,
            score,
          })
        })
      }

      if (showShows) {
        shows.forEach((show: any) => {
          const recordDate = show.createdAt || show.created_at
          const title = show.title || show.name || "Show"
          const content = show.description || show.notes || ""

          if (!withinDateRange(recordDate)) return

          const score = scoreRecord(title, content, show, recordDate)
          if (query.trim() && score <= 0) return

          allResults.push({
            id: String(show.id),
            title,
            content,
            type: "Show",
            source: "shows",
            date: recordDate,
            score,
          })
        })
      }

      if (showTasks) {
        shows.forEach((show: any) => {
          const tasks = Array.isArray(show.tasks) ? show.tasks : []

          tasks.forEach((task: any) => {
            const recordDate =
              task.createdAt || task.created_at || task.dueDate || task.due_date

            const title = task.title || "Task"
            const content = task.notes || task.description || ""
            const enrichedRecord = {
              ...task,
              parentShowTitle: show.title || show.name || "",
            }

            if (!withinDateRange(recordDate)) return

            const score = scoreRecord(title, content, enrichedRecord, recordDate)
            if (query.trim() && score <= 0) return

            allResults.push({
              id: `${show.id}-${task.id}`,
              title,
              content,
              type: "Task",
              source: "tasks",
              date: recordDate,
              score,
            })
          })
        })
      }

      if (showFeedback) {
        feedback.forEach((item: any) => {
          const recordDate = item.timestamp
          const title = item.showTitle || item.name || "Feedback"
          const content = item.comment || ""

          if (!withinDateRange(recordDate)) return

          const score = scoreRecord(title, content, item, recordDate)
          if (query.trim() && score <= 0) return

          allResults.push({
            id: String(item.id),
            title,
            content,
            type: "Feedback",
            source: "feedback",
            date: recordDate,
            score,
          })
        })
      }

      allResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score

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

  function toggleResult(result: SearchResult) {
    setSelected(result)

    void trackClientEvent({
      tool: "global_search",
      action: "search_result_opened",
      metadata: {
        type: result.type,
        source: result.source,
        id: result.id,
      },
    })
  }

  const groupedResults = useMemo<ResultGroups>(() => {
    const groups: ResultGroups = {
      ideas: [],
      shows: [],
      tasks: [],
      feedback: [],
    }

    results.forEach((result) => {
      if (result.type === "Idea") groups.ideas.push(result)
      if (result.type === "Show") groups.shows.push(result)
      if (result.type === "Task") groups.tasks.push(result)
      if (result.type === "Feedback") groups.feedback.push(result)
    })

    return groups
  }, [results])

  const resultCountLabel = useMemo(() => {
    if (isLoading) return "Searching..."
    if (!hasSearched) return "Ready to search"
    if (results.length === 0) return "No results"
    if (results.length === 1) return "1 result"
    return `${results.length} results`
  }, [hasSearched, isLoading, results.length])

  const activeSourceCount = [showIdeas, showShows, showTasks, showFeedback].filter(Boolean).length

  function groupIsOpen(group: keyof ResultGroups) {
    if (group === "ideas") return ideasGroupOpen
    if (group === "shows") return showsGroupOpen
    if (group === "tasks") return tasksGroupOpen
    return feedbackGroupOpen
  }

  function toggleGroup(group: keyof ResultGroups) {
    if (group === "ideas") setIdeasGroupOpen((prev) => !prev)
    if (group === "shows") setShowsGroupOpen((prev) => !prev)
    if (group === "tasks") setTasksGroupOpen((prev) => !prev)
    if (group === "feedback") setFeedbackGroupOpen((prev) => !prev)
  }

  function formatDate(value?: string | number) {
    if (!value) return ""
    const date = typeof value === "number" ? new Date(value) : new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleDateString()
  }

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

        {!hasSearched && !isLoading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/75 mb-4">
            Enter a keyword and search across your saved ideas, shows, tasks, and feedback.
          </div>
        )}

        {hasSearched && !isLoading && results.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70 mb-4">
            <div className="font-semibold text-white mb-2">No results found</div>
            <div className="text-sm">
              Try a broader keyword, expand your content type filters, or switch the date range to All Time.
            </div>
          </div>
        )}

        {GROUP_ORDER.map((groupKey) => {
          const groupResults = groupedResults[groupKey]
          if (groupResults.length === 0) return null

          const open = groupIsOpen(groupKey)

          return (
            <div
              key={groupKey}
              className="mb-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <button
                onClick={() => toggleGroup(groupKey)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{GROUP_LABELS[groupKey]}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                    {groupResults.length}
                  </span>
                </div>

                <span className="text-white/60">{open ? "−" : "+"}</span>
              </button>

              {open && (
                <div className="p-4 pt-0 space-y-3">
                  {groupResults.map((result) => {
                    const isSelected = selected?.id === result.id

                    return (
                      <div
                        key={result.id}
                        className={`p-4 rounded-2xl border cursor-pointer transition ${
                          isSelected
                            ? "border-purple-400/40 bg-purple-500/10"
                            : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                        onClick={() => toggleResult(result)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-white">{result.title}</div>
                            <div className="text-xs text-white/50 mt-1">
                              {result.type} • {result.source}
                              {result.date ? ` • ${formatDate(result.date)}` : ""}
                            </div>
                          </div>

                          <div className="text-[11px] px-2 py-1 rounded-full bg-white/10 text-white/60 whitespace-nowrap">
                            Score {result.score}
                          </div>
                        </div>

                        <div className="text-sm mt-3 line-clamp-3 text-white/80">
                          {result.content || "No preview available."}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {selected && (
          <div className="mt-6 p-4 rounded-2xl border border-purple-400/30 bg-purple-500/5">
            <h3 className="font-bold text-lg mb-2">{selected.title}</h3>

            <div className="text-sm text-white/50 mb-3">
              {selected.type} • {selected.source}
              {selected.date ? ` • ${formatDate(selected.date)}` : ""}
            </div>

            <div className="whitespace-pre-wrap text-white/90">
              {selected.content || "No additional content available."}
            </div>
          </div>
        )}

        {hasSearched && results.length > 0 && activeSourceCount === 1 && (
          <div className="mt-4 text-xs text-white/45">
            Search is currently limited to one content type filter.
          </div>
        )}
      </div>
    </div>
  )
}