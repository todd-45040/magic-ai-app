import { useEffect, useMemo, useRef, useState } from "react"

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
  partner_source: string
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

type SearchSummary = {
  totalItems: number
  ideasCount: number
  showsCount: number
  tasksCount: number
  feedbackCount: number
  recentCount7d: number
  recentCount30d: number
}

type RecentSearchItem = {
  id: string
  query: string
  createdAt: number
  filters: {
    dateRange: string
    searchMode: SearchMode
    sourceFilter: string
    categoryFilter: string
    toolFilter: string
    activeTagFilters: string[]
    contentTypesEnabled: {
      ideas: boolean
      shows: boolean
      tasks: boolean
      feedback: boolean
    }
  }
}

type RecentActivityItem = {
  id: string
  label: string
  sublabel: string
  date?: number
  result: SearchResult
}

type GlobalSearchProps = {
  shows?: any[]
  ideas?: any[]
  onNavigate?: (view: string, primaryId: string, secondaryId?: string) => void
  universalQuery?: string
  launchSource?: string
  onPromoteToDashboard?: (payload: {
    query: string
    resultCount: number
    summary: SearchSummary
  }) => void
}

const GROUP_ORDER: Array<keyof ResultGroups> = ["ideas", "shows", "tasks", "feedback"]

const GROUP_LABELS: Record<keyof ResultGroups, string> = {
  ideas: "Ideas",
  shows: "Shows",
  tasks: "Tasks",
  feedback: "Feedback",
}

const RECENT_SEARCHES_STORAGE_KEY = "maw-global-search-recent-searches"
const MAX_RECENT_SEARCHES = 8

export default function GlobalSearch({
  shows: showsProp,
  ideas: ideasProp,
  onNavigate,
  universalQuery,
  launchSource,
  onPromoteToDashboard,
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
  const [advancedOpen, setAdvancedOpen] = useState(true)
  const [dashboardOpen, setDashboardOpen] = useState(true)
  const [recentSearchesOpen, setRecentSearchesOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  const [ideasGroupOpen, setIdeasGroupOpen] = useState(false)
  const [showsGroupOpen, setShowsGroupOpen] = useState(false)
  const [tasksGroupOpen, setTasksGroupOpen] = useState(false)
  const [feedbackGroupOpen, setFeedbackGroupOpen] = useState(false)

  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>([])

  const hasMountedFilterTelemetry = useRef(false)
  const hasAppliedUniversalQuery = useRef(false)

  useEffect(() => {
    void trackClientEvent({
      tool: "global_search",
      action: "search_page_opened",
      metadata: {
        partner_source: "GlobalSearch",
        launchSource: launchSource || "search-page",
        contentTypesEnabled: {
          ideas: showIdeas,
          shows: showShows,
          tasks: showTasks,
          feedback: showFeedback,
        },
      },
    })

    try {
      const raw = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setRecentSearches(parsed)
      }
    } catch (error) {
      console.error("Failed to load recent searches", error)
    }
  }, [])

  useEffect(() => {
    if (!universalQuery || hasAppliedUniversalQuery.current) return
    hasAppliedUniversalQuery.current = true
    setQuery(universalQuery)

    void trackClientEvent({
      tool: "global_search",
      action: "search_universal_entry_received",
      metadata: {
        launchSource: launchSource || "unknown",
        query: universalQuery,
      },
    })
  }, [universalQuery, launchSource])

  useEffect(() => {
    if (!hasMountedFilterTelemetry.current) {
      hasMountedFilterTelemetry.current = true
      return
    }

    void trackClientEvent({
      tool: "global_search",
      action: "search_filters_changed",
      metadata: {
        queryLength: query.trim().length,
        dateRange,
        searchMode,
        categoryFilter,
        toolFilter,
        sourceFilter,
        activeTagFilters,
        contentTypesEnabled: {
          ideas: showIdeas,
          shows: showShows,
          tasks: showTasks,
          feedback: showFeedback,
        },
      },
    })
  }, [
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
  ])

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

    setQueryOpen(true)
    setFiltersOpen(true)
    setAdvancedOpen(true)
    setDashboardOpen(true)
    setRecentSearchesOpen(false)
    setActivityOpen(false)

    setIdeasGroupOpen(false)
    setShowsGroupOpen(false)
    setTasksGroupOpen(false)
    setFeedbackGroupOpen(false)

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
      partner_source: "ideas",
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
      partner_source: "shows",
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
      partner_source: "tasks",
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
      partner_source: "feedback",
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

  function summarizeUsageBy<T extends string>(
    items: SearchResult[],
    selector: (item: SearchResult) => T
  ) {
    const summary: Record<string, number> = {}

    items.forEach((item) => {
      const key = selector(item)
      summary[key] = (summary[key] || 0) + 1
    })

    return summary
  }

  function buildSummary(items: SearchResult[]): SearchSummary {
    const now = Date.now()

    return {
      totalItems: items.length,
      ideasCount: items.filter((item) => item.type === "Idea").length,
      showsCount: items.filter((item) => item.type === "Show").length,
      tasksCount: items.filter((item) => item.type === "Task").length,
      feedbackCount: items.filter((item) => item.type === "Feedback").length,
      recentCount7d: items.filter((item) => {
        const t = item.normalizedDate || 0
        return t > 0 && now - t <= 7 * 24 * 60 * 60 * 1000
      }).length,
      recentCount30d: items.filter((item) => {
        const t = item.normalizedDate || 0
        return t > 0 && now - t <= 30 * 24 * 60 * 60 * 1000
      }).length,
    }
  }

  function saveRecentSearch(nextItem: RecentSearchItem) {
    try {
      const existing = recentSearches.filter(
        (item) =>
          !(
            item.query === nextItem.query &&
            JSON.stringify(item.filters) === JSON.stringify(nextItem.filters)
          )
      )

      const next = [nextItem, ...existing].slice(0, MAX_RECENT_SEARCHES)
      setRecentSearches(next)
      window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next))
    } catch (error) {
      console.error("Failed to save recent search", error)
    }
  }

  async function runSearch(queryOverride?: string) {
    const activeQuery = typeof queryOverride === "string" ? queryOverride : query

    if (typeof queryOverride === "string") {
      setQuery(queryOverride)
    }

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
          const normalized = normalizeIdea({ ...idea })
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

      const sourceUsage = summarizeUsageBy(allResults, (item) => item.source)
      const typeUsage = summarizeUsageBy(allResults, (item) => item.type)
      const toolUsage = summarizeUsageBy(
        allResults.filter((item) => Boolean(item.toolName)),
        (item) => item.toolName as string
      )

      const summary = buildSummary(allResults)

      const recentItem: RecentSearchItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        query: activeQuery.trim(),
        createdAt: Date.now(),
        filters: {
          dateRange,
          searchMode,
          sourceFilter,
          categoryFilter,
          toolFilter,
          activeTagFilters,
          contentTypesEnabled: {
            ideas: showIdeas,
            shows: showShows,
            tasks: showTasks,
            feedback: showFeedback,
          },
        },
      }

      if (activeQuery.trim()) {
        saveRecentSearch(recentItem)
      }

      void trackClientEvent({
        tool: "global_search",
        action: "search_query_run",
        metadata: {
          query: activeQuery,
          queryLength: activeQuery.trim().length,
          resultCount: allResults.length,
          zeroResults: allResults.length === 0,
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
          sourceUsage,
          typeUsage,
          toolUsage,
          summary,
        },
      })

      if (allResults.length === 0) {
        void trackClientEvent({
          tool: "global_search",
          action: "search_zero_results",
          metadata: {
            query: activeQuery,
            queryLength: activeQuery.trim().length,
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
      }

      onPromoteToDashboard?.({
        query: activeQuery,
        resultCount: allResults.length,
        summary,
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
        partner_source: result.source,
        id: result.id,
        title: result.title,
        category: result.category || null,
        toolName: result.toolName || null,
        hasRelatedShow: Boolean(result.showId),
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
      action: "search_deeplink_clicked",
      metadata: {
        destination: "saved-ideas",
        resultId: result.id,
        resultType: result.type,
        resultSource: result.source,
        ideaId: result.ideaId,
      },
    })

    navigateTo("saved-ideas", result.ideaId)
  }

  function handleOpenShowPlanner(result: SearchResult) {
    if (!result.showId) return

    void trackClientEvent({
      tool: "global_search",
      action: "search_deeplink_clicked",
      metadata: {
        destination: "show-planner",
        resultId: result.id,
        resultType: result.type,
        resultSource: result.source,
        showId: result.showId,
        taskId: result.taskId || null,
      },
    })

    navigateTo("show-planner", result.showId, result.taskId)
  }

  function handleOpenAudienceFeedback(result: SearchResult) {
    void trackClientEvent({
      tool: "global_search",
      action: "search_deeplink_clicked",
      metadata: {
        destination: "show-feedback",
        resultId: result.id,
        resultType: result.type,
        resultSource: result.source,
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

    const nextTags = [...activeTagFilters, normalized]
    setActiveTagFilters(nextTags)
    setTagInput("")

    void trackClientEvent({
      tool: "global_search",
      action: "search_tag_filter_added",
      metadata: {
        addedTag: normalized,
        activeTagFilters: nextTags,
      },
    })
  }

  function removeTagFilter(tag: string) {
    const nextTags = activeTagFilters.filter((item) => item !== tag)
    setActiveTagFilters(nextTags)

    void trackClientEvent({
      tool: "global_search",
      action: "search_tag_filter_removed",
      metadata: {
        removedTag: tag,
        activeTagFilters: nextTags,
      },
    })
  }

  function applyRecentSearch(item: RecentSearchItem) {
    setQuery(item.query)
    setDateRange(item.filters.dateRange)
    setSearchMode(item.filters.searchMode)
    setSourceFilter(item.filters.sourceFilter)
    setCategoryFilter(item.filters.categoryFilter)
    setToolFilter(item.filters.toolFilter)
    setActiveTagFilters(item.filters.activeTagFilters)
    setShowIdeas(item.filters.contentTypesEnabled.ideas)
    setShowShows(item.filters.contentTypesEnabled.shows)
    setShowTasks(item.filters.contentTypesEnabled.tasks)
    setShowFeedback(item.filters.contentTypesEnabled.feedback)

    void trackClientEvent({
      tool: "global_search",
      action: "search_recent_search_applied",
      metadata: {
        query: item.query,
        createdAt: item.createdAt,
      },
    })

    void runSearch(item.query)
  }

  function clearRecentSearches() {
    setRecentSearches([])
    try {
      window.localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY)
    } catch {}

    void trackClientEvent({
      tool: "global_search",
      action: "search_recent_searches_cleared",
      metadata: {},
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

  const searchSummary = useMemo(() => buildSummary(results), [results])

  const recentActivity = useMemo<RecentActivityItem[]>(() => {
    return [...results]
      .sort((a, b) => (b.normalizedDate || 0) - (a.normalizedDate || 0))
      .slice(0, 8)
      .map((result) => ({
        id: `${result.type}-${result.id}`,
        label: result.title,
        sublabel: `${result.type} • ${result.toolName || result.source}`,
        date: result.normalizedDate,
        result,
      }))
  }, [results])

  const surfacedRecentItems = useMemo(() => {
    return [...results]
      .filter((item) => Boolean(item.normalizedDate))
      .sort((a, b) => (b.normalizedDate || 0) - (a.normalizedDate || 0))
      .slice(0, 6)
  }, [results])

  function groupIsOpen(group: keyof ResultGroups) {
    if (group === "ideas") return ideasGroupOpen
    if (group === "shows") return showsGroupOpen
    if (group === "tasks") return tasksGroupOpen
    return feedbackGroupOpen
  }

  function toggleGroup(group: keyof ResultGroups) {
    const openBefore = groupIsOpen(group)

    if (group === "ideas") setIdeasGroupOpen((prev) => !prev)
    if (group === "shows") setShowsGroupOpen((prev) => !prev)
    if (group === "tasks") setTasksGroupOpen((prev) => !prev)
    if (group === "feedback") setFeedbackGroupOpen((prev) => !prev)

    void trackClientEvent({
      tool: "global_search",
      action: "search_group_toggled",
      metadata: {
        group,
        state: openBefore ? "collapsed" : "expanded",
        resultCount:
          group === "ideas"
            ? groupedResults.ideas.length
            : group === "shows"
              ? groupedResults.shows.length
              : group === "tasks"
                ? groupedResults.tasks.length
                : groupedResults.feedback.length,
      },
    })
  }

  function formatDate(value?: string | number) {
    const timestamp = normalizeDate(value)
    if (!timestamp) return ""
    return new Date(timestamp).toLocaleDateString()
  }

  function formatRelativeTime(timestamp?: number) {
    if (!timestamp) return ""
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 60) return `${Math.max(1, minutes)}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
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
                onClick={() => void runSearch()}
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

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5">
          <button
            onClick={() => setRecentSearchesOpen(!recentSearchesOpen)}
            className="font-semibold w-full text-left px-4 py-3 flex items-center justify-between"
          >
            <span>Recent Searches</span>
            <span className="text-white/60">{recentSearchesOpen ? "−" : "+"}</span>
          </button>

          {recentSearchesOpen && (
            <div className="px-4 pb-4">
              {recentSearches.length === 0 ? (
                <div className="text-sm text-white/50">
                  Recent searches will appear here after you run searches.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentSearches.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => applyRecentSearch(item)}
                      className="w-full text-left p-3 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5"
                    >
                      <div className="font-medium text-sm text-white">{item.query}</div>
                      <div className="text-xs text-white/50 mt-1">
                        {formatRelativeTime(item.createdAt)} • {item.filters.searchMode} • {item.filters.dateRange}
                      </div>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={clearRecentSearches}
                    className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
                  >
                    Clear recent searches
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Search Results</h2>
          <div className="text-sm text-white/60">{resultCountLabel}</div>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <button
            onClick={() => setDashboardOpen(!dashboardOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5"
          >
            <span className="font-semibold">Dashboard Search Summary</span>
            <span className="text-white/60">{dashboardOpen ? "−" : "+"}</span>
          </button>

          {dashboardOpen && (
            <div className="p-4 pt-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-white/50">Total Results</div>
                  <div className="text-lg font-semibold">{searchSummary.totalItems}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-white/50">Ideas</div>
                  <div className="text-lg font-semibold">{searchSummary.ideasCount}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-white/50">Shows</div>
                  <div className="text-lg font-semibold">{searchSummary.showsCount}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-white/50">Tasks</div>
                  <div className="text-lg font-semibold">{searchSummary.tasksCount}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-white/50">Feedback</div>
                  <div className="text-lg font-semibold">{searchSummary.feedbackCount}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs text-white/50">Recent 30 Days</div>
                  <div className="text-lg font-semibold">{searchSummary.recentCount30d}</div>
                </div>
              </div>

              {hasSearched && (
                <div className="mt-3 text-xs text-white/50">
                  Search intelligence snapshot for dashboard-level surfacing.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <button
            onClick={() => setActivityOpen(!activityOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5"
          >
            <span className="font-semibold">Recent Activity Feed</span>
            <span className="text-white/60">{activityOpen ? "−" : "+"}</span>
          </button>

          {activityOpen && (
            <div className="p-4 pt-0">
              {recentActivity.length === 0 ? (
                <div className="text-sm text-white/50">
                  Recent activity will appear after results are loaded.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleResult(item.result)}
                      className="w-full text-left p-3 rounded-xl border border-white/10 bg-black/20 hover:bg-white/5"
                    >
                      <div className="font-medium text-sm text-white">{item.label}</div>
                      <div className="text-xs text-white/50 mt-1">
                        {item.sublabel}
                        {item.date ? ` • ${formatRelativeTime(item.date)}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {surfacedRecentItems.length > 0 && (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="font-semibold mb-3">Recently Created / Updated</div>
            <div className="flex flex-wrap gap-2">
              {surfacedRecentItems.map((item) => (
                <button
                  key={`recent-${item.id}`}
                  type="button"
                  onClick={() => toggleResult(item)}
                  className="text-xs px-3 py-2 rounded-full border border-white/10 bg-black/20 hover:bg-white/5"
                >
                  {item.title} • {formatDate(item.date)}
                </button>
              ))}
            </div>
          </div>
        )}

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