'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import FontFamily from '@tiptap/extension-font-family'
import { authedFetch } from '@/lib/authed-fetch'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import './ReportEditor.css'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo,
  Redo,
  Save,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Image as ImageIcon,
  Link as LinkIcon,
  Table as TableIcon,
  Minus,
  Quote,
  Code,
  Highlighter,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Plus,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  Search,
  Replace,
  X,
  ZoomIn,
  ZoomOut,
  Printer,
  FileDown,
  Columns,
  RotateCw,
  Ruler as RulerIcon,
  Eye,
  EyeOff,
  Type,
  PilcrowSquare,
  Indent,
  Outdent,
  SeparatorHorizontal,
  MessageSquare,
  Bookmark,
  Hash,
  Settings,
} from 'lucide-react'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ReportSection {
  id: string
  title: string
  content: string
  order: number
}

interface ReportEditorProps {
  reportId: string
  valuationId: string
  initialContent?: ReportSection[]
  onSave?: (sections: ReportSection[]) => Promise<void>
  onContentChange?: (hasUnsavedChanges: boolean) => void
  readOnly?: boolean
}

interface PageSettings {
  size: 'a4' | 'letter' | 'legal'
  orientation: 'portrait' | 'landscape'
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
}

interface FindReplaceState {
  isOpen: boolean
  searchTerm: string
  replaceTerm: string
  matchCase: boolean
  matchCount: number
  currentMatch: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
  { label: 'Palatino', value: 'Palatino Linotype, serif' },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Cambria', value: 'Cambria, serif' },
]

const FONT_SIZES = [
  { label: '8', value: '8px' },
  { label: '9', value: '9px' },
  { label: '10', value: '10px' },
  { label: '11', value: '11px' },
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
  { label: '28', value: '28px' },
  { label: '32', value: '32px' },
  { label: '36', value: '36px' },
  { label: '48', value: '48px' },
  { label: '72', value: '72px' },
]

const LINE_SPACINGS = [
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
  { label: '2.5', value: '2.5' },
  { label: '3.0', value: '3' },
]

const PAGE_SIZES = {
  a4: { width: 794, height: 1123, label: 'A4 (210 × 297 mm)' },
  letter: { width: 816, height: 1056, label: 'Letter (8.5 × 11 in)' },
  legal: { width: 816, height: 1344, label: 'Legal (8.5 × 14 in)' },
}

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200]

const DEFAULT_SECTIONS: ReportSection[] = [
  { id: 'letter_of_transmittal', title: 'Letter of Transmittal', content: '<p>Loading...</p>', order: 1 },
  { id: 'summary_of_key_data', title: 'Summary of Key Data', content: '<p>Loading...</p>', order: 2 },
  { id: 'property_risk_assessment', title: 'Property Risk Assessment', content: '<p>Loading...</p>', order: 3 },
  { id: 'general_introduction', title: 'Chapter One: General Introduction', content: '<p>Loading...</p>', order: 4 },
  { id: 'legal_attributes', title: 'Chapter Two: Legal Attributes', content: '<p>Loading...</p>', order: 5 },
  { id: 'data_influencing_values', title: 'Chapter Three: Data Influencing Property Values', content: '<p>Loading...</p>', order: 6 },
  { id: 'property_description', title: 'Chapter Four: Property Description', content: '<p>Loading...</p>', order: 7 },
  { id: 'valuation_process', title: 'Part Four: Valuation Process', content: '<p>Loading...</p>', order: 8 },
  { id: 'certification', title: 'Certification/Valuation Opinion', content: '<p>Loading...</p>', order: 9 },
  { id: 'limiting_conditions', title: 'Statement of Limiting Conditions', content: '<p>Loading...</p>', order: 10 },
  { id: 'appendices', title: 'Appendices', content: '<p>Loading...</p>', order: 11 },
]

// ============================================================================
// CUSTOM TIPTAP EXTENSIONS
// ============================================================================

// A single TextStyle extension carrying BOTH fontSize and lineHeight attributes. Previously these
// were two separate `TextStyle.extend()` extensions — but each keeps the name "textStyle", so
// registering both produced a duplicate-extension warning. Merged into one (the toolbar sets these
// as attributes on the same `textStyle` mark, so behaviour is unchanged).
const TextStyleExtended = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize || null,
        renderHTML: attributes => {
          if (!attributes.fontSize) return {}
          return { style: `font-size: ${attributes.fontSize}` }
        },
      },
      lineHeight: {
        default: null,
        parseHTML: element => element.style.lineHeight || null,
        renderHTML: attributes => {
          if (!attributes.lineHeight) return {}
          return { style: `line-height: ${attributes.lineHeight}` }
        },
      },
    }
  },
})

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

// Toolbar Button Component - Dark theme
function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
  className = '',
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${isActive
        ? 'bg-amber-600 text-foreground'
        : disabled
          ? 'text-muted-foreground cursor-not-allowed'
          : 'text-gray-300 hover:bg-gray-600 hover:text-foreground'
        } ${className}`}
    >
      {children}
    </button>
  )
}

// Ruler Component
function Ruler({
  width,
  marginLeft,
  marginRight,
  zoom,
  onMarginChange,
}: {
  width: number
  marginLeft: number
  marginRight: number
  zoom: number
  onMarginChange?: (left: number, right: number) => void
}) {
  const scaledWidth = width * (zoom / 100)
  const rulerRef = useRef<HTMLDivElement>(null)

  // Generate tick marks
  const ticks = useMemo(() => {
    const result = []
    const inchWidth = 96 * (zoom / 100) // pixels per inch at current zoom
    const inches = Math.ceil(width / 96)

    for (let i = 0; i <= inches; i++) {
      result.push(
        <div
          key={`inch-${i}`}
          className="absolute flex flex-col items-center"
          style={{ left: `${i * inchWidth}px` }}
        >
          <div className="w-px h-3 bg-gray-600" />
          <span className="text-[9px] text-muted-foreground mt-0.5">{i}</span>
        </div>
      )
      // Half-inch marks
      if (i < inches) {
        result.push(
          <div
            key={`half-${i}`}
            className="absolute"
            style={{ left: `${(i + 0.5) * inchWidth}px` }}
          >
            <div className="w-px h-2 bg-gray-400" />
          </div>
        )
        // Quarter-inch marks
        result.push(
          <div
            key={`quarter-${i}-1`}
            className="absolute"
            style={{ left: `${(i + 0.25) * inchWidth}px` }}
          >
            <div className="w-px h-1 bg-gray-300" />
          </div>
        )
        result.push(
          <div
            key={`quarter-${i}-2`}
            className="absolute"
            style={{ left: `${(i + 0.75) * inchWidth}px` }}
          >
            <div className="w-px h-1 bg-gray-300" />
          </div>
        )
      }
    }
    return result
  }, [width, zoom])

  return (
    <div
      ref={rulerRef}
      className="h-6 bg-muted border-b border-gray-300 relative overflow-hidden"
      style={{ width: `${scaledWidth}px` }}
    >
      {/* Margin indicators */}
      <div
        className="absolute top-0 bottom-0 bg-gray-300 opacity-50"
        style={{ left: 0, width: `${marginLeft * (zoom / 100)}px` }}
      />
      <div
        className="absolute top-0 bottom-0 bg-gray-300 opacity-50"
        style={{ right: 0, width: `${marginRight * (zoom / 100)}px` }}
      />
      {/* Tick marks */}
      <div className="absolute top-0 left-0 h-full">
        {ticks}
      </div>
    </div>
  )
}

// Find & Replace Dialog
function FindReplaceDialog({
  state,
  onClose,
  onSearch,
  onReplace,
  onReplaceAll,
  onNext,
  onPrevious,
  onChange,
}: {
  state: FindReplaceState
  onClose: () => void
  onSearch: () => void
  onReplace: () => void
  onReplaceAll: () => void
  onNext: () => void
  onPrevious: () => void
  onChange: (updates: Partial<FindReplaceState>) => void
}) {
  if (!state.isOpen) return null

  return (
    <div className="absolute top-12 right-4 z-50 bg-card border border-gray-300 rounded-lg shadow-xl p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">Find & Replace</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Find</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={state.searchTerm}
              onChange={(e) => onChange({ searchTerm: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              placeholder="Search text..."
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
            />
            <button onClick={onSearch} className="px-2 py-1 bg-amber-500 text-foreground rounded text-sm hover:bg-amber-600">
              <Search className="w-4 h-4" />
            </button>
          </div>
          {state.matchCount > 0 && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground">
                {state.currentMatch} of {state.matchCount} matches
              </span>
              <div className="flex gap-1">
                <button onClick={onPrevious} className="px-2 py-0.5 text-xs bg-muted rounded hover:bg-gray-200">←</button>
                <button onClick={onNext} className="px-2 py-0.5 text-xs bg-muted rounded hover:bg-gray-200">→</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Replace with</label>
          <input
            type="text"
            value={state.replaceTerm}
            onChange={(e) => onChange({ replaceTerm: e.target.value })}
            placeholder="Replace text..."
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={state.matchCase}
              onChange={(e) => onChange({ matchCase: e.target.checked })}
              className="w-3 h-3"
            />
            Match case
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onReplace}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-muted"
          >
            Replace
          </button>
          <button
            onClick={onReplaceAll}
            className="flex-1 px-3 py-1.5 text-sm bg-amber-500 text-foreground rounded hover:bg-amber-600"
          >
            Replace All
          </button>
        </div>
      </div>
    </div>
  )
}

// Page Settings Dialog
function PageSettingsDialog({
  isOpen,
  settings,
  onClose,
  onApply,
}: {
  isOpen: boolean
  settings: PageSettings
  onClose: () => void
  onApply: (settings: PageSettings) => void
}) {
  const [localSettings, setLocalSettings] = useState(settings)

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl p-6 w-96">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Page Settings</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Page Size</label>
            <select
              value={localSettings.size}
              onChange={(e) => setLocalSettings({ ...localSettings, size: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-amber-500 outline-none"
            >
              {Object.entries(PAGE_SIZES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Orientation</label>
            <div className="flex gap-2">
              <button
                onClick={() => setLocalSettings({ ...localSettings, orientation: 'portrait' })}
                className={`flex-1 py-2 px-4 rounded border ${localSettings.orientation === 'portrait'
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-300 hover:bg-muted'
                  }`}
              >
                Portrait
              </button>
              <button
                onClick={() => setLocalSettings({ ...localSettings, orientation: 'landscape' })}
                className={`flex-1 py-2 px-4 rounded border ${localSettings.orientation === 'landscape'
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-300 hover:bg-muted'
                  }`}
              >
                Landscape
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Margins (inches)</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Top</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={localSettings.marginTop / 96}
                  onChange={(e) => setLocalSettings({ ...localSettings, marginTop: parseFloat(e.target.value) * 96 })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Bottom</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={localSettings.marginBottom / 96}
                  onChange={(e) => setLocalSettings({ ...localSettings, marginBottom: parseFloat(e.target.value) * 96 })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Left</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={localSettings.marginLeft / 96}
                  onChange={(e) => setLocalSettings({ ...localSettings, marginLeft: parseFloat(e.target.value) * 96 })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Right</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={localSettings.marginRight / 96}
                  onChange={(e) => setLocalSettings({ ...localSettings, marginRight: parseFloat(e.target.value) * 96 })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onApply(localSettings)
              onClose()
            }}
            className="flex-1 px-4 py-2 bg-amber-500 text-foreground rounded hover:bg-amber-600"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// Word Count Component
function WordCount({ content }: { content: string }) {
  const stats = useMemo(() => {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const words = text ? text.split(' ').filter(w => w.length > 0).length : 0
    const characters = text.length
    const charactersNoSpaces = text.replace(/\s/g, '').length
    return { words, characters, charactersNoSpaces }
  }, [content])

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>{stats.words} words</span>
      <span className="text-muted-foreground">|</span>
      <span>{stats.characters} characters</span>
    </div>
  )
}

// ============================================================================
// PAGED CONTENT COMPONENT - Handles content overflow across multiple pages
// ============================================================================

interface PagedSectionProps {
  section: ReportSection
  sectionIndex: number
  totalSections: number
  pageWidth: number
  pageHeight: number
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  isActive: boolean
  showMargins: boolean
  showPageNumbers: boolean
  editor: ReturnType<typeof useEditor> | null
  onActivate: () => void
}

function PagedSection({
  section,
  sectionIndex,
  totalSections,
  pageWidth,
  pageHeight,
  marginTop,
  marginBottom,
  marginLeft,
  marginRight,
  isActive,
  showMargins,
  showPageNumbers,
  editor,
  onActivate,
}: PagedSectionProps) {
  // Standard Word page dimensions - content should flow naturally
  // No artificial height restrictions - let content determine page count
  
  return (
    <div
      id={`page-${section.id}`}
      className={`page-wrapper mb-8 ${isActive ? 'active' : ''}`}
    >
      <div
        className="page"
        style={{
          width: `${pageWidth}px`,
          minHeight: `${pageHeight}px`, // Use minHeight to allow content to flow
          padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
          backgroundColor: '#ffffff',
          boxShadow: isActive
            ? '0 8px 16px rgba(0, 0, 0, 0.2), 0 0 0 2px rgba(217, 119, 6, 0.4)'
            : '0 4px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.08)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={onActivate}
      >
        {/* Margin indicators */}
        {showMargins && (
          <div
            className="absolute pointer-events-none z-10 border border-dashed border-blue-200"
            style={{
              top: `${marginTop}px`,
              left: `${marginLeft}px`,
              right: `${marginRight}px`,
              bottom: `${marginBottom}px`,
            }}
          />
        )}

        {/* Page header */}
        <div className="section-header mb-4 pb-3 border-b-2 border-amber-500 flex-shrink-0">
          <h1 className="text-xl font-bold text-gray-800 m-0">
            <span className="text-amber-600 mr-2">{section.order}.</span>
            {section.title}
          </h1>
        </div>

        {/* Page content - flows naturally */}
        <div className="page-content flex-1">
          {isActive && editor ? (
            <EditorContent
              editor={editor}
              className="report-editor-content"
            />
          ) : (
            <div
              className="report-editor-content cursor-pointer"
              dangerouslySetInnerHTML={{ __html: section.content }}
              onClick={onActivate}
            />
          )}
        </div>

        {/* Page footer */}
        {showPageNumbers && (
          <div className="flex-shrink-0 pt-4 mt-auto text-center border-t border-gray-100">
            <span className="text-xs text-muted-foreground font-mono">
              Page {sectionIndex + 1} of {totalSections}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN EDITOR COMPONENT
// ============================================================================

export function ReportEditor({
  reportId,
  valuationId,
  initialContent,
  onSave,
  onContentChange,
  readOnly = false,
}: ReportEditorProps) {
  // ============ STATE ============
  const [sections, setSections] = useState<ReportSection[]>(initialContent || DEFAULT_SECTIONS)
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id || 'letter_of_transmittal')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // View settings
  const [zoom, setZoom] = useState(100)
  const [showRuler, setShowRuler] = useState(true)
  const [showMargins, setShowMargins] = useState(true)
  const [showPageNumbers, setShowPageNumbers] = useState(true)
  const [showFormatting, setShowFormatting] = useState(false) // Show hidden characters

  // Menus & dialogs
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [showTableMenu, setShowTableMenu] = useState(false)
  const [showViewMenu, setShowViewMenu] = useState(false)
  const [showPageSettingsDialog, setShowPageSettingsDialog] = useState(false)

  // Find & Replace
  const [findReplace, setFindReplace] = useState<FindReplaceState>({
    isOpen: false,
    searchTerm: '',
    replaceTerm: '',
    matchCase: false,
    matchCount: 0,
    currentMatch: 0,
  })

  // Page settings
  const [pageSettings, setPageSettings] = useState<PageSettings>({
    size: 'letter',
    orientation: 'portrait',
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
  })

  // Refs
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const insertMenuRef = useRef<HTMLDivElement>(null)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pagedContainerRef = useRef<HTMLDivElement>(null)

  // ============ COMPUTED VALUES ============
  const currentSection = sections.find(s => s.id === activeSection) || sections[0]

  const pageSize = useMemo(() => {
    const size = PAGE_SIZES[pageSettings.size]
    return pageSettings.orientation === 'landscape'
      ? { width: size.height, height: size.width }
      : size
  }, [pageSettings])

  const combinedContent = useMemo(() => {
    return sections
      .sort((a, b) => a.order - b.order)
      .map(s => `<div class="section" data-section-id="${s.id}">
        <h1 class="section-title">${s.order}. ${s.title}</h1>
        ${s.content}
      </div>`)
      .join('<div class="page-break"></div>')
  }, [sections])

  // ============ TIPTAP EDITOR ============
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        // StarterKit v3 bundles Link + Underline; disable them so our explicitly-configured
        // versions register without a duplicate-extension warning.
        link: false,
        underline: false,
      }),
      Underline,
      TextStyleExtended,
      FontFamily.configure({
        types: ['textStyle'],
      }),
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'max-w-full h-auto rounded shadow-sm' },
      }),
      Placeholder.configure({
        placeholder: 'Start typing your content here...',
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'border-collapse w-full' },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: { class: 'border border-gray-400 bg-muted p-2 text-left font-semibold' },
      }),
      TableCell.configure({
        HTMLAttributes: { class: 'border border-gray-300 p-2' },
      }),
    ],
    content: currentSection?.content || '',
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const newContent = editor.getHTML()
      setSections(prev => prev.map(s =>
        s.id === activeSection ? { ...s, content: newContent } : s
      ))
      setHasUnsavedChanges(true)
      onContentChange?.(true)
    },
  })

  // ============ EFFECTS ============

  // Update editor editable state when readOnly changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly)
    }
  }, [editor, readOnly])

  // Update editor content when active section changes
  useEffect(() => {
    if (editor && currentSection) {
      editor.commands.setContent(currentSection.content)
    }
  }, [activeSection, editor])

  // Update editor content when sections are loaded/updated
  useEffect(() => {
    if (editor && currentSection && !loading) {
      editor.commands.setContent(currentSection.content)
    }
  }, [currentSection?.content, editor, loading])

  // Load report content from backend
  const loadContent = useCallback(async (forceRegenerate = false) => {
    try {
      if (forceRegenerate) setRegenerating(true)
      else setLoading(true)
      setLoadError(null)

      const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'
      const url = `${API_BASE}/reports/${reportId}/content${forceRegenerate ? '?regenerate=true' : ''}`
      
      console.log('Loading report content from:', url)
      const response = await authedFetch(url)

      if (response.ok) {
        const data = await response.json()
        console.log('Report content loaded:', data.sections?.length, 'sections')
        if (data.sections && data.sections.length > 0) {
          setSections(data.sections)
          if (!data.sections.find((s: ReportSection) => s.id === activeSection)) {
            setActiveSection(data.sections[0].id)
          }
          if (forceRegenerate) setHasUnsavedChanges(true)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`
        console.error('Failed to load content:', errorMessage)
        setLoadError(errorMessage)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to server'
      console.error('Failed to load content:', err)
      setLoadError(errorMessage)
    } finally {
      setLoading(false)
      setRegenerating(false)
    }
  }, [reportId, activeSection])

  useEffect(() => {
    if (reportId) loadContent(false)
    else setLoading(false)
  }, [reportId])

  // Auto-save
  useEffect(() => {
    if (!hasUnsavedChanges || readOnly) return
    const timer = setTimeout(() => handleSave(), 5000)
    return () => clearTimeout(timer)
  }, [hasUnsavedChanges, sections])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 's':
            e.preventDefault()
            handleSave()
            break
          case 'f':
            e.preventDefault()
            setFindReplace(prev => ({ ...prev, isOpen: true }))
            break
          case 'h':
            e.preventDefault()
            setFindReplace(prev => ({ ...prev, isOpen: true }))
            break
          case 'p':
            e.preventDefault()
            handlePrint()
            break
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (insertMenuRef.current && !insertMenuRef.current.contains(e.target as Node)) {
        setShowInsertMenu(false)
        setShowTableMenu(false)
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setShowViewMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ============ HANDLERS ============

  const handleSave = useCallback(async () => {
    if (saving) return
    try {
      setSaving(true)
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'
      const response = await authedFetch(`${API_BASE}/reports/${reportId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to save')
      }
      setLastSaved(new Date())
      setHasUnsavedChanges(false)
      onContentChange?.(false)
      onSave?.(sections)
      console.log('Report saved successfully')
    } catch (err) {
      console.error('Failed to save report content:', err)
      alert('Failed to save report. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [reportId, sections, saving, onSave, onContentChange])

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId)
    const pageEl = document.getElementById(`page-${sectionId}`)
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const insertImage = useCallback(() => {
    fileInputRef.current?.click()
    setShowInsertMenu(false)
  }, [])

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB')
      return
    }

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'
      const formData = new FormData()
      formData.append('file', file)
      formData.append('reportId', reportId)

      const response = await authedFetch(`${API_BASE}/reports/${reportId}/images`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Failed to upload image')

      const data = await response.json()
      editor.chain().focus().setImage({ src: data.url || data.path, alt: file.name }).run()
    } catch (err) {
      console.error('Failed to upload image:', err)
      const reader = new FileReader()
      reader.onload = () => {
        editor.chain().focus().setImage({ src: reader.result as string, alt: file.name }).run()
      }
      reader.readAsDataURL(file)
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [editor, reportId])

  const insertLink = useCallback(() => {
    const url = window.prompt('Enter URL:')
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run()
    }
    setShowInsertMenu(false)
  }, [editor])

  const insertTable = useCallback((rows: number, cols: number) => {
    if (editor) {
      editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    }
    setShowInsertMenu(false)
    setShowTableMenu(false)
  }, [editor])

  const insertHorizontalRule = useCallback(() => {
    if (editor) {
      editor.chain().focus().setHorizontalRule().run()
    }
    setShowInsertMenu(false)
  }, [editor])

  const insertPageBreak = useCallback(() => {
    if (editor) {
      editor.chain().focus().insertContent('<div class="page-break"></div>').run()
    }
    setShowInsertMenu(false)
  }, [editor])

  const setFontFamily = useCallback((fontFamily: string) => {
    if (editor) {
      if (fontFamily) {
        editor.chain().focus().setFontFamily(fontFamily).run()
      } else {
        editor.chain().focus().unsetFontFamily().run()
      }
    }
  }, [editor])

  const setFontSizeHandler = useCallback((fontSize: string) => {
    if (editor) {
      editor.chain().focus().setMark('textStyle', { fontSize }).run()
    }
  }, [editor])

  const setLineSpacing = useCallback((lineHeight: string) => {
    if (editor) {
      editor.chain().focus().setMark('textStyle', { lineHeight }).run()
    }
  }, [editor])

  const handleZoom = useCallback((delta: number) => {
    setZoom(prev => {
      const newZoom = prev + delta
      return Math.max(50, Math.min(200, newZoom))
    })
  }, [])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const handleExportPDF = useCallback(async () => {
    // Trigger print dialog which can save as PDF
    window.print()
  }, [])

  // Find & Replace handlers
  const handleSearch = useCallback(() => {
    if (!editor || !findReplace.searchTerm) return

    const text = editor.getText()
    const searchTerm = findReplace.matchCase
      ? findReplace.searchTerm
      : findReplace.searchTerm.toLowerCase()
    const searchText = findReplace.matchCase ? text : text.toLowerCase()

    let count = 0
    let pos = 0
    while ((pos = searchText.indexOf(searchTerm, pos)) !== -1) {
      count++
      pos += searchTerm.length
    }

    setFindReplace(prev => ({
      ...prev,
      matchCount: count,
      currentMatch: count > 0 ? 1 : 0,
    }))

    // Highlight first match
    if (count > 0) {
      // Use browser's find functionality as fallback
      (window as any).find?.(findReplace.searchTerm, findReplace.matchCase, false, true, false, false, false)
    }
  }, [editor, findReplace.searchTerm, findReplace.matchCase])

  const handleReplace = useCallback(() => {
    if (!editor) return

    const selection = window.getSelection()
    if (selection && selection.toString().toLowerCase() === findReplace.searchTerm.toLowerCase()) {
      document.execCommand('insertText', false, findReplace.replaceTerm)
      handleSearch()
    }
  }, [editor, findReplace.searchTerm, findReplace.replaceTerm, handleSearch])

  const handleReplaceAll = useCallback(() => {
    if (!editor || !findReplace.searchTerm) return

    const html = editor.getHTML()
    const regex = new RegExp(findReplace.searchTerm, findReplace.matchCase ? 'g' : 'gi')
    const newHtml = html.replace(regex, findReplace.replaceTerm)
    editor.commands.setContent(newHtml)

    setFindReplace(prev => ({
      ...prev,
      matchCount: 0,
      currentMatch: 0,
    }))
  }, [editor, findReplace])

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-muted">
        <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
        <span className="ml-3 text-sm text-muted-foreground">Loading report content...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-muted p-8">
        <div className="text-red-500 mb-4">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Failed to load report content</h3>
        <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">{loadError}</p>
        <button
          onClick={() => loadContent(false)}
          className="px-4 py-2 bg-amber-500 text-foreground rounded hover:bg-amber-600 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-400 report-editor-root">
      {/* Hidden file input for image upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Find & Replace Dialog */}
      <FindReplaceDialog
        state={findReplace}
        onClose={() => setFindReplace(prev => ({ ...prev, isOpen: false }))}
        onSearch={handleSearch}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
        onNext={() => (window as any).find?.(findReplace.searchTerm, findReplace.matchCase, false, true, false, false, false)}
        onPrevious={() => (window as any).find?.(findReplace.searchTerm, findReplace.matchCase, true, true, false, false, false)}
        onChange={(updates) => setFindReplace(prev => ({ ...prev, ...updates }))}
      />

      {/* Page Settings Dialog */}
      <PageSettingsDialog
        isOpen={showPageSettingsDialog}
        settings={pageSettings}
        onClose={() => setShowPageSettingsDialog(false)}
        onApply={setPageSettings}
      />

      {/* Main Toolbar - Dark theme for readability */}
      <div className="bg-gray-800 border-b border-gray-700 shadow-sm z-20 sticky top-0">
        {/* Primary Toolbar Row */}
        <div className="px-3 py-2 flex items-center gap-1 flex-wrap border-b border-gray-700">
          {/* Font Family */}
          <div className="flex items-center gap-1 pr-2 border-r border-border">
            <select
              onChange={(e) => setFontFamily(e.target.value)}
              disabled={readOnly}
              className={`h-8 px-2 text-sm border border-gray-600 rounded bg-gray-700 text-foreground min-w-[120px] ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Font Family"
            >
              {FONT_FAMILIES.map(font => (
                <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size */}
          <div className="flex items-center gap-1 pr-2 border-r border-gray-600">
            <select
              onChange={(e) => setFontSizeHandler(e.target.value)}
              disabled={readOnly}
              className={`h-8 w-16 px-2 text-sm border border-gray-600 rounded bg-gray-700 text-foreground ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Font Size"
              defaultValue="12px"
            >
              {FONT_SIZES.map(size => (
                <option key={size.value} value={size.value}>{size.label}</option>
              ))}
            </select>
          </div>

          {/* Text Formatting */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-gray-600">
            <ToolbarButton onClick={() => editor?.chain().focus().toggleBold().run()} isActive={editor?.isActive('bold')} title="Bold (⌘B)" disabled={readOnly}>
              <Bold className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleItalic().run()} isActive={editor?.isActive('italic')} title="Italic (⌘I)" disabled={readOnly}>
              <Italic className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleUnderline().run()} isActive={editor?.isActive('underline')} title="Underline (⌘U)" disabled={readOnly}>
              <UnderlineIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleStrike().run()} isActive={editor?.isActive('strike')} title="Strikethrough" disabled={readOnly}>
              <Strikethrough className="w-4 h-4" />
            </ToolbarButton>
          </div>

          {/* Highlight & Sub/Superscript */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-gray-600">
            <ToolbarButton onClick={() => editor?.chain().focus().toggleHighlight({ color: '#fef08a' }).run()} isActive={editor?.isActive('highlight')} title="Highlight" disabled={readOnly}>
              <Highlighter className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleSubscript().run()} isActive={editor?.isActive('subscript')} title="Subscript" disabled={readOnly}>
              <SubscriptIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleSuperscript().run()} isActive={editor?.isActive('superscript')} title="Superscript" disabled={readOnly}>
              <SuperscriptIcon className="w-4 h-4" />
            </ToolbarButton>
          </div>

          {/* Text Color */}
          <div className="flex items-center gap-0.5 px-2 border-r border-gray-600">
            <input
              type="color"
              onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
              disabled={readOnly}
              className={`w-7 h-7 p-0.5 rounded border border-gray-600 bg-gray-700 ${readOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title="Text Color"
            />
          </div>

          {/* Heading */}
          <div className="flex items-center gap-1 pr-2 border-r border-gray-600">
            <select
              onChange={(e) => {
                const val = e.target.value
                if (val === '0') editor?.chain().focus().setParagraph().run()
                else editor?.chain().focus().toggleHeading({ level: parseInt(val) as 1 | 2 | 3 | 4 }).run()
              }}
              disabled={readOnly}
              className={`h-8 px-2 text-sm border border-gray-600 rounded bg-gray-700 text-foreground ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="0">Normal</option>
              <option value="1">Heading 1</option>
              <option value="2">Heading 2</option>
              <option value="3">Heading 3</option>
              <option value="4">Heading 4</option>
            </select>
          </div>

          {/* Line Spacing */}
          <div className="flex items-center gap-1 pr-2 border-r border-gray-600">
            <select
              onChange={(e) => setLineSpacing(e.target.value)}
              disabled={readOnly}
              className={`h-8 w-16 px-2 text-sm border border-gray-600 rounded bg-gray-700 text-foreground ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Line Spacing"
              defaultValue="1.5"
            >
              {LINE_SPACINGS.map(spacing => (
                <option key={spacing.value} value={spacing.value}>{spacing.label}</option>
              ))}
            </select>
          </div>

          {/* Alignment */}
          <div className="flex items-center gap-0.5 px-2 border-r border-gray-600">
            <ToolbarButton onClick={() => editor?.chain().focus().setTextAlign('left').run()} isActive={editor?.isActive({ textAlign: 'left' })} title="Align Left" disabled={readOnly}>
              <AlignLeft className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().setTextAlign('center').run()} isActive={editor?.isActive({ textAlign: 'center' })} title="Align Center" disabled={readOnly}>
              <AlignCenter className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().setTextAlign('right').run()} isActive={editor?.isActive({ textAlign: 'right' })} title="Align Right" disabled={readOnly}>
              <AlignRight className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().setTextAlign('justify').run()} isActive={editor?.isActive({ textAlign: 'justify' })} title="Justify" disabled={readOnly}>
              <AlignJustify className="w-4 h-4" />
            </ToolbarButton>
          </div>

          {/* Lists & Indentation */}
          <div className="flex items-center gap-0.5 px-2 border-r border-gray-600">
            <ToolbarButton onClick={() => editor?.chain().focus().toggleBulletList().run()} isActive={editor?.isActive('bulletList')} title="Bullet List" disabled={readOnly}>
              <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleOrderedList().run()} isActive={editor?.isActive('orderedList')} title="Numbered List" disabled={readOnly}>
              <ListOrdered className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().sinkListItem('listItem').run()} title="Increase Indent" disabled={readOnly}>
              <Indent className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().liftListItem('listItem').run()} title="Decrease Indent" disabled={readOnly}>
              <Outdent className="w-4 h-4" />
            </ToolbarButton>
          </div>

          {/* Block Elements */}
          <div className="flex items-center gap-0.5 px-2 border-r border-gray-600">
            <ToolbarButton onClick={() => editor?.chain().focus().toggleBlockquote().run()} isActive={editor?.isActive('blockquote')} title="Quote" disabled={readOnly}>
              <Quote className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().toggleCodeBlock().run()} isActive={editor?.isActive('codeBlock')} title="Code Block" disabled={readOnly}>
              <Code className="w-4 h-4" />
            </ToolbarButton>
          </div>

          {/* Insert Menu */}
          <div className="relative px-2 border-r border-gray-600" ref={insertMenuRef}>
            <button
              onClick={() => !readOnly && setShowInsertMenu(!showInsertMenu)}
              disabled={readOnly}
              className={`flex items-center gap-1 px-2 py-1.5 text-sm rounded border border-gray-600 ${readOnly ? 'text-muted-foreground cursor-not-allowed' : 'text-gray-200 hover:bg-gray-600'
                }`}
            >
              <Plus className="w-4 h-4" />
              Insert
              <ChevronDown className="w-3 h-3" />
            </button>

            {showInsertMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50">
                <button onClick={insertImage} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">
                  <ImageIcon className="w-4 h-4" /> Image
                </button>
                <button onClick={insertLink} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">
                  <LinkIcon className="w-4 h-4" /> Link
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowTableMenu(!showTableMenu)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
                  >
                    <span className="flex items-center gap-2"><TableIcon className="w-4 h-4" /> Table</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showTableMenu && (
                    <div className="absolute left-full top-0 ml-1 w-40 bg-gray-800 border border-gray-600 rounded-lg shadow-lg">
                      <button onClick={() => insertTable(2, 2)} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">2 × 2</button>
                      <button onClick={() => insertTable(3, 3)} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">3 × 3</button>
                      <button onClick={() => insertTable(4, 4)} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">4 × 4</button>
                      <button onClick={() => insertTable(5, 5)} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">5 × 5</button>
                    </div>
                  )}
                </div>
                <button onClick={insertHorizontalRule} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">
                  <Minus className="w-4 h-4" /> Horizontal Line
                </button>
                <button onClick={insertPageBreak} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">
                  <SeparatorHorizontal className="w-4 h-4" /> Page Break
                </button>
              </div>
            )}
          </div>

          {/* Table Controls */}
          {editor?.isActive('table') && (
            <div className="flex items-center gap-0.5 px-2 border-r border-gray-600">
              <ToolbarButton onClick={() => editor?.chain().focus().addRowAfter().run()} title="Add Row" disabled={readOnly}>
                <Plus className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor?.chain().focus().addColumnAfter().run()} title="Add Column" disabled={readOnly}>
                <MoreHorizontal className="w-4 h-4" />
              </ToolbarButton>
              <ToolbarButton onClick={() => editor?.chain().focus().deleteTable().run()} title="Delete Table" disabled={readOnly}>
                <Trash2 className="w-4 h-4" />
              </ToolbarButton>
            </div>
          )}

          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5 px-2 border-r border-gray-600">
            <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} disabled={readOnly || !editor?.can().undo()} title="Undo (⌘Z)">
              <Undo className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} disabled={readOnly || !editor?.can().redo()} title="Redo (⌘⇧Z)">
              <Redo className="w-4 h-4" />
            </ToolbarButton>
          </div>

          {/* Save Controls */}
          <div className="flex items-center gap-2 ml-auto">
            {lastSaved && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>
            )}
            <button
              onClick={() => loadContent(true)}
              disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 text-gray-200 hover:bg-gray-600 rounded border border-gray-600 transition-colors"
            >
              {regenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Refresh
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors ${hasUnsavedChanges
                ? 'bg-amber-500 text-foreground hover:bg-amber-600 border-amber-600'
                : 'bg-gray-700 text-muted-foreground border-gray-600'
                }`}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          </div>
        </div>

        {/* Secondary Toolbar Row - View & Tools */}
        <div className="px-3 py-1.5 flex items-center gap-2 bg-gray-700">
          {/* Find & Replace */}
          <ToolbarButton
            onClick={() => setFindReplace(prev => ({ ...prev, isOpen: !prev.isOpen }))}
            isActive={findReplace.isOpen}
            title="Find & Replace (⌘F)"
          >
            <Search className="w-4 h-4" />
          </ToolbarButton>

          <div className="w-px h-5 bg-gray-500" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <ToolbarButton onClick={() => handleZoom(-25)} title="Zoom Out" disabled={zoom <= 50}>
              <ZoomOut className="w-4 h-4" />
            </ToolbarButton>
            <select
              value={zoom}
              onChange={(e) => setZoom(parseInt(e.target.value))}
              className="h-7 px-1 text-xs border border-gray-600 rounded bg-gray-700 text-foreground"
            >
              {ZOOM_LEVELS.map(level => (
                <option key={level} value={level}>{level}%</option>
              ))}
            </select>
            <ToolbarButton onClick={() => handleZoom(25)} title="Zoom In" disabled={zoom >= 200}>
              <ZoomIn className="w-4 h-4" />
            </ToolbarButton>
          </div>

          <div className="w-px h-5 bg-gray-500" />

          {/* View Menu */}
          <div className="relative" ref={viewMenuRef}>
            <button
              onClick={() => setShowViewMenu(!showViewMenu)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-200 hover:bg-gray-600 rounded"
            >
              <Eye className="w-4 h-4" />
              View
              <ChevronDown className="w-3 h-3" />
            </button>

            {showViewMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-50">
                <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRuler}
                    onChange={(e) => setShowRuler(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <RulerIcon className="w-4 h-4" />
                  Ruler
                </label>
                <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showMargins}
                    onChange={(e) => setShowMargins(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Columns className="w-4 h-4" />
                  Margins
                </label>
                <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPageNumbers}
                    onChange={(e) => setShowPageNumbers(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Hash className="w-4 h-4" />
                  Page Numbers
                </label>
                <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFormatting}
                    onChange={(e) => setShowFormatting(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <PilcrowSquare className="w-4 h-4" />
                  Formatting Marks
                </label>
              </div>
            )}
          </div>

          {/* Page Settings */}
          <button
            onClick={() => setShowPageSettingsDialog(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-200 hover:bg-gray-600 rounded"
          >
            <Settings className="w-4 h-4" />
            Page Setup
          </button>

          <div className="w-px h-5 bg-gray-500" />

          {/* Print & Export */}
          <ToolbarButton onClick={handlePrint} title="Print (⌘P)">
            <Printer className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={handleExportPDF} title="Export as PDF">
            <FileDown className="w-4 h-4" />
          </ToolbarButton>

          {/* Word Count */}
          <div className="ml-auto">
            <WordCount content={currentSection?.content || ''} />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Section Navigation Sidebar - Sticky */}
        <div className="w-56 bg-gray-800 border-r border-gray-700 overflow-y-auto shadow-sm flex-shrink-0 sticky left-0 top-0 h-full">
          <div className="p-3 border-b border-gray-700 bg-gray-900 sticky top-0 z-10">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sections</h3>
          </div>
          <div className="py-1">
            {sections.sort((a, b) => a.order - b.order).map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-l-4 ${activeSection === section.id
                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-l-amber-500 font-medium'
                  : 'text-gray-300 hover:bg-gray-700 border-l-transparent'
                  }`}
              >
                <span className="text-xs text-muted-foreground mr-2">{section.order}.</span>
                {section.title}
              </button>
            ))}
          </div>
        </div>

        {/* Document Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Ruler */}
          {showRuler && (
            <div className="flex justify-center bg-gray-200 py-1">
              <Ruler
                width={pageSize.width}
                marginLeft={pageSettings.marginLeft}
                marginRight={pageSettings.marginRight}
                zoom={zoom}
              />
            </div>
          )}

          {/* Pages Container */}
          <div
            ref={scrollContainerRef}
            className={`flex-1 overflow-y-auto p-8 ${showMargins ? 'show-margins' : ''} ${showFormatting ? 'show-formatting' : ''}`}
            style={{ backgroundColor: '#525659' }}
          >
            <div
              ref={pagedContainerRef}
              className="paged-container flex flex-col items-center"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
            >
              {sections.sort((a, b) => a.order - b.order).map((section, index) => (
                <PagedSection
                  key={section.id}
                  section={section}
                  sectionIndex={index}
                  totalSections={sections.length}
                  pageWidth={pageSize.width}
                  pageHeight={pageSize.height}
                  marginTop={pageSettings.marginTop}
                  marginBottom={pageSettings.marginBottom}
                  marginLeft={pageSettings.marginLeft}
                  marginRight={pageSettings.marginRight}
                  isActive={activeSection === section.id}
                  showMargins={showMargins}
                  showPageNumbers={showPageNumbers}
                  editor={editor}
                  onActivate={() => setActiveSection(section.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReportEditor
