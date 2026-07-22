import { create } from 'zustand';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  createdAt?: string;
};

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  wsConnected: boolean;
  setSession: (accessToken: string, user: AuthUser) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: AuthUser) => void;
  setWsConnected: (v: boolean) => void;
  clear: () => void;
};

const ROLE_COOKIE = 'fo_role';

function writeRoleCookie(role: string | null) {
  if (typeof document === 'undefined') {
    return;
  }
  if (!role) {
    document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

/** Article VII.2 — access JWT in memory only (Zustand), never localStorage */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  wsConnected: false,
  setSession: (accessToken, user) => {
    writeRoleCookie(user.role);
    set({ accessToken, user });
  },
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => {
    writeRoleCookie(user.role);
    set({ user });
  },
  setWsConnected: (wsConnected) => set({ wsConnected }),
  clear: () => {
    writeRoleCookie(null);
    set({ accessToken: null, user: null, wsConnected: false });
  },
}));
