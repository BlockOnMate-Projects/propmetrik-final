/**
 * Shared styling for Property Management sub-tab rows, so every in-page shadcn <Tabs> filter row
 * (Documents, Maintenance, Reports, Bulk Ops, …) looks identical to the route-based section bar
 * (PMSectionNav): a clean amber "pill" row instead of a bordered card box.
 *
 * Usage:
 *   <TabsList className={subTabsListClass}>
 *     <TabsTrigger value="all" className={subTabsTriggerClass}>All</TabsTrigger>
 *   </TabsList>
 * Add layout tweaks with cn(): cn(subTabsListClass, 'w-full overflow-x-auto').
 */

export const subTabsListClass = 'bg-transparent border-0 p-0 h-9 gap-1 justify-start'

export const subTabsTriggerClass =
    'rounded-sm px-3 py-1 font-mono text-[11px] font-medium uppercase transition-all ' +
    'text-muted-foreground hover:text-amber-500 hover:bg-amber-950/20 ' +
    'data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-500 data-[state=active]:font-bold data-[state=active]:shadow-none'
