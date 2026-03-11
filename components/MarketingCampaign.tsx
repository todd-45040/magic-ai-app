import React, { useState } from "react"
import { saveIdea } from "../services/ideasService"
import { createShow, addTasksToShow } from "../services/showsService"

import {
  CopyIcon,
  SaveIcon,
  ShareIcon,
  CheckIcon
} from "./Icons"

interface Props {
  onIdeaSaved: () => void
  onNavigateToShowPlanner?: (showId: string) => void
}

export default function MarketingCampaign({
  onIdeaSaved,
  onNavigateToShowPlanner
}: Props) {

  const [showTitle, setShowTitle] = useState("")
  const [campaignStyle, setCampaignStyle] = useState("")
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([])
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [personaView, setPersonaView] = useState("Base")

  const [result, setResult] = useState("")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle")

  const [busyAction, setBusyAction] = useState<string | null>(null)

  const [notice, setNotice] = useState<string | null>(null)

  const activeResult = result

  const showTimedNotice = (message: string, timeout = 2500) => {
    setNotice(message)
    setTimeout(() => setNotice(null), timeout)
  }

  const buildCampaignDocument = () => {

    const personaSuffix =
      personaView !== "Base"
        ? ` (Persona: ${personaView})`
        : ""

    const meta = [
      `Show Title: ${showTitle || "(untitled)"}`,
      `Target Audience: ${selectedAudiences.join(", ") || "Not specified"}`,
      `Performance Style: ${selectedStyles.join(", ") || "Not specified"}`,
      `Campaign Style: ${campaignStyle || "Not specified"}`
    ].join("\n")

    return `
## Marketing Campaign for: ${showTitle}${personaSuffix}

${meta}

---

${activeResult}
`
  }

  const copyCampaignToClipboard = async () => {

    if (!activeResult) return

    setBusyAction("copy")

    try {

      await navigator.clipboard.writeText(
        buildCampaignDocument()
      )

      showTimedNotice("Campaign copied to clipboard")

    } catch {

      showTimedNotice("Clipboard copy failed")

    }

    setBusyAction(null)
  }

  const handleSave = async () => {

    if (!activeResult) return

    setBusyAction("save")

    try {

      await saveIdea({
        type: "text",
        title: `Marketing for ${showTitle || "Untitled Show"}`,
        content: buildCampaignDocument(),
        tags: ["marketing", "campaign"]
      })

      onIdeaSaved()

      setSaveStatus("saved")

      showTimedNotice("Campaign saved")

      setTimeout(() => setSaveStatus("idle"), 2000)

    } catch {

      showTimedNotice("Unable to save campaign")

    }

    setBusyAction(null)
  }

  const handleSendToShowPlanner = async () => {

    if (!activeResult) return

    if (!showTitle) {

      showTimedNotice("Add a show title first")

      return
    }

    setBusyAction("planner")

    try {

      const description = `
Marketing Campaign
Style: ${campaignStyle}
Audience: ${selectedAudiences.join(", ")}
`

      const createdShow = await createShow(
        showTitle,
        description
      )

      const tasks = [

        {
          title: "Marketing: Press Release",
          notes: activeResult,
          priority: "Medium",
          status: "To-Do"
        },

        {
          title: "Marketing: Social Media",
          notes: activeResult,
          priority: "Medium",
          status: "To-Do"
        },

        {
          title: "Marketing: Email Campaign",
          notes: activeResult,
          priority: "Medium",
          status: "To-Do"
        }

      ]

      await addTasksToShow(createdShow.id, tasks as any)

      showTimedNotice("Campaign sent to Show Planner")

      onNavigateToShowPlanner?.(createdShow.id)

    } catch {

      showTimedNotice("Unable to send to Show Planner")

    }

    setBusyAction(null)
  }

  return (

    <div className="space-y-6">

      <div className="space-y-2">

        <input
          className="w-full bg-slate-800 p-2 rounded"
          placeholder="Show Title"
          value={showTitle}
          onChange={(e) => setShowTitle(e.target.value)}
        />

        <input
          className="w-full bg-slate-800 p-2 rounded"
          placeholder="Campaign Style"
          value={campaignStyle}
          onChange={(e) => setCampaignStyle(e.target.value)}
        />

      </div>

      <div className="bg-slate-900 p-4 rounded-lg whitespace-pre-wrap">

        {activeResult || "AI campaign output will appear here."}

      </div>

      <div className="flex flex-wrap justify-end gap-2">

        <button
          onClick={copyCampaignToClipboard}
          disabled={!activeResult || busyAction === "copy"}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md"
        >
          <CopyIcon className="w-4 h-4" />
          {busyAction === "copy"
            ? "Copying..."
            : "Copy Campaign"}
        </button>

        <button
          onClick={handleSave}
          disabled={!activeResult || busyAction === "save"}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md"
        >

          {saveStatus === "saved" ? (

            <>
              <CheckIcon className="w-4 h-4 text-green-400" />
              Saved
            </>

          ) : (

            <>
              <SaveIcon className="w-4 h-4" />
              {busyAction === "save"
                ? "Saving..."
                : "Save Idea"}
            </>

          )}

        </button>

        <button
          onClick={handleSendToShowPlanner}
          disabled={!activeResult || busyAction === "planner"}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md"
        >

          {busyAction === "planner"
            ? "Sending..."
            : "Send to Show Planner"}

        </button>

        <button
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md"
        >
          <ShareIcon className="w-4 h-4" />
          Share
        </button>

      </div>

      {notice && (

        <div className="text-sm text-purple-300">
          {notice}
        </div>

      )}

    </div>

  )
}
