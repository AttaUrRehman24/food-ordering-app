import { create } from 'zustand';

export type CartItem = {
  productId: string;
  variantId: string;
  label: string;
  unitPrice: string;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  total: string;
  itemCount: number;
  setCart: (cart: { items: CartItem[]; total: string; itemCount: number }) => void;
  optimisticAdd: (item: CartItem) => void;
  rollback: (snapshot: { items: CartItem[]; total: string; itemCount: number }) => void;
  clear: () => void;
};

function recompute(items: CartItem[]) {
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const total = items
    .reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0)
    .toFixed(2);
  return { items, total, itemCount };
}

/** Article VII.3 — optimistic cart mutations */
export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  total: '0.00',
  itemCount: 0,
  setCart: (cart) => set(cart),
  optimisticAdd: (item) => {
    const items = [...get().items];
    const idx = items.findIndex(
      (i) => i.productId === item.productId && i.variantId === item.variantId,
    );
    if (idx >= 0) {
      items[idx] = { ...items[idx], quantity: items[idx].quantity + item.quantity };
    } else {
      items.push(item);
    }
    set(recompute(items));
  },
  rollback: (snapshot) => set(snapshot),
  clear: () => set({ items: [], total: '0.00', itemCount: 0 }),
}));
