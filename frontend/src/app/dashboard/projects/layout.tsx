import { ProjectsTopNav } from '@/components/layout/ProjectsTopNav'
import { ProjectsSectionNav } from '@/components/layout/ProjectsSectionNav'

/**
 * Project Management shell. Mirrors the Property Management layout: a numbered top-level
 * section nav (ProjectsTopNav) + a consistent section sub-nav (ProjectsSectionNav), both
 * driven by the shared `projectsNav` model. Individual pages render only their content —
 * all navigation (and its RBAC/tier gating) lives in the two shared nav components.
 */
export default function ProjectsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-background">
            <ProjectsTopNav />
            <ProjectsSectionNav />
            <div className="p-2 sm:p-4 pb-10">{children}</div>
        </div>
    )
}
