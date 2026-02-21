import { create } from 'zustand';

export type WindowType = 'workspace' | 'insight';

export interface WindowState {
    id: string;
    type: WindowType;
    title: string;
    isOpen: boolean;
    isMinimized: boolean;
    isMaximized: boolean;
    zIndex: number;
    position: { x: number; y: number };
    size: { width: number; height: number };
    data?: any; // For charts or specific context
}

interface WindowManagerStore {
    windows: WindowState[];
    maxZIndex: number;

    // Actions
    openWindow: (config: Partial<WindowState> & { id: string; type: WindowType; title: string }) => void;
    closeWindow: (id: string) => void;
    toggleMinimize: (id: string) => void;
    focusWindow: (id: string) => void;
    updatePosition: (id: string, x: number, y: number) => void;
    updateSize: (id: string, width: number, height: number) => void;
}

export const useWindowManagerStore = create<WindowManagerStore>((set) => ({
    windows: [],
    maxZIndex: 100,

    openWindow: (config) => set((state) => {
        const existing = state.windows.find(w => w.id === config.id);
        if (existing) {
            // Focus if already open
            const nextZ = state.maxZIndex + 1;
            return {
                windows: state.windows.map(w =>
                    w.id === config.id ? { ...w, isOpen: true, isMinimized: false, zIndex: nextZ } : w
                ),
                maxZIndex: nextZ
            };
        }

        const nextZ = state.maxZIndex + 1;
        const newWindow: WindowState = {
            id: config.id,
            type: config.type,
            title: config.title,
            isOpen: true,
            isMinimized: false,
            isMaximized: false,
            zIndex: nextZ,
            position: config.position || { x: 100, y: 100 },
            size: config.size || { width: 480, height: 600 },
            data: config.data,
        };

        return {
            windows: [...state.windows, newWindow],
            maxZIndex: nextZ
        };
    }),

    closeWindow: (id) => set((state) => ({
        windows: state.windows.filter(w => w.id !== id)
    })),

    toggleMinimize: (id) => set((state) => ({
        windows: state.windows.map(w =>
            w.id === id ? { ...w, isMinimized: !w.isMinimized } : w
        )
    })),

    focusWindow: (id) => set((state) => {
        const nextZ = state.maxZIndex + 1;
        return {
            windows: state.windows.map(w =>
                w.id === id ? { ...w, zIndex: nextZ, isMinimized: false } : w
            ),
            maxZIndex: nextZ
        };
    }),

    updatePosition: (id, x, y) => set((state) => ({
        windows: state.windows.map(w =>
            w.id === id ? { ...w, position: { x, y } } : w
        )
    })),

    updateSize: (id, width, height) => set((state) => ({
        windows: state.windows.map(w =>
            w.id === id ? { ...w, size: { width, height } } : w
        )
    })),
}));
