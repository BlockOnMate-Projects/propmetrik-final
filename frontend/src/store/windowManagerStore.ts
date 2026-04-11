import { create } from 'zustand';

export type WindowType = 'workspace' | 'insight';

export interface PanelState {
    isOpen: boolean;
    title: string;
    type: WindowType;
    data?: any;
}

interface WindowManagerStore {
    panel: PanelState;

    // Primary API
    openPanel: (config: { type: WindowType; title: string; data?: any }) => void;
    closePanel: () => void;
    togglePanel: () => void;

    // Legacy compatibility (used by MessageList for insight pop-outs)
    windows: never[];
    maxZIndex: number;
    openWindow: (config: { id: string; type: WindowType; title: string; data?: any; size?: any; position?: any }) => void;
    closeWindow: (id: string) => void;
    toggleMinimize: (id: string) => void;
    focusWindow: (id: string) => void;
    updatePosition: (id: string, x: number, y: number) => void;
    updateSize: (id: string, width: number, height: number) => void;
}

export const useWindowManagerStore = create<WindowManagerStore>((set) => ({
    panel: {
        isOpen: false,
        title: 'Workspace',
        type: 'workspace',
        data: undefined,
    },

    openPanel: (config) => set(() => ({
        panel: {
            isOpen: true,
            title: config.title,
            type: config.type,
            data: config.data,
        },
    })),

    closePanel: () => set((state) => ({
        panel: { ...state.panel, isOpen: false },
    })),

    togglePanel: () => set((state) => ({
        panel: { ...state.panel, isOpen: !state.panel.isOpen },
    })),

    // Legacy stubs — openWindow maps to openPanel for workspace type
    windows: [],
    maxZIndex: 100,
    openWindow: (config) => set(() => ({
        panel: {
            isOpen: true,
            title: config.title,
            type: config.type,
            data: config.data,
        },
    })),
    closeWindow: () => set((state) => ({
        panel: { ...state.panel, isOpen: false },
    })),
    toggleMinimize: () => {},
    focusWindow: () => {},
    updatePosition: () => {},
    updateSize: () => {},
}));
