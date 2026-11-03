import {
  type CartState,
  emptyCart,
  MAX_CART_ITEMS,
  MAX_QUANTITY,
  normalizeQuantity,
} from "./schema";

// `available` lo aporta la UI con los datos del catálogo. Evita acciones
// obviamente inválidas (agregar un agotado), pero NO sustituye la validación
// del servidor al crear el pedido.
export type CartAction =
  | { type: "add"; productId: string; branchId: string; available: boolean }
  | { type: "increment"; productId: string; available: boolean }
  | { type: "decrement"; productId: string }
  | { type: "setQuantity"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "clear" };

// Reducer puro. Devuelve el mismo objeto cuando la acción no cambia nada.
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      if (!action.available) return state;
      // El carrito pertenece a una sucursal. Si llega otra, el carrito pasa a
      // ella y conserva los productos: /carrito los revalida contra la nueva.
      const base =
        state.branchId === action.branchId ? state : { ...state, branchId: action.branchId };
      const existing = base.items.find((item) => item.productId === action.productId);
      if (existing) return updateQuantity(base, action.productId, existing.quantity + 1);
      if (base.items.length >= MAX_CART_ITEMS) return state;
      return { ...base, items: [...base.items, { productId: action.productId, quantity: 1 }] };
    }
    case "increment": {
      if (!action.available) return state;
      const existing = state.items.find((item) => item.productId === action.productId);
      return existing ? updateQuantity(state, action.productId, existing.quantity + 1) : state;
    }
    case "decrement": {
      // Nunca baja de 1: quitar un producto es una acción explícita ("remove").
      const existing = state.items.find((item) => item.productId === action.productId);
      return existing && existing.quantity > 1
        ? updateQuantity(state, action.productId, existing.quantity - 1)
        : state;
    }
    case "setQuantity": {
      const quantity = normalizeQuantity(action.quantity);
      return quantity === null ? state : updateQuantity(state, action.productId, quantity);
    }
    case "remove": {
      if (!state.items.some((item) => item.productId === action.productId)) return state;
      return { ...state, items: state.items.filter((item) => item.productId !== action.productId) };
    }
    case "clear":
      return state.items.length === 0 ? state : emptyCart(state.branchId);
  }
}

function updateQuantity(state: CartState, productId: string, quantity: number): CartState {
  const next = Math.min(quantity, MAX_QUANTITY);
  const current = state.items.find((item) => item.productId === productId);
  if (!current || current.quantity === next) return state;
  return {
    ...state,
    items: state.items.map((item) => (item.productId === productId ? { ...item, quantity: next } : item)),
  };
}

export function cartCount(state: CartState) {
  return state.items.reduce((total, item) => total + item.quantity, 0);
}
