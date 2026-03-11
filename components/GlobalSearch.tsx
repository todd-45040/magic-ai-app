import { useEffect, useMemo, useState } from "react"

import * as ideasService from "../services/ideasService"
import * as showsService from "../services/showsService"
import { getFeedback } from "../services/feedbackService"
import { trackClientEvent } from "../services/telemetryClient"

type SearchResultType = "Idea" | "Show" | "Task" | "Feedback"

type SearchMode = "all" | "titles"

type SearchResult = {
  id: string
  title: string
  content: string
  type: SearchResultType
  source: string
  date?: string | number
  normalizedDate?: number
  score: number
  category?: string
  toolName?: string
  tags: string[]
  showId?: string
  taskId?: string
  ideaId?: string
  feedbackId?: string
  relatedShowTitle?: string
}

type ResultGroups = {
  ideas: SearchResult[]
  shows: SearchResult[]
  tasks: SearchResult[]
  feedback: SearchResult[]
}

type GlobalSearchProps = {
  shows?: any[]
  ideas?: any[]
  onNavigate?: (view: string, primaryId: string, secondaryId?: string) => void
}

const GROUP_ORDER: Array<keyof ResultGroups> = ["ideas", "shows", "tasks", "feedback"]

const GROUP_LABELS: Record<keyof ResultGroups, string> = {
  ideas: "Ideas",
  shows: "Shows",
  tasks: "Tasks",
  feedback: "Feedback",
}

export default function GlobalSearch({
  shows: showsProp,
  ideas: ideasProp,
  onNavigate,
}: GlobalSearchProps) {
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
  const [searchMode, setSearchMode] = useState<SearchMode>("all")

  const [categoryFilter, setCategoryFilter] = useState("all")
  const [toolFilter, setToolFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [tagInput, setTagInput] = useState("")
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([])

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
    setSearchMode("all")
    setCategoryFilter("all")
    setToolFilter("all")
    setSourceFilter("all")
    setTagInput("")
    setActiveTagFilters([])

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

  function normalizeArray(values: unknown): string[] {
    if (!Array.isArray(values)) return []
    return values
      .map((value) => normalizeText(value))
      .filter(Boolean)
  }

  function tokenizeQuery(value: string) {
    return normalizeText(value)
      .split(/\s+/)
      .filter(Boolean)
  }

  function normalizeDate(value?: string | number) {
    if (!value && value !== 0) return undefined

    const timestamp =
      typeof value === "number" ? value : new Date(value).getTime()

    if (!Number.isFinite(timestamp)) return undefined
    return timestamp
  }

  function withinDateRange(value?: string | number) {
    if (dateRange === "all") return true

    const timestamp = normalizeDate(value)
    if (!timestamp) return true

    const now = Date.now()
    const diff = now - timestamp
    const days = diff / (1000 * 60 * 60 * 24)

    if (dateRange === "7") return days <= 7
    if (dateRange === "30") return days <= 30
    if (dateRange === "90") return days <= 90

    return true
  }

  function scoreRecord(
    title: string,
    content: string,
    fullRecord: unknown,
    date?: string | number
  ) {
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

    if (searchMode === "all" && contentText.includes(normalizedQuery)) {
      score += 250
    }

    if (searchMode === "all" && fullText.includes(normalizedQuery)) {
      score += 150
    }

    for (const token of tokens) {
      if (titleText.includes(token)) score += 40
      if (searchMode === "all" && contentText.includes(token)) score += 20
      if (searchMode === "all" && fullText.includes(token)) score += 10
    }

    const timestamp = normalizeDate(date)

    if (timestamp) {
      const ageInDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24))

      if (ageInDays <= 7) score += 25
      else if (ageInDays <= 30) score += 15
      else if (ageInDays <= 90) score += 8
    }

    return score
  }

  function matchesStructuredFilters(result: SearchResult) {
    if (sourceFilter !== "all" && normalizeText(result.source) !== normalizeText(sourceFilter)) {
      return false
    }

    if (categoryFilter !== "all") {
      const resultCategory = normalizeText(result.category)
      if (resultCategory !== normalizeText(categoryFilter)) {
        return false
      }
    }

    if (toolFilter !== "all") {
      const resultTool = normalizeText(result.toolName)
      if (resultTool !== normalizeText(toolFilter)) {
        return false
      }
    }

    if (activeTagFilters.length > 0) {
      const resultTags = result.tags.map((tag) => normalizeText(tag))
      const allTagsPresent = activeTagFilters.every((tag) => resultTags.includes(normalizeText(tag)))
      if (!allTagsPresent) {
        return false
      }
    }

    return true
  }

  function extractTags(...sources: unknown[]) {
    const output = new Set<string>()

    sources.forEach((source) => {
      if (Array.isArray(source)) {
        source.forEach((item) => {
          const normalized = normalizeText(item)
          if (normalized) output.add(normalized)
        })
        return
      }

      if (typeof source === "string") {
        source
          .split(",")
          .map((piece) => normalizeText(piece))
          .filter(Boolean)
          .forEach((piece) => output.add(piece))
      }
    })

    return Array.from(output)
  }

  function normalizeIdea(idea: any): SearchResult | null {
    const rawDate = idea.timestamp || idea.createdAt || idea.created_at
    const normalizedDate = normalizeDate(rawDate)
    const title = idea.title || "Idea"
    const content =
      idea.content ||
      idea.description ||
      idea.notes ||
      ""

    const category =
      idea.category ||
      idea.ideaCategory ||
      "Idea"

    const toolName =
      idea.tool ||
      idea.toolName ||
      "Saved Ideas"

    const tags = extractTags(
      idea.tags,
      idea.tag,
      idea.labels,
      idea.audience,
      idea.style
    )

    if (!withinDateRange(rawDate)) return null

    const score = scoreRecord(title, content, idea, rawDate)
    if (query.trim() && score <= 0) return null

    const result: SearchResult = {
      id: String(idea.id),
      title,
      content,
      type: "Idea",
      source: "ideas",
      date: rawDate,
      normalizedDate,
      score,
      category,
      toolName,
      tags,
      ideaId: String(idea.id),
      showId: idea.showId ? String(idea.showId) : undefined,
      relatedShowTitle: idea.showTitle || idea.showName || undefined,
    }

    return matchesStructuredFilters(result) ? result : null
  }

  function normalizeShow(show: any): SearchResult | null {
    const rawDate = show.createdAt || show.created_at || show.updatedAt || show.updated_at
    const normalizedDate = normalizeDate(rawDate)
    const title = show.title || show.name || "Show"
    const content =
      show.description ||
      show.notes ||
      show.summary ||
      ""

    const category =
      show.category ||
      show.showType ||
      show.type ||
      "Show"

    const toolName =
      show.tool ||
      show.toolName ||
      "Show Planner"

    const tags = extractTags(
      show.tags,
      show.tag,
      show.labels,
      show.audience,
      show.theme,
      show.venueType
    )

    if (!withinDateRange(rawDate)) return null

    const score = scoreRecord(title, content, show, rawDate)
    if (query.trim() && score <= 0) return null

    const result: SearchResult = {
      id: String(show.id),
      title,
      content,
      type: "Show",
      source: "shows",
      date: rawDate,
      normalizedDate,
      score,
      category,
      toolName,
      tags,
      showId: String(show.id),
    }

    return matchesStructuredFilters(result) ? result : null
  }

  function normalizeTask(task: any, parentShow: any): SearchResult | null {
    const rawDate =
      task.createdAt ||
      task.created_at ||
      task.updatedAt ||
      task.updated_at ||
      task.dueDate ||
      task.due_date

    const normalizedDate = normalizeDate(rawDate)
    const title = task.title || "Task"
    const content =
      task.notes ||
      task.description ||
      task.details ||
      ""

    const category =
      task.category ||
      task.status ||
      task.taskType ||
      "Task"

    const toolName =
      task.tool ||
      task.toolName ||
      "Show Planner"

    const relatedShowTitle = parentShow?.title || parentShow?.name || "Show"

    const tags = extractTags(
      task.tags,
      task.tag,
      task.labels,
      task.priority,
      task.status,
      relatedShowTitle
    )

    const enrichedRecord = {
      ...task,
      parentShowTitle: relatedShowTitle,
    }

    if (!withinDateRange(rawDate)) return null

    const score = scoreRecord(title, content, enrichedRecord, rawDate)
    if (query.trim() && score <= 0) return null

    const result: SearchResult = {
      id: `${parentShow?.id}-${task.id}`,
      title,
      content,
      type: "Task",
      source: "tasks",
      date: rawDate,
      normalizedDate,
      score,
      category,
      toolName,
      tags,
      showId: parentShow?.id ? String(parentShow.id) : undefined,
      taskId: String(task.id),
      relatedShowTitle,
    }

    return matchesStructuredFilters(result) ? result : null
  }

  function normalizeFeedback(item: any): SearchResult | null {
    const rawDate = item.timestamp || item.createdAt || item.created_at
    const normalizedDate = normalizeDate(rawDate)
    const title = item.showTitle || item.name || item.title || "Feedback"
    const content =
      item.comment ||
      item.notes ||
      item.content ||
      item.summary ||
      ""

    const category =
      item.category ||
      item.sentiment ||
      item.feedbackType ||
      "Feedback"

    const toolName =
      item.tool ||
      item.toolName ||
      "Audience Feedback"

    const tags = extractTags(
      item.tags,
      item.tag,
      item.labels,
      item.sentiment,
      item.showTitle
    )

    if (!withinDateRange(rawDate)) return null

    const score = scoreRecord(title, content, item, rawDate)
    if (query.trim() && score <= 0) return null

    const result: SearchResult = {
      id: String(item.id),
      title,
      content,
      type: "Feedback",
      source: "feedback",
      date: rawDate,
      normalizedDate,
      score,
      category,
      toolName,
      tags,
      feedbackId: String(item.id),
      showId: item.showId ? String(item.showId) : undefined,
      relatedShowTitle: item.showTitle || undefined,
    }

    return matchesStructuredFilters(result) ? result : null
  }

  async function runSearch() {
    setIsLoading(true)
    setSelected(null)
    setHasSearched(true)

    try {
      const allResults: SearchResult[] = []

      let shows: any[] = Array.isArray(showsProp) ? showsProp : []
      let ideas: any[] = Array.isArray(ideasProp) ? ideasProp : []
      let feedback: any[] = []

      if ((showShows || showTasks) && shows.length === 0) {
        try {
          shows = await showsService.getShows()
        } catch (error) {
          console.error("Failed to load shows", error)
        }
      }

      if (showIdeas && ideas.length === 0) {
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
          const normalized = normalizeIdea(idea)
          if (normalized) allResults.push(normalized)
        })
      }

      if (showShows) {
        shows.forEach((show: any) => {
          const normalized = normalizeShow(show)
          if (normalized) allResults.push(normalized)
        })
      }

      if (showTasks) {
        shows.forEach((show: any) => {
          const tasks = Array.isArray(show.tasks) ? show.tasks : []

          tasks.forEach((task: any) => {
            const normalized = normalizeTask(task, show)
            if (normalized) allResults.push(normalized)
          })
        })
      }

      if (showFeedback) {
        feedback.forEach((item: any) => {
          const normalized = normalizeFeedback(item)
          if (normalized) allResults.push(normalized)
        })
      }

      allResults.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return (b.normalizedDate || 0) - (a.normalizedDate || 0)
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
            searchMode,
            categoryFilter,
            toolFilter,
            sourceFilter,
            activeTagFilters,
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

  function navigateTo(view: string, primaryId: string, secondaryId?: string) {
    try {
      onNavigate?.(view, primaryId, secondaryId)
    } catch (error) {
      console.error("onNavigate failed", error)
    }

    try {
      window.dispatchEvent(
        new CustomEvent("maw:navigate", {
          detail: {
            view,
            primaryId,
            secondaryId,
            showId: primaryId,
            taskId: secondaryId,
          },
        })
      )
    } catch {}
  }

  function handleOpenSavedIdea(result: SearchResult) {
    if (!result.ideaId) return

    void trackClientEvent({
      tool: "global_search",
      action: "search_open_saved_idea",
      metadata: {
        resultId: result.id,
        ideaId: result.ideaId,
      },
    })

    navigateTo("saved-ideas", result.ideaId)
  }

  function handleOpenShowPlanner(result: SearchResult) {
    if (!result.showId) return

    void trackClientEvent({
      tool: "global_search",
      action: "search_open_show_planner",
      metadata: {
        resultId: result.id,
        showId: result.showId,
        taskId: result.taskId || null,
      },
    })

    navigateTo("show-planner", result.showId, result.taskId)
  }

  function handleOpenAudienceFeedback(result: SearchResult) {
    void trackClientEvent({
      tool: "global_search",
      action: "search_open_audience_feedback",
      metadata: {
        resultId: result.id,
        feedbackId: result.feedbackId || null,
        showId: result.showId || null,
      },
    })

    navigateTo("show-feedback", result.feedbackId || result.showId || result.id)
  }

  function renderActionButtons(result: SearchResult) {
    const actions: Array<{
      key: string
      label: string
      onClick: () => void
    }> = []

    if (result.type === "Idea" && result.ideaId) {
      actions.push({
        key: "open-idea",
        label: "Open in Saved Ideas",
        onClick: () => handleOpenSavedIdea(result),
      })
    }

    if (result.type === "Show" && result.showId) {
      actions.push({
        key: "open-show",
        label: "Open in Show Planner",
        onClick: () => handleOpenShowPlanner(result),
      })
    }

    if (result.type === "Task" && result.showId) {
      actions.push({
        key: "open-task",
        label: result.taskId ? "Open related show/task" : "Open related show",
        onClick: () => handleOpenShowPlanner(result),
      })
    }

    if (result.type === "Feedback") {
      actions.push({
        key: "open-feedback",
        label: "Open in Audience Feedback",
        onClick: () => handleOpenAudienceFeedback(result),
      })

      if (result.showId) {
        actions.push({
          key: "open-feedback-show",
          label: "Open related show",
          onClick: () => handleOpenShowPlanner(result),
        })
      }
    }

    if (result.type === "Idea" && result.showId) {
      actions.push({
        key: "open-idea-show",
        label: "Open related show",
        onClick: () => handleOpenShowPlanner(result),
      })
    }

    if (actions.length === 0) return null

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              action.onClick()
            }}
            className="text-xs px-2.5 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
          >
            {action.label}
          </button>
        ))}
      </div>
    )
  }

  function addTagFilter() {
    const normalized = normalizeText(tagInput)
    if (!normalized) return
    if (activeTagFilters.includes(normalized)) {
      setTagInput("")
      return
    }
    setActiveTagFilters((prev) => [...prev, normalized])
    setTagInput("")
  }

  function removeTagFilter(tag: string) {
    setActiveTagFilters((prev) => prev.filter((item) => item !== tag))
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

  const availableCategories = useMemo(() => {
    const values = new Set<string>()

    results.forEach((result) => {
      const normalized = normalizeText(result.category)
      if (normalized) values.add(result.category as string)
    })

    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [results])

  const availableTools = useMemo(() => {
    const values = new Set<string>()

    results.forEach((result) => {
      const normalized = normalizeText(result.toolName)
      if (normalized) values.add(result.toolName as string)
    })

    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [results])

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

    void trackClientEvent({
      tool: "global_search",
      action: "search_group_toggled",
      metadata: {
        group,
      },
    })
  }

  function formatDate(value?: string | number) {
    const timestamp = normalizeDate(value)
    if (!timestamp) return ""
    return new Date(timestamp).toLocaleDateString()
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

              <div className="mt-3">
                <label className="block text-sm mb-2 text-white/70">Search Mode</label>
                <select
                  value={searchMode}
                  onChange={(e) => setSearchMode(e.target.value as SearchMode)}
                  className="w-full p-3 rounded-xl border border-white/10 bg-black/30"
                >
                  <option value="all">Search all text</option>
                  <option value="titles">Titles only</option>
                </select>
              </div>

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
            <div className="px-4 pb-4 space-y-4">
              <div>
                <label className="block text-sm mb-2">Date Range</label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="w-full p-3 rounded-xl border border-white/10 bg-black/30"
                >
                  <option value="all">All Time</option>
                  <option value="90">Last 90 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="7">Last 7 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">Source</label>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="w-full p-3 rounded-xl border border-white/10 bg-black/30"
                >
                  <option value="all">All Sources</option>
                  <option value="ideas">Ideas</option>
                  <option value="shows">Shows</option>
                  <option value="tasks">Tasks</option>
                  <option value="feedback">Feedback</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full p-3 rounded-xl border border-white/10 bg-black/30"
                >
                  <option value="all">All Categories</option>
                  {availableCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">Tool</label>
                <select
                  value={toolFilter}
                  onChange={(e) => setToolFilter(e.target.value)}
                  className="w-full p-3 rounded-xl border border-white/10 bg-black/30"
                >
                  <option value="all">All Tools</option>
                  {availableTools.map((tool) => (
                    <option key={tool} value={tool}>
                      {tool}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">Tag Filter</label>

                <div className="flex gap-2">
                  <input
                    className="flex-1 p-3 rounded-xl border border-white/10 bg-black/30"
                    placeholder="Add tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addTagFilter()
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={addTagFilter}
                    className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
                  >
                    Add
                  </button>
                </div>

                {activeTagFilters.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeTagFilters.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => removeTagFilter(tag)}
                        className="text-xs px-2.5 py-1.5 rounded-full border border-purple-400/30 bg-purple-500/10 text-white/85"
                      >
                        #{tag} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
              Try a broader keyword, expand your content type filters, remove a tag filter, or switch the date range to All Time.
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
                              {result.category ? ` • ${result.category}` : ""}
                              {result.toolName ? ` • ${result.toolName}` : ""}
                              {result.relatedShowTitle ? ` • ${result.relatedShowTitle}` : ""}
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

                        {result.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.tags.slice(0, 6).map((tag) => (
                              <span
                                key={`${result.id}-${tag}`}
                                className="text-[11px] px-2 py-1 rounded-full bg-white/10 text-white/65"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {renderActionButtons(result)}
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
              {selected.category ? ` • ${selected.category}` : ""}
              {selected.toolName ? ` • ${selected.toolName}` : ""}
              {selected.relatedShowTitle ? ` • ${selected.relatedShowTitle}` : ""}
              {selected.date ? ` • ${formatDate(selected.date)}` : ""}
            </div>

            {selected.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {selected.tags.map((tag) => (
                  <span
                    key={`selected-${selected.id}-${tag}`}
                    className="text-[11px] px-2 py-1 rounded-full bg-white/10 text-white/70"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="whitespace-pre-wrap text-white/90">
              {selected.content || "No additional content available."}
            </div>

            {renderActionButtons(selected)}
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