"use client"

// Song structure picker modal with custom builder
import * as React from "react"
import { createPortal } from "react-dom"
import { X, Sparkles, Music2, ChevronRight, Check, ArrowLeft, Plus, Trash2, GripVertical, Copy, Save, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  genres,
  sectionColors,
  sectionLabels,
  createSongStructureOutput,
  type Genre,
  type SongStructure,
  type SongStructureOutput,
  type SectionType,
  type SongSection,
} from "@/lib/songStructureContract"
import type { CustomSongStructure } from "@/lib/songStructureCustomStructures"
import { writeLocalCustomSongStructures } from "@/lib/songStructureCustomStructures"
import { Button } from "@/components/song-structure/ui/button"
import { Input } from "@/components/song-structure/ui/input"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/song-structure/ui/alert-dialog"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type CustomStructure = CustomSongStructure

interface SongStructurePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (structure: SongStructureOutput | null) => void
  /** From plugin theme + system resolution (no in-modal toggle). */
  isDark: boolean
  /** Custom library loaded from API or local fallback (reset when modal opens). */
  initialCustomStructures: CustomStructure[]
  /** Persist after each change; use API when authenticated, local storage when not. */
  persistCustomStructures?: (structures: CustomStructure[]) => Promise<void>
}

type ViewState = "genres" | "structures" | "builder"

// ────────────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────────────

export function SongStructurePicker({
  isOpen,
  onClose,
  onSelect,
  isDark,
  initialCustomStructures,
  persistCustomStructures,
}: SongStructurePickerProps) {
  const [selectedGenre, setSelectedGenre] = React.useState<Genre | null>(null)
  const [view, setView] = React.useState<ViewState>("genres")
  const [animating, setAnimating] = React.useState(false)
  const [slideDirection, setSlideDirection] = React.useState<"left" | "right">("left")
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Custom structures state
  const [customStructures, setCustomStructures] = React.useState<CustomStructure[]>([])
  const [builderSections, setBuilderSections] = React.useState<SongSection[]>([])
  const [builderName, setBuilderName] = React.useState("")
  const [editingStructureId, setEditingStructureId] = React.useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false)
  const [showExitDialog, setShowExitDialog] = React.useState(false)

  const saveCustomStructures = (structures: CustomStructure[]) => {
    setCustomStructures(structures)
    void (async () => {
      try {
        if (persistCustomStructures) {
          await persistCustomStructures(structures)
        } else {
          writeLocalCustomSongStructures(structures)
        }
      } catch {
        // UI state already updated; persistence can be retried on next edit
      }
    })()
  }

  React.useEffect(() => {
    if (isOpen) {
      setCustomStructures(initialCustomStructures)
      setSelectedGenre(null)
      setView("genres")
      setBuilderSections([])
      setBuilderName("")
      setEditingStructureId(null)
      setHasUnsavedChanges(false)
    }
  }, [isOpen, initialCustomStructures])

  if (!isOpen) return null

  const navigateTo = (genre: Genre) => {
    setSlideDirection("left")
    setAnimating(true)
    setTimeout(() => {
      setSelectedGenre(genre)
      setView("structures")
      setAnimating(false)
      scrollRef.current?.scrollTo({ top: 0 })
    }, 180)
  }

  const navigateToBuilder = (sections: SongSection[] = [], name = "", editId: string | null = null) => {
    setSlideDirection("left")
    setAnimating(true)
    setTimeout(() => {
      setBuilderSections(sections)
      setBuilderName(name)
      setEditingStructureId(editId)
      setHasUnsavedChanges(false)
      setView("builder")
      setAnimating(false)
      scrollRef.current?.scrollTo({ top: 0 })
    }, 180)
  }

  const navigateBack = () => {
    if (view === "builder" && hasUnsavedChanges) {
      setShowExitDialog(true)
      return
    }
    performNavigateBack()
  }

  const performNavigateBack = () => {
    setSlideDirection("right")
    setAnimating(true)
    setTimeout(() => {
      if (view === "builder") {
        setView("genres")
        setSelectedGenre(null)
        setBuilderSections([])
        setBuilderName("")
        setEditingStructureId(null)
        setHasUnsavedChanges(false)
      } else {
        setView("genres")
        setSelectedGenre(null)
      }
      setAnimating(false)
      scrollRef.current?.scrollTo({ top: 0 })
    }, 180)
  }

  const handleClose = () => {
    if (view === "builder" && hasUnsavedChanges) {
      setShowExitDialog(true)
      return
    }
    onClose()
  }

  const handleNoScaffold = () => {
    onSelect(null)
  }

  const handleSelectStructure = (genre: Genre, structure: SongStructure) => {
    onSelect(createSongStructureOutput(genre, structure))
  }

  const handleSelectCustomStructure = (structure: CustomStructure) => {
    const output: SongStructureOutput = {
      genreId: "custom",
      genreName: "Custom",
      structureId: structure.id,
      structureName: structure.name,
      sections: structure.sections,
    }
    onSelect(output)
  }

  const handleCustomize = (genre: Genre, structure: SongStructure) => {
    navigateToBuilder(
      structure.sections.map(s => ({ ...s })),
      `${structure.name} (Custom)`,
      null
    )
  }

  /** Persist builder state to My Structures; returns null if invalid. */
  const persistBuilderToLibrary = (): CustomStructure | null => {
    if (!builderName.trim() || builderSections.length === 0) return null

    const id = editingStructureId ?? `custom-${Date.now()}`
    const newStructure: CustomStructure = {
      id,
      name: builderName.trim(),
      description: "Custom song structure",
      sections: builderSections,
    }

    let updated: CustomStructure[]
    if (editingStructureId) {
      updated = customStructures.map(s => s.id === editingStructureId ? newStructure : s)
    } else {
      updated = [...customStructures, newStructure]
      setEditingStructureId(id)
    }

    saveCustomStructures(updated)
    setHasUnsavedChanges(false)
    return newStructure
  }

  /** Save to library only; stay in the builder. */
  const handleSaveStructureForLater = () => {
    persistBuilderToLibrary()
  }

  /** Save to library and return to the previous screen (e.g. from unsaved dialog). */
  const handleSaveStructureAndLeave = () => {
    if (!persistBuilderToLibrary()) return
    setShowExitDialog(false)
    performNavigateBack()
  }

  /** Save to library and continue new-song flow with this structure. */
  const handleUseThisStructure = () => {
    const saved = persistBuilderToLibrary()
    if (!saved) return
    onSelect({
      genreId: "custom",
      genreName: "Custom",
      structureId: saved.id,
      structureName: saved.name,
      sections: saved.sections,
    })
  }

  const handleDeleteCustomStructure = (id: string) => {
    saveCustomStructures(customStructures.filter(s => s.id !== id))
  }

  const handleEditCustomStructure = (structure: CustomStructure) => {
    navigateToBuilder(
      structure.sections.map(s => ({ ...s })),
      structure.name,
      structure.id
    )
  }

  // Create a virtual "Custom" genre for display
  const customGenre: Genre | null = customStructures.length > 0 ? {
    id: "custom",
    name: "My Structures",
    description: "Your custom song structures",
    structures: customStructures.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      sections: c.sections,
    })),
  } : null

  return (
    <div
      className={cn(
        "song-structure-plugin-root fixed inset-0 z-[200] flex flex-col",
        isDark && "dark"
      )}
    >
      <div className="flex flex-col h-full bg-background text-foreground transition-colors duration-300">

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Music2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                {view === "builder" ? (editingStructureId ? "Edit Structure" : "Build Structure") : "New Song"}
              </h1>
              <p className="text-sm text-muted-foreground leading-tight">
                {view === "builder" ? "Drag sections to arrange your structure" : "Choose a starting structure"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-9 w-9 rounded-lg"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Main scrollable area */}
        <div className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
          <div className="px-4 py-6 sm:px-6 sm:py-8 max-w-5xl mx-auto">

            {/* No Scaffold — only shown on genre view */}
            {view === "genres" && (
              <button
                onClick={handleNoScaffold}
                className={cn(
                  "w-full mb-4 p-4 sm:p-5 rounded-xl border-2 border-dashed border-border",
                  "flex items-center justify-between group",
                  "hover:border-muted-foreground hover:bg-muted transition-all duration-200"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted group-hover:bg-accent transition-colors">
                    <Sparkles className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <p className="text-base font-semibold">No Scaffold</p>
                    <p className="text-sm text-muted-foreground">Start with a blank canvas and build from scratch</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 shrink-0" />
              </button>
            )}

            {/* Build Your Own — only shown on genre view */}
            {view === "genres" && (
              <button
                onClick={() => navigateToBuilder()}
                className={cn(
                  "w-full mb-8 p-4 sm:p-5 rounded-xl border-2 border-dashed border-primary/50",
                  "flex items-center justify-between group",
                  "hover:border-primary hover:bg-primary/5 transition-all duration-200"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-base font-semibold">Build Your Own</p>
                    <p className="text-sm text-muted-foreground">Create a custom structure with drag and drop</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 shrink-0" />
              </button>
            )}

            {/* Divider — only on genre view */}
            {view === "genres" && (
              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest">
                  <span className="bg-background px-3 text-muted-foreground">Or choose a template</span>
                </div>
              </div>
            )}

            {/* Animated view container */}
            <div
              className={cn(
                "transition-all duration-180",
                animating && slideDirection === "left" && "opacity-0 translate-x-4",
                animating && slideDirection === "right" && "opacity-0 -translate-x-4",
                !animating && "opacity-100 translate-x-0"
              )}
              style={{ transition: "opacity 180ms ease, transform 180ms ease" }}
            >
              {view === "genres" ? (
                <GenreGrid
                  genres={genres}
                  customGenre={customGenre}
                  onSelectGenre={navigateTo}
                  onSelectCustomGenre={() => customGenre && navigateTo(customGenre)}
                />
              ) : view === "structures" && selectedGenre ? (
                selectedGenre.id === "custom" ? (
                  <CustomStructureView
                    structures={customStructures}
                    onSelect={handleSelectCustomStructure}
                    onEdit={handleEditCustomStructure}
                    onDelete={handleDeleteCustomStructure}
                    onBack={navigateBack}
                  />
                ) : (
                  <StructureView
                    genre={selectedGenre}
                    onSelectStructure={s => handleSelectStructure(selectedGenre, s)}
                    onCustomize={s => handleCustomize(selectedGenre, s)}
                    onBack={navigateBack}
                  />
                )
              ) : view === "builder" ? (
                <BuilderView
                  sections={builderSections}
                  name={builderName}
                  onSectionsChange={(s) => { setBuilderSections(s); setHasUnsavedChanges(true) }}
                  onNameChange={(n) => { setBuilderName(n); setHasUnsavedChanges(true) }}
                  onUseStructure={handleUseThisStructure}
                  onSaveForLater={handleSaveStructureForLater}
                  onBack={navigateBack}
                  canSave={builderName.trim().length > 0 && builderSections.length > 0}
                  isEditing={!!editingStructureId}
                />
              ) : null}
            </div>

          </div>
        </div>

        {/* Legend footer — hide in builder view */}
        {view !== "builder" && (
          <footer className="px-4 py-3 sm:px-6 border-t border-border bg-card shrink-0">
            <div className="max-w-5xl mx-auto">
              <p className="text-xs text-muted-foreground mb-2">Section Types</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(sectionLabels) as [SectionType, string][]).map(([type, label]) => (
                  <SectionPill key={type} type={type} label={label} />
                ))}
              </div>
            </div>
          </footer>
        )}
      </div>

      {/* Unsaved changes dialog */}
      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent
          className={cn("song-structure-plugin-root", isDark && "dark")}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Do you want to save before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowExitDialog(false)
              setHasUnsavedChanges(false)
              performNavigateBack()
            }}>
              Discard
            </AlertDialogCancel>
            <Button onClick={handleSaveStructureAndLeave}>
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Genre Grid
// ──────────────────────────���─────────────────────────────────────────────────

function GenreGrid({
  genres,
  customGenre,
  onSelectGenre,
  onSelectCustomGenre,
}: {
  genres: Genre[]
  customGenre: Genre | null
  onSelectGenre: (g: Genre) => void
  onSelectCustomGenre: () => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {/* Custom structures card — show first if exists */}
      {customGenre && (
        <button
          onClick={onSelectCustomGenre}
          className={cn(
            "p-4 rounded-xl border-2 border-primary/30 bg-primary/5 text-left",
            "hover:border-primary hover:bg-primary/10 transition-all duration-150 group"
          )}
        >
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-base font-semibold">{customGenre.name}</h3>
            <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 transition-transform group-hover:translate-x-0.5 shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{customGenre.description}</p>
          <div className="flex gap-px h-2 rounded overflow-hidden">
            {customGenre.structures[0].sections.map((section, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: sectionColors[section.type].bg }}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {customGenre.structures.length} structure{customGenre.structures.length !== 1 ? "s" : ""}
          </p>
        </button>
      )}

      {genres.map((genre) => (
        <button
          key={genre.id}
          onClick={() => onSelectGenre(genre)}
          className={cn(
            "p-4 rounded-xl border border-border bg-card text-left",
            "hover:border-ring hover:bg-accent transition-all duration-150 group"
          )}
        >
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-base font-semibold">{genre.name}</h3>
            <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 transition-transform group-hover:translate-x-0.5 shrink-0" />
          </div>
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{genre.description}</p>
          <div className="flex gap-px h-2 rounded overflow-hidden">
            {genre.structures[0].sections.map((section, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: sectionColors[section.type].bg }}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {genre.structures.length} structures
          </p>
        </button>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Structure View (for preset genres)
// ────────────────────────────────────────────────────────────────────────────

function StructureView({
  genre,
  onSelectStructure,
  onCustomize,
  onBack,
}: {
  genre: Genre
  onSelectStructure: (s: SongStructure) => void
  onCustomize: (s: SongStructure) => void
  onBack: () => void
}) {
  const [hovered, setHovered] = React.useState<string | null>(null)

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All genres
      </button>

      <h2 className="text-xl font-bold mb-1">{genre.name}</h2>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{genre.description}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {genre.structures.map((structure) => (
          <StructureCard
            key={structure.id}
            structure={structure}
            isHovered={hovered === structure.id}
            onHover={() => setHovered(structure.id)}
            onLeave={() => setHovered(null)}
            onSelect={() => onSelectStructure(structure)}
            onCustomize={() => onCustomize(structure)}
          />
        ))}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Custom Structure View
// ────────────────────────────────────────────────────────────────────────────

function CustomStructureView({
  structures,
  onSelect,
  onEdit,
  onDelete,
  onBack,
}: {
  structures: CustomStructure[]
  onSelect: (s: CustomStructure) => void
  onEdit: (s: CustomStructure) => void
  onDelete: (id: string) => void
  onBack: () => void
}) {
  const [hovered, setHovered] = React.useState<string | null>(null)

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All genres
      </button>

      <h2 className="text-xl font-bold mb-1">My Structures</h2>
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">Your custom song structures</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {structures.map((structure) => (
          <div
            key={structure.id}
            className={cn(
              "p-4 rounded-xl border text-left transition-all duration-150",
              "bg-card hover:bg-accent",
              hovered === structure.id ? "border-ring" : "border-border"
            )}
            onMouseEnter={() => setHovered(structure.id)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Card header */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <button onClick={() => onSelect(structure)} className="flex-1 min-w-0 text-left">
                <h3 className="text-sm font-semibold">{structure.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {structure.sections.length} sections
                </p>
              </button>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEdit(structure)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onDelete(structure.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Timeline */}
            <button onClick={() => onSelect(structure)} className="w-full">
              <div className="flex gap-px h-3 rounded overflow-hidden mb-3">
                {structure.sections.map((section, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{ backgroundColor: sectionColors[section.type].bg }}
                    title={section.label}
                  />
                ))}
              </div>

              {/* Section pills */}
              <div className="flex flex-wrap gap-1">
                {structure.sections.map((section, i) => (
                  <SectionPill key={i} type={section.type} label={section.label} />
                ))}
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Structure Card
// ────────────────────────────────────────────────────────────────────────────

function StructureCard({
  structure,
  isHovered,
  onHover,
  onLeave,
  onSelect,
  onCustomize,
}: {
  structure: SongStructure
  isHovered: boolean
  onHover: () => void
  onLeave: () => void
  onSelect: () => void
  onCustomize: () => void
}) {
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        "p-4 rounded-xl border text-left transition-all duration-150",
        "bg-card hover:bg-accent",
        isHovered ? "border-ring" : "border-border"
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <button onClick={onSelect} className="flex-1 min-w-0 text-left">
          <h3 className="text-sm font-semibold">{structure.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {structure.sections.length} sections
          </p>
        </button>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onCustomize}
            title="Customize this structure"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <button
            onClick={onSelect}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
              isHovered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {isHovered ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Description */}
      <button onClick={onSelect} className="w-full text-left">
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed line-clamp-3">
          {structure.description}
        </p>

        {/* Timeline */}
        <div className="flex gap-px h-3 rounded overflow-hidden mb-3">
          {structure.sections.map((section, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ backgroundColor: sectionColors[section.type].bg }}
              title={section.label}
            />
          ))}
        </div>

        {/* Section pills */}
        <div className="flex flex-wrap gap-1">
          {structure.sections.map((section, i) => (
            <SectionPill key={i} type={section.type} label={section.label} />
          ))}
        </div>
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Builder View
// ────────────────────────────────────────────────────────────────────────────

// Pointer-event based drag — palette → canvas and in-canvas reorder (window listeners so move/up are not lost)
interface DragState {
  kind: "palette" | "reorder"
  /** Palette drag only */
  sectionType?: SectionType
  /** Reorder only */
  sourceIndex?: number
  /** Between items: 0 = before first, length = after last */
  dropSlot: number | null
  startX: number
  startY: number
  currentX: number
  currentY: number
  hasMoved: boolean
}

/** Floating preview under the pointer (portaled to body so modal overflow/stacking does not hide it). */
function BuilderDragGhost({ drag, sections }: { drag: DragState; sections: SongSection[] }) {
  let label: string
  let colors: { bg: string; text: string }
  if (drag.kind === "palette") {
    const t = drag.sectionType
    if (!t) return null
    label = sectionLabels[t]
    colors = sectionColors[t]
  } else {
    const i = drag.sourceIndex
    if (i === undefined) return null
    const sec = sections[i]
    if (!sec) return null
    label = sec.label
    colors = sectionColors[sec.type]
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[600] flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium",
        "shadow-xl ring-2 ring-primary/50",
        drag.hasMoved ? "opacity-100" : "opacity-90"
      )}
      style={{
        left: drag.currentX,
        top: drag.currentY,
        transform: "translate(-50%, -50%)",
        backgroundColor: colors.bg,
        color: colors.text,
      }}
      aria-hidden
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  )
}

function BuilderView({
  sections,
  name,
  onSectionsChange,
  onNameChange,
  onUseStructure,
  onSaveForLater,
  onBack,
  canSave,
  isEditing,
}: {
  sections: SongSection[]
  name: string
  onSectionsChange: (s: SongSection[]) => void
  onNameChange: (n: string) => void
  onUseStructure: () => void
  onSaveForLater: () => void
  onBack: () => void
  canSave: boolean
  isEditing: boolean
}) {
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const [isLongPress, setIsLongPress] = React.useState(false)
  const canvasRef = React.useRef<HTMLDivElement>(null)
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([])
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressOriginRef = React.useRef<{ x: number; y: number } | null>(null)
  const dragRef = React.useRef<DragState | null>(null)
  const sectionsRef = React.useRef(sections)
  const onSectionsChangeRef = React.useRef(onSectionsChange)
  sectionsRef.current = sections
  onSectionsChangeRef.current = onSectionsChange

  React.useLayoutEffect(() => {
    itemRefs.current.length = sections.length
  }, [sections.length])

  const sectionTypes = Object.entries(sectionLabels) as [SectionType, string][]

  const addSection = (type: SectionType) => {
    const count = sections.filter(s => s.type === type).length + 1
    const label = count > 1 ? `${sectionLabels[type]} ${count}` : sectionLabels[type]
    onSectionsChange([...sections, { type, label }])
  }

  const removeSection = (index: number) => {
    onSectionsChange(sections.filter((_, i) => i !== index))
  }

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressOriginRef.current = null
    setIsLongPress(false)
  }, [])

  /**
   * Insert index for flex-wrapped chips. Must use both X and Y: the old
   * `clientY < midY` check ignored horizontal position, so the top-right of the
   * canvas (above Intro’s vertical center) always became slot 0.
   */
  const getDropSlot = React.useCallback((clientX: number, clientY: number): number => {
    const refs = itemRefs.current
    const n = refs.length
    if (n === 0) return 0

    let minTop = Infinity
    let maxBottom = -Infinity
    for (let i = 0; i < n; i++) {
      const el = refs[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.width <= 0 && r.height <= 0) continue
      minTop = Math.min(minTop, r.top)
      maxBottom = Math.max(maxBottom, r.bottom)
    }

    if (minTop !== Infinity && clientY < minTop) return 0
    if (maxBottom !== -Infinity && clientY > maxBottom) return n

    for (let i = 0; i < n; i++) {
      const el = refs[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 && rect.height <= 0) continue
      const midX = rect.left + rect.width / 2
      if (clientY >= rect.top && clientY <= rect.bottom && clientX < midX) return i
    }

    return n
  }, [])

  const pointerInsideCanvas = React.useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current
    if (!el) return false
    const r = el.getBoundingClientRect()
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
  }, [])

  const commitReorder = React.useCallback((sourceIndex: number, dropSlot: number) => {
    const secs = sectionsRef.current
    let target = dropSlot > sourceIndex ? dropSlot - 1 : dropSlot
    if (target === sourceIndex) return
    const next = [...secs]
    const [removed] = next.splice(sourceIndex, 1)
    next.splice(target, 0, removed)
    onSectionsChangeRef.current(next)
  }, [])

  const insertPaletteSection = React.useCallback((type: SectionType, dropSlot: number) => {
    const secs = sectionsRef.current
    const count = secs.filter(s => s.type === type).length + 1
    const label = count > 1 ? `${sectionLabels[type]} ${count}` : sectionLabels[type]
    const next = [...secs]
    const safeSlot = Math.max(0, Math.min(dropSlot, next.length))
    next.splice(safeSlot, 0, { type, label })
    onSectionsChangeRef.current(next)
  }, [])

  React.useEffect(() => {
    dragRef.current = drag
  }, [drag])

  const trackingPointerDrag = drag !== null

  React.useEffect(() => {
    if (!trackingPointerDrag) return

    const onMove = (e: PointerEvent) => {
      e.preventDefault()
      const d = dragRef.current
      if (!d) return
      const inside = pointerInsideCanvas(e.clientX, e.clientY)
      const slot = inside ? getDropSlot(e.clientX, e.clientY) : null
      const moved =
        d.hasMoved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6
      const next = { ...d, currentX: e.clientX, currentY: e.clientY, dropSlot: slot, hasMoved: moved }
      dragRef.current = next
      setDrag(next)
    }

    const onUp = (e: PointerEvent) => {
      clearLongPressTimer()
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return

      const inside = pointerInsideCanvas(e.clientX, e.clientY)
      const slot = inside ? getDropSlot(e.clientX, e.clientY) : null
      const moved =
        d.hasMoved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6
      if (!moved || slot === null) return

      if (d.kind === "palette" && d.sectionType) {
        insertPaletteSection(d.sectionType, slot)
      } else if (d.kind === "reorder" && d.sourceIndex !== undefined) {
        commitReorder(d.sourceIndex, slot)
      }
    }

    window.addEventListener("pointermove", onMove, { passive: false })
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [trackingPointerDrag, clearLongPressTimer, getDropSlot, pointerInsideCanvas, commitReorder, insertPaletteSection])

  const startReorderDrag = (index: number, clientX: number, clientY: number) => {
    const initial: DragState = {
      kind: "reorder",
      sourceIndex: index,
      dropSlot: null,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
      hasMoved: false,
    }
    dragRef.current = initial
    setDrag(initial)
  }

  const startPaletteDrag = (sectionType: SectionType, clientX: number, clientY: number) => {
    const initial: DragState = {
      kind: "palette",
      sectionType,
      dropSlot: null,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
      hasMoved: false,
    }
    dragRef.current = initial
    setDrag(initial)
  }

  const onItemPointerDown = (e: React.PointerEvent, index: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return

    if (e.pointerType === "touch") {
      clearLongPressTimer()
      longPressOriginRef.current = { x: e.clientX, y: e.clientY }
      const timer = setTimeout(() => {
        longPressTimerRef.current = null
        longPressOriginRef.current = null
        setIsLongPress(true)
        if (navigator.vibrate) navigator.vibrate(40)
        startReorderDrag(index, e.clientX, e.clientY)
      }, 450)
      longPressTimerRef.current = timer
      return
    }

    startReorderDrag(index, e.clientX, e.clientY)
  }

  const onPendingLongPressPointerMove = (e: React.PointerEvent) => {
    if (!longPressTimerRef.current || !longPressOriginRef.current) return
    const o = longPressOriginRef.current
    if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > 12) clearLongPressTimer()
  }

  const onPendingLongPressPointerUp = () => {
    clearLongPressTimer()
  }

  const onPalettePointerDown = (sectionType: SectionType, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return
    e.preventDefault()

    if (e.pointerType === "touch") {
      clearLongPressTimer()
      longPressOriginRef.current = { x: e.clientX, y: e.clientY }
      const cx = e.clientX
      const cy = e.clientY
      const timer = setTimeout(() => {
        longPressTimerRef.current = null
        longPressOriginRef.current = null
        setIsLongPress(true)
        if (navigator.vibrate) navigator.vibrate(40)
        startPaletteDrag(sectionType, cx, cy)
      }, 450)
      longPressTimerRef.current = timer
      return
    }

    // Mouse: wait for movement so double-click to add still works
    const sx = e.clientX
    const sy = e.clientY
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      window.removeEventListener("pointermove", onMovePalettePending)
      window.removeEventListener("pointerup", onUpPalettePending)
      window.removeEventListener("pointercancel", onUpPalettePending)
    }
    const onMovePalettePending = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        cleanup()
        startPaletteDrag(sectionType, ev.clientX, ev.clientY)
      }
    }
    const onUpPalettePending = () => {
      cleanup()
    }
    window.addEventListener("pointermove", onMovePalettePending, { passive: true })
    window.addEventListener("pointerup", onUpPalettePending)
    window.addEventListener("pointercancel", onUpPalettePending)
  }

  return (
    <>
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Name input */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Structure Name</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="My Custom Structure"
          className="max-w-md"
        />
      </div>

      {/* Section palette */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Section Palette</label>
        <p className="text-xs text-muted-foreground mb-3">
          Double-click or double-tap to add quickly &bull; Or drag a section type into the structure area (touch: hold, then drag)
        </p>
        <div className="flex flex-wrap gap-2">
          {sectionTypes.map(([type, label]) => (
            <PaletteItem
              key={type}
              type={type}
              label={label}
              onAdd={() => addSection(type)}
              onPalettePointerDown={e => onPalettePointerDown(type, e)}
              onPalettePointerMove={onPendingLongPressPointerMove}
              onPalettePointerUp={onPendingLongPressPointerUp}
              onPalettePointerCancel={onPendingLongPressPointerUp}
            />
          ))}
        </div>
      </div>

      {/* Structure canvas */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Your Structure</label>
          {sections.length > 0 && (
            <span className="text-xs text-muted-foreground">{sections.length} section{sections.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        <div
          ref={canvasRef}
          className={cn(
            "min-h-[100px] p-3 rounded-xl border-2 border-dashed transition-colors select-none",
            drag ? "border-primary/60 bg-primary/5" : sections.length === 0 ? "border-border" : "border-border bg-muted/20"
          )}
        >
          {sections.length === 0 ? (
            <div
              className={cn(
                "flex items-center justify-center h-16 text-muted-foreground text-sm text-center px-2",
                drag?.kind === "palette" && drag.dropSlot === 0 && "ring-2 ring-primary/40 rounded-lg"
              )}
            >
              Drag a section type here, or double-click one above
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 items-center">
              {sections.map((section, index) => {
                const isBeingDragged = drag?.kind === "reorder" && drag.sourceIndex === index
                const showDropBefore =
                  drag !== null &&
                  drag.dropSlot === index &&
                  (drag.kind === "palette" || drag.sourceIndex !== index)
                return (
                  <React.Fragment key={index}>
                    {/* Drop indicator before this item */}
                    {showDropBefore && (
                      <div className="w-1 self-stretch rounded-full bg-primary animate-pulse" style={{ minHeight: 36 }} />
                    )}
                    <div
                      ref={el => { itemRefs.current[index] = el }}
                      data-section-index={index}
                      onPointerDown={(e) => onItemPointerDown(e, index)}
                      onPointerMove={onPendingLongPressPointerMove}
                      onPointerUp={onPendingLongPressPointerUp}
                      onPointerCancel={onPendingLongPressPointerUp}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium",
                        "transition-all duration-100 touch-none",
                        isBeingDragged && drag?.hasMoved
                          ? "opacity-30 scale-95"
                          : "cursor-grab active:cursor-grabbing",
                        !isBeingDragged && "hover:brightness-110"
                      )}
                      style={{
                        backgroundColor: sectionColors[section.type].bg,
                        color: sectionColors[section.type].text,
                      }}
                    >
                      <GripVertical className="h-3.5 w-3.5 opacity-60 shrink-0" />
                      <span className="whitespace-nowrap">{section.label}</span>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); removeSection(index) }}
                        className="ml-0.5 rounded-full p-0.5 opacity-70 hover:opacity-100 transition-opacity"
                        aria-label={`Remove ${section.label}`}
                        style={{ color: sectionColors[section.type].text }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </React.Fragment>
                )
              })}
              {/* Drop indicator at the end */}
              {drag !== null &&
                drag.dropSlot === sections.length &&
                (drag.kind === "palette" || drag.sourceIndex !== sections.length - 1) && (
                <div className="w-1 self-stretch rounded-full bg-primary animate-pulse" style={{ minHeight: 36 }} />
              )}
            </div>
          )}
        </div>
        {drag && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {isLongPress ? "Drag to reorder — release to drop" : "Drag to reorder — release to drop"}
          </p>
        )}
      </div>

      {/* Timeline preview */}
      {sections.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Preview</label>
          <div className="flex gap-px h-4 rounded overflow-hidden">
            {sections.map((section, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: sectionColors[section.type].bg }}
                title={section.label}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Button onClick={onUseStructure} disabled={!canSave}>
          Use this Structure
        </Button>
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onSaveForLater}
          disabled={!canSave}
          aria-label={isEditing ? "Update saved structure" : "Save structure for later"}
          title={isEditing ? "Update saved structure" : "Save structure for later"}
          className="shrink-0"
        >
          <Save className="h-4 w-4" />
        </Button>
      </div>
    </div>
    {typeof document !== "undefined" &&
      drag !== null &&
      createPortal(<BuilderDragGhost drag={drag} sections={sections} />, document.body)}
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Palette Item — handles click, double-click, and double-tap
// ────────────────────────────────────────────────────────────────────────────

function PaletteItem({
  type,
  label,
  onAdd,
  onPalettePointerDown,
  onPalettePointerMove,
  onPalettePointerUp,
  onPalettePointerCancel,
}: {
  type: SectionType
  label: string
  onAdd: () => void
  onPalettePointerDown: (e: React.PointerEvent) => void
  onPalettePointerMove: (e: React.PointerEvent) => void
  onPalettePointerUp: () => void
  onPalettePointerCancel: () => void
}) {
  const lastTap = React.useRef<number>(0)

  const handleTouchEnd = () => {
    const now = Date.now()
    if (now - lastTap.current < 350) {
      onAdd()
    }
    lastTap.current = now
  }

  return (
    <button
      type="button"
      onDoubleClick={onAdd}
      onTouchEnd={handleTouchEnd}
      onPointerDown={onPalettePointerDown}
      onPointerMove={onPalettePointerMove}
      onPointerUp={onPalettePointerUp}
      onPointerCancel={onPalettePointerCancel}
      className={cn(
        "px-3 py-2 rounded-lg text-sm font-medium transition-all touch-none",
        "hover:brightness-110 hover:shadow-md active:scale-95 cursor-grab active:cursor-grabbing"
      )}
      style={{
        backgroundColor: sectionColors[type].bg,
        color: sectionColors[type].text,
      }}
    >
      {label}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Section Pill
// ────────────────────────────────────────────────────────────────────────────

function SectionPill({ type, label }: { type: SectionType; label: string }) {
  const { bg, text } = sectionColors[type]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium leading-none"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  )
}
