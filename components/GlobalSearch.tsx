import { useEffect, useState } from "react"

import ideasService from "../services/ideasService"
import showsService from "../services/showsService"
import feedbackService from "../services/feedbackService"
import tasksService from "../services/tasksService"

type SearchResult = {
  id: string
  title: string
  content: string
  type: string
  source: string
  date?: string
}

export default function GlobalSearch() {

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<SearchResult | null>(null)

  const [showIdeas, setShowIdeas] = useState(true)
  const [showShows, setShowShows] = useState(true)
  const [showFeedback, setShowFeedback] = useState(true)
  const [showTasks, setShowTasks] = useState(true)

  const [dateRange, setDateRange] = useState("all")

  const [queryOpen, setQueryOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    track("search_page_opened")
  }, [])

  function track(event: string, data: any = {}) {
    try {
      console.log("telemetry", event, data)
    } catch {}
  }

  function resetSearch() {

    setQuery("")
    setResults([])
    setSelected(null)

    setShowIdeas(true)
    setShowShows(true)
    setShowFeedback(true)
    setShowTasks(true)

    setDateRange("all")

    track("search_reset")
  }

  function runSearch() {

    track("search_query_run", { query })

    const allResults: SearchResult[] = []

    if (showIdeas) {
      const ideas = ideasService.getIdeas?.() || []
      ideas.forEach((idea: any) => {

        if (matches(idea)) {
          allResults.push({
            id: idea.id,
            title: idea.title || "Idea",
            content: idea.content || "",
            type: "Idea",
            source: "ideas",
            date: idea.created
          })
        }

      })
    }

    if (showShows) {
      const shows = showsService.getShows?.() || []

      shows.forEach((show: any) => {

        if (matches(show)) {
          allResults.push({
            id: show.id,
            title: show.name || "Show",
            content: show.description || "",
            type: "Show",
            source: "shows",
            date: show.created
          })
        }

      })
    }

    if (showFeedback) {

      const feedback = feedbackService.getFeedback?.() || []

      feedback.forEach((item: any) => {

        if (matches(item)) {
          allResults.push({
            id: item.id,
            title: item.title || "Feedback",
            content: item.notes || "",
            type: "Feedback",
            source: "feedback",
            date: item.created
          })
        }

      })

    }

    if (showTasks) {

      const tasks = tasksService.getTasks?.() || []

      tasks.forEach((task: any) => {

        if (matches(task)) {
          allResults.push({
            id: task.id,
            title: task.title || "Task",
            content: task.notes || "",
            type: "Task",
            source: "tasks",
            date: task.created
          })
        }

      })

    }

    setResults(allResults)
  }

  function matches(record: any) {

    if (!query) return true

    const text = JSON.stringify(record).toLowerCase()

    return text.includes(query.toLowerCase())
  }

  function toggleResult(r: SearchResult) {
    setSelected(r)
    track("search_result_opened", { type: r.type })
  }

  return (

    <div className="flex w-full h-full">

      {/* LEFT PANEL */}

      <div className="w-1/3 p-4 border-r border-gray-700">

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Search</h2>

          <button
            onClick={resetSearch}
            className="text-sm px-3 py-1 border rounded"
          >
            Reset
          </button>
        </div>

        {/* QUERY */}

        <div className="mb-4">

          <button
            onClick={() => setQueryOpen(!queryOpen)}
            className="font-semibold w-full text-left"
          >
            Search Query
          </button>

          {queryOpen && (

            <div className="mt-2">

              <input
                className="w-full p-2 border rounded bg-black"
                placeholder="Search keyword..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <button
                onClick={runSearch}
                className="mt-2 px-4 py-2 bg-purple-600 rounded"
              >
                Search
              </button>

            </div>

          )}

        </div>

        {/* CONTENT TYPE */}

        <div className="mb-4">

          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="font-semibold w-full text-left"
          >
            Content Type
          </button>

          {filtersOpen && (

            <div className="mt-2 space-y-1">

              <label className="block">
                <input
                  type="checkbox"
                  checked={showIdeas}
                  onChange={() => setShowIdeas(!showIdeas)}
                />
                Ideas
              </label>

              <label className="block">
                <input
                  type="checkbox"
                  checked={showShows}
                  onChange={() => setShowShows(!showShows)}
                />
                Shows
              </label>

              <label className="block">
                <input
                  type="checkbox"
                  checked={showFeedback}
                  onChange={() => setShowFeedback(!showFeedback)}
                />
                Feedback
              </label>

              <label className="block">
                <input
                  type="checkbox"
                  checked={showTasks}
                  onChange={() => setShowTasks(!showTasks)}
                />
                Tasks
              </label>

            </div>

          )}

        </div>

        {/* ADVANCED */}

        <div className="mb-4">

          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="font-semibold w-full text-left"
          >
            Advanced Filters
          </button>

          {advancedOpen && (

            <div className="mt-2">

              <label className="block text-sm mb-1">
                Date Range
              </label>

              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full p-2 border rounded bg-black"
              >

                <option value="all">All Time</option>
                <option value="30">Last 30 Days</option>
                <option value="7">Last 7 Days</option>

              </select>

            </div>

          )}

        </div>

      </div>

      {/* RIGHT PANEL */}

      <div className="flex-1 p-4 overflow-y-auto">

        <h2 className="text-xl font-bold mb-4">Search Results</h2>

        {results.length === 0 && (
          <div className="text-gray-400">
            No results yet.
          </div>
        )}

        <div className="space-y-3">

          {results.map((r) => (

            <div
              key={r.id}
              className="p-3 border rounded cursor-pointer hover:bg-gray-800"
              onClick={() => toggleResult(r)}
            >

              <div className="font-semibold">{r.title}</div>

              <div className="text-sm text-gray-400">
                {r.type}
              </div>

              <div className="text-sm mt-1 line-clamp-2">
                {r.content}
              </div>

            </div>

          ))}

        </div>

        {selected && (

          <div className="mt-6 p-4 border rounded bg-gray-900">

            <h3 className="font-bold text-lg mb-2">
              {selected.title}
            </h3>

            <div className="text-sm text-gray-400 mb-2">
              {selected.type}
            </div>

            <div className="whitespace-pre-wrap">
              {selected.content}
            </div>

          </div>

        )}

      </div>

    </div>

  )
}